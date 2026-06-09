/**
 * Vendored from @exayard/sdk (packages/sdk/src/client.ts).
 *
 * Copied in so this n8n community node has ZERO runtime dependencies, which is
 * required for n8n verified-community-node eligibility. Keep in sync with the
 * upstream SDK if the client surface changes.
 */
import { ExayardError, type ExayardErrorBody } from './error'
import { constructWebhookEvent } from './webhooks'

/**
 * Configuration for the Exayard SDK client.
 */
export interface ExayardOptions {
  /** API key from /settings/api-keys. Either this or bearerToken must be set. */
  apiKey?: string
  /** OAuth bearer token (for connected-app flows). */
  bearerToken?: string
  /** Override the base URL. Defaults to https://api.exayard.com/v1. */
  baseUrl?: string
  /** Per-request timeout in ms. Defaults to 60000. */
  timeoutMs?: number
  /** Optional fetch override — for tests or custom runtimes. */
  fetch?: typeof fetch
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  path: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  /** Passed through as Idempotency-Key. Auto-generated for unsafe methods when omitted. */
  idempotencyKey?: string
  /** Include Idempotency-Key even when omitted (auto-generate). Defaults to true for unsafe methods. */
  autoIdempotencyKey?: boolean
}

const UNSAFE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

const randomIdempotencyKey = (): string => {
  // Good enough for SDK auto-retries; callers needing deterministic keys
  // pass their own. Uses crypto.randomUUID in runtimes that have it and
  // falls back to timestamp+random.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `idem_${crypto.randomUUID().replace(/-/g, '')}`
  }
  return `idem_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export class Exayard {
  private readonly apiKey?: string
  private readonly bearerToken?: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(opts: ExayardOptions = {}) {
    if (!opts.apiKey && !opts.bearerToken) {
      throw new Error('Exayard: pass `apiKey` or `bearerToken` — see https://developers.exayard.com/api-reference.')
    }
    this.apiKey = opts.apiKey
    this.bearerToken = opts.bearerToken
    this.baseUrl = (opts.baseUrl ?? 'https://api.exayard.com/v1').replace(/\/$/, '')
    this.timeoutMs = opts.timeoutMs ?? 60_000
    this.fetchImpl = opts.fetch ?? fetch
  }

  // Internal request primitive. Public resource methods compose this.
  private async request<R>(opts: RequestOptions): Promise<R> {
    const url = new URL(`${this.baseUrl}${opts.path}`)
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v))
      }
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.apiKey ?? this.bearerToken}`
    }

    if (opts.body !== undefined) headers['Content-Type'] = 'application/json'

    // Idempotency-Key for unsafe methods — auto-generated unless caller
    // pins one for replay-safe retries from their own retry loop.
    const autoIdem = opts.autoIdempotencyKey ?? UNSAFE_METHODS.has(opts.method)
    if (opts.idempotencyKey) {
      headers['Idempotency-Key'] = opts.idempotencyKey
    } else if (autoIdem) {
      headers['Idempotency-Key'] = randomIdempotencyKey()
    }

    // AbortSignal.timeout() replaces a setTimeout + AbortController + clearTimeout:
    // n8n's community-node lint forbids the setTimeout/clearTimeout globals, and
    // this is the modern equivalent (Node >=18; package engines require >=20).
    const res = await this.fetchImpl(url.toString(), {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs)
    })

    if (!res.ok) {
      const ct = res.headers.get('Content-Type') ?? ''
      if (ct.includes('problem+json') || ct.includes('application/json')) {
        const body = (await res.json()) as ExayardErrorBody
        throw new ExayardError(body)
      }
      // Fallback for non-JSON error pages (shouldn't happen against /v1 but
      // could hit a CDN error page if the service is down).
      const text = await res.text().catch(() => '')
      throw new ExayardError({
        type: 'https://developers.exayard.com/concepts/errors#transport_error',
        title: 'Transport Error',
        status: res.status,
        detail: text.slice(0, 500) || `HTTP ${res.status}`,
        code: 'transport_error',
        doc_url: 'https://developers.exayard.com/concepts/errors#transport_error',
        request_id: res.headers.get('X-Request-Id') ?? undefined
      })
    }

    if (res.status === 204) return undefined as R
    return (await res.json()) as R
  }

  // ---------------------------------------------------------------------------
  // Resource surface — a curated subset covering the flows agents and integrations
  // most often hit. Full OpenAPI coverage can be layered on via generated code
  // without changing the public shape of this client.
  // ---------------------------------------------------------------------------

  readonly me = {
    get: (): Promise<unknown> => this.request({ method: 'GET', path: '/me' })
  }

  readonly projects = {
    // GET /v1/projects returns a raw array (OpenAPI schema z.array(project));
    // there is no { items, next_cursor } envelope and the endpoint accepts only
    // organizationId/status/search (no limit/cursor pagination yet).
    list: (query: { organizationId: string; status?: string; search?: string }) =>
      this.request<unknown[]>({ method: 'GET', path: '/projects', query }),
    get: (id: string, query: { organizationId: string }) =>
      this.request<unknown>({ method: 'GET', path: `/projects/${id}`, query }),
    create: (body: { organizationId: string; name: string }, opts: { idempotencyKey?: string } = {}) =>
      this.request<{ id: string; _id: string }>({ method: 'POST', path: '/projects', body, idempotencyKey: opts.idempotencyKey }),
    export: (id: string, query: { organizationId: string }) =>
      this.request<unknown>({ method: 'GET', path: `/projects/${id}/export`, query }),
    archive: (id: string, query: { organizationId: string }) =>
      this.request<void>({ method: 'POST', path: `/projects/${id}/archive`, query })
  }

  // File upload is a 3-step dance: presign → PUT bytes to R2 → confirm (which
  // kicks off PDF page extraction). `upload` wraps all three. A PDF becomes
  // pages asynchronously after confirm — poll pages.list() until each file's
  // processingStatus is 'complete' before proposing/running.
  readonly files = {
    presign: (body: {
      organizationId: string
      projectId: string
      filename: string
      mimeType: string
      fileSize: number
      folderId?: string
    }) =>
      this.request<{ fileId: string; uploadUrl: string; r2Key: string; expiresAt: number; filename: string }>({
        method: 'POST',
        path: '/files',
        body
      }),
    confirm: (fileId: string, r2Key: string) =>
      this.request<void>({ method: 'POST', path: `/files/${fileId}/confirm`, body: { r2Key } }),
    upload: async (body: {
      organizationId: string
      projectId: string
      filename: string
      mimeType: string
      bytes: Uint8Array | ArrayBuffer
      folderId?: string
    }): Promise<{ fileId: string }> => {
      const buf = body.bytes instanceof ArrayBuffer ? new Uint8Array(body.bytes) : body.bytes
      const { fileId, uploadUrl, r2Key } = await this.files.presign({
        organizationId: body.organizationId,
        projectId: body.projectId,
        filename: body.filename,
        mimeType: body.mimeType,
        fileSize: buf.byteLength,
        folderId: body.folderId
      })
      const put = await this.fetchImpl(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': body.mimeType },
        // Node/undici fetch accepts a Uint8Array body at runtime; the fetch
        // body type doesn't list it, so cast at this boundary.
        body: buf as unknown as RequestInit['body']
      })
      if (!put.ok) {
        throw new ExayardError({
          type: 'https://developers.exayard.com/concepts/errors#transport_error',
          title: 'Upload Failed',
          status: put.status,
          detail: `PUT to storage failed: HTTP ${put.status}`,
          code: 'transport_error',
          doc_url: 'https://developers.exayard.com/concepts/errors#transport_error'
        })
      }
      await this.files.confirm(fileId, r2Key)
      return { fileId }
    }
  }

  // List a project's pages (grouped by file). Discover pageIds + poll each
  // file's processingStatus until extraction finishes.
  readonly pages = {
    list: (projectId: string, query: { organizationId: string }) =>
      this.request<unknown[]>({ method: 'GET', path: `/projects/${projectId}/pages`, query })
  }

  // AI takeoff assessments. Reads resolve the org from the project/assessment
  // (no organizationId). `start` kicks off an AI run on an existing project's
  // pages — pair with the assessment.completed webhook + latest()/takeoffSummary
  // to pull results once it finishes.
  readonly assessments = {
    list: (projectId: string) =>
      this.request<unknown[]>({ method: 'GET', path: `/projects/${projectId}/assessments` }),
    latest: (projectId: string) =>
      this.request<unknown>({ method: 'GET', path: `/projects/${projectId}/assessments/latest` }),
    get: (id: string) => this.request<unknown>({ method: 'GET', path: `/assessments/${id}` }),
    takeoffSummary: (projectId: string) =>
      this.request<unknown>({ method: 'GET', path: `/projects/${projectId}/takeoff-summary` }),
    // Ask the AI what to measure: prompt + pageIds → proposed `elements`
    // (id/name/category/hexColor) you can pass straight to run().
    propose: (
      projectId: string,
      body: { organizationId: string; prompt: string; pageIds?: string[]; fileIds?: string[] }
    ) =>
      this.request<{
        elements: Array<{ id: string; name: string; category: 'area' | 'linear' | 'count'; hexColor: string }>
        creditEstimate?: number
      }>({ method: 'POST', path: `/projects/${projectId}/analysis/propose`, body }),
    // Run an AI takeoff analysis on an existing project and let it complete
    // end-to-end (no human approval step). You specify exactly what to detect
    // via `elements` (each: id, name, category area|linear|count, hexColor) on
    // the given pageIds. Returns { assessmentId, layerId, pageIds }; track
    // completion via the assessment.completed webhook + latest()/takeoffSummary.
    //
    // (Maps to POST /v1/projects/{id}/analysis/run — the pre-approved path that
    // runs to completion. The auto-detect POST /assessments path pauses at
    // awaiting_approval, which needs a human, so it isn't exposed here.)
    run: (
      projectId: string,
      body: {
        organizationId: string
        pageIds: string[]
        elements: Array<{
          id: string
          name: string
          category: 'area' | 'linear' | 'count'
          hexColor: string
        }>
        layerName?: string
      },
      opts: { idempotencyKey?: string } = {}
    ) =>
      this.request<{ assessmentId: string; layerId: string; pageIds: string[] }>({
        method: 'POST',
        path: `/projects/${projectId}/analysis/run`,
        body,
        idempotencyKey: opts.idempotencyKey
      })
  }

  // Document generation — turn a project's takeoff data into an estimate or a
  // bid document. Both run synchronously and return the generated document's
  // id, an optional URL, and rendered text/html. Pair with the
  // estimate.generated / bid.generated webhooks if you generate elsewhere.
  readonly estimates = {
    generate: (
      projectId: string,
      body: { organizationId: string; query: string; notes?: string; measurementContext?: string },
      opts: { idempotencyKey?: string } = {}
    ) =>
      this.request<{
        documentId: string
        documentUrl?: string
        text: string
        html: string
        sourceFiles: unknown[]
      }>({ method: 'POST', path: `/projects/${projectId}/estimates`, body, idempotencyKey: opts.idempotencyKey })
  }

  readonly bids = {
    generate: (
      projectId: string,
      body: {
        organizationId: string
        notes?: string
        measurementContext?: string
        ignoreMissingVariables?: boolean
      },
      opts: { idempotencyKey?: string } = {}
    ) =>
      this.request<{
        documentId: string
        documentUrl?: string
        text: string
        html: string
        sourceFiles: unknown[]
        warnings?: unknown[]
      }>({ method: 'POST', path: `/projects/${projectId}/bids`, body, idempotencyKey: opts.idempotencyKey })
  }

  // Vendor pricing — upsert a product's price for a specific vendor. Replaces
  // the existing price row (PUT) so it is safe to call repeatedly.
  readonly products = {
    setPrice: (
      productId: string,
      vendorId: string,
      body: {
        organizationId: string
        pricePerUnit: number
        minOrderQuantity?: number
        leadTimeDays?: number
        notes?: string
      },
      opts: { idempotencyKey?: string } = {}
    ) =>
      this.request<{ id: string }>({
        method: 'PUT',
        path: `/products/${productId}/prices/${vendorId}`,
        body,
        idempotencyKey: opts.idempotencyKey
      })
  }

  // Vendor quotes — request a quote from a vendor, record the vendor's
  // response, and advance the quote's status (accepted/rejected/expired).
  // Pair with the quote.* webhooks to react to lifecycle changes.
  readonly quotes = {
    request: (
      projectId: string,
      body: {
        organizationId: string
        vendorId: string
        quoteNumber: string
        lineItems?: Array<{
          description: string
          quantity: number
          unit: string
          unitPrice: number
          totalPrice: number
          productId?: string
        }>
        subtotal?: number
        tax?: number
        shipping?: number
        total?: number
        validUntil?: number
        notes?: string
      },
      opts: { idempotencyKey?: string } = {}
    ) =>
      this.request<{ id: string }>({
        method: 'POST',
        path: `/projects/${projectId}/quotes`,
        body,
        idempotencyKey: opts.idempotencyKey
      }),
    receive: (
      quoteId: string,
      body: {
        organizationId: string
        lineItems: Array<{
          description: string
          quantity: number
          unit: string
          unitPrice: number
          totalPrice: number
          productId?: string
        }>
        subtotal: number
        tax?: number
        shipping?: number
        total: number
        validUntil?: number
      },
      opts: { idempotencyKey?: string } = {}
    ) =>
      this.request<{ id: string }>({
        method: 'PATCH',
        path: `/quotes/${quoteId}/receive`,
        body,
        idempotencyKey: opts.idempotencyKey
      }),
    updateStatus: (
      quoteId: string,
      body: { organizationId: string; status: 'accepted' | 'rejected' | 'expired' },
      opts: { idempotencyKey?: string } = {}
    ) =>
      this.request<{ id: string }>({
        method: 'PATCH',
        path: `/quotes/${quoteId}/status`,
        body,
        idempotencyKey: opts.idempotencyKey
      })
  }

  readonly help = {
    search: (body: { query: string; limit?: number; section?: string }) =>
      this.request<{
        results: Array<{ id: string; title: string; description: string; url: string; score: number }>
        total: number
      }>({ method: 'POST', path: '/help/search', body, autoIdempotencyKey: false })
  }

  readonly webhooks = {
    listEndpoints: (query: { organizationId: string }) =>
      this.request<unknown[]>({ method: 'GET', path: '/webhook_endpoints', query }),
    createEndpoint: (body: { organizationId: string; url: string; events: string[]; description?: string }) =>
      this.request<{ id: string; secret: string }>({ method: 'POST', path: '/webhook_endpoints', body }),
    deleteEndpoint: (id: string, query: { organizationId: string }) =>
      this.request<void>({ method: 'DELETE', path: `/webhook_endpoints/${id}`, query }),
    listDeliveries: (id: string, query: { organizationId: string; limit?: number }) =>
      this.request<unknown[]>({ method: 'GET', path: `/webhook_endpoints/${id}/deliveries`, query }),
    /**
     * Parse + verify an inbound webhook delivery. Throws WebhookSignatureError
     * on any signature failure — always catch and return 400 to let us retry.
     */
    constructEvent: constructWebhookEvent
  }
}
