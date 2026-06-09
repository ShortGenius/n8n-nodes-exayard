/**
 * Vendored from @exayard/sdk (packages/sdk/src/error.ts).
 *
 * Copied in so this n8n community node has ZERO runtime dependencies, which is
 * required for n8n verified-community-node eligibility. Keep in sync with the
 * upstream SDK if the error envelope changes.
 *
 * Typed error surface for SDK consumers.
 *
 * Every non-2xx response from /v1 is parsed into an ExayardError so callers
 * can branch on `err.code` (stable) rather than `err.message` (human). Shape
 * matches the RFC 9457 Problem Details envelope — title/detail/instance are
 * present, extensions (code/param/doc_url/request_id) come through intact.
 */

export interface ExayardErrorBody {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
  code: string
  param?: string
  doc_url?: string
  request_id?: string
}

export class ExayardError extends Error {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly detail: string
  readonly instance?: string
  readonly code: string
  readonly param?: string
  readonly docUrl?: string
  readonly requestId?: string

  constructor(body: ExayardErrorBody) {
    // Guard against upstream error pages that don't conform to Problem Details —
    // a missing code/title/detail should still produce a useful message rather
    // than the string "undefined (undefined): undefined".
    const title = body.title ?? 'error'
    const status = typeof body.status === 'number' ? body.status : 0
    const code = body.code ?? `http_${status || 'unknown'}`
    const detail = body.detail ?? ''
    const message = detail
      ? `${title} (${code}): ${detail}`
      : `HTTP ${status || 'unknown'}: ${title}`
    super(message)
    this.name = 'ExayardError'
    this.type = body.type ?? 'about:blank'
    this.title = title
    this.status = status
    this.detail = detail
    this.instance = body.instance
    this.code = code
    this.param = body.param
    this.docUrl = body.doc_url
    this.requestId = body.request_id
  }

  // Convenience guards for the most common branching points.
  isRateLimited(): boolean {
    return this.code === 'rate_limited' || this.status === 429
  }

  isUnauthenticated(): boolean {
    return this.code === 'unauthenticated' || this.status === 401
  }

  isNotFound(): boolean {
    return this.code === 'not_found' || this.status === 404
  }

  isInsufficientScope(): boolean {
    return this.code === 'insufficient_scope' || this.status === 403
  }

  isIdempotencyConflict(): boolean {
    return this.code === 'idempotency_key_reused'
  }
}
