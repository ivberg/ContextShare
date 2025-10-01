# Admin UI Fixes - Summary

## Issues Fixed

### 1. ✅ Local Network Permissions Prompt (Catalogs Not Displaying)
**Root Cause:** The admin UI was making API requests to `http://localhost:3000` instead of the Azure backend because `NEXT_PUBLIC_API_BASE_URL` was set at runtime, but Next.js static exports bake environment variables at build time.

**Fix:** Modified `server/scripts/deploy-azure.mjs` to set `NEXT_PUBLIC_API_BASE_URL=/` as an environment variable during the npm build step, ensuring all API requests go to the same origin (the Azure backend).

**Files Changed:**
- `server/scripts/deploy-azure.mjs` - Added `NEXT_PUBLIC_API_BASE_URL: '/'` to build environment

### 2. ✅ No Authentication/Login Prompt
**Root Cause:** The `AdminAuthGate` component checked for an API key but there was no login page to provide one.

**Fix:** 
- Created a complete login page at `/login` that allows users to enter their admin API key
- The login page validates the key by making a test API request before storing it
- Updated `AdminAuthGate` to properly redirect to login when no key is present
- Added logout functionality to the navigation sidebar

**Files Changed:**
- `server/web-admin/src/app/login/page.tsx` - **NEW** login page
- `server/web-admin/src/app/layout.tsx` - Fixed auth gate to be a separate client component
- `server/web-admin/src/components/auth/AdminAuthGate.tsx` - **NEW** client-side auth wrapper
- `server/web-admin/src/components/layout/Navigation.tsx` - Added logout button

### 3. ✅ API Authentication Headers
**Root Cause:** Even with an API key stored, it wasn't being sent with API requests.

**Fix:** Added Axios request interceptor to automatically attach the API key from localStorage to all requests as the `X-Admin-API-Key` header. Also added 401/403 error handling to redirect to login if authentication fails.

**Files Changed:**
- `server/web-admin/src/lib/api.ts` - Added request/response interceptors for auth

---

## How It Works Now

1. **First Visit**: User visits `/admin-ui` → redirected to `/admin-ui/login`
2. **Login**: User enters admin API key → validated against backend → stored in localStorage
3. **Authenticated Requests**: All API calls include `X-Admin-API-Key` header from localStorage
4. **API Calls**: All requests go to `/` (same origin as the Express server, not localhost)
5. **Logout**: User clicks logout → API key removed → redirected to login

---

## Deployment Instructions

### Quick Deploy (Recommended)
```powershell
cd server
npm run deploy:azure
```

This will automatically:
- Build the server with TypeScript
- Build the admin UI with `NEXT_PUBLIC_API_BASE_URL=/` (set during build)
- Package everything including the static admin UI export
- Deploy to Azure with correct environment variables

**Note:** The deployment script now automatically sets `NEXT_PUBLIC_API_BASE_URL=/` during the admin UI build, so the static export will make API calls to the same origin (the Express backend) instead of localhost.

---

## Testing Checklist

After deployment, verify:

- [ ] Visit `https://<your-app>.azurewebsites.net/admin-ui`
- [ ] Should redirect to `/admin-ui/login` (no localhost permissions prompt)
- [ ] Enter your admin API key from `CONTEXTSHARE_AZURE_ADMIN_API_KEY`
- [ ] Should authenticate and redirect to dashboard
- [ ] Dashboard should show catalog count (not 0 if you have catalogs)
- [ ] Click "Catalogs" to see full list
- [ ] Verify all catalogs and resources display correctly
- [ ] Click logout button to test logout flow

---

## Environment Variables

Make sure these are set in your Azure App Service:

```env
ADMIN_API_KEY=<your-secret-key>
ENABLE_ADMIN_UI=true
NEXT_PUBLIC_API_BASE_URL=/
MODE=database  # or file, or hybrid
DATABASE_PATH=/home/site/data/catalog.db  # if using database mode
```

**Note:** `NEXT_PUBLIC_API_BASE_URL` should be `/` for production (same origin as backend). It's now set automatically during deployment by the build script.

---

## Security Notes

1. **API Key Storage**: The admin API key is stored in browser localStorage
2. **Transport Security**: Always use HTTPS in production (Azure provides this)
3. **Key Rotation**: To rotate keys:
   - Update `ADMIN_API_KEY` in Azure App Service settings
   - Users will need to login again with the new key
4. **Key Protection**: Never commit API keys to git or expose them in public

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Azure App Service                              │
│  ┌───────────────────────────────────────────┐ │
│  │  Express Server (index.ts)                │ │
│  │  ├─ /healthz                              │ │
│  │  ├─ /admin/* (API endpoints)              │ │
│  │  │   └─ X-Admin-API-Key authentication    │ │
│  │  └─ /admin-ui/* (static Next.js export)   │ │
│  │      ├─ /admin-ui/login (auth page)       │ │
│  │      ├─ /admin-ui/ (dashboard)            │ │
│  │      └─ /admin-ui/catalogs (catalog list) │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
         ▲
         │ All API calls use same origin (/)
         │ X-Admin-API-Key header from localStorage
         │
    ┌────────────┐
    │  Browser   │
    │  (Client)  │
    └────────────┘
```

---

## Troubleshooting

### Issue: Still seeing localhost permissions prompt
- Rebuild admin UI with correct env var: `NEXT_PUBLIC_API_BASE_URL=/`
- Clear browser cache and localStorage
- Verify static files in `admin-ui/` folder have correct API base URL

### Issue: Login page not appearing
- Check Azure app settings: `ENABLE_ADMIN_UI=true`
- Verify `/admin-ui` route is accessible
- Check browser console for errors

### Issue: "Invalid API key" error
- Verify `ADMIN_API_KEY` is set in Azure App Service settings
- Ensure you're using the correct key when logging in
- Check backend logs for authentication errors

### Issue: Catalogs still showing 0
- Verify backend is serving catalogs: visit `/admin/catalogs` with curl/Postman
- Check browser network tab for API request/response
- Ensure API key is being sent in requests (X-Admin-API-Key header)
- Verify MODE and DATABASE_PATH/CATALOG_ROOT settings in Azure

---

## Next Steps

Consider these enhancements:
- [ ] Add "Remember me" checkbox to persist login longer
- [ ] Add API key visibility toggle on login page
- [ ] Implement session expiration/refresh logic
- [ ] Add user profile page showing current API key (masked)
- [ ] Add audit logging for admin actions
