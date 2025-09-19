#!/usr/bin/env node

/**
 * ContextShare Catalog Resource Processor
 * 
 * Production script for processing AI catalog resources from any local repository
 * and inserting them into ContextShare catalogs via the Agent API.
 * 
 * Features:
 * - Auto-discovers resource files (.chatmode.md, .instructions.md, etc.)
 * - Analyzes content and generates proper metadata
 * - Transforms local paths to GitHub URLs
 * - Checks for duplicates in ContextShare database
 * - Manual or automatic approval workflows
 * - Configurable repository mappings
 * - LLM-friendly API for programmatic use
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');
const url = require('url');

/**
 * LLM-friendly API for analyzing individual resources
 * This is the main interface that LLMs should use
 */
class CatalogResourceAnalyzer {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = new Logger(this.config.logLevel);
    }

    /**
     * Analyze a single file and return structured metadata
     * @param {string} filePath - Path to the file to analyze
     * @param {object} repoConfig - Repository configuration (optional, will auto-detect)
     * @returns {Promise<object>} Analysis result with metadata and API payload
     */
    async analyzeFile(filePath, repoConfig = null) {
        try {
            // Auto-detect repo config if not provided
            if (!repoConfig) {
                const repoRoot = this.findRepositoryRoot(filePath);
                repoConfig = detectRepoConfig(repoRoot);
            }

            // Read and analyze file
            const content = fs.readFileSync(filePath, 'utf8');
            const filename = path.basename(filePath);
            const type = this.inferResourceType(filename);
            
            if (!type) {
                return {
                    success: false,
                    error: 'File is not a recognized resource type'
                };
            }

            const contentUrl = transformToGitHubUrl(filePath, repoConfig);
            // Content analysis will be done by LLM, not automated

            return {
                success: true,
                filePath,
                filename,
                type,
                contentUrl,
                metadata,
                apiPayload,
                repoConfig,
                contentPreview: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
                suggestions: this.generateSuggestions(metadata, content)
            };

        } catch (error) {
            return {
                success: false,
                filePath,
                error: error.message
            };
        }
    }

    /**
     * Analyze content directly without file system access
     * @param {string} content - File content
     * @param {string} filename - Filename to determine type
     * @param {string} contentUrl - GitHub URL for the content
     * @returns {object} Analysis result
     */
    analyzeContent(content, filename, contentUrl) {
        try {
            const type = this.inferResourceType(filename);
            
            if (!type) {
                return {
                    success: false,
                    error: 'Filename does not match a recognized resource type'
                };
            }

            // Content analysis will be done by LLM, not automated
            const apiPayload = { needsLLMAnalysis: true, contentUrl };

            return {
                success: true,
                filename,
                type,
                contentUrl,
                metadata,
                apiPayload,
                contentPreview: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
                suggestions: this.generateSuggestions(metadata, content)
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Generate improvement suggestions for metadata
     * @param {object} metadata - Current metadata
     * @param {string} content - File content
     * @returns {object} Suggestions for improving metadata
     */
    generateSuggestions(metadata, content) {
        const suggestions = {
            title: [],
            description: [],
            category: [],
            tags: []
        };

        // Title suggestions
        if (!metadata.title) {
            suggestions.title.push('Consider adding a clear title with # heading');
        } else if (metadata.title.length > 60) {
            suggestions.title.push('Title is quite long, consider shortening for better display');
        }

        // Description suggestions
        if (!metadata.description || metadata.description.length < 50) {
            suggestions.description.push('Add a more detailed description explaining the purpose and usage');
        }

        // Category suggestions based on content analysis
        const contentLower = content.toLowerCase();
        const alternativeCategories = [];
        
        if (contentLower.includes('react') && metadata.category !== 'web-development') {
            alternativeCategories.push('web-development');
        }
        if (contentLower.includes('python') && metadata.category !== 'python') {
            alternativeCategories.push('python');
        }
        if (contentLower.includes('security') && metadata.category !== 'security') {
            alternativeCategories.push('security');
        }

        if (alternativeCategories.length > 0) {
            suggestions.category.push(`Consider these alternative categories: ${alternativeCategories.join(', ')}`);
        }

        // Tags suggestions
        const currentTags = metadata.tags.split(',').map(t => t.trim()).filter(Boolean);
        const suggestedTags = [];

        if (contentLower.includes('tutorial') && !currentTags.includes('tutorial')) {
            suggestedTags.push('tutorial');
        }
        if (contentLower.includes('example') && !currentTags.includes('example')) {
            suggestedTags.push('example');
        }
        if (contentLower.includes('beginner') && !currentTags.includes('beginner')) {
            suggestedTags.push('beginner');
        }

        if (suggestedTags.length > 0) {
            suggestions.tags.push(`Consider adding these tags: ${suggestedTags.join(', ')}`);
        }

        return suggestions;
    }

    /**
     * Find the repository root from a file path
     * @param {string} filePath - Path to a file
     * @returns {string} Repository root path
     */
    findRepositoryRoot(filePath) {
        let currentDir = path.dirname(filePath);
        
        while (currentDir !== path.dirname(currentDir)) {
            if (fs.existsSync(path.join(currentDir, '.git'))) {
                return currentDir;
            }
            currentDir = path.dirname(currentDir);
        }
        
        // Fallback to directory containing the file
        return path.dirname(filePath);
    }

    /**
     * Infer resource type from filename
     * @param {string} filename - Filename
     * @returns {string|null} Resource type or null if not recognized
     */
    inferResourceType(filename) {
        for (const [ext, type] of Object.entries(RESOURCE_EXTENSIONS)) {
            if (filename.endsWith(ext)) {
                return type;
            }
        }
        return null;
    }

    /**
     * Check if a resource already exists in the catalog
     * @param {string} contentUrl - GitHub URL to check
     * @returns {Promise<boolean>} True if exists
     */
    async checkExists(contentUrl) {
        if (!this.config.apiKey) {
            return false;
        }
        return await checkResourceExists(this.config.serverUrl, this.config.apiKey, contentUrl);
    }

    /**
     * Submit a resource to the catalog
     * @param {object} apiPayload - API payload to submit
     * @returns {Promise<object>} Submission result
     */
    async submitResource(apiPayload) {
        if (!this.config.apiKey) {
            throw new Error('API key required for submission');
        }
        return await submitResource(this.config.serverUrl, this.config.apiKey, apiPayload);
    }
}

// Configuration and utilities
const DEFAULT_CONFIG = {
    serverUrl: 'http://localhost:3000',
    apiKey: process.env.CONTEXTSHARE_API_KEY || '',
    catalogId: 1,
    approvalMode: 'manual', // 'manual', 'auto', 'dry-run'
    batchSize: Infinity, // Process all files by default
    logLevel: 'info' // 'debug', 'info', 'warn', 'error'
};

// Resource type mappings
const RESOURCE_EXTENSIONS = {
    '.chatmode.md': 'chatmodes',
    '.instructions.md': 'instructions', 
    '.instruction.md': 'instructions', // legacy support
    '.prompt.md': 'prompts',
    '.task.json': 'tasks',
    '.mcp.json': 'mcp'
};

/**
 * Logger utility
 */
class Logger {
    constructor(level = 'info') {
        this.levels = { debug: 0, info: 1, warn: 2, error: 3 };
        this.level = this.levels[level] || 1;
    }
    
    debug(...args) { if (this.level <= 0) console.log('🔍', ...args); }
    info(...args) { if (this.level <= 1) console.log('ℹ️', ...args); }
    warn(...args) { if (this.level <= 2) console.warn('⚠️', ...args); }
    error(...args) { if (this.level <= 3) console.error('❌', ...args); }
    success(...args) { if (this.level <= 1) console.log('✅', ...args); }
}

/**
 * Auto-detect repository configuration from local path
 * @param {string} localPath - Local repository path
 * @returns {object} Repository configuration
 */
function detectRepoConfig(localPath) {
    const logger = new Logger();
    
    // Try to detect from git remote
    try {
        const { execSync } = require('child_process');
        const gitRemote = execSync('git remote get-url origin', { 
            cwd: localPath, 
            encoding: 'utf8' 
        }).trim();
        
        logger.debug(`Git remote detected: ${gitRemote}`);
        
        // Parse GitHub URL patterns
        let match = gitRemote.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
        if (match) {
            return {
                owner: match[1],
                repo: match[2],
                branch: 'main',
                localRoot: path.resolve(localPath)
            };
        }
    } catch (error) {
        logger.debug(`Git detection failed: ${error.message}`);
    }
    
    // Fallback to path-based detection
    const pathParts = localPath.split(path.sep);
    const repoName = pathParts[pathParts.length - 1];
    
    return {
        owner: 'github', // default assumption
        repo: repoName,
        branch: 'main',
        localRoot: path.resolve(localPath)
    };
}

/**
 * Discover all resource files recursively
 * @param {string} rootPath - Root directory to search
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Array} Array of discovered files with metadata
 */
function discoverResourceFiles(rootPath, maxDepth = 5) {
    const logger = new Logger();
    const discovered = [];
    
    function scanDirectory(dirPath, currentDepth = 0) {
        if (currentDepth > maxDepth) return;
        
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip common non-resource directories
                    if (!entry.name.startsWith('.') && 
                        !['node_modules', 'dist', 'build', 'coverage'].includes(entry.name)) {
                        scanDirectory(fullPath, currentDepth + 1);
                    }
                } else if (entry.isFile()) {
                    // Check if file matches resource patterns
                    const ext = getResourceExtension(entry.name);
                    if (ext && RESOURCE_EXTENSIONS[ext]) {
                        discovered.push({
                            filePath: fullPath,
                            filename: entry.name,
                            type: RESOURCE_EXTENSIONS[ext],
                            relativePath: path.relative(rootPath, fullPath),
                            size: fs.statSync(fullPath).size
                        });
                    }
                }
            }
        } catch (error) {
            logger.warn(`Cannot read directory ${dirPath}: ${error.message}`);
        }
    }
    
    scanDirectory(rootPath);
    logger.info(`Discovered ${discovered.length} resource files`);
    return discovered;
}

/**
 * Get resource extension from filename
 * @param {string} filename - File name
 * @returns {string|null} Extension if it's a resource file
 */
function getResourceExtension(filename) {
    for (const ext of Object.keys(RESOURCE_EXTENSIONS)) {
        if (filename.endsWith(ext)) {
            return ext;
        }
    }
    return null;
}
/**
 * Transform local file path to raw GitHub URL
 * Generates raw.githubusercontent.com URLs for direct content access
 * @param {string} localPath - Local file path
 * @param {object} repoConfig - Repository configuration
 * @returns {string} Raw GitHub URL
 */
function transformToGitHubUrl(localPath, repoConfig) {
    const {
        owner,
        repo, 
        branch = 'main',
        localRoot
    } = repoConfig;

    // Normalize the path separators
    const normalizedLocal = localPath.replace(/\\/g, '/');
    const normalizedRoot = localRoot.replace(/\\/g, '/');
    
    // Extract relative path from local root - ensure we handle the root path correctly
    let relativePath = normalizedLocal.replace(normalizedRoot, '');
    
    // Remove leading slash if present
    relativePath = relativePath.replace(/^\/+/, '');
    
    // Construct raw GitHub URL (not blob URL)
    const githubUrl = `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branch}/${relativePath}`;
    
    return githubUrl;
}

/**
 * Fetch all existing resources from database once for efficient lookup
 * @returns {Promise<Set<string>>} Set of existing filenames and URLs
 */
async function fetchAllExistingResources() {
    try {
        const { execSync } = require('child_process');
        const path = require('path');
        
        console.log(`🔍 Fetching all existing resources from database...`);
        
        // Get all filenames and URLs in one query
        const query = `SELECT filename, content_url FROM resources`;
        
        const result = execSync(
            `npx tsx src/tools/db-query.ts "${query}"`,
            { 
                cwd: path.join(__dirname, '..'),
                encoding: 'utf8',
                stdio: 'pipe'
            }
        );
        
        const existingResources = new Set();
        
        // Parse the output to extract filenames and URLs
        const lines = result.split('\n');
        for (const line of lines) {
            // Look for lines that contain actual data (not headers or separators)
            if (line.includes('│') && !line.includes('(index)') && !line.includes('├─') && !line.includes('└─')) {
                // Extract filename and URL from table format
                const parts = line.split('│').map(part => part.trim()).filter(part => part);
                if (parts.length >= 3) {
                    const filename = parts[1]?.replace(/'/g, ''); // Column 1 is filename
                    const contentUrl = parts[2]?.replace(/'/g, ''); // Column 2 is content_url
                    
                    if (filename && filename !== 'filename') existingResources.add(filename);
                    if (contentUrl && contentUrl !== 'content_url') existingResources.add(contentUrl);
                }
            }
        }
        
        console.log(`📊 Found ${existingResources.size} existing resource identifiers in database`);
        return existingResources;
        
    } catch (error) {
        console.warn(`⚠️ Failed to fetch existing resources:`, error.message);
        return new Set(); // Return empty set if query fails
    }
}

/**
 * Check if a resource exists using pre-fetched lookup table
 * @param {Set<string>} existingResources - Pre-fetched set of existing resources
 * @param {string} contentUrl - The content URL to check
 * @param {string} filename - Filename to check
 * @returns {boolean} True if resource exists
 */
function checkResourceExistsInLookup(existingResources, contentUrl, filename) {
    const exists = existingResources.has(filename) || existingResources.has(contentUrl);
    
    if (exists) {
        console.log(`✅ Resource found: ${filename}`);
    } else {
        console.log(`❌ Resource not found: ${filename}`);
    }
    
    return exists;
}

/**
 * Check if resource already exists in database using direct query (legacy - use lookup table instead)
 * @param {string} contentUrl - GitHub URL to check
 * @param {string} filename - Filename to check
 * @returns {Promise<boolean>} True if resource exists
 */
async function checkResourceExistsInDB(contentUrl, filename) {
    try {
        const { execSync } = require('child_process');
        const path = require('path');
        
        // Simple filename-based check first (most reliable)
        const query = `SELECT filename FROM resources WHERE filename = '${filename}' LIMIT 1`;
        const dbPath = path.join(__dirname, '..', 'catalog.db');
        
        console.log(`🔍 Checking database for: ${filename}`);
        
        // Execute the query
        const result = execSync(
            `npx tsx src/tools/db-query.ts "${query}"`,
            { 
                cwd: path.join(__dirname, '..'),
                encoding: 'utf8',
                stdio: 'pipe'
            }
        );
        
        // Check if result contains the filename (meaning it was found)
        const exists = result.includes(filename);
        
        if (exists) {
            console.log(`✅ Found existing resource: ${filename}`);
        } else {
            console.log(`❌ Resource not found: ${filename}`);
        }
        
        return exists;
        
    } catch (error) {
        // If database check fails, assume doesn't exist to avoid blocking processing
        console.warn(`⚠️ Database check failed for ${filename}: ${error.message}`);
        return false;
    }
}

/**
 * Check if resource already exists in ContextShare
 * @param {string} serverUrl - ContextShare server URL
 * @param {string} apiKey - API key
 * @param {string} contentUrl - GitHub URL to check
 * @returns {Promise<boolean>} True if resource exists
 */
async function checkResourceExists(serverUrl, apiKey, contentUrl) {
    return new Promise((resolve) => {
        const searchUrl = `${serverUrl}/api/resources/search?q=${encodeURIComponent(contentUrl)}`;
        
        const options = {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        };
        
        const req = https.get(searchUrl, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const results = JSON.parse(data);
                    // Check if any result has the same contentUrl
                    const exists = results.some(r => r.contentUrl === contentUrl);
                    resolve(exists);
                } catch (error) {
                    resolve(false); // Assume doesn't exist on error
                }
            });
        });
        
        req.on('error', () => resolve(false));
        req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

/**
 * Submit resource to ContextShare API
 * @param {string} serverUrl - ContextShare server URL
 * @param {string} apiKey - API key
 * @param {object} payload - Resource payload
 * @returns {Promise<object>} API response
 */
async function submitResource(serverUrl, apiKey, payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const urlObj = new url.URL(`${serverUrl}/api/admin/resources`);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        
        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(result);
                    } else {
                        reject(new Error(`API Error ${res.statusCode}: ${result.message || responseData}`));
                    }
                } catch (error) {
                    reject(new Error(`Invalid JSON response: ${responseData}`));
                }
            });
        });
        
        req.on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        
        req.write(data);
        req.end();
    });
}

// Content analysis and metadata generation removed - LLM will handle this

/**
 * Interactive approval workflow
 * @param {object} resourceData - Resource data for approval
 * @returns {Promise<boolean>} True if approved
 */
async function requestApproval(resourceData) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        console.log('\n' + '='.repeat(60));
        console.log(`📄 ${resourceData.filename}`);
        console.log(`🔗 ${resourceData.contentUrl}`);
        console.log(`📝 Title: ${resourceData.metadata.title || 'N/A'}`);
        console.log(`📂 Category: ${resourceData.metadata.category}`);
        console.log(`🏷️  Tags: ${resourceData.metadata.tags}`);
        console.log(`📄 Description: ${resourceData.metadata.description || 'N/A'}`);
        console.log('='.repeat(60));
        
        rl.question('Approve this resource? (y/n/q): ', (answer) => {
            rl.close();
            const response = answer.toLowerCase().trim();
            if (response === 'q') {
                process.exit(0);
            }
            resolve(response === 'y' || response === 'yes');
        });
    });
}

/**
 * Process a single resource file
 * @param {object} fileInfo - File information from discovery
 * @param {object} repoConfig - Repository configuration
 * @param {object} config - Processing configuration
 * @param {Set<string>} existingResources - Pre-fetched lookup table of existing resources
 * @returns {Promise<object>} Processing result
 */
async function processFile(fileInfo, repoConfig, config, existingResources) {
    const logger = new Logger(config.logLevel);
    
    try {
        // Read file content
        const content = fs.readFileSync(fileInfo.filePath, 'utf8');
        
        // Transform path to GitHub URL
        const contentUrl = transformToGitHubUrl(fileInfo.filePath, repoConfig);
        
        // Check if resource already exists using pre-fetched lookup table (much faster!)
        const exists = checkResourceExistsInLookup(existingResources, contentUrl, fileInfo.filename);
        if (exists) {
            logger.info(`⏭️ SKIPPING: ${fileInfo.filename} (already exists in database)`);
            return {
                success: false,
                filePath: fileInfo.filePath,
                reason: 'Resource already exists in catalog',
                skipped: true
            };
        }
        
        // Extract content for LLM analysis instead of automated analysis
        const result = {
            success: true,
            filePath: fileInfo.filePath,
            filename: fileInfo.filename,
            type: fileInfo.type,
            contentUrl,
            content: content,
            contentPreview: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
            needsLLMAnalysis: true
        };
        
        // Save content to temporary file for LLM analysis
        const tempDir = path.join(__dirname, 'temp-analysis');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFile = path.join(tempDir, `${fileInfo.filename}`);
        fs.writeFileSync(tempFile, content, 'utf8');
        
        // No approval or database insertion - LLM will handle this
        result.tempFile = tempFile;
        result.submitted = false;
        result.awaitingLLMAnalysis = true;
        
        logger.info(`📄 Content saved for LLM analysis: ${tempFile}`);
        
        return result;
        
    } catch (error) {
        return {
            success: false,
            filePath: fileInfo.filePath,
            error: error.message
        };
    }
}

/**
 * Main processing function
 * @param {string} repositoryPath - Path to repository root
 * @param {object} options - Processing options
 * @returns {Promise<object>} Processing summary
 */
async function processRepository(repositoryPath, options = {}) {
    const logger = new Logger(options.logLevel || 'info');
    const config = { ...DEFAULT_CONFIG, ...options };
    
    logger.info(`🚀 ContextShare Catalog Resource Processor v1.0.0`);
    logger.info(`📁 Repository: ${repositoryPath}`);
    
    // Detect repository configuration
    const repoConfig = detectRepoConfig(repositoryPath);
    logger.info(`🔍 Detected repo: ${repoConfig.owner}/${repoConfig.repo}`);
    
    // Discover resource files
    logger.info(`🔍 Discovering resource files...`);
    const discoveredFiles = discoverResourceFiles(repositoryPath);
    
    if (discoveredFiles.length === 0) {
        logger.warn(`No resource files found in ${repositoryPath}`);
        return { success: false, message: 'No resource files found' };
    }
    
    // Group by type for better reporting
    const byType = discoveredFiles.reduce((acc, file) => {
        acc[file.type] = (acc[file.type] || 0) + 1;
        return acc;
    }, {});
    
    logger.info(`📊 Found ${discoveredFiles.length} files:`, byType);
    
    // 🚀 OPTIMIZATION: Fetch all existing resources ONCE for efficient lookup
    logger.info(`\n🔍 Fetching existing resources for efficient duplicate detection...`);
    const existingResources = await fetchAllExistingResources();
    
    // Process files in batches - process until we have batchSize new files (excluding skips)
    const results = [];
    const batchSize = config.batchSize;
    let processedCount = 0;
    let currentIndex = 0;
    
    logger.info(`\n📦 Processing batch to get ${batchSize} new files`);
    logger.info(`📊 Total files to scan: ${discoveredFiles.length}`);
    
    // Process files sequentially until we have enough new ones or run out of files
    while (processedCount < batchSize && currentIndex < discoveredFiles.length) {
        const file = discoveredFiles[currentIndex];
        const result = await processFile(file, repoConfig, config, existingResources);
        results.push(result);
        
        // Only count non-skipped files toward our batch size
        if (!result.skipped) {
            processedCount++;
        }
        currentIndex++;
    }
    
    logger.info(`📊 Scanned ${currentIndex} files, processed ${processedCount} new files`);
    logger.info(`📊 Remaining files: ${discoveredFiles.length - currentIndex}`);
    
    // Generate summary
    const successful = results.filter(r => r.success && r.submitted);
    const failed = results.filter(r => !r.success && !r.skipped);
    const skipped = results.filter(r => r.skipped);
    
    logger.info('\n' + '='.repeat(60));
    logger.info('📊 PROCESSING SUMMARY');
    logger.info('='.repeat(60));
    logger.success(`✅ Successfully processed: ${successful.length}`);
    logger.info(`⏭️  Skipped: ${skipped.length}`);
    logger.error(`❌ Failed: ${failed.length}`);
    
    if (failed.length > 0) {
        logger.info('\n🔍 Failed items:');
        failed.forEach(f => {
            logger.error(`  - ${path.basename(f.filePath)}: ${f.error || f.reason}`);
        });
    }
    
    if (skipped.length > 0) {
        logger.info('\n⏭️  Skipped items:');
        skipped.forEach(s => {
            logger.info(`  - ${path.basename(s.filePath)}: ${s.reason}`);
        });
    }
    
    return {
        success: true,
        summary: {
            total: discoveredFiles.length,
            successful: successful.length,
            failed: failed.length,
            skipped: skipped.length
        },
        results,
        repoConfig
    };
}

// Export functions for use as module
module.exports = {
    // Main LLM-friendly class
    CatalogResourceAnalyzer,
    
    // Individual functions for direct use
    transformToGitHubUrl,
    processFile,
    processRepository,
    discoverResourceFiles,
    detectRepoConfig,
    checkResourceExists,
    submitResource,
    
    // Utility functions
    createAnalyzer: (config = {}) => new CatalogResourceAnalyzer(config),
    
    // Quick analysis function for LLMs - saves content for LLM analysis
    quickAnalyze: async (filePath, repoConfig = null) => {
        const analyzer = new CatalogResourceAnalyzer();
        return await analyzer.analyzeFile(filePath, repoConfig);
    }
};

// CLI usage when run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
ContextShare Catalog Resource Processor v1.0.0
===============================================

Automatically discovers and processes AI catalog resources from any local repository
for insertion into ContextShare catalogs.

Usage: node catalog-resource-processor.js <repository-path> [options]

Options:
  --server-url <url>        ContextShare server URL (default: http://localhost:3000)
  --api-key <key>          API key for ContextShare (env: CONTEXTSHARE_API_KEY)
  --catalog-id <id>        Target catalog ID (default: 1)
  --approval-mode <mode>   Approval workflow: manual, auto, dry-run (default: manual)
  --owner <owner>          Override GitHub repository owner
  --repo <repo>            Override GitHub repository name  
  --branch <branch>        Override GitHub branch (default: main)
  --batch-size <size>      Processing batch size (default: all files)
  --log-level <level>      Logging level: debug, info, warn, error (default: info)
  --help                   Show this help

Approval Modes:
  manual    - Prompt for approval of each resource (default)
  auto      - Automatically approve all resources
  dry-run   - Analyze and display but don't submit to API

Examples:
  # Basic usage with manual approval
  node catalog-resource-processor.js "s:\\src\\awesome-copilot"
  
  # Auto-approve with custom catalog
  node catalog-resource-processor.js "C:\\code\\my-repo" --approval-mode auto --catalog-id 2
  
  # Dry-run to see what would be processed
  node catalog-resource-processor.js "~/projects/repo" --approval-mode dry-run
  
  # Custom GitHub mapping
  node catalog-resource-processor.js "C:\\local\\repo" --owner myorg --repo myrepo --branch develop

Environment Variables:
  CONTEXTSHARE_API_KEY     API key for authentication
        `);
        process.exit(1);
    }
    
    const repositoryPath = args[0];
    const options = {};
    
    // Parse command line options
    for (let i = 1; i < args.length; i += 2) {
        const option = args[i];
        const value = args[i + 1];
        
        switch (option) {
            case '--server-url':
                options.serverUrl = value;
                break;
            case '--api-key':
                options.apiKey = value;
                break;
            case '--catalog-id':
                options.catalogId = parseInt(value);
                break;
            case '--approval-mode':
                if (!['manual', 'auto', 'dry-run'].includes(value)) {
                    console.error(`Invalid approval mode: ${value}`);
                    process.exit(1);
                }
                options.approvalMode = value;
                break;
            case '--owner':
                options.owner = value;
                break;
            case '--repo':
                options.repo = value;
                break;
            case '--branch':
                options.branch = value;
                break;
            case '--batch-size':
                options.batchSize = parseInt(value);
                break;
            case '--log-level':
                options.logLevel = value;
                break;
            case '--help':
                // Show help and exit
                args.length = 0;
                break;
            default:
                console.error(`Unknown option: ${option}`);
                process.exit(1);
        }
    }
    
    // Validate repository path
    if (!fs.existsSync(repositoryPath)) {
        console.error(`❌ Repository path does not exist: ${repositoryPath}`);
        process.exit(1);
    }
    
    // Run the processor
    processRepository(repositoryPath, options)
        .then(result => {
            if (result.success) {
                process.exit(0);
            } else {
                console.error(`❌ Processing failed: ${result.message}`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`❌ Unexpected error: ${error.message}`);
            process.exit(1);
        });
}