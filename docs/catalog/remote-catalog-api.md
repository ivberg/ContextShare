# Remote Catalog API Guide

> Moved from root path `REMOTE_CATALOG_API.md` to `docs/catalog/remote-catalog-api.md`.

This document defines the server-side contract for exposing AI assistant catalog resources ("remote catalogs") that the ContextShare VS Code extension can consume over HTTPS. Implementing this API allows teams to centrally host chat modes, instruction sets, prompts, tasks, and MCP server definitions.

> Scope: This is a **pull-only, static-file** model. The extension performs authenticated (anonymous) HTTPS GET requests only. No POST/PUT/DELETE are required. Responses MUST be cacheable, deterministic, and free of sensitive data.

---
## 1. High-Level Model

A remote catalog is represented by one or more HTTPS base URLs provided via extension configuration (per-category override) that point either to:

1. A **single file URL** (e.g., `https://cdn.example.com/catalog/instructions/global.instructions.md`), or
2. A **directory-style URL ending with a slash** (e.g., `https://cdn.example.com/catalog/instructions/`) which MUST expose an `index.json` manifest enumerating file entries.

The client (ResourceService) treats each configured category override independently. There is **no multi-category recursive traversal** for remote URLs; discovery is per override.

---
## 2. Resource Categories & Filenames

| Category | Enum Value | Directory Name (runtime) | Allowed Remote File Types (convention) |
|----------|------------|---------------------------|-----------------------------------------|
| Chat Modes | `chatmodes` | `chatmodes/` | `*.chatmode.md` (Markdown) |
| Instructions | `instructions` | `instructions/` | `*.instructions.md` or legacy `*.instruction.md` |
| Prompts | `prompts` | `prompts/` | `*.prompt.md` |
| Tasks | `tasks` | `tasks/` | `*.task.json` (JSON or JSONC) |
| MCP | `mcp` | (merged into `.vscode/mcp.json`) | `*.mcp.json` (JSON or JSONC) |

The server does **not** need to enforce file extensions, but consistent naming helps categorization, downstream tooling, and human comprehension.

---
## 3. Directory Manifest: `index.json`

When a remote override ends with `/`, the extension requests `<base>index.json`.

### 3.1 Schema
`index.json` MUST be a UTF-8 encoded JSON array of file names (strings), with no nesting or metadata objects. Example:
```json
[
	"team-guidelines.instructions.md",
	"onboarding.chatmode.md",
	"build-system.prompt.md",
	"housekeeping.task.json"
]
```
Rules:
- Array only (no object wrapper)
- Each element is a raw file name (no paths, no `./`)
- No duplicates (duplicates will simply be ignored client-side if present)
- Filenames MUST NOT contain directory separators
- Filenames SHOULD already be sanitized (see Security) but the client will re-sanitize

### 3.2 Behavior
For each listed filename `F`:
1. Client validates `F` with `isSafeRelativeEntry(F)`; invalid entries are skipped silently.
2. Client applies `sanitizeFilename(F)` producing `safeName` (may differ from `F`).
3. Client performs GET on `<base><encodeURIComponent(safeName)>`.
4. Content is cached (TTL default 5 min) and stored under a runtime cache directory: `.copilot_catalog_cache/<category>/safeName`.

---
## 4. Single File URL Mode
If the override does **not** end with `/`, the URL is treated as a direct file. The client:
1. Downloads the content
2. Derives a local filename from the final path segment
3. Sanitizes it
4. Caches it identically to directory mode

---
## 5. HTTP & Transport Requirements

| Aspect | Requirement |
|--------|-------------|
| Protocol | `https://` only (hard-enforced) |
| Host Restrictions | Localhost & private RFC1918 / 172.16-31 ranges rejected client-side |
| Redirects | Up to 3 redirects (all must remain HTTPS & pass validation) |
| Timeout | 8 seconds per request (network timeout) |
| Max Response Size | 1 MB (body truncated -> error) |
| Headers Sent | `User-Agent: VSCode-ContextShare/1.0` |

Server SHOULD set proper caching headers (ETag/Last-Modified) for CDN efficiency, but client maintains its own in-memory TTL.

---
## 6. Caching Semantics (Client-Side)

| Dimension | Behavior |
|----------|----------|
| In-Memory Cache Key | Full URL string |
| TTL Default | 5 minutes (configurable via `setRemoteCacheTtl(seconds)`) |
| Max Entries | 50 (LRU by timestamp eviction) |
| Max Entry Size | 1 MB (oversized responses not cached) |
| Eviction | Expired entries removed on each fetch; if still over cap, oldest trimmed |
| Persistence | Memory only (re-fetch after extension reload) |
| Disk Copy | A separate cached file copy written to `.copilot_catalog_cache/<category>/` for activation & diffing |

No validation ETag negotiation is currently performed. A server update becomes visible once TTL expires or local cache is cleared programmatically.

---
## 7. Security & Validation

Client performs multiple safeguards:

1. URL Validation (`isValidHttpsUrl`):
	 - HTTPS scheme only
	 - Rejects localhost & private subnet hosts
	 - Rejects URLs longer than 2000 chars
2. Manifest Entry Validation (`isSafeRelativeEntry`):
	 - Rejects absolute paths, traversal sequences (`..`), UNC paths, control chars, excessive length (>1000)
3. Filename Sanitization (`sanitizeFilename`):
	 - Strips path separators & disallowed chars
	 - Replaces empty or reserved names with `file.txt`
	 - Truncates >200 chars and appends `.txt`
4. Size & Timeout Guards:
	 - Aborts >1 MB bodies / >8s requests
5. Redirect Safety:
	 - Max 3, each target validated as HTTPS & public host
6. JSONC Support:
	 - For MCP and Task JSON files, comments (`//`, `/* */`) and trailing commas are stripped/normalized client-side before parsing/validation.
7. MCP & Task Schema Validation:
	 - Non-fatal warnings recorded; invalid objects may be skipped from merges.

Server Guidance:
- Do not serve user-specific secrets.
- Prefer static hosting (CDN, object store) to eliminate dynamic risks.
- Ensure consistent MIME types (e.g., `application/json` for JSON).

---
## 8. Activation Semantics

Remote resources are initially discovered with state `INACTIVE`. When a user activates:
- Non-MCP categories: File copied from cache path into runtime: `<workspace>/.github/<category>/<filename>`
- Tasks: Additionally merged into `.vscode/tasks.json` (deduplicated by label/hash)
- MCP: Servers merged into `.vscode/mcp.json` with de-duplication and conflict rename strategy (`-catalog`, `-catalog-#`)

State transitions:
- `ACTIVE`: Target file content equals catalog (or all MCP servers present with identical config)
- `MODIFIED`: Target file exists but differs (or partial MCP presence)

Deactivation removes runtime copy (except user-origin assets) and cleans merged MCP/task entries added by that resource using sidecar metadata files:
- `.copilot-catalog-mcp-meta.json`
- `.copilot-catalog-tasks-meta.json`

---
## 9. Index & Content Examples

### 9.1 Directory with Mixed Resources
```
https://cdn.example.com/catalog/prompts/
	index.json
	summarize.prompt.md
	contextualize.prompt.md
```
`index.json`:
```json
["summarize.prompt.md", "contextualize.prompt.md"]
```

### 9.2 Tasks Example (`*.task.json`)
File: `dependency-audit.task.json`
```jsonc
{
	// Triggers security audit
	"label": "Security: Audit",
	"type": "shell",
	"command": "npm",
	"args": ["audit"],
	"group": "test"
}
```

### 9.3 MCP Server Fragment (`team-services.mcp.json`)
```jsonc
{
	"servers": {
		"vector-store": { "command": "node", "args": ["dist/vector-server.js"] },
		"retriever": { "command": "python", "args": ["retriever.py"] }
	},
	"inputs": [ { "id": "apiToken" } ]
}
```

---
## 10. Error Handling Expectations

| Failure | Client Behavior |
|---------|-----------------|
| Network error / timeout | Skips the affected file or directory; logs sanitized warning |
| Non-200 HTTP | Treats as failure; resource omitted |
| Invalid JSON in `index.json` | Entire directory skipped; other categories continue |
| Invalid manifest entry | Entry skipped silently |
| Oversized response | File skipped (not cached) |
| Invalid redirect | Aborts with error; skips file |
| Invalid MCP/task schema | Logs warning; may still merge partial valid portions |

Extension never fails discovery globally due to a single remote error; it is a best-effort additive source.

---
## 10.1 Authenticated Sources (Optional Extension)

The base protocol is anonymous HTTPS. Implementations may extend with authentication **without changing the manifest or per-file content contract**.

Two backward-compatible enhancements are defined (see [Backend Auth Integration](./backend-auth-integration.md) for full design):

1. **Descriptor Format**: A category override may be an object instead of a string:
	 ```jsonc
	 {
		 "copilotCatalog.source.instructions": {
			 "url": "https://secure.example.com/instructions/",
			 "auth": { "strategy": "vscode-account", "scope": "api://<API_APP_ID>/access_as_user" },
			 "cache": { "ttlSeconds": 300 },
			 "headers": { "X-Catalog-Segment": "engineering" }
		 }
	 }
	 ```
2. **Auth Strategies** (client obtains necessary headers, server validates):

	 | Strategy | Purpose | Header Injected | Notes |
	 |----------|---------|-----------------|-------|
	 | none | Public static hosting | (none) | Current default behavior |
	 | bearer-token | Static secret token | `Authorization: Bearer <token>` | Secret stored in VS Code SecretStorage |
	 | vscode-account | User identity (OBO backend) | `Authorization: Bearer <access_token>` | Backend can OBO to Graph or other IdP |
	 | custom | Enterprise plugin hook | Custom headers | For advanced integrators |

Caching remains URL + auth-partitioned. Unauthorized (401/403) responses simply cause the source to be skipped (logged, sanitized).

Security additions (client side): header redaction, cache partitioning, no plaintext secret persistence.

Backend guidance & extended patterns: see [Backend Auth Integration](./backend-auth-integration.md).

---
## 11. Recommended Server Implementation Checklist

- [ ] Serve over HTTPS with valid public certificate
- [ ] Provide stable `index.json` arrays for directory endpoints
- [ ] Ensure filenames pre-sanitized & unique
- [ ] Keep individual files < 1 MB
- [ ] Avoid dynamic query parameters (cache friendliness)
- [ ] Set `Cache-Control: public, max-age=300` (matching default TTL) or longer if acceptable
- [ ] GZIP / Brotli compression enabled
- [ ] Provide ETag headers for future conditional requests (client currently does full fetch)
- [ ] Log access separately from sensitive infrastructure logs
- [ ] Version resources via filename when breaking changes occur (e.g., `guidelines.v2.instructions.md`)

---
## 12. Future Extensions (Non-Binding)
Potential future client capabilities (design for forward compatibility):
- Conditional fetch using ETag/If-None-Match
- Batched manifest with metadata (size, hash) instead of plain array
- Digital signature verification of catalog bundle
- Delta manifests for large catalogs

Design your server so that adding sibling files or optional fields in a future `index.json` object form does not break older clients (e.g., serve an alternative endpoint for richer manifests rather than changing existing shape).

---
## 13. Quick Start Example

Minimal static hosting layout (S3, Azure Blob, GCS, etc.):
```
root/
	instructions/
		index.json
		onboarding.instructions.md
	prompts/
		index.json
		summarize.prompt.md
	tasks/
		index.json
		audit.task.json
```
`instructions/index.json`:
```json
["onboarding.instructions.md"]
```

Configure the extension (settings.json):
```jsonc
{
	"copilotCatalog.source.instructions": "https://cdn.example.com/root/instructions/",
	"copilotCatalog.source.prompts": "https://cdn.example.com/root/prompts/",
	"copilotCatalog.source.tasks": "https://cdn.example.com/root/tasks/"
}
```

---
## 14. Contract Summary

| Aspect | Contract |
|--------|----------|
| Manifest shape | JSON array of sanitized file names |
| Per-file transport | HTTPS GET, <=1 MB, <=8s, <=3 redirects |
| URL safety | Public host only (no localhost/private ranges) |
| Categories | Determined by config mapping; no inference across remote trees |
| Caching | 5 min in-memory TTL; disk copy in runtime cache dir |
| Activation | Copy (or merge for MCP/Tasks) into workspace runtime |
| Security filters | Filename sanitization, traversal prevention, size & redirect limits |
| Failure isolation | Per-file/per-category; best-effort continue |

---
## 15. Support
For questions or enhancements, open an issue in the repository referencing this document (`remote-catalog-api.md`). Provide example URLs, manifest samples, and logs (with sensitive data removed).

---
## 16. (Database Mode) Bulk Catalog Export API

Provides a single fetch of all enabled catalogs and their enabled resources with a lean schema (IDs and enabled flags removed; resource type implied by grouping).

Endpoint:
```
GET /admin/catalog-export
```

Minimal Response Structure:
```jsonc
{
	"generated_at": "2025-09-19T21:30:00.000Z",
	"catalogs": [
		{
			"name": "engineering",
			"display_name": "Engineering Catalog",
			"description": "Primary engineering assistant assets",
			"source_type": "local",
			"source_path": null,
			"source_url": null,
			"created_at": "2025-09-19T20:00:00.000Z",
			"updated_at": "2025-09-19T21:00:00.000Z",
			"resources": {
				"instructions": [
					{
						"filename": "onboarding.instructions.md",
						"title": "Onboarding Guide",
						"description": "Team onboarding sequence",
						"category": "people-success",
						"tags": "hr,getting-started",
						"content_type": "text/markdown",
						"resource_type": "content",
						"content": "# Onboarding...",          // Present iff content resource and <=50KB
						"truncated": true,                      // Indicates large content omitted
						"size": 98765,                          // Character size when truncated or for reference
						"created_at": "2025-09-18T18:00:00.000Z",
						"updated_at": "2025-09-19T18:00:00.000Z"
					}
				],
				"chatmodes": [],
				"prompts": [],
				"tasks": [],
				"mcp": []
			}
		}
	],
	"counts": { "catalogs": 1, "resources": 42 }
}
```

Resource Summary Fields (per category array):
| Field | Notes |
|-------|-------|
| filename | Resource file name as stored |
| title, description | Optional metadata if provided |
| category, tags | Optional domain taxonomy / search tags |
| content_type | MIME/derived type (e.g. `text/markdown`) |
| resource_type | `content` or `url` |
| content_url | Present only for `url` resources |
| metadata | Parsed JSON if original metadata existed |
| content | Inlined only when `resource_type=content` and size <= 50KB |
| truncated | Boolean flag if original content exceeded inline limit |
| size | Character length for content resources (always when truncated, optional otherwise) |
| created_at / updated_at | Original timestamps |

Behavior & Constraints:
* Only enabled catalogs/resources are returned; disabled items filtered server side.
* No `id`, `enabled`, or per-entry `type` properties (type implicit by array key).
* >50KB content omitted; `truncated` + `size` signal presence and original length.
* Hard guard at 10,000 resources → `413 export_too_large` response.
* `Cache-Control: no-store` to encourage fresh pulls; clients may cache if desired.

Intended Uses:
* One-step synchronization (search index, offline snapshot, diffing environment contents).
* Bootstrap for tooling that needs full metadata before selective caching.

Planned / Potential Enhancements (non-breaking):
* Pagination or streaming (`?cursor=`)
* `?inlineContent=false` toggle
* Per-resource hash digests for delta sync
* ETag/If-None-Match conditional fetch
* Field projection (`?fields=filename,title`)

---
*Last updated: 2025-09-15*

