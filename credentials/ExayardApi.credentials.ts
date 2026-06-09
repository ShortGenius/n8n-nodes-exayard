import type { ICredentialType, INodeProperties } from 'n8n-workflow'

/**
 * Credential type for the Exayard n8n nodes.
 *
 * Stores an Exayard API key generated at
 * https://app.exayard.com/settings/developer. The key is sent on every
 * request as `Authorization: Bearer <key>`.
 */
export class ExayardApi implements ICredentialType {
  name = 'exayardApi'
  displayName = 'Exayard API'
  documentationUrl = 'https://developers.exayard.com/authentication'

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description:
        'Generate one at Exayard → Settings → Developer. Scope to read:* or read:*/write:* depending on what this workflow needs.'
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://api.exayard.com/v1',
      description: 'Override only if you are pointing at a non-production deployment.'
    }
  ]
}
