# ContextShare Reference Server

Reference implementation of the remote catalog backend with comprehensive database support and admin capabilities.

## Features

### Core Capabilities
- **Multi-mode operation**: File, Database, and Hybrid modes
- **SQLite Database**: Full CRUD operations with migrations and performance optimization  
- **Admin REST API**: Complete catalog and resource management (database/hybrid modes only)
- **Public Catalog API**: Standard catalog browsing for all modes
- **Migration Tools**: CLI tools for migrating file-based catalogs to database

### Current Implementation
- Config parsing & validation (`CATALOG_ROOT`, `PORT`, `MODE`, `DATABASE_PATH`)
- Structured logging with authorization/token redaction
- Generic TTL LRU cache with automatic invalidation
- File system catalog provider (`/catalog/:category/index.json` + file fetch)
- SQLite catalog provider with full database operations
- Express application with health endpoint `/healthz`
- Request ID + placeholder auth middleware (anonymous vs token present)
- Category whitelist & proper 404 on invalid category
- Proper 404 for missing files; 413 for oversized files (>1MB)
- Unified JSON error responses
- Comprehensive test coverage (30+ tests)

## Quick Start

### File Mode (Traditional)
```powershell
# PowerShell
cd server
$env:CATALOG_ROOT = "../example-catalog"
npm run build
npm start
```

### Database Mode (with Admin API)
```powershell
# PowerShell  
cd server
$env:MODE = "database"
$env:DATABASE_PATH = "./catalog.db"
npm run build
npm start
```

Visit the [Admin API Documentation](./ADMIN_API.md) for complete API reference and examples.

## Server Modes

| Mode | Description | Admin API | Use Case |
|------|-------------|-----------|----------|
| `file` | File-based catalogs | ❌ | Development, static content |
| `database` | SQLite database only | ✅ | Production, dynamic content |  
| `hybrid` | Database with file fallback | ✅ | Migration scenarios |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CATALOG_ROOT` | File mode only | (none) | Path to catalog root containing category subfolders (e.g. `../example-catalog`). |
| `DATABASE_PATH` | Database/Hybrid | (none) | Path to SQLite database file (e.g. `./catalog.db` or `:memory:`). |
| `MODE` | No | `file` | Server mode: `file`, `database`, or `hybrid`. |
| `PORT` | No | `3000` | HTTP listen port. |

### Mode-Specific Requirements

**File Mode:**
- Requires: `CATALOG_ROOT`
- Optional: `PORT`

**Database Mode:**  
- Requires: `DATABASE_PATH`
- Optional: `PORT`
- Features: Admin API, migrations, performance optimization

**Hybrid Mode:**
- Requires: `DATABASE_PATH`
- Optional: `CATALOG_ROOT`, `PORT`  
- Features: Database with file fallback

## API Endpoints

### Public Catalog API (All Modes)
```
GET  /healthz                                    # Health check
GET  /catalog/:category/index.json               # List resources in category  
GET  /catalog/:category/:filename                # Get resource content
```

### Admin API (Database/Hybrid Modes Only)
```
GET  /admin/catalogs                             # List all catalogs
POST /admin/catalogs                             # Create new catalog
GET  /admin/catalogs/:id/resources               # List resources in catalog

POST   /admin/resources                          # Create new resource
PUT    /admin/resources/:catalogId/:category/:filename  # Update resource
DELETE /admin/resources/:catalogId/:category/:filename  # Delete resource  
GET    /admin/resources/:catalogId/:category/:filename  # Get resource details
```

**📖 See [Admin API Documentation](./ADMIN_API.md) for complete API reference, examples, and usage patterns.**

## Running Examples

### Development with File Mode
```bash
cd server
npm install
npm run build

# Use existing example catalog
export CATALOG_ROOT=../example-catalog  # PowerShell: $env:CATALOG_ROOT="../example-catalog"
npm start
```

**Test the API:**
- Health: `http://localhost:3000/healthz`
- List instructions: `http://localhost:3000/catalog/instructions/index.json`  
- Fetch file: `http://localhost:3000/catalog/instructions/catalog-setup-guardrails.instructions.md`

### Production with Database Mode
```bash
cd server
npm install
npm run build

# Configure database mode
export MODE=database                    # PowerShell: $env:MODE="database"
export DATABASE_PATH=./catalog.db       # PowerShell: $env:DATABASE_PATH="./catalog.db"
npm start
```

**Use the Admin API:**
```bash
# Create a catalog
curl -X POST http://localhost:3000/admin/catalogs \
  -H "Content-Type: application/json" \
  -d '{"name": "my-catalog", "displayName": "My Catalog", "sourceType": "local"}'

# Create a resource  
curl -X POST http://localhost:3000/admin/resources \
  -H "Content-Type: application/json" \
  -d '{"catalogId": 1, "category": "instructions", "filename": "test.instructions.md", "content": "# Test\nContent here"}'
```

## Migration from File to Database

Use the built-in migration tools to convert file-based catalogs to database storage:

```bash
# Migrate a single catalog
npm run migrate:single -- --catalog-path ./my-catalog --database ./catalog.db --catalog-name "My Catalog"

# Migrate multiple catalogs using a config file
npm run migrate:batch -- --config ./migration-config.json --database ./catalog.db
```

## Development

### Watch Mode
```bash
npm run build
node --watch dist/index.js
```

### Testing
```bash
npm test                    # Run all tests
npm run test:security       # Run security-specific tests  
npm run lint                # Code linting
```

The test suite includes 30+ tests covering:
- File and database catalog providers
- Admin API endpoints and validation
- Error handling and edge cases
- Performance testing (1000+ resources)
- Security validation
- Cache management

## Architecture

### File Structure
```
server/
├── src/
│   ├── index.ts              # Application entry point
│   ├── config.ts             # Configuration and CLI parsing
│   ├── http/
│   │   ├── app.ts            # Express app setup and routing
│   │   ├── middleware/       # Request ID, auth guard
│   │   └── routes/
│   │       └── admin.ts      # Admin API routes
│   ├── database/
│   │   ├── service.ts        # SQLite database service
│   │   ├── schema.ts         # Database schema definitions
│   │   ├── migrationRunner.ts # Migration management
│   │   └── migrations/       # SQL migration files
│   ├── catalog/
│   │   ├── types.ts          # Catalog provider interface
│   │   ├── fileSystemCatalogProvider.ts
│   │   └── sqliteCatalogProvider.ts
│   ├── cache/
│   │   └── lru.ts           # LRU cache implementation
│   ├── logging/
│   │   └── logger.ts        # Structured logging
│   └── tools/
│       ├── migrate.ts       # Migration utilities
│       └── migrate-cli.ts   # CLI migration tools
└── test/                    # Comprehensive test suite
```

### Database Schema

The SQLite database uses two main tables:

**Catalogs:**
- `id`, `name`, `display_name`, `description`
- `source_type`, `source_path`, `source_url`  
- `enabled`, `created_at`, `updated_at`

**Resources:**
- `id`, `catalog_id`, `category`, `filename`
- `title`, `description`, `content`, `content_type`
- `metadata` (JSON), `enabled`, `created_at`, `updated_at`

### Performance Features

- **SQLite WAL Mode**: Optimized for concurrent reads
- **Proper Indexing**: Fast queries on category, filename, enabled status
- **LRU Caching**: Index results cached with automatic invalidation
- **Connection Management**: Efficient database connection handling
- **Migration System**: Versioned schema updates

## Error Responses

| Scenario | Status | Body |
|----------|--------|------|
| Missing catalog file | 404 | `{ "error": "not_found" }` |
| File too large (>1MB) | 413 | `{ "error": "file_too_large" }` |
| Invalid category | 404 | `{ "error": "category_not_found" }` |
| Validation error | 400 | `{ "error": "validation_error", "details": [...] }` |
| Internal error | 500 | `{ "error": "internal" }` |

## Security Considerations

**⚠️ Important**: The current implementation includes placeholder authentication only.

### For Production Deployment:
1. **Authentication**: Implement JWT validation or API key authentication
2. **Authorization**: Add role-based access control  
3. **Rate Limiting**: Implement per-user/IP rate limits
4. **HTTPS**: Use TLS encryption for all traffic
5. **Input Validation**: Additional sanitization beyond current Zod schemas
6. **Audit Logging**: Track all admin operations
7. **Secret Management**: Use proper secret management for database credentials

### Current Security Features:
- Input validation via Zod schemas
- File size limits (1MB max)
- Path traversal protection  
- Category whitelisting
- Structured error responses (no stack traces)

## Roadmap & Future Features

### Phase 1: Core Hardening
- [ ] JWT authentication with JWKS support
- [ ] Role-based authorization  
- [ ] Rate limiting middleware
- [ ] Enhanced audit logging

### Phase 2: Advanced Features  
- [ ] Web-based admin interface
- [ ] Resource versioning and history
- [ ] Bulk import/export operations
- [ ] Advanced search and filtering
- [ ] Resource templates and scaffolding

### Phase 3: Enterprise Features
- [ ] Microsoft Graph OBO integration
- [ ] Policy engine with group-based filtering  
- [ ] ETag generation & conditional requests
- [ ] Multi-tenant support
- [ ] Backup and restore tools

### Phase 4: Scaling & Distribution
- [ ] PostgreSQL support  
- [ ] Horizontal scaling support
- [ ] CDN integration
- [ ] Prometheus metrics
- [ ] Distributed caching

## Disclaimer

This is a reference implementation for development & testing. **Production deployments require additional security hardening** including authentication, authorization, rate limiting, HTTPS, and proper secret management.

## Documentation

- **[Admin API Reference](./ADMIN_API.md)** - Complete REST API documentation with examples
- [Server Implementation](./README.md) - This document  
- [Server Deployment Guide](../docs/server/deployment.md) - Production deployment guidance
