# ContextShare Admin API

The ContextShare server provides a comprehensive REST API for managing catalogs and resources when running in **database mode** or **hybrid mode**. This API is available at the `/admin` endpoint and provides full CRUD operations for catalog management.

## Overview

The Admin API is automatically enabled when the server runs in database or hybrid mode. It provides:

- **Catalog Management**: Create, list, and manage catalog metadata
- **Resource Management**: Full CRUD operations for catalog resources (instructions, prompts, chat modes, tasks, MCP configs)
- **Content Management**: Direct content editing and metadata management
- **Cache Integration**: Automatic cache invalidation for optimal performance

## Getting Started

### 1. Start the Server in Database Mode

```powershell
# PowerShell
cd server
$env:MODE = "database"
$env:DATABASE_PATH = "./admin-catalog.db"
$env:PORT = "3000"
npm run build
npm start
```

```bash
# Bash/Linux
cd server
export MODE=database
export DATABASE_PATH=./admin-catalog.db
export PORT=3000
npm run build
npm start
```

### 2. Server Modes

| Mode | Description | Admin API |
|------|-------------|-----------|
| `file` | File-based catalogs only | ❌ Not available |
| `database` | SQLite database only | ✅ Full API available |
| `hybrid` | Database with file fallback | ✅ Full API available |

### 3. Base URL

All admin endpoints are prefixed with `/admin`:
```
http://localhost:3000/admin/
```

## API Reference

### Catalogs

#### List All Catalogs
```http
GET /admin/catalogs
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "my-catalog",
    "display_name": "My Catalog",
    "description": "A sample catalog",
    "source_type": "local",
    "source_path": "/path/to/catalog",
    "source_url": null,
    "enabled": 1,
    "created_at": "2025-09-18T19:00:00.000Z",
    "updated_at": "2025-09-18T19:00:00.000Z",
    "resource_count": 5
  }
]
```

#### Create a New Catalog
```http
POST /admin/catalogs
Content-Type: application/json

{
  "name": "my-new-catalog",
  "displayName": "My New Catalog",
  "description": "Description of the catalog",
  "sourceType": "local",
  "sourcePath": "/optional/path",
  "sourceUrl": "https://optional-url.com"
}
```

**Response:**
```json
{
  "id": 2,
  "name": "my-new-catalog",
  "display_name": "My New Catalog",
  "description": "Description of the catalog",
  "source_type": "local",
  "source_path": "/optional/path",
  "source_url": "https://optional-url.com",
  "enabled": 1,
  "created_at": "2025-09-18T19:30:00.000Z",
  "updated_at": "2025-09-18T19:30:00.000Z"
}
```

#### List Resources in a Catalog
```http
GET /admin/catalogs/:id/resources
```

**Response:**
```json
[
  {
    "id": 1,
    "catalog_id": 1,
    "category": "instructions",
    "filename": "setup.instructions.md",
    "title": "Setup Instructions",
    "description": null,
    "content_type": "text/markdown",
    "enabled": 1,
    "created_at": "2025-09-18T19:00:00.000Z",
    "updated_at": "2025-09-18T19:00:00.000Z"
  }
]
```

### Resources

#### Create a New Resource
```http
POST /admin/resources
Content-Type: application/json

{
  "catalogId": 1,
  "category": "instructions",
  "filename": "new-guide.instructions.md",
  "content": "# New Guide\n\nThis is the content of the new guide.",
  "metadata": {
    "tags": ["guide", "tutorial"],
    "author": "admin"
  }
}
```

**Categories:** `chatmodes`, `instructions`, `prompts`, `tasks`, `mcp`

**Response:**
```json
{
  "id": 2,
  "catalog_id": 1,
  "category": "instructions",
  "filename": "new-guide.instructions.md",
  "title": "New Guide",
  "description": null,
  "content": "# New Guide\n\nThis is the content of the new guide.",
  "content_type": "text/markdown",
  "metadata": "{\"tags\":[\"guide\",\"tutorial\"],\"author\":\"admin\"}",
  "enabled": 1,
  "created_at": "2025-09-18T19:35:00.000Z",
  "updated_at": "2025-09-18T19:35:00.000Z"
}
```

#### Update a Resource
```http
PUT /admin/resources/:catalogId/:category/:filename
Content-Type: application/json

{
  "content": "# Updated Guide\n\nThis is the updated content.",
  "metadata": {
    "tags": ["guide", "tutorial", "updated"],
    "author": "admin"
  }
}
```

**Response:**
```json
{
  "message": "Resource updated successfully"
}
```

#### Delete a Resource
```http
DELETE /admin/resources/:catalogId/:category/:filename
```

**Response:**
```json
{
  "message": "Resource deleted successfully"
}
```

#### Get Resource Content
```http
GET /admin/resources/:catalogId/:category/:filename
```

**Response:**
```json
{
  "content": "# Updated Guide\n\nThis is the updated content.",
  "content_type": "text/markdown",
  "metadata": "{\"tags\":[\"guide\",\"tutorial\",\"updated\"],\"author\":\"admin\"}",
  "title": "Updated Guide",
  "description": null
}
```

## Usage Examples

### Using curl

#### Create a catalog:
```bash
curl -X POST http://localhost:3000/admin/catalogs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-catalog",
    "displayName": "Test Catalog",
    "sourceType": "local"
  }'
```

#### Create an instruction:
```bash
curl -X POST http://localhost:3000/admin/resources \
  -H "Content-Type: application/json" \
  -d '{
    "catalogId": 1,
    "category": "instructions",
    "filename": "hello.instructions.md",
    "content": "# Hello World\n\nThis is a test instruction."
  }'
```

### Using PowerShell

#### List catalogs:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/admin/catalogs" -Method GET
```

#### Create a resource:
```powershell
$body = @{
  catalogId = 1
  category = "prompts"
  filename = "test.prompt.md"
  content = "# Test Prompt\n\nThis is a test prompt."
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/admin/resources" -Method POST -Body $body -ContentType "application/json"
```

## Error Handling

The API returns appropriate HTTP status codes:

| Status | Description | Example Response |
|--------|-------------|------------------|
| 200 | Success | `{ "message": "Success" }` |
| 201 | Created | `{ "id": 1, "name": "..." }` |
| 400 | Validation Error | `{ "error": "validation_error", "details": [...] }` |
| 404 | Not Found | `{ "error": "not_found" }` |
| 413 | File Too Large | `{ "error": "file_too_large" }` |
| 500 | Internal Error | `{ "error": "internal" }` |

## Public Catalog API

Resources created via the Admin API are immediately available through the public catalog endpoints:

```http
GET /catalog/:category/index.json        # List resources
GET /catalog/:category/:filename          # Get resource content
```

## Performance & Caching

- **Automatic Cache Invalidation**: Index caches are automatically invalidated when resources are modified
- **Database Optimization**: Uses SQLite with WAL mode and proper indexing
- **Concurrent Operations**: Supports multiple simultaneous operations
- **Performance Tested**: Handles 1000+ resources efficiently

## Migration Tools

The server includes CLI tools for migrating file-based catalogs to the database:

```bash
# Migrate a single catalog
npm run migrate:single -- --catalog-path ./my-catalog --database ./catalog.db --catalog-name "My Catalog"

# Migrate multiple catalogs
npm run migrate:batch -- --config ./migration-config.json --database ./catalog.db
```

## Security Considerations

**Important**: The current implementation does not include authentication. For production use:

1. Add authentication middleware (JWT tokens, API keys, etc.)
2. Implement authorization/permissions
3. Add rate limiting
4. Use HTTPS
5. Validate and sanitize all inputs
6. Implement audit logging

## Development & Testing

Run the test suite to verify Admin API functionality:

```bash
cd server
npm test
```

The test suite includes:
- Catalog CRUD operations
- Resource CRUD operations  
- Validation testing
- Error handling
- Performance testing
- Cache invalidation testing

## Future Enhancements

Planned features for the Admin API:

- [ ] Web-based admin interface
- [ ] Bulk operations (import/export)
- [ ] Resource versioning
- [ ] Advanced search and filtering
- [ ] User management and permissions
- [ ] Audit logs and activity tracking
- [ ] Resource templates and scaffolding