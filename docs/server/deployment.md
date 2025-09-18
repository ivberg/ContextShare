# ContextShare Reference Server Deployment Guide

This guide explains how to run and test the Phase 0 ContextShare reference backend so the VS Code extension can consume remote catalog resources. It covers local development, containerization, production hardening basics, and how to point the extension at the server.

> IMPORTANT: The extension only accepts **HTTPS remote sources on non-localhost public hosts** (see `isValidHttpsUrl`). For local testing you can either (a) use a public HTTPS tunnel (Codespaces, ngrok, dev tunnel), (b) terminate TLS via a reverse proxy, **or (c) temporarily enable the development-only setting** `copilotCatalog.dev.allowInsecureHttp` which relaxes validation to permit `http://localhost` and private IP ranges. Never commit that setting enabled to shared or production workspaces.

---
## 1. Prerequisites

| Component | Version | Notes |
|-----------|---------|-------|
| Node.js | 18+ LTS | CommonJS build; ES features used are Node 18+ safe |
| npm | 9+ | For dependency install |
| Catalog Content | Your catalog directory (mirrors `example-catalog/`) | Must contain category folders |
| Public HTTPS Endpoint | ngrok / reverse proxy / CDN | Required for extension to accept URL |

---
## 2. Directory Structure Recap
```
server/
  package.json
  tsconfig.json
  src/
    index.ts
    http/app.ts
    catalog/fileSystemCatalogProvider.ts
    cache/lru.ts
    logging/logger.ts
    http/middleware/*
```
Your catalog root should look like:
```
my-catalog/
  instructions/
    onboarding.instructions.md
  prompts/
    summarize.prompt.md
  chatmodes/
    role.chatmode.md
  tasks/
    build.task.json
  mcp/
    team.mcp.json   (optional future use)
```

---
## 3. Local Development Run (HTTP Only)
```
cd server
npm install
# Set environment variable (choose the syntax for your shell):
# PowerShell
$env:CATALOG_ROOT = "../example-catalog"
# Windows CMD
set CATALOG_ROOT=..\example-catalog
# Bash / Zsh
export CATALOG_ROOT=../example-catalog

npm run build
npm start
```
Server listens on `PORT` (default 3000). Test:
```
curl http://localhost:3000/healthz
curl http://localhost:3000/catalog/instructions/index.json
```
This will work locally for curl, but the extension will **reject** `http://localhost` for remote discovery (security restriction).

---
## 4. Exposing HTTPS for Extension Testing
You need a public HTTPS URL mapping to the server.

### Option A: GitHub Codespaces / Dev Container
If you run this repo in a Codespace, forward port 3000. Codespaces gives you an HTTPS URL like:
```
https://3000-<hash>-<user>.github.dev/catalog/instructions/index.json
```
Use that as your remote source.

### Option B: ngrok
```
ngrok http 3000
# Output includes Forwarding: https://<random>.ngrok-free.app -> http://localhost:3000
```
Use the HTTPS forwarding URL as your base (must include trailing slash when referencing a directory).

### Option C: Reverse Proxy + TLS (Caddy / Nginx)
1. Obtain domain + TLS cert (Let’s Encrypt) or use Caddy auto HTTPS.
2. Reverse proxy to `http://127.0.0.1:3000`.
3. Ensure response headers include appropriate cache control (optional).

Caddyfile snippet:
```
example-catalog.mycompany.dev {
  reverse_proxy localhost:3000
}
```

---
## 5. Extension Configuration Examples
Enable a remote directory for instructions (Phase 0 server returns `index.json`). Add to your workspace `.vscode/settings.json`:
```jsonc
{
  "copilotCatalog.source.instructions": "https://<your-https-host>/catalog/instructions/"
}
```
If you want multiple categories (explicit overrides):
```jsonc
{
  "copilotCatalog.source.instructions": "https://<host>/catalog/instructions/",
  "copilotCatalog.source.prompts": "https://<host>/catalog/prompts/",
  "copilotCatalog.source.chatmodes": "https://<host>/catalog/chatmodes/",
  "copilotCatalog.source.tasks": "https://<host>/catalog/tasks/"
}
```
Each directory must expose an `index.json` (the server handles this automatically). The extension will:
1. GET `.../index.json`
2. Iterate file names → GET each file
3. Cache outcomes per TTL (client side)

---
## 6. Testing the Flow End-to-End
1. Start server (local or remote) with your catalog.
2. Confirm raw index: `curl https://<host>/catalog/instructions/index.json`.
3. In VS Code workspace settings, paste the HTTPS URL(s).
4. Run “ContextShare: Refresh”.
5. Observe resources appear as remote (`origin: remote`).
6. Activate a resource and verify it copies into `.github/<category>/`.

---
## 7. Troubleshooting
| Symptom | Likely Cause | Resolution |
|---------|--------------|-----------|
| No resources appear | URL not HTTPS / blocked by localhost rule | Use public HTTPS domain/tunnel |
| 404 on index.json | Wrong path or category missing | Check server log & ensure folder exists |
| 404 category_not_found | Whitelist restriction | Use one of: chatmodes, instructions, prompts, tasks, mcp |
| File fetch 404 not_found | Filename mismatch | Confirm listed name in index.json matches actual file |
| Large file 413 | File >1MB limit | Reduce file size or split into multiple files |
| Inconsistent refresh | Client caching TTL (5m default) | Use command to clear cache (future) or wait TTL |
| Startup failure: Config validation (missing CATALOG_ROOT) | Env var not set | Set with `$env:CATALOG_ROOT="../example-catalog"` (PowerShell), `set CATALOG_ROOT=..\example-catalog` (CMD), `export CATALOG_ROOT=../example-catalog` (bash), or pass `--catalog-root ../example-catalog` |

---
## 8. Containerization (Optional)
Add a simple Dockerfile:
```Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev
COPY server/ ./
RUN npm run build
ENV PORT=3000
ENV CATALOG_ROOT=/catalog
VOLUME ["/catalog"]
EXPOSE 3000
CMD ["node", "dist/index.js"]
```
Build & run:
```
docker build -t contextshare-server .
docker run -it --rm -p 3000:3000 -v $(pwd)/example-catalog:/catalog contextshare-server
```
Front with HTTPS reverse proxy or run container in an environment that provisions TLS.

---
## 9. Production Hardening Checklist (Forward Looking)
| Area | Action |
|------|--------|
| Auth | Add JWT validation (JWKS) and enforce audience / issuer |
| Policy | Implement group-based filtering before returning index list |
| Rate Limiting | Token bucket per IP + user claim |
| TLS | Enforce strong ciphers; HTTP/2 optional |
| Logging | Add structured access log separate from app log |
| Observability | Add metrics & healthz deeper checks (catalog existence) |
| Secrets | Use managed secret store for OBO client secrets (future) |
| ETag | Add weak etags for file + index responses |
| Security Headers | `Strict-Transport-Security`, minimal `Server` header |

---
## 10. Current Server Feature Matrix (Phase 0)
| Feature | Status | Notes |
|---------|--------|-------|
| Health endpoint | ✅ | `/healthz` basic JSON |
| Index listing | ✅ | Caches in-memory TTL 60s |
| File fetch | ✅ | 1MB cap, content-type heuristic |
| Category whitelist | ✅ | Five categories enforced |
| 404 behavior | ✅ | Missing file & category separated |
| Large file error | ✅ | 413 with `file_too_large` |
| Auth | ⏳ | Placeholder only (no validation) |
| Policy filtering | ⏳ | Planned (group prefixes) |
| Graph OBO | ⏳ | Planned behind feature flag |
| ETag support | ⏳ | Planned weak hash utility |
| Rate limiting | ⏳ | Future hardening |

---
## 11. FAQ
**Q: Can I test with plain HTTP?**  
A: The extension rejects non-HTTPS remote URLs, so only manual curl works. Use a tunnel or proxy for HTTPS.

**Q: How do I clear the extension’s remote cache?**  
A: Phase 0: restart VS Code or wait for TTL expiry. A dedicated command is planned.

**Q: Can I personalize index output per user today?**  
A: Not yet—requires auth + policy engine (upcoming phases).

---
## 12. Support
Open an issue with:
- Example source URL
- `index.json` response
- Sanitized log snippet

Please redact any tokens or internal hostnames.

---
*Last updated: 2025-09-16*
