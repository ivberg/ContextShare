# LLM Usage Guide for Catalog Resource Processor

This guide explains how Large Language Models (LLMs) can use the Catalog Resource Processor to analyze AI resources and generate appropriate metadata for ContextShare catalogs.

## Quick Start for LLMs

```javascript
const { analyzeContentDirect, CatalogResourceAnalyzer } = require('./catalog-resource-processor.js');

// Method 1: Quick analysis (most common)
const analysis = analyzeContentDirect(content, filename, githubUrl);

// Method 2: Full analyzer with configuration
const analyzer = new CatalogResourceAnalyzer({ catalogId: 1 });
const result = analyzer.analyzeContent(content, filename, githubUrl);
```

## Key Functions for LLM Use

### `analyzeContentDirect(content, filename, contentUrl, config?)`

**Purpose**: Analyze resource content and generate metadata without file system access.

**Parameters**:
- `content` (string): Full file content
- `filename` (string): Original filename (e.g., "react-expert.chatmode.md")
- `contentUrl` (string): GitHub URL where the resource is hosted
- `config` (object, optional): Configuration options

**Returns**: Analysis object with:
```javascript
{
  success: true,
  filename: "react-expert.chatmode.md",
  type: "chatmodes",
  contentUrl: "https://github.com/...",
  metadata: {
    type: "chatmodes",
    filename: "react-expert.chatmode.md", 
    title: "React Expert",
    description: "Expert React development assistant...",
    category: "web-development",
    tags: "react,typescript,expert,frontend"
  },
  apiPayload: { /* Ready for API submission */ },
  suggestions: {
    title: [],
    description: ["Add more specific details..."],
    category: [],
    tags: ["Consider adding 'hooks' tag"]
  }
}
```

### `CatalogResourceAnalyzer` Class

**Purpose**: Full-featured analyzer with state and configuration.

```javascript
const analyzer = new CatalogResourceAnalyzer({
  catalogId: 1,
  serverUrl: 'http://localhost:3000',
  apiKey: 'your-api-key',
  logLevel: 'info'
});

// Analyze content
const result = analyzer.analyzeContent(content, filename, url);

// Check if resource already exists
const exists = await analyzer.checkExists(githubUrl);

// Submit to catalog
const response = await analyzer.submitResource(apiPayload);
```

## Resource Type Detection

The analyzer automatically detects resource types based on filename extensions:

| Extension | Type | Description |
|-----------|------|-------------|
| `.chatmode.md` | `chatmodes` | AI assistant conversation modes |
| `.instructions.md` | `instructions` | Coding guidelines and best practices |
| `.instruction.md` | `instructions` | Legacy instruction files |
| `.prompt.md` | `prompts` | Reusable AI prompts |
| `.task.json` | `tasks` | Automation task definitions |
| `.mcp.json` | `mcp` | Model Context Protocol servers |

## Metadata Categories

The analyzer suggests appropriate categories based on content analysis:

### Technology Domains
- `web-development`: React, Angular, Vue, frontend technologies
- `cloud`: Azure, AWS, GCP, serverless, containers
- `database`: SQL, NoSQL, data management
- `mobile`: iOS, Android, React Native, Flutter
- `backend`: APIs, servers, microservices
- `devops`: CI/CD, deployment, containers
- `security`: Authentication, encryption, best practices
- `testing`: Unit tests, integration tests, automation
- `ai-ml`: Machine learning, AI integration

### Language-Specific
- `python`: Django, Flask, data science
- `javascript`: Node.js, TypeScript, vanilla JS
- `dotnet`: C#, ASP.NET, Blazor
- `java`: Spring Boot, enterprise Java
- `rust`: Systems programming, WebAssembly
- `go`: Microservices, cloud native

## LLM Workflow Examples

### 1. Analyze Single File

```javascript
// LLM receives file content and needs to generate metadata
const content = `# React Testing Guide
Complete guide for testing React components with Jest and React Testing Library...`;

const filename = 'react-testing-guide.instructions.md';
const githubUrl = 'https://github.com/repo/blob/main/instructions/react-testing-guide.instructions.md';

const analysis = analyzeContentDirect(content, filename, githubUrl);

if (analysis.success) {
  console.log('Suggested metadata:', analysis.metadata);
  console.log('Improvements:', analysis.suggestions);
  console.log('API payload:', analysis.apiPayload);
}
```

### 2. Batch Processing

```javascript
const analyzer = new CatalogResourceAnalyzer({ catalogId: 1 });

const files = [
  { content: '...', filename: 'file1.chatmode.md', url: 'https://...' },
  { content: '...', filename: 'file2.instructions.md', url: 'https://...' }
];

for (const file of files) {
  const result = analyzer.analyzeContent(file.content, file.filename, file.url);
  
  if (result.success) {
    // LLM can review and potentially modify metadata before submission
    console.log(`Analyzed ${file.filename}:`, result.metadata);
    
    // Check for duplicates
    const exists = await analyzer.checkExists(file.url);
    if (!exists) {
      // Submit to catalog
      await analyzer.submitResource(result.apiPayload);
    }
  }
}
```

### 3. Content Improvement Suggestions

```javascript
const analysis = analyzeContentDirect(content, filename, url);

if (analysis.success) {
  // LLM can use suggestions to recommend improvements
  const { suggestions } = analysis;
  
  if (suggestions.title.length > 0) {
    console.log('Title suggestions:', suggestions.title);
  }
  
  if (suggestions.description.length > 0) {
    console.log('Description improvements:', suggestions.description);
  }
  
  if (suggestions.tags.length > 0) {
    console.log('Additional tags to consider:', suggestions.tags);
  }
}
```

## Error Handling

```javascript
const analysis = analyzeContentDirect(content, filename, url);

if (!analysis.success) {
  console.error('Analysis failed:', analysis.error);
  // Common errors:
  // - "Filename does not match a recognized resource type"
  // - File reading errors
  // - Invalid content format
}
```

## Configuration Options

```javascript
const config = {
  catalogId: 1,                    // Target catalog ID
  serverUrl: 'http://localhost:3000', // ContextShare server
  apiKey: 'your-api-key',         // API authentication
  logLevel: 'info'                // Logging verbosity
};

const analyzer = new CatalogResourceAnalyzer(config);
```

## Integration with ContextShare API

The generated `apiPayload` is ready for direct submission to ContextShare:

```javascript
// The apiPayload follows the ContextShare schema:
{
  "catalogId": 1,
  "type": "chatmodes",
  "filename": "react-expert.chatmode.md",
  "title": "React Expert",
  "description": "Expert React development assistant...",
  "category": "web-development",
  "tags": "react,typescript,expert,frontend",
  "contentUrl": "https://github.com/repo/blob/main/chatmodes/react-expert.chatmode.md",
  "resourceType": "url",
  "metadata": {
    "source": "resource-processor",
    "processedAt": "2025-09-18T23:21:18.597Z",
    "version": "1.0.0"
  }
}
```

## Best Practices for LLMs

1. **Always analyze content first** before making metadata suggestions
2. **Use the suggestions system** to provide improvement recommendations
3. **Check for duplicates** before submitting resources
4. **Validate URLs** to ensure they point to actual GitHub content
5. **Review metadata quality** - especially titles and descriptions
6. **Consider user context** when suggesting categories and tags
7. **Handle errors gracefully** and provide meaningful feedback

This processor enables LLMs to efficiently analyze and categorize AI resources for ContextShare catalogs while providing intelligent suggestions for metadata improvement.