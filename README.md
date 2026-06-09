# n8n-nodes-exayard

n8n community node for [Exayard](https://exayard.com) — AI-powered construction takeoffs, estimates, and bids.

## Install

In your n8n instance:

```
npm install n8n-nodes-exayard
```

Restart n8n. The package ships two nodes (`Exayard` and `Exayard Trigger`) and one credential type (`Exayard API`).

## Authentication

1. Sign in to Exayard at https://exayard.com.
2. Open **Settings → Developer** and create an API key. Scope it to read or write per resource — least-privilege keys keep workflows safe.
3. In n8n, **Credentials → New → Exayard API** and paste the key. The default base URL (`https://api.exayard.com/v1`) is correct for production.

## Nodes

### Exayard (action)

| Resource | Operations |
|---|---|
| Project  | List, Get, Create, Archive, Export |
| Webhook  | List Endpoints, Create Endpoint, Delete Endpoint, List Deliveries |
| Help     | Search |
| Me       | Get |

### Exayard Trigger

Subscribes to Exayard lifecycle events and emits a workflow run per delivery. Supported events:

- `project.{created,updated,archived}`
- `assessment.{started,completed,approved,cancelled}`
- `estimate.generated`
- `bid.generated`
- `file.processed`
- `*` (all events)

Activating the trigger registers a webhook endpoint at Exayard pointing at the n8n production URL. Deactivating it deletes the endpoint so you do not leak orphan subscriptions. Signatures are verified per-delivery (HMAC-SHA256, 5-minute timestamp window).

## Links

- Marketing landing page: https://exayard.com/integrations/n8n
- API docs: https://developers.exayard.com
- OpenAPI: https://api.exayard.com/v1/openapi.json
- Status: https://status.exayard.com
- Source: https://github.com/ShortGenius/n8n-nodes-exayard

## License

MIT.
