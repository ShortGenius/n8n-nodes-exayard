import { Exayard as ExayardClient, constructWebhookEvent, WebhookSignatureError } from '../../src/vendor'
import type {
  IDataObject,
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData
} from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'

/**
 * Webhook trigger node for Exayard lifecycle events.
 *
 * On activate, registers a webhook endpoint at api.exayard.com pointing
 * at the n8n production webhook URL. The endpoint secret returned by
 * Exayard is stored in node static data so signature verification works
 * across restarts.
 *
 * On deactivate, deletes the registered endpoint so we don't leak
 * orphan webhook subscriptions on the Exayard side.
 */
export class ExayardTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Exayard Trigger',
    name: 'exayardTrigger',
    icon: 'file:ExayardTrigger.svg',
    group: ['trigger'],
    version: 1,
    description: 'Triggers when an Exayard lifecycle event fires',
    defaults: { name: 'Exayard Trigger' },
    inputs: [] as INodeTypeDescription['inputs'],
    outputs: ['main'] as INodeTypeDescription['outputs'],
    credentials: [{ name: 'exayardApi', required: true }],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook'
      }
    ],
    properties: [
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.'
      },
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        default: ['project.created', 'assessment.completed', 'estimate.generated', 'bid.generated'],
        options: [
          { name: 'Project Created', value: 'project.created' },
          { name: 'Project Updated', value: 'project.updated' },
          { name: 'Project Archived', value: 'project.archived' },
          { name: 'Takeoff Started', value: 'assessment.started' },
          { name: 'Takeoff Completed', value: 'assessment.completed' },
          { name: 'Takeoff Approved', value: 'assessment.approved' },
          { name: 'Takeoff Cancelled', value: 'assessment.cancelled' },
          { name: 'Takeoff Failed', value: 'assessment.failed' },
          { name: 'Estimate Generated', value: 'estimate.generated' },
          { name: 'Bid Generated', value: 'bid.generated' },
          { name: 'File Processed', value: 'file.processed' },
          { name: 'Quote Requested', value: 'quote.requested' },
          { name: 'Quote Received', value: 'quote.received' },
          { name: 'Quote Accepted', value: 'quote.accepted' },
          { name: 'Quote Rejected', value: 'quote.rejected' },
          { name: 'Quote Expired', value: 'quote.expired' },
          { name: 'All Events', value: '*' }
        ],
        required: true
      }
    ]
  }

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData('node')
        if (typeof data.endpointId !== 'string' || typeof data.organizationId !== 'string') {
          return false
        }
        // Confirm the endpoint still exists on the Exayard side — if it was
        // deleted from the dashboard, clear local state and return false so
        // n8n re-runs create() instead of staying silently dead.
        const credentials = await this.getCredentials('exayardApi')
        const client = new ExayardClient({
          apiKey: credentials.apiKey as string,
          baseUrl: (credentials.baseUrl as string) || undefined
        })
        const endpoints = (await client.webhooks.listEndpoints({
          organizationId: data.organizationId
        })) as Array<{ _id?: string }>
        const exists = endpoints.some(e => e._id === data.endpointId)
        if (!exists) {
          delete data.endpointId
          delete data.endpointSecret
          delete data.organizationId
        }
        return exists
      },
      async create(this: IHookFunctions): Promise<boolean> {
        const credentials = await this.getCredentials('exayardApi')
        const events = this.getNodeParameter('events') as string[]
        const url = this.getNodeWebhookUrl('default')
        if (!url) {
          throw new NodeOperationError(this.getNode(), 'n8n did not provide a webhook URL.')
        }
        const client = new ExayardClient({
          apiKey: credentials.apiKey as string,
          baseUrl: (credentials.baseUrl as string) || undefined
        })
        // Org id: explicit field, or derived from the API key via GET /me — the
        // same behavior as the Zapier and Make connectors.
        let organizationId = (this.getNodeParameter('organizationId', '') as string).trim()
        if (!organizationId) {
          const me = (await client.me.get()) as { memberships?: Array<{ orgId?: string }> }
          organizationId = me.memberships?.[0]?.orgId ?? ''
          if (!organizationId) {
            throw new NodeOperationError(
              this.getNode(),
              'Could not determine an organization for this API key. Use an organization-scoped key, or set the Organization ID field.'
            )
          }
        }
        const res = await client.webhooks.createEndpoint({
          organizationId,
          url,
          events,
          description: 'n8n trigger'
        })
        const data = this.getWorkflowStaticData('node')
        data.endpointId = res.id
        data.endpointSecret = res.secret
        data.organizationId = organizationId
        return true
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        const data = this.getWorkflowStaticData('node')
        if (typeof data.endpointId !== 'string' || typeof data.organizationId !== 'string') {
          return true
        }
        const credentials = await this.getCredentials('exayardApi')
        const client = new ExayardClient({
          apiKey: credentials.apiKey as string,
          baseUrl: (credentials.baseUrl as string) || undefined
        })
        try {
          await client.webhooks.deleteEndpoint(data.endpointId, { organizationId: data.organizationId })
        } catch {
          // Best-effort cleanup; Exayard might have already removed the endpoint.
        }
        delete data.endpointId
        delete data.endpointSecret
        delete data.organizationId
        return true
      }
    }
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const req = this.getRequestObject()
    const res = this.getResponseObject()
    const signature = (req.headers['exayard-signature'] || req.headers['Exayard-Signature']) as string | undefined
    const data = this.getWorkflowStaticData('node')
    const secret = data.endpointSecret as string | undefined

    // Failure statuses must be written to the response object directly —
    // returning `webhookResponse` sends it as the response BODY with the
    // default 200 status, and Exayard treats any 2xx as delivered (no retry).
    if (!signature || !secret) {
      // Missing secret usually means the workflow was activated without
      // the create() hook completing — 400 makes Exayard retry until the
      // secret is in place.
      res.status(400).json({ error: 'missing_signature_or_secret' })
      return { noWebhookResponse: true }
    }

    // Verify against the exact wire bytes Exayard signed. n8n exposes them
    // as req.rawBody; re-serializing the parsed body is only a fallback —
    // it matches today's payloads but is not byte-stable in general.
    if (!req.rawBody) {
      await req.readRawBody?.()
    }
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(this.getBodyData())
    try {
      const event = await constructWebhookEvent(rawBody, signature, secret)
      return { workflowData: [[{ json: event as unknown as IDataObject }]] }
    } catch (err) {
      if (err instanceof WebhookSignatureError) {
        // 401 tells Exayard the signature failed; it will retry with
        // exponential backoff up to 3 days, but in practice signature
        // failures mean a config issue and should be loud.
        res.status(401).json({ error: err.code, detail: err.message })
        return { noWebhookResponse: true }
      }
      throw err
    }
  }
}
