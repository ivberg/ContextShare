# Authenticated Remote Catalog & Backend Integration Guide

> Moved from root path `BACKEND_AUTH_INTEGRATION.md` to `docs/catalog/backend-auth-integration.md`.

This guide describes how to extend the existing remote catalog mechanism to support authenticated access and optional Microsoft Graph enrichment using the On-Behalf-Of (OBO) flow. The design is intentionally **vendor-neutral** first, with a Microsoft Graph profile layered on top. Other organizations can substitute their own identity & data providers without changing the client contract.

---
## 1. Objectives

| Goal | Description |
|------|-------------|
| Backward compatible | Existing public HTTPS remote catalogs continue to work unmodified. |
| Pluggable auth | Introduce auth strategies (`none`, `bearer-token`, `vscode-account`, `custom`). |
| Secure header handling | Authorization never logged; secrets not persisted in plain text. |
| Cache isolation | Prevent credential cross-contamination by partitioning cache keys. |
| Server flexibility | Backend may be static, OBO Graph-enabled, or alternate provider (e.g., internal API). |
| Least privilege | Only required scopes requested; per-user filtering done server-side. |

---
## 2. Configuration Extension (Client)

Two forms remain accepted per category override:

1. Simple string (public or legacy style):
```jsonc
"copilotCatalog.source.instructions": "https://cdn.example.com/instructions/"
```
2. Object descriptor (enhanced):
```jsonc
"copilotCatalog.source.instructions": {
	"url": "https://secure.example.com/instructions/",
	"auth": {
		"strategy": "vscode-account",        // none | bearer-token | vscode-account | custom
		"scope": "api://<API_APP_ID>/access_as_user", // VS Code account scope (when strategy = vscode-account)
		"secretId": "instructionsToken"       // used for bearer-token (SecretStorage key reference)
	},
	"cache": { "ttlSeconds": 300, "noCache": false },
	"headers": { "X-Catalog-Segment": "engineering" },
	"extensions": { "vendor": "microsoft-graph-obo", "profile": "standard" }
}
```
Optional aggregated list (future expansion) can appear under `copilotCatalog.remoteSources` with the same object schema.

### 2.1 Descriptor Schema
```ts
interface RemoteSourceDescriptor {
	url: string;
	auth?: {
		strategy?: 'none' | 'bearer-token' | 'vscode-account' | 'custom';
		secretId?: string;   // for bearer-token
		scope?: string;      // for vscode-account
		providerId?: string; // default 'microsoft'
	};
	cache?: { ttlSeconds?: number; noCache?: boolean };
	headers?: Record<string,string>;
	extensions?: Record<string,any>; // vendor-specific hints
}
```

---
## 3. Auth Strategy Behavior

| Strategy | Acquisition | Storage | Injected Header | Notes |
|----------|------------|---------|-----------------|-------|
| none | N/A | N/A | (none) | Public remote catalogs |
| bearer-token | SecretStorage.get(secretId) | SecretStorage only | `Authorization: Bearer <token>` | User sets secret via command |
| vscode-account | `vscode.authentication.getSession(providerId, [scope])` | VS Code session | `Authorization: Bearer <access_token>` | Used to reach your backend; backend does OBO to Graph |
| custom | Extension hook/callback | In-memory | As provided | Enterprise integration point |

If acquisition fails, the source is skipped with sanitized log output (no crash of overall discovery).

---
## 4. Fetch Layer Changes

Refactor `fetchRemote(url)` to accept a context:
```ts
interface FetchContext {
	headers?: Record<string,string>;
	cacheKeyModifier?: string; // appended to base URL for cache partitioning
	noCache?: boolean;
}
```
Cache key becomes:
```
const cacheKey = url + '|' + (context.cacheKeyModifier || 'public');
```

`noCache` bypasses memory cache but still writes the disk copy for downstream activation comparisons unless explicitly disabled (future flag).

Sensitive headers (case-insensitive match on `authorization`, `x-api-key`, `x-credential`) are redacted before logging.

---
## 5. Secret & Session Management

| Aspect | Approach |
|--------|----------|
| Bearer tokens | User invokes command: `ContextShare: Set Remote Catalog Secret` → stores in SecretStorage under `secretId` |
| Token rotation | Overwriting secret invalidates cache entries (clear remote cache automatically) |
| VS Code account sessions | Lazy acquisition per descriptor; reuse same session for multiple categories sharing scope |
| Expired sessions | Rely on VS Code provider to refresh; on 401 from backend optionally re-request session (deferred to phase 2) |

---
## 6. Backend API Design (Generic)

Minimal endpoints (all HTTPS):
```
GET /catalog/{category}/index.json
GET /catalog/{category}/{fileName}
```
Responses mirror current unauthenticated contract:
- `index.json`: JSON array of sanitized file names
- File: raw text / markdown / JSON

### Optional Enrichment Endpoints
Add domain-specific routes (e.g., `GET /mcp/servers`, `GET /hats/recommended`) gated by same auth model.

### Response Headers (Recommended)
| Header | Purpose |
|--------|---------|
| `Cache-Control: public, max-age=300` | Align with default client TTL |
| `ETag` | Future conditional requests |
| `Content-Type` | Accurate reflection (e.g., `application/json`) |

---
## 7. Microsoft Graph OBO Profile (Optional Layer)

1. Extension obtains access token for API scope: `api://<WEB_API_APP_ID>/access_as_user`.
2. Backend validates and exchanges via MSAL On-Behalf-Of for delegated Graph scopes (e.g., `User.ReadBasic.All`).
3. Backend applies policy (group membership, license checks) to filter catalog file set.
4. Backend returns final `index.json` and per-file content (possibly templated).

Example Node backend snippet (simplified):
```ts
const { ConfidentialClientApplication } = require('@azure/msal-node');

const msal = new ConfidentialClientApplication({
	auth: { clientId, clientSecret, authority: `https://login.microsoftonline.com/${tenantId}` }
});

async function getGraphToken(userAssertion) {
	return msal.acquireTokenOnBehalfOf({
		oboAssertion: userAssertion,
		scopes: ['https://graph.microsoft.com/User.ReadBasic.All']
	});
}
```

### Authorization Patterns
- Map AAD group IDs → allowed catalog categories or file prefixes.
- Personalize instruction bundles based on department attribute.

### Least Privilege
Only include Graph scopes absolutely required. Filtering to name + email? Use `User.ReadBasic.All` with `$select=id,displayName,mail`.

---
## 8. Security Hardening

| Concern | Mitigation |
|---------|------------|
| Token replay | Enforce TLS; short token lifetimes (handled by AAD); validate audience & issuer every request |
| Over-broad scope | Restrict requested scopes; review per release |
| Log leakage | Redact headers & PII in logs (server + client) |
| Rate limiting | Apply per-user & per-IP limits (`429` with retry-after) |
| SSRF in file selection | Server serves only files from an allowlisted storage bucket/directory |
| Path traversal | Client & server both validate filenames; reject `..` sequences |

---
## 9. Caching & ETag Strategy

| Layer | Technique | Notes |
|-------|-----------|-------|
| Client memory | TTL (default 5m) | Auth-specific partitioning |
| Client disk copy | `.copilot_catalog_cache` | Used for diff & activation |
| Server memory (optional) | LRU of rendered file blobs | Avoid repeated Graph calls |
| Server conditional | Forward `If-None-Match` to storage (future) | Defer until client adds ETag support |
| Graph calls | Cache group memberships per user for short window (e.g., 2–5 min) | Respect license & security policies |

---
## 10. Incremental Rollout

Phase | Features |
------|----------|
P1 | Object descriptor parsing, bearer-token strategy, cache partitioning |
P2 | vscode-account strategy (basic OBO), secret command UX |
P3 | Custom strategy hook, dynamic category filtering via backend |
P4 | ETag conditional fetch, token refresh retry heuristics |
P5 | Signed manifests, multi-tenant isolation enhancements |

Feature flag (user setting):
```jsonc
"copilotCatalog.enableAuthenticatedSources": true
```
If false, descriptors with auth are ignored (warn).

---
## 11. Testing Strategy

| Test Type | Focus |
|-----------|-------|
| Unit | Descriptor normalization, cache key formation, auth header redaction |
| Mock HTTP | Auth required vs missing token, 401 handling |
| Integration | End-to-end discovery with bearer + vscode-account stub |
| Security | Path traversal attempts, invalid redirect, large response rejection under auth |
| Performance | Many small files under auth (cache efficiency) |

Add new test fixtures for descriptor parsing & header injection.

---
## 12. Documentation Updates

- [Remote Catalog API](./remote-catalog-api.md): Authenticated Sources section.
- This file (`backend-auth-integration.md`): Backend design & multi-vendor model.
- README: Link to both documents.

---
## 13. Future Enhancements

| Idea | Description |
|------|-------------|
| Signed Manifests | Server publishes detached signature; client verifies with trusted public key |
| Hash Prevalidation | `index.json` includes SHA256 for each file to detect tampering |
| Graph Delta Mode | Endpoint returns only changed file names since a cursor |
| Multi-Tenant Profile | Distinguish tenant-specific catalog sub-roots automatically |
| User Diff Awareness | Compare personalized file vs upstream base for audit trail |
| Token Refresh Events | Listen for VS Code auth session changes & clear affected cache entries |

---
## 14. Minimal Migration Checklist

- [ ] Add feature flag
- [ ] Implement descriptor parser & normalization
- [ ] Implement fetch context & header injection
- [ ] Add bearer-token secret command
- [ ] Add vscode-account strategy (behind flag)
- [ ] Update docs & README links
- [ ] Add tests (parsing, cache partitioning, auth flows)
- [ ] Validate logging redaction

---
## 15. Sample End-to-End Flow (Graph OBO)

1. User configures descriptor with `vscode-account` and API scope.
2. Extension discovery calls descriptor normalization.
3. For remote fetch:
	 - Acquire VS Code session token (for API audience)
	 - Build headers `{ Authorization: Bearer <token> }`
	 - Fetch `index.json`, apply standard validation
4. Backend validates token, performs OBO to Graph, resolves allowed file set.
5. Backend streams file list → client fetches individual files with same header.
6. Client caches per (url + authHash) and surfaces resources.
7. Activation process unchanged (local copy / merges / MCP behavior remains).

---
## 16. Reference Command Concepts

| Command | Purpose |
|---------|--------|
| ContextShare: Set Remote Catalog Secret | Prompt user for bearer token stored under `secretId` |
| ContextShare: Clear Remote Auth Cache | Clears memory token & remote cache partitions |
| ContextShare: Show Remote Source Diagnostics | Lists normalized descriptors & auth strategies |

---
## 17. Security Review Notes (Pre-Implementation)

Checklist before merging:
- [ ] No secrets written to logs
- [ ] Authorization header always redacted
- [ ] Cache partition includes auth identity hash
- [ ] Skipped sources do not throw
- [ ] Feature flag gating new behavior
- [ ] Unit tests assert redaction & partitioning

---
*Last updated: 2025-09-15*

