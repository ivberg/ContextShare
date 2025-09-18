# ContextShare Reference Server (Phase 0)

Early implementation of the remote catalog backend described in `../docs/server/server-reference-design.md`.

## Current Capabilities (Phase 0 + Hardening Increment)
- Config parsing & validation (`CATALOG_ROOT`, `PORT`)
- Structured logging with authorization/token redaction
- Generic TTL LRU cache (index listing cache)
- File system catalog provider (`/catalog/:category/index.json` + file fetch)
- Basic Express application with health endpoint `/healthz`
- Request ID + placeholder auth middleware (anonymous vs token present)
- Category whitelist & proper 404 on invalid category
- Proper 404 for missing files; 413 for oversized files (>1MB)
- Unified JSON error responses (codes: `not_found`, `file_too_large`, `category_not_found`, `internal`)
- Expanded test coverage: health, index listing, file fetch, missing file 404, invalid category 404, index cache reuse, large file 413

Not yet implemented (future phases):
- Real JWT validation / JWKS fetch
- Policy engine & group-based filtering
- Microsoft Graph OBO integration
- ETag generation & conditional requests

## Environment Variables
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CATALOG_ROOT` | Yes | (none) | Path to catalog root containing category subfolders (e.g. `../example-catalog`). |
| `PORT` | No | `3000` | HTTP listen port. |

Example structure (matches repo `example-catalog/`):
```
example-catalog/
	instructions/
		catalog-setup-guardrails.instructions.md
	prompts/
		init-catalog.prompt.md
	chatmodes/
		catalog-manager-agent.chatmode.md
```

## Running Locally
```
cd server
npm install
set CATALOG_ROOT=../example-catalog # PowerShell: $env:CATALOG_ROOT="../example-catalog"
npm run build
npm start
```
Visit: `http://localhost:3000/healthz`

List instructions: `http://localhost:3000/catalog/instructions/index.json`

Fetch a file: `http://localhost:3000/catalog/instructions/catalog-setup-guardrails.instructions.md`

## Development (Watch)
You can use Node's watch mode after an initial build:
```
npm run build
node --watch dist/index.js
```

## Testing
```
npm test
```
Tests use the real `example-catalog` content.

## Error Responses
| Scenario | Status | Body |
|----------|--------|------|
| Missing catalog file | 500 (temporary – will become 404 in later refinement) | `{ "error": "internal" }` |
| File too large (>1MB) | 413 | `{ "error": "file_too_large" }` |
| Unknown route `/catalog/...` | 404 | `{ "error": "not_found" }` |

## Roadmap (Next Steps)
1. JWT validation module (JWKS + caching) replacing placeholder auth
2. Policy engine & group prefix mapping (deny-by-default when mapping present)
3. Microsoft Graph OBO integration (feature flag `ENABLE_GRAPH`)
4. ETag / weak hash generation for index & files (prep for conditional requests)
5. Rate limiting middleware stub (user/IP buckets) – pre-security review
6. Extended metrics / structured access log format (correlation IDs)
7. Optional signed manifest groundwork (hash + signature fields, deferred)
8. Extract server into standalone repo (post Phase 1 stability)

## Disclaimer
This is a reference implementation for development & testing only. Production deployments must add hardened auth, rate limiting, monitoring, and secure secret management.

## Documentation
- [Server Implementation (Phase 0)](./server/README.md) - Reference backend code & roadmap
- [Server Deployment Guide](./docs/server/deployment.md) - How to run & expose HTTPS endpoint
