# ContextShare Resource Metadata & API Guide for AI Agents

## Overview

This guide explains how AI agents can analyze resource content and use the ContextShare API to create properly categorized and tagged resources with searchable metadata.

## LLM Workflow for Processing External Repository Resources

### ✅ Current Streamlined Workflow (Recommended)

**Overview**: The most effective approach uses the catalog-resource-processor to automatically discover and extract only new content files, then LLM analyzes each file and generates proper metadata.

#### Step 1: Extract Content Files
```bash
# Run processor to save content files (skips existing resources automatically)
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes"
```

**What this does:**
- ✅ **Automatic duplicate detection**: Uses direct database queries to skip existing resources
- ✅ **Content extraction**: Saves file content to `temp-analysis/` folder  
- ✅ **No automated analysis**: Just extracts content for LLM review
- ✅ **Correct URLs**: Generates proper raw GitHub URLs
- ✅ **No batch limits**: Processes all new files automatically

#### Step 2: LLM Analysis and Metadata Generation

For each file in `temp-analysis/`:

1. **Read COMPLETE content file**: `temp-analysis/[filename].md` - **CRITICAL: Read the entire file, not just the first few lines**
2. **Analyze as LLM**: Extract title, understand purpose, identify domain, skill level, and all covered technologies
3. **Generate comprehensive JSON metadata**: Following exact schema from guide with complete tags and accurate descriptions
4. **Insert into database**: Using `insert-to-db.js`
5. **Cleanup files**: Remove both .md and .json files after success

**Example LLM Workflow:**
```bash
# 1. LLM reads: temp-analysis/accessibility.chatmode.md
# 2. LLM generates: accessibility-metadata.json (following schema)
# 3. LLM inserts: $env:CONTEXTSHARE_API_KEY="admin-key"; node insert-to-db.js accessibility-metadata.json
# 4. LLM cleans up: Remove-Item accessibility-metadata.json, temp-analysis/accessibility.chatmode.md
```

**Required JSON Schema** (must match exactly):
```json
{
  "resources": [
    {
      "catalogId": 1,
      "type": "chatmodes",
      "filename": "example.chatmode.md",
      "title": "Resource Title",
      "description": "Resource description",
      "category": "web-development",
      "tags": "tag1,tag2,tag3",
      "contentUrl": "https://raw.githubusercontent.com/github/awesome-copilot/refs/heads/main/chatmodes/example.chatmode.md",
      "resourceType": "url"
    }
  ]
}
```

#### Benefits of Streamlined Workflow:
- ✅ **LLM reads actual content**: No automated analysis, proper understanding
- ✅ **Automatic duplicate detection**: Skips existing resources efficiently  
- ✅ **Proper categorization**: LLM understands context and purpose
- ✅ **Scalable**: Process hundreds of files systematically
- ✅ **Clean**: Removes processed files to track progress

## Available Processing Scripts

### Primary Tool: catalog-resource-processor.js

The main script for extracting content files from external repositories. **No longer handles approval or insertion** - just saves content for LLM analysis.

**Current Usage** (streamlined):
```bash
# Extract content files for LLM analysis (processes all new files automatically)
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\chatmodes"
```

**Key Options:**
- `--log-level`: `debug`, `info`, `warn`, `error`

**Features:**
- ✅ **Automatic duplicate detection**: Uses direct database queries to skip existing resources
- ✅ **Content extraction**: Saves file content to `temp-analysis/` folder
- ✅ **URL generation**: Creates proper raw GitHub URLs for later use
- ✅ **No automation**: Just extracts content, LLM handles analysis

### Secondary Tool: insert-to-db.js

Used by LLM to insert generated metadata into the database.

**Usage:**
```bash
$env:CONTEXTSHARE_API_KEY="admin-key"; node insert-to-db.js your-metadata.json
```

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

🚨 **CRITICAL**: Always read the COMPLETE file content before analysis. Reading only the first few lines leads to:
- ❌ Missing advanced topics and frameworks
- ❌ Incorrect skill level classification
- ❌ Incomplete tag sets
- ❌ Poor descriptions that don't reflect full scope

When analyzing COMPLETE resource content, extract:

1. **Primary Technology** → `category` (from main focus of entire file)
2. **ALL Secondary Technologies** → `tags` (from complete content scan)
3. **Actual Skill Level** → `tags` (based on complexity of complete content)
4. **All Purposes/Use Cases** → `tags` (from examples and sections throughout)
5. **Accurate Title** → `title` (reflecting full scope)
6. **Comprehensive Summary** → `description` (covering complete feature set)

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
# 1. Verify server is running
curl http://localhost:3000/healthz

# 2. If health check passes, proceed directly to step 3
# If health check fails, set environment variables and start server:
$env:MODE = "database"
$env:DATABASE_PATH = "./catalog.db"
$env:CONTEXTSHARE_API_KEY = "admin-key"
npm start

# 3. Test with a single resource (will fail until API is fixed)
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

### Streamlined Processing Approach

**Recommended Approach**: Use the catalog-resource-processor.js script which automatically handles existence checking and only extracts content from new files.

```bash
# The script automatically checks database and only processes new files
node scripts/catalog-resource-processor.js "s:\src\awesome-copilot\prompts"
```

**Benefits:**
- ⚡ **Ultra-fast**: Built-in database queries skip existing resources
- 🎯 **Precise**: Direct database lookup with filename and URL matching  
- 🔍 **Comprehensive**: Handles all files in directory automatically
- 📊 **Informative**: Shows which files are skipped vs processed

### Common API Issues

1. **Server Not Running**
   ```
   Error: connect ECONNREFUSED ::1:3000
   ```
   **Solution**: Check server health with `curl http://localhost:3000/healthz`. If it fails, start the server with `npm start` in database mode

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

🔍 **COMPLETE CONTENT ANALYSIS CHECKLIST**:

**Before Analysis:**
- [ ] Read the ENTIRE file from start to finish (not just first 15-30 lines)
- [ ] Scan for all technologies, frameworks, and patterns mentioned
- [ ] Identify skill level from complexity indicators throughout
- [ ] Note all use cases, examples, and practical applications

**During Analysis:**
1. **Read actual file content COMPLETELY** - Every section, example, and instruction
2. **Extract frontmatter AND validate against full content**
3. **Identify ALL technologies mentioned** - not just the filename/title
4. **Assess true complexity level** - beginner/intermediate/advanced based on complete content
5. **Catalog comprehensive feature set** - what's actually covered in full

**After Analysis:**
- [ ] Category reflects the PRIMARY technology focus of complete content
- [ ] Tags include ALL relevant technologies and patterns found
- [ ] Description accurately summarizes the FULL scope and capabilities
- [ ] Skill level matches the actual complexity of complete instructions
- [ ] No major topics or frameworks were missed due to partial reading

**Quality Examples of Complete Analysis:**
- NestJS file: Should include authentication, testing, TypeORM, security, performance (not just "NestJS basics")
- Angular file: Should include signals, standalone components, specific architectural patterns (not just "Angular development")
- Python file: Should include PEP standards, testing, type hints, specific libraries (not just "Python guidelines")