# Azure Deployment Guide (Example)

This document shows how to deploy the `ContextShare` example server (this `server/` folder) to **Azure App Service (Linux)** using a repeatable script and environment variable guidance.

> This is an educational reference implementation. Adapt naming conventions, SKU sizes, and add security controls before any production use.

---
## 1. Prerequisites

1. **Azure Subscription** with permission to create Resource Groups and App Service resources.
2. **Azure CLI** installed: https://learn.microsoft.com/cli/azure/install-azure-cli
3. **Login**: `az login` (and optionally `az account set --subscription <SUB_ID>`)
4. **Node.js 18+** installed locally (for building) – Azure runtime defaults to Node 20 LTS (Node 18 remains a supported override).
5. (Optional) **Git** if you plan to clone & deploy from source.
6. (Optional) **Docker Desktop** or compatible Docker runtime when deploying from Windows/macOS, to build native Node modules for Linux locally.

---
## 2. Configuration Overview

The server supports three modes:

| Mode      | Required Vars                | Description |
|-----------|------------------------------|-------------|
| file      | `CATALOG_ROOT`               | Serves catalog directly from filesystem. |
| database  | `DATABASE_PATH`              | Uses SQLite DB only. Migrations executed on startup. |
| hybrid    | `CATALOG_ROOT`, `DATABASE_PATH` | Combines file + database provider. |

Additional notes:
- `PORT` is assigned by Azure (the Express server listens on that port or defaults to 3000 locally).
- `NODE_ENV=production` is set automatically by the deployment script.
- `ADMIN_API_KEY` (optional) protects `/admin/*` endpoints (database/hybrid modes only). Provide via flag `--admin-api-key` or set as App Setting. Requests must include header `X-Admin-Api-Key: <value>`.
- See `.env.example` for local development values. **Never commit real `.env` files.**

---
## 3. Deployment Script

The automated script lives in `server/scripts/deploy-azure.mjs` and is exposed through the local `npm run deploy:azure` command.

### Recommended command (from this `server/` folder)
```bash
cd server
npm install
npm run build        # optional, script will build automatically
npm run deploy:azure -- \
	--resource-group MyContextShareRG \
	--location westus2 \
	--app-name my-contextshare-demo \
	--mode file \
	--catalog-root example-catalog \
	--include-catalog \
	--include-admin-ui
```

> Tip: Always run the command from this `server/` folder (for example, via `npm run deploy:azure`). The legacy root shim now simply reminds you to run the server-scoped command.

### Key Flags
| Flag | Required | Example | Notes |
|------|----------|---------|-------|
| `--resource-group` | Yes | `MyContextShareRG` | Created if missing. |
| `--location` | Yes | `westus2` | Any region supporting Linux App Service. |
| `--app-name` | Yes | `my-contextshare-demo` | Globally unique (forms URL). |
| `--plan-name` | No | `demo-plan` | Defaults to `<app-name>-plan`. |
| `--plan-sku` / `--sku` | No | `B1` | Use `F1` (free), `B1`, or higher (`P1v3`). |
| `--node-version` / `--node-fx-version` | No | `20-lts` | Forces the App Service runtime (defaults to Node 20 LTS). Accepts `NODE|20-lts`, `NODE|18-lts`, or shorthand `20-lts` / `18-lts`. |
| `--mode` | No | `file` | `database` / `hybrid` require `--database-path`. |
| `--catalog-root` | No | `example-catalog` | Relative path copied if `--include-catalog`. |
| `--include-catalog` | No | (flag) | Bundles catalog into artifact. |
| `--include-admin-ui` | No | (flag) | Builds & embeds Next.js admin UI at /admin-ui (sets ENABLE_ADMIN_UI + NEXT_PUBLIC_API_BASE_URL). |
| `--database-path` | Cond. | `/home/site/data/catalog.db` | Required for `database` / `hybrid`. Persistent `/home` recommended. |
| `--remote-build` | No | `true` | Forces Azure to restore dependencies during deployment instead of bundling local `node_modules`. Auto-enabled when the local Node major version does not match the target runtime (or when other fallbacks require it). |
| `--no-color` | No | (flag) | Disable ANSI colors. |

The script is **idempotent**: existing resources are reused.

#### Environment Variable Defaults
All CLI flags have environment fallbacks so you can redeploy without retyping arguments. Set these once (PowerShell `setx`, Bash `export`, CI secrets, etc.) and the script will use them whenever the flag is omitted. `.env` and `.env.local` files inside `server/` are loaded automatically.

| Environment Variable | Equivalent Flag | Notes |
|----------------------|-----------------|-------|
| `CONTEXTSHARE_AZURE_RESOURCE_GROUP` | `--resource-group` | Required if flag omitted. |
| `CONTEXTSHARE_AZURE_LOCATION` | `--location` | Azure region. |
| `CONTEXTSHARE_AZURE_APP_NAME` | `--app-name` | Must remain globally unique. |
| `CONTEXTSHARE_AZURE_PLAN_NAME` | `--plan-name` | Defaults to `<app-name>-plan` otherwise. |
| `CONTEXTSHARE_AZURE_PLAN_SKU`, `CONTEXTSHARE_AZURE_SKU` | `--plan-sku`, `--sku` | Falls back to `B1`. |
| `CONTEXTSHARE_AZURE_MODE` | `--mode` | Defaults to `file`. |
| `CONTEXTSHARE_AZURE_CATALOG_ROOT` | `--catalog-root` | Relative to repository root (validated to stay within project). |
| `CONTEXTSHARE_AZURE_INCLUDE_CATALOG` | `--include-catalog` | Accepts `true/false`, `1/0`, `yes/no`. |
| `CONTEXTSHARE_AZURE_INCLUDE_ADMIN_UI` | `--include-admin-ui` | Same boolean parsing as above. |
| `CONTEXTSHARE_AZURE_DATABASE_PATH` | `--database-path` | Required for database/hybrid modes. |
| `CONTEXTSHARE_AZURE_ADMIN_API_KEY` | `--admin-api-key` | Keep secret; prefer Key Vault in production. |
| `CONTEXTSHARE_AZURE_NODE_VERSION` | `--node-version` | Overrides runtime stack (defaults to `20-lts`). |
| `CONTEXTSHARE_AZURE_REMOTE_BUILD` | `--remote-build` | Set to `true` to force Azure remote dependency restore. Usually unnecessary when Docker is available locally and your local Node matches the target runtime. |

> Runtime note: the deployment script ensures the App Service stack matches the selected Node version (default 20 LTS) and restarts the site automatically when that setting changes so the packaged `dist/` build runs under the expected environment. Azure App Service has announced Node 18 retirement timelines, so treating Node 20 as the standard keeps the site compliant.

> Mode helpers: historical values such as `catalog` or `db` are treated as aliases for `file` and `database` respectively to keep existing `.env` files working. Use the canonical mode names going forward (`file`, `database`, `hybrid`).

> Native dependency note: `better-sqlite3` ships native bindings. When you run the deployment script from Windows or macOS the script installs production dependencies inside a `node:20` Docker container so the resulting `node_modules` match Azure Linux. If Docker is unavailable the script attempts an `npm install` with `platform=linux` and `arch=x64`; when your local Node major version differs from the target runtime (for example local Node 22 vs Azure Node 20) the script automatically enables remote build so Azure performs the install step with the correct toolchain. When bumping native dependencies, keep Docker available or allow the remote build fallback so binaries compile for Linux.

Example (PowerShell, one-time setup for current session):

```powershell
cd server
$Env:CONTEXTSHARE_AZURE_RESOURCE_GROUP = "MyContextShareRG"
$Env:CONTEXTSHARE_AZURE_LOCATION = "westus2"
$Env:CONTEXTSHARE_AZURE_APP_NAME = "my-contextshare-demo"
$Env:CONTEXTSHARE_AZURE_INCLUDE_CATALOG = "true"
```

With those in place you can deploy with minimal flags:

```powershell
cd server
npm run deploy:azure -- --mode file --catalog-root example-catalog
```

### Admin UI (Next.js) specifics

- The optional admin UI is built with Next.js 14. Keep `output: 'standalone'` in `server/web-admin/next.config.ts`; the deployment script copies the `.next/standalone` output into the ZIP artifact.
- Azure App Service cannot reliably run the default Next.js runtime build for App Router projects. Without the standalone output you will hit module resolution errors such as `Cannot find module '../server/require-hook'` or missing SWC helpers. Rebuild with `npm run build` in `server/web-admin` if you suspect a stale build.
- Standalone bundles expose `server.js` at the root of the packaged admin UI. Azure runs the admin UI with `node server.js`, matching the working approach documented during prior investigations.
- When hosting the admin UI somewhere else, keep the standalone packaging workflow; it is the only configuration we have verified to succeed on Azure App Service without containerizing the site.

### What the Script Does
1. Validates Azure CLI presence & login
2. Ensures Resource Group
3. Ensures Linux App Service Plan
4. Ensures Web App (Node 20 LTS)
5. Builds TypeScript (`npm run build` in `server/`)
6. Installs production dependencies into the deployment workspace. On non-Linux hosts with Docker, this happens inside a `node:20` container to produce Linux-compatible binaries; otherwise the script runs `npm install` with `platform=linux arch=x64` so native modules download Linux builds, falling back to Azure remote build only if that step fails. The packaged ZIP contains `dist/`, `package.json`, `node_modules/` (when bundled locally), optional `example-catalog`, and a bootstrap `server.js` while keeping paths Linux-friendly even when run on Windows.
7. Sets App Settings (`MODE`, `CATALOG_ROOT`, `DATABASE_PATH`, `NODE_ENV`)
8. Performs ZIP deploy via `az webapp deploy --type zip` (or `config-zip` fallback on Windows)
9. Prints health endpoint URL
10. Aligns runtime stack + SCM (`linuxFxVersion`, `WEBSITE_NODE_DEFAULT_VERSION`, `SCM_NODE_VERSION`) and restarts the site when the stack changes or Kudu reports an outdated Node version.

---
## 4. Manual (Alternative) Deployment
If you prefer manual Azure CLI steps:
```bash
az group create --name MyContextShareRG --location westus2
az appservice plan create --name my-contextshare-demo-plan --resource-group MyContextShareRG --sku B1 --is-linux
az webapp create --name my-contextshare-demo --resource-group MyContextShareRG --plan my-contextshare-demo-plan --runtime "NODE|20-lts"
az webapp config appsettings set --resource-group MyContextShareRG --name my-contextshare-demo --settings MODE=file CATALOG_ROOT=./example-catalog NODE_ENV=production
```
Then build & zip locally and deploy:
```bash
(cd server && npm install && npm run build)
# Create zip containing server/dist, package.json, (optionally) example-catalog
az webapp deploy --resource-group MyContextShareRG --name my-contextshare-demo --src-path ./contextshare-deploy-<id>.zip --type zip
# Windows note: `az webapp deploy` occasionally misinterprets Windows-created ZIP paths. When that happens the script automatically falls back to the legacy `az webapp deployment source config-zip` command.
```

---
## 5. Post-Deployment Validation

### Runtime stack sanity check

```powershell
az webapp config show `
	--resource-group MyContextShareRG `
	--name my-contextshare-demo `
	--query "{linuxFxVersion:linuxFxVersion,nodeVersion:siteConfig.nodeVersion}"
```

- `linuxFxVersion` must resolve to `NODE|20-lts` (or whichever version you overrode via `--node-version`).
- `nodeVersion` reflects the Kudu/SCM site. If it still reports a different major than the one you selected (for example Node 22 after switching to Node 20), restart the app (`az webapp restart ...`). When the mismatch persists, update the runtime stack in the Azure portal and temporarily relax IP restrictions so you can inspect Kudu diagnostics.
- The script sets `WEBSITE_NODE_DEFAULT_VERSION`, `SCM_NODE_VERSION`, and `SCM_DO_BUILD_DURING_DEPLOYMENT=false`; Kudu continues to log “Building the app…” during ZIP deploys, but that text is just ZIP polling noise rather than an Oryx build.

### Health endpoints

```
https://<app-name>.azurewebsites.net/healthz
```
Expected JSON:
```json
{"status":"ok","mode":"file"}
```
Catalog index example:
```
https://<app-name>.azurewebsites.net/catalog/prompts/index.json
```

---
## 6. Switching Modes
Switch to database mode later:
```bash
az webapp config appsettings set \
	--resource-group MyContextShareRG \
	--name my-contextshare-demo \
	--settings MODE=database DATABASE_PATH=/home/site/data/catalog.db
az webapp restart --resource-group MyContextShareRG --name my-contextshare-demo
```
Hybrid mode:
```bash
az webapp config appsettings set \
	--resource-group MyContextShareRG \
	--name my-contextshare-demo \
	--settings MODE=hybrid CATALOG_ROOT=./example-catalog DATABASE_PATH=/home/site/data/catalog.db
```

---
## 7. Logs & Troubleshooting
Tail logs:
```bash
az webapp log tail --resource-group MyContextShareRG --name my-contextshare-demo
```
Common issues:
| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| 500 on catalog routes | Missing `CATALOG_ROOT` in file mode | Set app setting or redeploy with correct flag. |
| Node 22 still printed in Kudu logs | App Service plan/SCM runtime not aligned with Node 20 | Run the runtime stack sanity check above, restart with `az webapp restart`, and update the App Service plan runtime in the Azure portal if the mismatch persists. Ensure your IP is allowlisted to access `https://<app>.scm.azurewebsites.net`. |
| Startup error referencing `DATABASE_PATH` | Mode requires DB path | Add `DATABASE_PATH` app setting. |
| 404 category | Category not deployed / wrong path | Ensure `--include-catalog` or external storage mounted. |
| `az` not found | CLI missing | Install Azure CLI. |
| `spawnSync az ENOENT` even though CLI works in a shell | Terminal PATH not yet refreshed | Re-open the shell after installing Azure CLI or add its install path to `PATH`. The script now retries with `.cmd/.exe` fallbacks, but it still needs access to the CLI binaries. |

> If IP restrictions block access to `https://<app>.scm.azurewebsites.net`, temporarily allow your current IP under **Networking → Access Restrictions** so you can download diagnostics or run `az webapp log deployment show` for failed ZIP uploads.

---
## 8. Cleanup
```bash
az group delete --name MyContextShareRG --yes --no-wait
```

Local build artifacts such as `.azure-deploy/`, `tmpZipInspect/`, and `contextshare-deploy-*.zip` are git-ignored. Delete them manually when you want to reclaim disk space.

---
## 9. Security & Production Notes
- Auth not implemented yet (`authGuard` placeholder). Add real authentication before exposing publicly.
- Consider Azure Key Vault or App Configuration for secrets once added.
- Scale: `az appservice plan update --sku P1v3 ...`
- Large catalogs: consider Blob Storage or Azure Files instead of bundling.

---
## 10. Enhancement Ideas
- GitHub Action that invokes the same script for CI deployments
- Key Vault reference integration
- JWT / OAuth bearer auth + rate limiting
- Custom domain + managed cert

---
## 11. Quick Reference
Run from `server/`:

```bash
npm run deploy:azure -- \
	--resource-group MyContextShareRG \
	--location westus2 \
	--app-name my-contextshare-demo \
	--mode file \
	--catalog-root example-catalog \
	--include-catalog \
	--include-admin-ui
```
Health URL:
```
https://my-contextshare-demo.azurewebsites.net/healthz
```

---
**Enjoy exploring ContextShare on Azure!**

---
### (Temporary) Admin UI Authentication
The `web-admin` UI now requires the shared `ADMIN_API_KEY`:
1. Navigate to the admin UI (if hosted separately, ensure `NEXT_PUBLIC_API_BASE_URL` points to the server) – currently you run it locally on port 3001.
2. You are redirected to `/login` if no key is stored.
3. Enter the same value you configured as `ADMIN_API_KEY` (stored locally in `localStorage`).
4. All subsequent requests include `X-Admin-Api-Key` automatically.

Limitations (for future hardening):
- No rate limiting or lockouts.
- Key is stored in cleartext in browser localStorage.
- Anyone with the key has full admin privileges.
- Add real auth (OIDC / Azure AD / JWT) before production exposure.
