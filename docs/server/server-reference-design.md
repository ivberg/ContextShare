# Server Reference Design (Hack / Optional)

> Moved from root path `SERVER_REFERENCE_DESIGN.md` to `docs/server/server-reference-design.md`.

This document specifies the co-located reference server for the ContextShare extension. It is intentionally minimal, portable, and safe to extract into a dedicated repository later. Production deployments MUST harden beyond this baseline.

> Status: DESIGN + TASKS (no full implementation yet)

---
## 1. Scope & Non‑Goals

| In Scope | Out of Scope (Phase 0) |
|----------|------------------------|
| Serve catalog files over HTTPS endpoints | Multi-tenant isolation beyond claim filtering |
| Optional user-based filtering via Microsoft Graph (OBO) | Persistent database storage / version history |
| Simple policy engine (group → filename prefix) | Admin web UI (future phase) |
| In-memory caching (files, groups) | Signed bundles / manifest signatures |
| Health/readiness endpoints | Telemetry / analytics collection |

---
## 2. High-Level Architecture

```
+------------------+        +-----------------------+        +-------------------+
| VS Code Extension| -----> | Reference Server API  | -----> | Microsoft Graph   |
| (fetch index/file|        |  /catalog endpoints   |  OBO   | (optional)        |
+------------------+        +----------+------------+        +-------------------+
																	 |                                
																	 v                                
														+---------------+                       
														| Catalog Store | (filesystem)          
														+---------------+                       
```

Modules:
- HTTP Layer (Express) → Routes → Controllers
- Auth (JWT validation + optional OBO client)
- Catalog Provider (filesystem abstraction)
- Policy Engine (filters file set per user groups/claims)
- Graph Adapter (fetch user profile/groups)
- Cache (LRU for groups + file content)
- Config Validation & Environment parsing
- Logging (structured, redacted)

---
## 3. Folder Structure (Proposed)

```
server/
	README.md
	package.json
	tsconfig.json
	src/
		index.ts                # startup entry
		config.ts               # env var parsing & validation
		logging/logger.ts       # structured logging
		http/
			app.ts                # express app builder
			routes/catalogRoutes.ts
			routes/healthRoutes.ts
			middleware/requestId.ts
			middleware/authGuard.ts
			middleware/errorHandler.ts
		auth/
			tokenValidator.ts     # JWT validation & caching of JWKS
			oboClient.ts          # MSAL OBO flow (optional)
			userContextBuilder.ts # Resolves user groups / claims
		graph/
			graphClient.ts        # Minimal Graph calls
			groupCache.ts         # In-memory group cache
		catalog/
			catalogProvider.ts    # Interface
			fileSystemCatalogProvider.ts
			policy/policyEngine.ts
			policy/groupPrefixPolicy.ts
			types.ts
		cache/lru.ts            # Simple generic LRU (or use tiny dependency)
		util/etag.ts            # Hash or weak etag generator
		util/hashing.ts
		types/index.ts          # Shared server-side types
	test/
		catalogProvider.test.ts
		policyEngine.test.ts
		auth.test.ts
		graphClient.test.ts
		routes.catalog.test.ts
```

---
## 4. Environment Configuration

| Variable | Purpose | Required | Example |
|----------|---------|----------|---------|
| `PORT` | HTTP listen port | No (default 3000) | 3000 |
| `CATALOG_ROOT` | Base path to catalog directory | Yes | `./example-catalog` |
| `ENABLE_GRAPH` | Toggle Graph features | No (default `0`) | `1` |
| `TENANT_ID` | AAD tenant for token validation & OBO | If Graph | `1234-...` |
| `API_APP_ID` | API app registration client ID (audience) | If Graph | `abcd-...` |
| `CLIENT_ID` | Confidential client (same as API_APP_ID or separate) | If OBO | `abcd-...` |
| `CLIENT_SECRET` | Secret for OBO | If OBO | (secret) |
| `GRAPH_SCOPES` | Space or comma separated | If OBO | `User.ReadBasic.All` |
| `GROUP_PREFIX_POLICY_MAP` | JSON map groupId→prefix array | Optional | `{"gid1":["instructions/","prompts/"]}` |
| `LOG_LEVEL` | logging verbosity | No | `info` |
| `RATE_LIMIT` | Requests per minute/user (future) | No | `60` |

---
## 5. Request Lifecycle

1. Request arrives at `/catalog/:category/index.json` with `Authorization: Bearer <user-token>`
2. `requestId` middleware attaches correlation id
3. `authGuard` validates JWT (issuer, audience, exp). If `ENABLE_GRAPH=1` and policy requires groups:
	 - OBO flow obtains Graph token (caches by user assertion hash)
	 - Graph adapter resolves groups (cached) and basic profile
4. Policy engine filters file list from provider based on groups/prefix map
5. Response serialized (JSON array). Headers: `Cache-Control: no-store` (initial), `ETag` (optional later)
6. Logging of summary (requestId, userId hash, fileCount) with redacted tokens

---
## 6. Catalog Provider Interface

```ts
export interface CatalogProvider {
	list(category: string): Promise<string[]>; // sanitized file names only
	read(category: string, fileName: string): Promise<Buffer | string>;
	exists(category: string, fileName: string): Promise<boolean>;
}
```
Phase 0 implementation: `FileSystemCatalogProvider` reads from `CATALOG_ROOT/<category>/`.

---
## 7. Policy Engine

```ts
export interface PolicyContext {
	user?: UserContext;  // undefined => treat as anonymous if allowed
	category: string;
	fileNames: string[]; // original list from provider
}
export interface PolicyResult { allowed: string[]; reason?: string; }
export interface CatalogPolicy { apply(ctx: PolicyContext): Promise<PolicyResult>; }
```
Base policies combined sequentially; if a policy denies (returns empty) no further processing.

Phase 0 policy: `GroupPrefixPolicy` – allow only file names where path starts with any prefix mapped to at least one of user’s group IDs. If no mapping -> allow all (configurable).

---
## 8. Microsoft Graph Integration (Optional)

Triggered only if `ENABLE_GRAPH=1`:
- OBO token acquisition using `msal-node`
- Endpoints used:
	- `GET /v1.0/me?$select=id,displayName,mail` (profile)
	- `GET /v1.0/me/memberOf?$select=id` (groups) – paginated
- Caching: groups cached for `GROUP_CACHE_TTL` (default 300s)
- Fail-safe: On Graph failure, either (a) deny (strict mode) or (b) fallback to unfiltered list (per env `GRAPH_FAIL_MODE=strict|lenient`)

---
## 9. Caching Strategy

| Cache | Key | TTL | Invalidation |
|-------|-----|-----|--------------|
| Group membership | userObjectId | 300s | Expiry / manual clear endpoint (future) |
| File content | category + fileName | 120s | Expiry / file mtime check (optional) |
| OBO token | assertion hash + scopes | token exp | Natural expiry |
| JWKS keys | kid | 24h | kid rotation detection |

Implementation: simple LRU wrapper with per-entry TTL metadata.

---
## 10. Security Considerations

| Risk | Mitigation |
|------|------------|
| Token replay | TLS + exp validation + audience check |
| Privilege escalation | Strict group mapping; default-deny when mapping present |
| Directory traversal | Sanitize & validate category + filename (no `..`, keep whitelist) |
| Large file attacks | Size cap (e.g., 1 MB) match extension client guard |
| Logging secrets | Redact `authorization` header; hash user id for correlation |
| Graph throttling | Backoff (exponential attempt + jitter), cap retries |

---
## 11. Error Model

| Condition | Response |
|-----------|----------|
| Missing/invalid token (when auth required) | 401 JSON `{ error: 'unauthorized' }` |
| Category not found | 404 `{ error: 'category_not_found' }` |
| File not found | 404 `{ error: 'not_found' }` |
| Policy denies all | 403 `{ error: 'forbidden' }` |
| Graph failure (strict) | 502 `{ error: 'graph_unavailable' }` |
| Internal error | 500 `{ error: 'internal' }` |

Errors always JSON with stable shape.

---
## 12. Unit Test Plan

| Test Suite | Cases |
|------------|-------|
| `catalogProvider.test.ts` | list() with empty dir; read() returns content; invalid category -> error |
| `policyEngine.test.ts` | GroupPrefixPolicy allow; deny; no groups -> passthrough; conflict mapping |
| `auth.test.ts` | Valid JWT; invalid audience; expired token; redaction of logs |
| `graphClient.test.ts` | OBO success; Graph throttling + retry; pagination; failure fallback |
| `routes.catalog.test.ts` | index.json public; index.json filtered; file fetch unauthorized; 404 category |
| `lru.test.ts` (optional) | Eviction order; TTL expiry |
| `errorHandler.test.ts` | Ensures JSON shape on thrown error |

Mock Graph responses; use lightweight JWKS mock for token tests.

---
## 13. Integration Test Plan

Spin up server with ephemeral catalog fixture:
- Scenario: public mode (ENABLE_GRAPH=0) – fetch index + file
- Scenario: graph strict – group allows subset
- Scenario: graph strict failure (simulate 500) – expect 502
- Scenario: lenient failure – returns unfiltered list

Use supertest or undici for HTTP assertions.

---
## 14. Performance Smoke Goals

| Aspect | Target (Reference) |
|--------|--------------------|
| index.json request (cold) | < 150 ms local dev |
| index.json request (warm) | < 40 ms local (cached) |
| File fetch latency | < 30 ms (warm) |
| Memory baseline | < 150 MB Node process under small catalog |

(Not enforced by test, documented for regression awareness.)

---
## 15. Incremental Implementation Tasks (Server)

| ID | Task | Notes |
|----|------|-------|
| S1 | Scaffold folder & package.json | Add scripts: build, dev, test |
| S2 | Implement config parsing & validation | Fail-fast with descriptive errors |
| S3 | Add logging utility with redaction | Redact authorization header |
| S4 | Implement LRU cache utility | TTL + size cap |
| S5 | FileSystemCatalogProvider | Sanitize & cap file size |
| S6 | Basic Express app + health routes | No auth yet |
| S7 | JWT validator (no Graph) | Accept HS256/RS256 AAD-style tokens (JWKS) |
| S8 | Auth middleware & user context stub | Attach user to request |
| S9 | Catalog routes (public + authorized path) | Return index.json & file content |
| S10 | Policy engine scaffolding + GroupPrefixPolicy | Config-driven mapping |
| S11 | Graph OBO client (conditional) | `ENABLE_GRAPH=1` gating |
| S12 | Graph adapter (profile + groups) | Pagination + caching |
| S13 | Integrate policy with user groups | Filter index list |
| S14 | Error handler middleware | Uniform JSON error responses |
| S15 | Unit tests suites S1–S10 | CI gating |
| S16 | Integration tests (public) | supertest harness |
| S17 | Integration tests (Graph) | mock Graph endpoints |
| S18 | Add ETag generation utility | Optional weak hash |
| S19 | README for server usage | Quick start commands |
| S20 | Document future hardening items | Security checklist update |

---
## 16. Migration Strategy (Extracting Server Later)

Steps to spin out:
1. Move `server/` to new repo `contextshare-server`.
2. Preserve package namespacing; update import paths.
3. Add separate CI pipeline (lint, test, security scan).
4. Reference new repo URL in ../catalog/remote-catalog-api.md + ../catalog/backend-auth-integration.md.
5. Version independently (semantic versioning for server).

---
## 17. Future Enhancements (Tracked but Deferred)

| Feature | Rationale |
|---------|-----------|
| Signed Manifests | Integrity & tamper detection |
| Delta Manifests | Large catalogs efficiency |
| Multi-tenant root partitioning | SaaS scenario |
| Admin UI (React) | Non-technical curation |
| Persistent Storage (Postgres/SQLite) | Revision history, audit logs |
| Rate Limiting Middleware | Abuse prevention |
| Observability (OpenTelemetry) | Tracing & metrics |
| Manifest Hash Prevalidation | Client verifies file hash early |

---
## 18. Open Questions

| Question | Decision Placeholder |
|----------|----------------------|
| Should anonymous access be allowed when auth enabled? | Default deny; env flag to relax |
| Fallback when Graph half-fails (profile ok, groups fail)? | Treat as groups fail mode (strict/lenient) |
| Support for conditional GET (ETag) in Phase 0? | Deferred until S18 |

---
## 19. Quick Start (Future Implementation)

```bash
# (after implementation)
cd server
npm install
npm run dev
# With Graph (set environment vars first)
ENABLE_GRAPH=1 TENANT_ID=<tenant> API_APP_ID=<id> CLIENT_ID=<id> CLIENT_SECRET=<secret> CATALOG_ROOT=../example-catalog npm run dev
```

---
## 20. Change Log (Server Design)

| Date | Change |
|------|--------|
| 2025-09-16 | Initial reference design added |

---
*End of server-reference-design.md*

