# ContextShare Resource Metadata & API Guide for AI Agents

## Overview

This guide explains how AI agents can analyze resource content and use the ContextShare API to create properly categorized and tagged resources with searchable metadata.

## LLM Workflow for Processing External Repository Resources

### Recommended Workflow

The most effective approach for processing resources from external repositories uses the catalog-resource-processor with flexible batch sizes:

1. **Single File Mode** (for testing/refinement): Process one file at a time with manual approval
2. **Small Batch Mode** (for production): Process 5-10 files at a time to stay within LLM context limits
3. **Discovery Mode** (for planning): List all available files without processing

### Single File Processing (Testing & Refinement)

For testing the workflow and refining categorization rules:

```bash
# Process one file with manual approval (recommended for first-time setup)
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes" --approval-mode manual --batch-size 1

# Dry-run to see what would be processed without submitting
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes" --approval-mode dry-run --batch-size 1
```

**Benefits of Single-File Mode:**
- Prevents LLM context overflow
- Allows iterative refinement of categorization
- Enables duplicate checking before processing
- Provides clear feedback loop for metadata quality
- Perfect for testing and process refinement

### Small Batch Processing (Production)

Once the process is refined, process in small batches to optimize efficiency:

```bash
# Process 5-10 files at a time with manual approval
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes" --approval-mode manual --batch-size 5

# Auto-approve small batches (use with caution)
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes" --approval-mode auto --batch-size 10
```

**LLM Analysis Checklist (applies to all modes):**
1. Read actual file content thoroughly
2. Extract title from frontmatter or heading
3. Analyze content for appropriate category
4. Generate relevant tags based on technologies/purpose
5. Write clear, searchable description
6. Verify GitHub URL transformation

### Key Lessons Learned

1. **Always Read Actual Content**: Never assume or generate metadata without reading the full file content
2. **Fix Filename Errors**: Be aware of typos in original filenames (e.g., "accesibility.chatmode.md")
3. **Category Selection Matters**: Choose categories that reflect actual content, not assumptions
4. **Check for Duplicates**: Always verify resources don't already exist before insertion
5. **URL Path Mapping**: Ensure local paths correctly map to GitHub URLs

### Common Categorization Patterns

Based on analysis of chatmode files:

- **automation**: Autonomous agents, automated workflows
- **web-development**: React, Angular, frontend technologies
- **cloud**: Azure, AWS, infrastructure, deployment
- **development**: General coding, debugging, planning
- **dotnet**: C#, .NET specific guidance
- **database**: SQL, data analysis, query assistance
- **ai-ml**: AI agents, declarative agents, ML workflows
- **devops**: CI/CD, deployment, collaboration tools

## Available Processing Scripts

### Primary Tool: catalog-resource-processor.js

The main script for processing AI catalog resources with flexible batch sizes and approval modes.

**Discovery Mode** (see what files are available):
```bash
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes" --approval-mode dry-run --log-level info
```

**Single File Mode** (testing and refinement):
```bash
# Process one file at a time with manual approval
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes" --approval-mode manual --batch-size 1
```

**Small Batch Mode** (production processing):
```bash
# Process 5-10 files with manual approval (recommended)
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes" --approval-mode manual --batch-size 5

# Auto-approve small batches (use with caution after testing)
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes" --approval-mode auto --batch-size 10
```

**Key Options:**
- `--batch-size <n>`: Process n files at a time (1 for testing, 5-10 for production)
- `--approval-mode`: `manual` (prompt each), `auto` (approve all), `dry-run` (analyze only)
- `--log-level`: `debug`, `info`, `warn`, `error`
- `--catalog-id <id>`: Target catalog ID (default: 1)

**Features:**
- Automatic duplicate detection via API search
- GitHub URL generation from local paths
- Content analysis and metadata generation
- LLM-friendly batch processing within context limits
- Manual approval workflow for quality control

### Core Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'chatmodes' \| 'instructions' \| 'prompts' \| 'tasks' \| 'mcp'` | ✅ | Resource type (what the file is) |
| `filename` | `string` | ✅ | File name with appropriate extension |
| `title` | `string \| null` | ❌ | Human-readable resource title |
| `description` | `string \| null` | ❌ | Detailed description of what the resource does |
| `category` | `string \| null` | ❌ | Domain/technology category for grouping |
| `tags` | `string \| null` | ❌ | Comma-separated searchable keywords |

### Searchable Fields

The system searches across these fields using LIKE queries:
1. **`title`** - Most important for matching
2. **`description`** - Key for content discovery 
3. **`tags`** - Specific keywords and technologies
4. **`category`** - Domain-level filtering

## Categorization Guidelines

### Resource Types (`type` field)

| Type | File Extension | Description |
|------|---------------|-------------|
| `chatmodes` | `.chatmode.md` | AI assistant conversation modes/personas |
| `instructions` | `.instructions.md` | Coding guidelines and best practices |
| `prompts` | `.prompt.md` | Reusable AI prompts for specific tasks |
| `tasks` | `.task.json` | Automation task definitions |
| `mcp` | `.mcp.json` | Model Context Protocol server configurations |

### Categories (`category` field)

Choose ONE primary domain/technology category:

#### Technology Domains
- `web-development` - Frontend, React, Angular, Vue, etc.
- `cloud` - Azure, AWS, GCP, cloud architecture
- `database` - SQL, NoSQL, data management
- `mobile` - iOS, Android, React Native, Flutter
- `backend` - APIs, servers, microservices
- `devops` - CI/CD, containers, deployment
- `security` - Authentication, encryption, best practices
- `testing` - Unit tests, integration tests, automation
- `ai-ml` - Machine learning, AI integration
- `game-development` - Gaming, Unity, Unreal

#### Language-Specific
- `dotnet` - C#, ASP.NET, Blazor
- `javascript` - Node.js, TypeScript, vanilla JS
- `python` - Django, Flask, data science
- `java` - Spring Boot, enterprise Java
- `rust` - Systems programming, WebAssembly
- `go` - Microservices, cloud native

#### Role-Based
- `architecture` - System design, patterns
- `performance` - Optimization, monitoring
- `documentation` - Technical writing, APIs

### Tags (`tags` field)

Use comma-separated keywords without spaces. Combine multiple aspects:

#### Technology Stack Tags
```
react,typescript,hooks
dotnet,blazor,signalr
python,django,postgresql
azure,functions,cosmos
```

#### Skill Level Tags
```
beginner,tutorial
intermediate,best-practices
advanced,architecture
expert,performance
```

#### Purpose Tags
```
debugging,troubleshooting
automation,ci-cd
security,authentication
testing,unit-tests
documentation,api
```

#### Domain-Specific Tags
```
frontend,responsive,accessibility
backend,api,microservices
database,orm,migrations
cloud,serverless,containers
```

## Content Analysis Guidelines

When analyzing resource content, extract:

1. **Primary Technology** → `category`
2. **Secondary Technologies** → `tags`
3. **Skill Level Indicators** → `tags`
4. **Purpose/Use Case** → `tags`
5. **Clear Title** → `title`
6. **Descriptive Summary** → `description`

### Example Analysis

**Resource Content:**
```markdown
# React TypeScript Best Practices

Advanced patterns for building scalable React applications with TypeScript,
including custom hooks, context patterns, and performance optimization.
```

**Extracted Metadata:**
```json
{
  "type": "instructions",
  "filename": "react-typescript-best-practices.instructions.md",
  "title": "React TypeScript Best Practices",
  "description": "Advanced patterns for building scalable React applications with TypeScript, including custom hooks, context patterns, and performance optimization",
  "category": "web-development",
  "tags": "react,typescript,hooks,context,performance,advanced"
}
```

## API Usage

### Base URL
```
POST /admin/resources
```

### Authentication
Include admin API key in headers:
```
Authorization: Bearer <admin-api-key>
```

### Create Resource Request

```typescript
interface CreateResourceRequest {
  catalogId: number;           // Target catalog ID
  type: ResourceType;          // Resource type
  filename: string;            // File name with extension
  title?: string;              // Human-readable title
  description?: string;        // Detailed description
  category?: string;           // Domain category
  tags?: string;               // Comma-separated tags
  content?: string;            // File content (for content type)
  contentUrl?: string;         // External URL (for url type)
  resourceType: 'content' | 'url';
  metadata?: Record<string, unknown>; // Additional JSON metadata
}
```

### Example API Calls

#### Content Resource (Stored Content)
```json
{
  "catalogId": 1,
  "type": "instructions",
  "filename": "react-hooks-guide.instructions.md",
  "title": "React Hooks Complete Guide",
  "description": "Comprehensive guide to React hooks including useState, useEffect, custom hooks, and best practices",
  "category": "web-development", 
  "tags": "react,hooks,usestate,useeffect,javascript,frontend",
  "content": "# React Hooks Guide\n\n...",
  "resourceType": "content"
}
```

#### URL Resource (External Link)
```json
{
  "catalogId": 1,
  "type": "instructions",
  "filename": "azure-functions-typescript.instructions.md",
  "title": "Azure Functions TypeScript Best Practices",
  "description": "Official Microsoft guidelines for building Azure Functions with TypeScript",
  "category": "cloud",
  "tags": "azure,functions,typescript,serverless,cloud",
  "contentUrl": "https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node",
  "resourceType": "url"
}
```

## Search Functionality

Resources can be searched using:

```
GET /api/resources/search?q=<query>&category=<category>&type=<type>
```

The search looks across:
- Title (highest priority)
- Description (high priority) 
- Tags (exact and partial matches)
- Category (exact matches)

## Best Practices for Agents

1. **Always analyze content** before creating metadata
2. **Use consistent categories** from the approved list
3. **Include skill level** in tags when obvious
4. **Write clear descriptions** that help users understand utility
5. **Use specific technology tags** rather than generic ones
6. **Include purpose tags** (debugging, automation, etc.)
7. **Keep tags lowercase** and use hyphens for multi-word concepts

## Common Patterns

### Chatmode Analysis
```json
{
  "type": "chatmodes",
  "category": "web-development",
  "tags": "react,expert,architect,frontend"
}
```

### Instruction Analysis  
```json
{
  "type": "instructions", 
  "category": "dotnet",
  "tags": "csharp,blazor,best-practices,architecture"
}
```

### Prompt Analysis
```json
{
  "type": "prompts",
  "category": "testing", 
  "tags": "unit-tests,automation,debugging"
}
```

This metadata structure enables powerful search and discovery while keeping the implementation simple and maintainable.

## Workflow Testing & Troubleshooting

## Workflow Testing & Troubleshooting

### ⚠️ CRITICAL: API Implementation Status

**Current Status (Sept 2025)**: The admin API has schema mismatches and missing implementations:

1. **Schema Mismatch**: Database migration renamed `category` → `type` and added new fields, but admin routes validation schema wasn't updated
2. **Missing Implementation**: `SqliteCatalogProvider.create()` method doesn't exist - admin routes call non-existent method
3. **Field Mapping Issues**: 
   - Database: `type` (resource type), `category` (domain), `tags`, `title`, `description`
   - API Schema: Still expects old `category` field for resource type

**Workaround**: Use direct database insertion or implement missing methods before testing workflow.

### Testing the Full Workflow

⚠️ **Note**: Full API testing requires implementing missing SqliteCatalogProvider methods first.

```bash
# 1. Set environment variables
$env:MODE = "database"
$env:DATABASE_PATH = "./catalog.db"
$env:CONTEXTSHARE_API_KEY = "admin-key"

# 2. Test with a single resource (will fail until API is fixed)
node scripts/insert-to-db.js your-metadata.json
```

**Expected JSON Format for insert-to-db.js** (corrected schema):
```json
{
  "resources": [
    {
      "catalogId": 1,
      "type": "chatmodes", 
      "filename": "example.chatmode.md",
      "title": "Resource Title",
      "description": "Resource description", 
      "category": "automation",
      "tags": "tag1,tag2,tag3",
      "contentUrl": "https://github.com/owner/repo/blob/main/file.md",
      "resourceType": "url"
    }
  ]
}
```

### Database Schema (Post-Migration)

Current database fields after migration 003:
```sql
-- resources table
id INTEGER PRIMARY KEY
catalog_id INTEGER 
type TEXT              -- Resource type: chatmodes, instructions, prompts, tasks, mcp
filename TEXT
title TEXT             -- Human-readable title
description TEXT       -- Detailed description
category TEXT          -- Domain category: automation, web-development, cloud, etc.
tags TEXT              -- Comma-separated: autonomous,agent,research,debugging
content TEXT
content_type TEXT
resource_type TEXT     -- 'content' or 'url'
content_url TEXT
enabled INTEGER
metadata TEXT          -- JSON metadata
created_at TEXT
updated_at TEXT
```

### Common API Issues

1. **Server Not Running**
   ```
   Error: connect ECONNREFUSED ::1:3000
   ```
   **Solution**: Start the server with `npm start` in database mode

2. **Wrong Endpoint**
   ```
   Cannot POST /api/admin/resources
   ```
   **Solution**: Use `/admin/resources` not `/api/admin/resources`

3. **HTTPS/HTTP Mismatch**
   ```
   SSL routines:tls_get_more_records:packet length too long
   ```
   **Solution**: Fixed in updated insert-to-db.js script

4. **Missing API Key**
   ```
   API key required
   ```
   **Solution**: Set `CONTEXTSHARE_API_KEY` environment variable

5. **Schema Validation Errors**
   ```
   validation_error
   ```
   **Solution**: Check resource schema matches API requirements

## Troubleshooting & Best Practices

### Common Issues

1. **File Reading Errors**
   ```bash
   # Ensure file paths are correct
   node scripts/process-single.js "temp-analysis/1-file.chatmode.md"
   ```

2. **API Connection Issues**
   ```bash
   # Set environment variable
   export CONTEXTSHARE_API_KEY=your-api-key
   
   # Or pass directly
   node scripts/process-single.js --api-key your-key-here
   ```

3. **Duplicate Detection**
   ```bash
   # Always check before inserting
   node scripts/process-single.js "file.md" --dry-run
   ```

### Filename Corrections

When processing external repositories, watch for common filename issues:
- `accesibility.chatmode.md` → should be `accessibility.chatmode.md`
- Ensure proper `.chatmode.md`, `.instructions.md` extensions
- Handle legacy `.instruction.md` files (without 's')

### URL Path Mapping

Local paths must correctly map to GitHub URLs:
```
Local: s:\src\awesome-copilot\chatmodes\file.chatmode.md
GitHub: https://github.com/github/awesome-copilot/blob/main/chatmodes/file.chatmode.md
```

### Category Selection Guidelines

Choose categories that match actual content:
- Don't assume `ai-ml` for all chatmodes
- `automation` for autonomous agents
- `web-development` for frontend technologies
- `cloud` for Azure/AWS specific content
- `development` for general coding assistance

### LLM Analysis Verification

Always verify LLM analysis by:
1. Reading actual file content thoroughly
2. Checking extracted frontmatter matches content
3. Ensuring category reflects primary technology/purpose
4. Validating tags are relevant and searchable