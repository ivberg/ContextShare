# ContextShare Extension Development Workflow

This guide covers the complete development workflow for the ContextShare VS Code extension, including building, testing, and troubleshooting.

## Overview

ContextShare manages AI assistant catalog resources across multiple repositories, providing centralized discovery, activation, and preset functionality for AI resources that enhance GitHub Copilot workflows.

## Development Setup

### Prerequisites
- Node.js (version matching VS Code requirements)
- VS Code with Extension Development Host support
- Git (for version control)

### Initial Setup
```powershell
# Clone and install dependencies
git clone https://github.com/microsoft/contextshare.git
cd ContextShare
npm install
```

## Build Process

### Understanding the Build Pipeline

The extension uses a two-stage build process:
1. **TypeScript Compilation**: `tsc` compiles TypeScript sources to JavaScript in `dist/`
2. **Bundling**: `esbuild` bundles all code into a single `dist/extension.js` file

**Critical**: The VS Code Extension Development Host only loads `dist/extension.js` (the bundled file), not individual compiled files.

### Build Commands

#### One-time Build
```powershell
# Full build (compile + bundle)
npm run build

# Bundle only (if TypeScript already compiled)
npm run bundle
```

#### Watch Mode Options
```powershell
# Option A: TypeScript watch only (requires manual bundling)
npm run watch

# Option B: Bundle watch (auto-rebuilds extension.js on save) - RECOMMENDED
npm run watch:bundle

# Option C: Both (in separate terminals)
# Terminal 1:
npm run watch
# Terminal 2:
npm run watch:bundle
```

**Recommendation**: Use `npm run watch:bundle` for fastest iteration cycles.

## Development Host Setup

### Method 1: VS Code F5 Launch (Recommended)
1. Open the ContextShare project in VS Code
2. Press `F5` to launch Extension Development Host
3. VS Code automatically opens a new window with the extension loaded

### Method 2: Manual Launch
```powershell
# Launch the test VS Code binary with extension development path
& "C:\src\ContextShare\.vscode-test\vscode-win32-arm64-archive-1.104.1\Code.exe" `
  --extensions-dir "C:\src\ContextShare\.vscode-test\extensions" `
  --user-data-dir "C:\src\ContextShare\.vscode-test\user-data" `
  "C:\src\ContextShare" `
  --extensionDevelopmentPath "C:\src\ContextShare"
```

**Important**: Include a workspace folder path (`"C:\src\ContextShare"`) to enable workspace settings.

## Configuration Setup

### Development Settings
In the Extension Development Host, configure these settings (File > Preferences > Settings > JSON):

```json
{
  "copilotCatalog.remoteBase": "http://localhost:3000/catalog",
  "copilotCatalog.dev.allowInsecureHttp": true,
  "copilotCatalog.dev.disableLogRedaction": true,
  "copilotCatalog.dev.showBuildTimestamp": true,
  "copilotCatalog.remoteCacheTtlSeconds": 501
}
```

### Setting Descriptions
- `remoteBase`: Base URL for remote catalog discovery
- `allowInsecureHttp`: Enables HTTP (non-HTTPS) URLs for development
- `disableLogRedaction`: Shows full paths/URLs in logs (useful for debugging)
- `showBuildTimestamp`: Displays version and activation time in status bar
- `remoteCacheTtlSeconds`: Cache duration for remote resources

## Development Workflow

### Standard Development Cycle
1. **Start watch mode**:
   ```powershell
   npm run watch:bundle
   ```

2. **Launch Extension Development Host**:
   - Press `F5` in VS Code, OR
   - Run manual launch command

3. **Configure development settings** in the dev host window

4. **Make code changes** in your editor

5. **Reload extension** in dev host:
   - Command Palette > "Developer: Reload Window"
   - Or use `Ctrl+R`

6. **Verify changes**:
   - Check status bar for updated timestamp
   - Review logs in Output > "ContextShare"
   - Test functionality

### Verification Steps

#### Build Verification
- Check that `dist/extension.js` timestamp updated after changes
- Search extension.js for recent code strings to confirm inclusion

#### Runtime Verification
After reloading the extension host:

1. **Status Bar Check**: Look for `ContextShare v0.3.6` with timestamp tooltip
2. **Runtime Flags**: Run command "ContextShare (Dev): Show Runtime Flags"
3. **Log Verification**: Open Output > "ContextShare" and look for:
   ```
   [ResourceService] allowInsecureHttp=true
   [ResourceService] disableLogRedaction=true
   DEV MODE: Insecure HTTP/localhost remote catalogs ENABLED (activation)
   ```

## Troubleshooting

### Extension Not Loading
- **Symptom**: Extension commands not available
- **Fix**: Ensure F5 launched from ContextShare project folder, not empty window

### Changes Not Appearing
- **Symptom**: Code changes don't affect behavior
- **Cause**: Stale `extension.js` bundle
- **Fix**: 
  1. Run `npm run bundle`
  2. Reload Extension Development Host window
  3. Verify `extension.js` timestamp

### Settings Not Applied
- **Symptom**: Dev flags not working despite being set
- **Cause**: Settings configured in wrong VS Code instance
- **Fix**: Set development settings in the Extension Development Host window, not the source project window

### HTTP URLs Still Rejected
- **Symptom**: `Protocol "http:" not supported` errors
- **Verification**: 
  1. Check for `allowInsecureHttp=true` in logs
  2. Ensure latest bundle loaded (contains HTTP/HTTPS protocol fix)
  3. Verify settings in correct VS Code instance

### Mixed VS Code Versions
- **Symptom**: Inconsistent behavior across sessions
- **Cause**: Multiple test binary versions in `.vscode-test/`
- **Fix**: Use only the newest `vscode-win32-arm64-archive-*` folder

## Testing

### Running Tests
```powershell
# Run full test suite
npm test

# Run specific test file
npm test -- --grep "pattern"
```

### Test Types
- **Unit Tests**: Service and utility function tests
- **Integration Tests**: End-to-end resource discovery and activation
- **Security Tests**: URL validation and sanitization

## Remote Catalog Development

### Local Server Setup
For testing remote catalog functionality:

1. **Start local HTTP server** serving catalog structure:
   ```
   http://localhost:3000/catalog/
   ├── chatmodes/
   │   └── index.json          # ["example.chatmode.md"]
   ├── instructions/
   │   └── index.json          # ["setup.instructions.md"]
   └── ...
   ```

2. **Enable insecure HTTP**:
   ```json
   "copilotCatalog.dev.allowInsecureHttp": true
   ```

3. **Configure remote base**:
   ```json
   "copilotCatalog.remoteBase": "http://localhost:3000/catalog"
   ```

### Expected Log Flow
```
remoteBase=http://localhost:3000/catalog/ derived=chatmodes,instructions,prompts,tasks,mcp
Created virtual repository (remoteBase)
[ResourceService] remote fetch index start category=instructions url=http://localhost:3000/catalog/instructions/index.json
[ResourceService] remote fetch index success category=instructions count=5
[ResourceService] remote fetch file start category=instructions url=http://localhost:3000/catalog/instructions/setup.instructions.md
[ResourceService] remote fetch file success category=instructions name=setup.instructions.md bytes=842
```

## Common Commands

### Development Commands
```powershell
# Quick rebuild and test
npm run build && npm test

# Start bundle watch
npm run watch:bundle

# Verify version sync
npm run verify:version

# Build VSIX package
npm run package
```

### Extension Commands (in dev host)
- `ContextShare: Refresh` - Manually refresh resource discovery
- `ContextShare (Dev): Show Runtime Flags` - Display current configuration
- `Developer: Reload Window` - Restart extension host
- `Developer: Toggle Developer Tools` - Open browser dev tools

## Performance Tips

1. **Use `watch:bundle`** instead of manual bundling
2. **Keep Extension Development Host open** between changes
3. **Use `Developer: Reload Window`** instead of full restart
4. **Clear cache periodically** by deleting `.vscode-test/user-data`
5. **Monitor bundle size** - extension.js should be reasonably sized

## Security Considerations

- Development flags (`dev.*`) are for local development only
- Never commit `allowInsecureHttp: true` in production configs
- Remote URLs are validated for safety (HTTPS-only in production)
- Path traversal protection prevents malicious catalog content

## Additional Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [Extension Development Guide](https://code.visualstudio.com/api/get-started/your-first-extension)
- [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)