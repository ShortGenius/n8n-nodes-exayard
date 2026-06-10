# n8n-nodes-exayard

n8n community node for [Exayard](https://exayard.com) — AI-powered construction takeoffs, estimates, and bids.

## Install

In your n8n instance:

```
npm install n8n-nodes-exayard
```

Restart n8n. The package ships two nodes (`Exayard` and `Exayard Trigger`) and one credential type (`Exayard API`).

## Authentication

1. Sign in to Exayard and open **Settings → Developer** at https://app.exayard.com/settings/developer to create an API key. Scope it to read or write per resource — least-privilege keys keep workflows safe.
2. In n8n, **Credentials → New → Exayard API** and paste the key, then hit **Test**. The default base URL (`https://api.exayard.com/v1`) is correct for production.
3. **Organization ID is optional everywhere** — leave the field blank and the node derives the organization from the API key automatically.

## Nodes

### Exayard (action)

| Resource | Operations |
|---|---|
| Project | List, Get, Create, List Pages, Archive, Export |
| Assessment | Run AI Takeoff, Propose Elements, Get Latest, List, Get by ID, Get Takeoff Totals |
| Estimate | Generate |
| Bid | Generate |
| Vendor Price | Set |
| Quote | Request, Record Response, Update Status |
| File | Upload |
| Webhook | List Endpoints, Create Endpoint, Delete Endpoint, List Deliveries |
| Help | Search |
| Me | Get |

### Exayard Trigger

Subscribes to Exayard lifecycle events and emits a workflow run per delivery. Supported events:

- `project.{created,updated,archived}`
- `assessment.{started,completed,approved,cancelled,failed}`
- `estimate.generated`
- `bid.generated`
- `file.processed`
- `quote.{requested,received,accepted,rejected,expired}`
- `*` (all events)

## Use as an AI Agent tool

The Exayard node is marked `usableAsTool`, so an n8n **AI Agent** can call it directly: add the AI Agent node, click the **Tool** connector, and pick **Exayard**. The agent can then list projects, run takeoffs, generate estimates, and more from natural-language instructions.

Self-hosted instances must allow community nodes as tools by setting the environment variable `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`.

Activating the trigger registers a webhook endpoint at Exayard pointing at the n8n production URL. Deactivating it deletes the endpoint so you do not leak orphan subscriptions. Signatures are verified per-delivery (HMAC-SHA256, 5-minute timestamp window).

## Links

- Marketing landing page: https://exayard.com/integrations/n8n
- API docs: https://developers.exayard.com
- OpenAPI: https://api.exayard.com/v1/openapi.json
- Status: https://status.exayard.com
- Source: https://github.com/ShortGenius/n8n-nodes-exayard

## License

MIT.
