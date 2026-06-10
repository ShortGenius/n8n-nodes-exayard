import { Exayard as ExayardClient, ExayardError } from '../../src/vendor'
import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'

/**
 * Action node for the Exayard API.
 *
 * Mirrors the @exayard/sdk surface: Projects, Webhooks, Help, Me.
 * Each operation maps directly to a method on the SDK client so the
 * shape stays in sync when new endpoints land.
 */
export class Exayard implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Exayard',
    name: 'exayard',
    icon: 'file:Exayard.svg',
    group: ['transform'],
    version: 1,
    usableAsTool: true,
    subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
    description: 'AI-powered construction takeoffs, estimates, and bids',
    defaults: { name: 'Exayard' },
    inputs: ['main'] as INodeTypeDescription['inputs'],
    outputs: ['main'] as INodeTypeDescription['outputs'],
    credentials: [{ name: 'exayardApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        default: 'project',
        options: [
          { name: 'Project', value: 'project' },
          { name: 'Assessment', value: 'assessment' },
          { name: 'Estimate', value: 'estimate' },
          { name: 'Bid', value: 'bid' },
          { name: 'Vendor Price', value: 'vendorPrice' },
          { name: 'Quote', value: 'quote' },
          { name: 'File', value: 'file' },
          { name: 'Webhook', value: 'webhook' },
          { name: 'Help', value: 'help' },
          { name: 'Me', value: 'me' }
        ]
      },
      // Project operations
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'list',
        displayOptions: { show: { resource: ['project'] } },
        options: [
          { name: 'List', value: 'list', action: 'List projects', description: 'List projects in an organization' },
          { name: 'Get', value: 'get', action: 'Get a project', description: 'Get a single project by ID' },
          { name: 'Create', value: 'create', action: 'Create a project', description: 'Create a new project' },
          { name: 'List Pages', value: 'listPages', action: 'List pages in a project', description: 'List a project\'s pages (grouped by file)' },
          { name: 'Archive', value: 'archive', action: 'Archive a project', description: 'Archive an existing project' },
          { name: 'Export', value: 'export', action: 'Export a project', description: 'Export project data' }
        ]
      },
      // File operations
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'upload',
        displayOptions: { show: { resource: ['file'] } },
        options: [
          { name: 'Upload', value: 'upload', action: 'Upload a file to a project', description: 'Upload a binary file (e.g. a PDF) to a project' }
        ]
      },
      // Webhook operations
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'list',
        displayOptions: { show: { resource: ['webhook'] } },
        options: [
          { name: 'List Endpoints', value: 'list', action: 'List webhook endpoints' },
          { name: 'Create Endpoint', value: 'create', action: 'Create a webhook endpoint' },
          { name: 'Delete Endpoint', value: 'delete', action: 'Delete a webhook endpoint' },
          { name: 'List Deliveries', value: 'deliveries', action: 'List deliveries for an endpoint' }
        ]
      },
      // Help operations
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'search',
        displayOptions: { show: { resource: ['help'] } },
        options: [{ name: 'Search', value: 'search', action: 'Search help articles' }]
      },
      // Me operations
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'get',
        displayOptions: { show: { resource: ['me'] } },
        options: [{ name: 'Get', value: 'get', action: 'Get the authenticated identity' }]
      },
      // Estimate operations
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'generate',
        displayOptions: { show: { resource: ['estimate'] } },
        options: [
          {
            name: 'Generate',
            value: 'generate',
            action: 'Generate an estimate',
            description: 'Generate an estimate document from a project'
          }
        ]
      },
      // Bid operations
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'generate',
        displayOptions: { show: { resource: ['bid'] } },
        options: [
          {
            name: 'Generate',
            value: 'generate',
            action: 'Generate a bid',
            description: 'Generate a bid document from a project'
          }
        ]
      },
      // Vendor Price operations
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'set',
        displayOptions: { show: { resource: ['vendorPrice'] } },
        options: [
          {
            name: 'Set',
            value: 'set',
            action: 'Set a vendor price for a product',
            description: 'Create or replace a product\'s price for a vendor'
          }
        ]
      },
      // Estimate: Generate — org, project, prompt, optional notes/context
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['estimate'], operation: ['generate'] } }
      },
      {
        displayName: 'Project ID',
        name: 'projectId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard project ID to estimate',
        displayOptions: { show: { resource: ['estimate'], operation: ['generate'] } }
      },
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        default: '',
        required: true,
        description: 'What to estimate (natural-language prompt)',
        displayOptions: { show: { resource: ['estimate'], operation: ['generate'] } }
      },
      {
        displayName: 'Notes',
        name: 'notes',
        type: 'string',
        default: '',
        description: 'Optional notes to guide the estimate',
        displayOptions: { show: { resource: ['estimate'], operation: ['generate'] } }
      },
      {
        displayName: 'Measurement Context',
        name: 'measurementContext',
        type: 'string',
        default: '',
        description: 'Optional measurement context to include',
        displayOptions: { show: { resource: ['estimate'], operation: ['generate'] } }
      },
      // Bid: Generate — org, project, optional notes/context/flags
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['bid'], operation: ['generate'] } }
      },
      {
        displayName: 'Project ID',
        name: 'projectId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard project ID to bid on',
        displayOptions: { show: { resource: ['bid'], operation: ['generate'] } }
      },
      {
        displayName: 'Notes',
        name: 'notes',
        type: 'string',
        default: '',
        description: 'Optional notes to guide the bid',
        displayOptions: { show: { resource: ['bid'], operation: ['generate'] } }
      },
      {
        displayName: 'Measurement Context',
        name: 'measurementContext',
        type: 'string',
        default: '',
        description: 'Optional measurement context to include',
        displayOptions: { show: { resource: ['bid'], operation: ['generate'] } }
      },
      {
        displayName: 'Ignore Missing Variables',
        name: 'ignoreMissingVariables',
        type: 'boolean',
        default: false,
        description: 'Whether to generate the bid even if some template variables are missing',
        displayOptions: { show: { resource: ['bid'], operation: ['generate'] } }
      },
      // Vendor Price: Set — org, product, vendor, price + optional fields
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['vendorPrice'], operation: ['set'] } }
      },
      {
        displayName: 'Product ID',
        name: 'productId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard product ID',
        displayOptions: { show: { resource: ['vendorPrice'], operation: ['set'] } }
      },
      {
        displayName: 'Vendor ID',
        name: 'vendorId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard vendor ID',
        displayOptions: { show: { resource: ['vendorPrice'], operation: ['set'] } }
      },
      {
        displayName: 'Price Per Unit',
        name: 'pricePerUnit',
        type: 'number',
        default: 0,
        required: true,
        description: 'Vendor price per unit for this product',
        displayOptions: { show: { resource: ['vendorPrice'], operation: ['set'] } }
      },
      {
        displayName: 'Min Order Quantity',
        name: 'minOrderQuantity',
        type: 'number',
        default: 0,
        description: 'Optional minimum order quantity',
        displayOptions: { show: { resource: ['vendorPrice'], operation: ['set'] } }
      },
      {
        displayName: 'Lead Time Days',
        name: 'leadTimeDays',
        type: 'number',
        default: 0,
        description: 'Optional lead time in days',
        displayOptions: { show: { resource: ['vendorPrice'], operation: ['set'] } }
      },
      {
        displayName: 'Notes',
        name: 'notes',
        type: 'string',
        default: '',
        description: 'Optional notes about this price',
        displayOptions: { show: { resource: ['vendorPrice'], operation: ['set'] } }
      },
      // Quote operations
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'create',
        displayOptions: { show: { resource: ['quote'] } },
        options: [
          {
            name: 'Request Quote',
            value: 'create',
            action: 'Request a quote from a vendor',
            description: 'Request a quote from a vendor for a project'
          },
          {
            name: 'Record Quote Response',
            value: 'receive',
            action: 'Record a vendor\'s quote response',
            description: 'Record the vendor\'s response to a requested quote'
          },
          {
            name: 'Update Quote Status',
            value: 'updateStatus',
            action: 'Update a quote\'s status',
            description: 'Mark a quote as accepted, rejected, or expired'
          }
        ]
      },
      // Quote: Request Quote — org, project, vendor, quote number + optional details
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Project ID',
        name: 'projectId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard project ID to request the quote for',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Vendor ID',
        name: 'vendorId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard vendor ID to request the quote from',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Quote Number',
        name: 'quoteNumber',
        type: 'string',
        default: '',
        required: true,
        description: 'Your reference number for this quote',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Line Items',
        name: 'lineItems',
        type: 'json',
        default: '[]',
        description: 'Optional array of { description, quantity, unit, unitPrice, totalPrice, productId? }',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Subtotal',
        name: 'subtotal',
        type: 'number',
        default: 0,
        description: 'Optional subtotal amount',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Tax',
        name: 'tax',
        type: 'number',
        default: 0,
        description: 'Optional tax amount',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Shipping',
        name: 'shipping',
        type: 'number',
        default: 0,
        description: 'Optional shipping amount',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Total',
        name: 'total',
        type: 'number',
        default: 0,
        description: 'Optional total amount',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Valid Until',
        name: 'validUntil',
        type: 'number',
        default: 0,
        description: 'Optional expiry as epoch milliseconds',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      {
        displayName: 'Notes',
        name: 'notes',
        type: 'string',
        default: '',
        description: 'Optional notes for the vendor',
        displayOptions: { show: { resource: ['quote'], operation: ['create'] } }
      },
      // Quote: Record Quote Response — org, quote, line items + totals
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['quote'], operation: ['receive'] } }
      },
      {
        displayName: 'Quote ID',
        name: 'quoteId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard quote ID to record the response for',
        displayOptions: { show: { resource: ['quote'], operation: ['receive'] } }
      },
      {
        displayName: 'Line Items',
        name: 'lineItems',
        type: 'json',
        default: '[]',
        required: true,
        description: 'Array of { description, quantity, unit, unitPrice, totalPrice, productId? }',
        displayOptions: { show: { resource: ['quote'], operation: ['receive'] } }
      },
      {
        displayName: 'Subtotal',
        name: 'subtotal',
        type: 'number',
        default: 0,
        required: true,
        description: 'Subtotal amount',
        displayOptions: { show: { resource: ['quote'], operation: ['receive'] } }
      },
      {
        displayName: 'Tax',
        name: 'tax',
        type: 'number',
        default: 0,
        description: 'Optional tax amount',
        displayOptions: { show: { resource: ['quote'], operation: ['receive'] } }
      },
      {
        displayName: 'Shipping',
        name: 'shipping',
        type: 'number',
        default: 0,
        description: 'Optional shipping amount',
        displayOptions: { show: { resource: ['quote'], operation: ['receive'] } }
      },
      {
        displayName: 'Total',
        name: 'total',
        type: 'number',
        default: 0,
        required: true,
        description: 'Total amount',
        displayOptions: { show: { resource: ['quote'], operation: ['receive'] } }
      },
      {
        displayName: 'Valid Until',
        name: 'validUntil',
        type: 'number',
        default: 0,
        description: 'Optional expiry as epoch milliseconds',
        displayOptions: { show: { resource: ['quote'], operation: ['receive'] } }
      },
      // Quote: Update Quote Status — org, quote, status
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['quote'], operation: ['updateStatus'] } }
      },
      {
        displayName: 'Quote ID',
        name: 'quoteId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard quote ID to update',
        displayOptions: { show: { resource: ['quote'], operation: ['updateStatus'] } }
      },
      {
        displayName: 'Status',
        name: 'status',
        type: 'options',
        default: 'accepted',
        required: true,
        description: 'New status for the quote',
        options: [
          { name: 'Accepted', value: 'accepted' },
          { name: 'Rejected', value: 'rejected' },
          { name: 'Expired', value: 'expired' }
        ],
        displayOptions: { show: { resource: ['quote'], operation: ['updateStatus'] } }
      },
      // Assessment operations (read-only AI takeoff results). These endpoints
      // resolve the org from the project/assessment, so no Organization ID is
      // needed. Pair with the Assessment Completed trigger to fetch results.
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'latest',
        displayOptions: { show: { resource: ['assessment'] } },
        options: [
          { name: 'Run', value: 'run', action: 'Run an AI takeoff to completion', description: 'Detect the given elements on the given pages (no approval step)' },
          { name: 'Propose', value: 'propose', action: 'Propose elements via AI prompt', description: 'Ask the AI what to measure: prompt + pages -> proposed elements' },
          { name: 'Get Latest', value: 'latest', action: 'Get the latest assessment for a project', description: 'Most recent assessment with detected elements' },
          { name: 'List', value: 'list', action: 'List assessments for a project' },
          { name: 'Get', value: 'get', action: 'Get an assessment by ID' },
          { name: 'Get Takeoff Summary', value: 'summary', action: 'Get aggregated takeoff totals for a project', description: 'Aggregated count / linear / area totals' }
        ]
      },
      // Assessment: project-scoped ops need a Project ID
      {
        displayName: 'Project ID',
        name: 'projectId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard project ID',
        displayOptions: { show: { resource: ['assessment'], operation: ['run', 'propose', 'latest', 'list', 'summary'] } }
      },
      // Assessment: Run needs the org, which pages, and what to detect
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['assessment'], operation: ['run'] } }
      },
      {
        displayName: 'Page IDs',
        name: 'pageIds',
        type: 'string',
        default: '',
        required: true,
        description: 'Comma-separated page IDs to analyze',
        displayOptions: { show: { resource: ['assessment'], operation: ['run'] } }
      },
      {
        displayName: 'Elements (JSON)',
        name: 'elements',
        type: 'json',
        default: '[]',
        required: true,
        description: 'What to detect: array of { id, name, category (area|linear|count), hexColor }',
        displayOptions: { show: { resource: ['assessment'], operation: ['run'] } }
      },
      // Assessment: Propose needs the org, a prompt, and optionally which pages
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['assessment'], operation: ['propose'] } }
      },
      {
        displayName: 'Prompt',
        name: 'prompt',
        type: 'string',
        default: '',
        required: true,
        description: 'Natural-language description of what to measure',
        displayOptions: { show: { resource: ['assessment'], operation: ['propose'] } }
      },
      {
        displayName: 'Page IDs',
        name: 'pageIds',
        type: 'string',
        default: '',
        description: 'Optional comma-separated page IDs to scope the proposal',
        displayOptions: { show: { resource: ['assessment'], operation: ['propose'] } }
      },
      // Assessment: Get by ID needs an Assessment ID
      {
        displayName: 'Assessment ID',
        name: 'assessmentId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['assessment'], operation: ['get'] } }
      },
      // Shared org ID
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['project', 'webhook'] } }
      },
      // Project: Get / Archive / Export / List Pages — ID
      {
        displayName: 'Project ID',
        name: 'projectId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['project'], operation: ['get', 'archive', 'export', 'listPages'] } }
      },
      // Project: List — optional filters
      {
        displayName: 'Status',
        name: 'status',
        type: 'string',
        default: '',
        description: 'Optional status filter (active, draft, archived, etc.)',
        displayOptions: { show: { resource: ['project'], operation: ['list'] } }
      },
      {
        displayName: 'Search',
        name: 'search',
        type: 'string',
        default: '',
        description: 'Free-text search across project names',
        displayOptions: { show: { resource: ['project'], operation: ['list'] } }
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        default: 50,
        typeOptions: { minValue: 1, maxValue: 200 },
        description: 'Max number of projects per page',
        displayOptions: { show: { resource: ['project'], operation: ['list'] } }
      },
      // Project: Create — name
      {
        displayName: 'Name',
        name: 'name',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['project'], operation: ['create'] } }
      },
      // Webhook: Create — url + events
      {
        displayName: 'Endpoint URL',
        name: 'url',
        type: 'string',
        default: '',
        required: true,
        placeholder: 'https://example.com/webhooks/exayard',
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } }
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
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } }
      },
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        default: '',
        displayOptions: { show: { resource: ['webhook'], operation: ['create'] } }
      },
      // Webhook: Delete / Deliveries — endpoint ID
      {
        displayName: 'Endpoint ID',
        name: 'endpointId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['webhook'], operation: ['delete', 'deliveries'] } }
      },
      // Help: Search — query
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { resource: ['help'], operation: ['search'] } }
      },
      // File: Upload — org, project, and the incoming binary property
      {
        displayName: 'Organization ID',
        name: 'organizationId',
        type: 'string',
        default: '',
        required: false,
        description: 'Exayard organization ID (org_...). Leave blank to derive it from the API key.',
        displayOptions: { show: { resource: ['file'], operation: ['upload'] } }
      },
      {
        displayName: 'Project ID',
        name: 'projectId',
        type: 'string',
        default: '',
        required: true,
        description: 'Exayard project ID to upload the file into',
        displayOptions: { show: { resource: ['file'], operation: ['upload'] } }
      },
      {
        displayName: 'Binary Property',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        required: true,
        description: 'Name of the binary property on the incoming item that holds the file',
        displayOptions: { show: { resource: ['file'], operation: ['upload'] } }
      }
    ]
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials('exayardApi')
    const client = new ExayardClient({
      apiKey: credentials.apiKey as string,
      baseUrl: (credentials.baseUrl as string) || undefined
    })

    // Organization id: use the explicit field if set, otherwise derive it from
    // the API key via GET /me (first membership) — matching the Zapier and Make
    // connectors, where users never paste an org id. Resolved once and cached.
    let cachedOrgId: string | undefined
    const resolveOrg = async (itemIndex: number): Promise<string> => {
      const explicit = (this.getNodeParameter('organizationId', itemIndex, '') as string).trim()
      if (explicit) return explicit
      if (cachedOrgId) return cachedOrgId
      const me = (await client.me.get()) as { memberships?: Array<{ orgId?: string }> }
      const derived = me.memberships?.[0]?.orgId
      if (!derived) {
        throw new NodeOperationError(
          this.getNode(),
          'Could not determine an organization for this API key. Use an organization-scoped key, or set the Organization ID field.'
        )
      }
      cachedOrgId = derived
      return cachedOrgId
    }

    const items = this.getInputData()
    const out: INodeExecutionData[] = []

    for (let i = 0; i < items.length; i++) {
      const resource = this.getNodeParameter('resource', i) as string
      const operation = this.getNodeParameter('operation', i) as string

      try {
        let result: unknown

        if (resource === 'me') {
          result = await client.me.get()
        } else if (resource === 'project') {
          const organizationId = await resolveOrg(i)
          if (operation === 'list') {
            const status = this.getNodeParameter('status', i, '') as string
            const search = this.getNodeParameter('search', i, '') as string
            // Note: GET /v1/projects has no limit/cursor pagination yet, so the
            // "Limit" field is not forwarded — kept in the UI for forward-compat.
            result = await client.projects.list({
              organizationId,
              status: status || undefined,
              search: search || undefined
            })
          } else if (operation === 'get') {
            const projectId = this.getNodeParameter('projectId', i) as string
            result = await client.projects.get(projectId, { organizationId })
          } else if (operation === 'create') {
            const name = this.getNodeParameter('name', i) as string
            result = await client.projects.create({ organizationId, name })
          } else if (operation === 'listPages') {
            const projectId = this.getNodeParameter('projectId', i) as string
            result = await client.pages.list(projectId, { organizationId })
          } else if (operation === 'archive') {
            const projectId = this.getNodeParameter('projectId', i) as string
            await client.projects.archive(projectId, { organizationId })
            result = { ok: true, archived: projectId }
          } else if (operation === 'export') {
            const projectId = this.getNodeParameter('projectId', i) as string
            result = await client.projects.export(projectId, { organizationId })
          }
        } else if (resource === 'webhook') {
          const organizationId = await resolveOrg(i)
          if (operation === 'list') {
            result = await client.webhooks.listEndpoints({ organizationId })
          } else if (operation === 'create') {
            const url = this.getNodeParameter('url', i) as string
            const events = this.getNodeParameter('events', i) as string[]
            const description = this.getNodeParameter('description', i, '') as string
            result = await client.webhooks.createEndpoint({
              organizationId,
              url,
              events,
              description: description || undefined
            })
          } else if (operation === 'delete') {
            const endpointId = this.getNodeParameter('endpointId', i) as string
            await client.webhooks.deleteEndpoint(endpointId, { organizationId })
            result = { ok: true, deleted: endpointId }
          } else if (operation === 'deliveries') {
            const endpointId = this.getNodeParameter('endpointId', i) as string
            result = await client.webhooks.listDeliveries(endpointId, { organizationId })
          }
        } else if (resource === 'assessment') {
          if (operation === 'run') {
            const projectId = this.getNodeParameter('projectId', i) as string
            const organizationId = await resolveOrg(i)
            const pageIds = (this.getNodeParameter('pageIds', i, '') as string)
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
            const elementsRaw = this.getNodeParameter('elements', i, '[]') as string | unknown[]
            const elements = (
              typeof elementsRaw === 'string' ? JSON.parse(elementsRaw) : elementsRaw
            ) as Array<{ id: string; name: string; category: 'area' | 'linear' | 'count'; hexColor: string }>
            result = await client.assessments.run(projectId, { organizationId, pageIds, elements })
          } else if (operation === 'propose') {
            const projectId = this.getNodeParameter('projectId', i) as string
            const organizationId = await resolveOrg(i)
            const prompt = this.getNodeParameter('prompt', i) as string
            const pageIds = (this.getNodeParameter('pageIds', i, '') as string)
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
            result = await client.assessments.propose(projectId, {
              organizationId,
              prompt,
              pageIds: pageIds.length > 0 ? pageIds : undefined
            })
          } else if (operation === 'latest') {
            const projectId = this.getNodeParameter('projectId', i) as string
            result = await client.assessments.latest(projectId)
          } else if (operation === 'list') {
            const projectId = this.getNodeParameter('projectId', i) as string
            result = await client.assessments.list(projectId)
          } else if (operation === 'get') {
            const assessmentId = this.getNodeParameter('assessmentId', i) as string
            result = await client.assessments.get(assessmentId)
          } else if (operation === 'summary') {
            const projectId = this.getNodeParameter('projectId', i) as string
            result = await client.assessments.takeoffSummary(projectId)
          }
        } else if (resource === 'estimate') {
          if (operation === 'generate') {
            const organizationId = await resolveOrg(i)
            const projectId = this.getNodeParameter('projectId', i) as string
            const query = this.getNodeParameter('query', i) as string
            const notes = this.getNodeParameter('notes', i, '') as string
            const measurementContext = this.getNodeParameter('measurementContext', i, '') as string
            result = await client.estimates.generate(projectId, {
              organizationId,
              query,
              notes: notes || undefined,
              measurementContext: measurementContext || undefined
            })
          }
        } else if (resource === 'bid') {
          if (operation === 'generate') {
            const organizationId = await resolveOrg(i)
            const projectId = this.getNodeParameter('projectId', i) as string
            const notes = this.getNodeParameter('notes', i, '') as string
            const measurementContext = this.getNodeParameter('measurementContext', i, '') as string
            const ignoreMissingVariables = this.getNodeParameter('ignoreMissingVariables', i, false) as boolean
            result = await client.bids.generate(projectId, {
              organizationId,
              notes: notes || undefined,
              measurementContext: measurementContext || undefined,
              ignoreMissingVariables: ignoreMissingVariables || undefined
            })
          }
        } else if (resource === 'vendorPrice') {
          if (operation === 'set') {
            const organizationId = await resolveOrg(i)
            const productId = this.getNodeParameter('productId', i) as string
            const vendorId = this.getNodeParameter('vendorId', i) as string
            const pricePerUnit = this.getNodeParameter('pricePerUnit', i) as number
            const minOrderQuantity = this.getNodeParameter('minOrderQuantity', i, 0) as number
            const leadTimeDays = this.getNodeParameter('leadTimeDays', i, 0) as number
            const notes = this.getNodeParameter('notes', i, '') as string
            result = await client.products.setPrice(productId, vendorId, {
              organizationId,
              pricePerUnit,
              minOrderQuantity: minOrderQuantity || undefined,
              leadTimeDays: leadTimeDays || undefined,
              notes: notes || undefined
            })
          }
        } else if (resource === 'quote') {
          // Line items arrive via an n8n `json` field, which may already be a
          // parsed array or a raw JSON string. Normalize to a real array (or
          // undefined when blank).
          type QuoteLineItem = {
            description: string
            quantity: number
            unit: string
            unitPrice: number
            totalPrice: number
            productId?: string
          }
          const parseLineItems = (raw: string | unknown[]): QuoteLineItem[] | undefined => {
            const parsed = (typeof raw === 'string' ? (raw.trim() ? JSON.parse(raw) : []) : raw) as QuoteLineItem[]
            return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined
          }
          if (operation === 'create') {
            const organizationId = await resolveOrg(i)
            const projectId = this.getNodeParameter('projectId', i) as string
            const vendorId = this.getNodeParameter('vendorId', i) as string
            const quoteNumber = this.getNodeParameter('quoteNumber', i) as string
            const lineItems = parseLineItems(this.getNodeParameter('lineItems', i, '[]') as string | unknown[])
            const subtotal = this.getNodeParameter('subtotal', i, 0) as number
            const tax = this.getNodeParameter('tax', i, 0) as number
            const shipping = this.getNodeParameter('shipping', i, 0) as number
            const total = this.getNodeParameter('total', i, 0) as number
            const validUntil = this.getNodeParameter('validUntil', i, 0) as number
            const notes = this.getNodeParameter('notes', i, '') as string
            result = await client.quotes.request(projectId, {
              organizationId,
              vendorId,
              quoteNumber,
              lineItems,
              subtotal: subtotal || undefined,
              tax: tax || undefined,
              shipping: shipping || undefined,
              total: total || undefined,
              validUntil: validUntil || undefined,
              notes: notes || undefined
            })
          } else if (operation === 'receive') {
            const organizationId = await resolveOrg(i)
            const quoteId = this.getNodeParameter('quoteId', i) as string
            const lineItems = parseLineItems(this.getNodeParameter('lineItems', i, '[]') as string | unknown[]) ?? []
            const subtotal = this.getNodeParameter('subtotal', i) as number
            const tax = this.getNodeParameter('tax', i, 0) as number
            const shipping = this.getNodeParameter('shipping', i, 0) as number
            const total = this.getNodeParameter('total', i) as number
            const validUntil = this.getNodeParameter('validUntil', i, 0) as number
            result = await client.quotes.receive(quoteId, {
              organizationId,
              lineItems,
              subtotal,
              tax: tax || undefined,
              shipping: shipping || undefined,
              total,
              validUntil: validUntil || undefined
            })
          } else if (operation === 'updateStatus') {
            const organizationId = await resolveOrg(i)
            const quoteId = this.getNodeParameter('quoteId', i) as string
            const status = this.getNodeParameter('status', i) as 'accepted' | 'rejected' | 'expired'
            result = await client.quotes.updateStatus(quoteId, { organizationId, status })
          }
        } else if (resource === 'file') {
          if (operation === 'upload') {
            const organizationId = await resolveOrg(i)
            const projectId = this.getNodeParameter('projectId', i) as string
            const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string
            const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName)
            const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName)
            result = await client.files.upload({
              organizationId,
              projectId,
              filename: binaryData.fileName ?? 'upload.pdf',
              mimeType: binaryData.mimeType ?? 'application/pdf',
              bytes: new Uint8Array(buffer)
            })
          }
        } else if (resource === 'help') {
          const query = this.getNodeParameter('query', i) as string
          result = await client.help.search({ query })
        }

        if (result === undefined) {
          throw new NodeOperationError(
            this.getNode(),
            `Unsupported resource/operation combination: ${resource}.${operation}`,
            { itemIndex: i }
          )
        }

        // n8n expects each output item to be wrapped in { json: ... }.
        // Array-returning operations are split into one item per row so
        // downstream nodes can iterate naturally. Cast through unknown
        // because n8n's IDataObject is stricter than Record<string,
        // unknown> — values must be IDataObject | GenericValue, but
        // upstream SDK return types are intentionally loose.
        const push = (row: unknown) => {
          out.push({ json: row as unknown as IDataObject, pairedItem: { item: i } })
        }
        if (Array.isArray(result)) {
          for (const row of result) push(row)
        } else if (result && typeof result === 'object' && 'items' in result && Array.isArray((result as { items: unknown }).items)) {
          for (const row of (result as { items: unknown[] }).items) push(row)
        } else {
          push(result)
        }
      } catch (err) {
        const message =
          err instanceof ExayardError
            ? `${err.title} (${err.code}): ${err.detail}`
            : err instanceof Error
              ? err.message
              : String(err)
        // Per-item Continue On Fail: emit the error as this item's output and
        // keep going, so prior items' results survive and later items still run.
        if (this.continueOnFail()) {
          out.push({
            json: { error: message, ...(err instanceof ExayardError ? { code: err.code, status: err.status } : {}) },
            pairedItem: { item: i }
          })
          continue
        }
        if (err instanceof ExayardError) {
          // Surface RFC 9457 problem+json fields verbatim so workflow
          // branches can read code / detail / doc_url.
          throw new NodeOperationError(this.getNode(), message, {
            itemIndex: i,
            description: err.docUrl ? `See ${err.docUrl}` : undefined
          })
        }
        throw new NodeOperationError(this.getNode(), err as Error, { itemIndex: i })
      }
    }

    return [out]
  }
}
