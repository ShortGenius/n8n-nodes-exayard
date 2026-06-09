/**
 * Vendored from @exayard/sdk (packages/sdk/src/webhooks.ts).
 *
 * Copied in so this n8n community node has ZERO runtime dependencies, which is
 * required for n8n verified-community-node eligibility. Keep in sync with the
 * upstream SDK if the signing scheme changes.
 *
 * Webhook signature verification — Stripe-compatible pattern.
 *
 * Exayard signs every delivery with:
 *   Exayard-Signature: t=<unix>,v1=<base64-hmac-sha256>
 *
 * where the signed payload is `${t}.${rawBody}` and the HMAC secret is the
 * endpoint's whsec_... value returned once at creation time.
 */

export type WebhookEventType =
  | 'project.created'
  | 'project.updated'
  | 'project.archived'
  | 'assessment.started'
  | 'assessment.completed'
  | 'assessment.approved'
  | 'assessment.cancelled'
  | 'assessment.failed'
  | 'estimate.generated'
  | 'bid.generated'
  | 'file.processed'
  | 'quote.requested'
  | 'quote.received'
  | 'quote.accepted'
  | 'quote.rejected'
  | 'quote.expired'

export interface WebhookEvent<T = unknown> {
  id: string
  type: WebhookEventType
  created: number
  data: T
}

export class WebhookSignatureError extends Error {
  readonly code: 'invalid_signature' | 'replay_window_exceeded' | 'malformed_header'

  constructor(code: WebhookSignatureError['code'], message: string) {
    super(message)
    this.name = 'WebhookSignatureError'
    this.code = code
  }
}

// 5-minute replay window matches the server-side signing convention in
// packages/backend/convex/webhooks.ts.
const REPLAY_WINDOW_SECONDS = 5 * 60

const parseSignatureHeader = (header: string): { t: number; v1: string } => {
  const parts = header.split(',').map(s => s.trim())
  let t: number | undefined
  let v1: string | undefined
  for (const part of parts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const k = part.slice(0, eq)
    const v = part.slice(eq + 1)
    if (k === 't') t = parseInt(v, 10)
    if (k === 'v1') v1 = v
  }
  if (t === undefined || Number.isNaN(t) || !v1) {
    throw new WebhookSignatureError('malformed_header', `Exayard-Signature must be "t=<unix>,v1=<digest>" — got "${header}".`)
  }
  return { t, v1 }
}

const hmacSha256Base64 = async (secret: string, payload: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const bytes = new Uint8Array(digest)
  let str = ''
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!)
  return btoa(str)
}

// Constant-time base64 compare. Short-circuit on length mismatch is fine —
// attacker already knows the digest length (SHA-256 = 44 base64 chars).
const safeCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

/**
 * Verify a webhook delivery and parse its payload as a typed WebhookEvent.
 *
 * Throws WebhookSignatureError with a stable `code` on failure:
 *   - malformed_header: Exayard-Signature isn't in t=…,v1=… form
 *   - replay_window_exceeded: timestamp is >5 minutes from now
 *   - invalid_signature: digest doesn't match
 */
export const constructWebhookEvent = async <T = unknown>(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  options: { now?: number } = {}
): Promise<WebhookEvent<T>> => {
  const { t, v1 } = parseSignatureHeader(signatureHeader)
  const nowSec = Math.floor((options.now ?? Date.now()) / 1000)
  if (Math.abs(nowSec - t) > REPLAY_WINDOW_SECONDS) {
    throw new WebhookSignatureError(
      'replay_window_exceeded',
      `Signature timestamp ${t} is outside the ${REPLAY_WINDOW_SECONDS}-second window (now=${nowSec}).`
    )
  }

  const expected = await hmacSha256Base64(secret, `${t}.${rawBody}`)
  if (!safeCompare(expected, v1)) {
    throw new WebhookSignatureError('invalid_signature', 'HMAC digest mismatch. Check the endpoint secret.')
  }

  return JSON.parse(rawBody) as WebhookEvent<T>
}
