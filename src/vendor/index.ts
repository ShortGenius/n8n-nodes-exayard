/**
 * Vendored copy of @exayard/sdk.
 *
 * The Exayard SDK is internal/unpublished, so its source is vendored here to
 * keep this n8n community node free of runtime dependencies (a requirement for
 * n8n verified-community-node eligibility). The four files under this directory
 * mirror packages/sdk/src/{client,error,webhooks,index}.ts and have ZERO npm
 * dependencies — they rely only on built-ins (fetch, URL, crypto, TextEncoder,
 * btoa). Keep in sync with the upstream SDK.
 *
 * Usage:
 *
 *   import { Exayard } from '../../vendor'
 *   const exa = new Exayard({ apiKey: '...' })
 */

export { Exayard } from './client'
export type { ExayardOptions } from './client'
export { ExayardError } from './error'
export type { ExayardErrorBody } from './error'
export { constructWebhookEvent, WebhookSignatureError } from './webhooks'
export type { WebhookEvent, WebhookEventType } from './webhooks'
