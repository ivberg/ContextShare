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

            const metadata = analyzeContent(content, filename, type);
            const contentUrl = transformToGitHubUrl(filePath, repoConfig);
            const apiPayload = generateApiPayload(metadata, contentUrl, this.config.catalogId);

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

            const metadata = analyzeContent(content, filename, type);
            const apiPayload = generateApiPayload(metadata, contentUrl, this.config.catalogId);

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
    batchSize: 10,
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
 * Transform local file path to GitHub URL
 * Note: Server automatically transforms repository URLs to raw content URLs for optimal performance.
 * Scripts can provide blob URLs which will be automatically converted.
 * @param {string} localPath - Local file path
 * @param {object} repoConfig - Repository configuration
 * @returns {string} GitHub URL
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
    
    // Extract relative path from local root
    const relativePath = normalizedLocal.replace(normalizedRoot, '').replace(/^\//, '');
    
    // Construct GitHub URL
    const githubUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${relativePath}`;
    
    return githubUrl;
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

/**
 * Analyze resource content and extract metadata
 * @param {string} content - File content
 * @param {string} filename - Original filename
 * @param {string} type - Resource type
 * @returns {object} Extracted metadata
 */
function analyzeContent(content, filename, type) {
    const lines = content.split('\n');
    let title = null;
    let description = null;
    
    // Extract title from first heading
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
        title = titleMatch[1].trim();
    }
    
    // Extract description from content after title
    let descriptionLines = [];
    let inDescription = false;
    let headingCount = 0;
    
    for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip comments and metadata
        if (trimmed.startsWith('<!--') || trimmed.startsWith('```')) {
            continue;
        }
        
        // Track headings
        if (trimmed.startsWith('#')) {
            headingCount++;
            if (headingCount === 1) {
                inDescription = true;
                continue;
            } else {
                break; // Stop at second heading
            }
        }
        
        // Collect description lines
        if (inDescription && trimmed && !trimmed.startsWith('#')) {
            descriptionLines.push(trimmed);
        }
        
        // Stop if we have enough description
        if (descriptionLines.length >= 5) {
            break;
        }
    }
    
    description = descriptionLines.join(' ').substring(0, 300).trim();
    
    // Analyze content for category and tags
    const contentLower = content.toLowerCase();
    let category = getDefaultCategory(type);
    let tags = [type];
    
    // Technology detection
    const techPatterns = {
        'web-development': ['react', 'vue', 'angular', 'frontend', 'javascript', 'typescript', 'html', 'css'],
        'cloud': ['azure', 'aws', 'gcp', 'cloud', 'serverless', 'kubernetes', 'docker'],
        'database': ['sql', 'mongodb', 'postgresql', 'mysql', 'database', 'orm'],
        'mobile': ['ios', 'android', 'react native', 'flutter', 'swift', 'kotlin'],
        'backend': ['api', 'server', 'node.js', 'express', 'microservice'],
        'devops': ['ci/cd', 'pipeline', 'deployment', 'jenkins', 'github actions'],
        'security': ['auth', 'security', 'encryption', 'oauth', 'jwt'],
        'testing': ['test', 'unit test', 'integration', 'jest', 'mocha'],
        'python': ['python', 'django', 'flask', 'pandas', 'numpy'],
        'dotnet': ['c#', '.net', 'asp.net', 'blazor', 'entity framework'],
        'java': ['java', 'spring', 'maven', 'gradle'],
        'rust': ['rust', 'cargo', 'wasm'],
        'go': ['golang', 'go ', 'gin', 'gorilla']
    };
    
    for (const [cat, patterns] of Object.entries(techPatterns)) {
        if (patterns.some(pattern => contentLower.includes(pattern))) {
            category = cat;
            tags.push(...patterns.filter(p => contentLower.includes(p)));
            break;
        }
    }
    
    // Skill level detection
    if (contentLower.includes('beginner') || contentLower.includes('basic') || contentLower.includes('intro')) {
        tags.push('beginner');
    } else if (contentLower.includes('advanced') || contentLower.includes('expert')) {
        tags.push('advanced');
    } else if (contentLower.includes('intermediate')) {
        tags.push('intermediate');
    }
    
    // Purpose detection
    const purposePatterns = {
        'debugging': ['debug', 'troubleshoot', 'error', 'bug'],
        'architecture': ['architecture', 'design', 'pattern'],
        'performance': ['performance', 'optimization', 'speed'],
        'security': ['security', 'auth', 'permission'],
        'automation': ['automation', 'script', 'ci/cd'],
        'documentation': ['documentation', 'doc', 'guide'],
        'tutorial': ['tutorial', 'how-to', 'step-by-step']
    };
    
    for (const [purpose, patterns] of Object.entries(purposePatterns)) {
        if (patterns.some(pattern => contentLower.includes(pattern))) {
            tags.push(purpose);
        }
    }
    
    // Remove duplicates and clean tags
    tags = [...new Set(tags)].filter(tag => tag.length > 1);
    
    return {
        type,
        filename,
        title,
        description: description || null,
        category,
        tags: tags.join(',')
    };
}

/**
 * Get default category for resource type
 * @param {string} type - Resource type
 * @returns {string} Default category
 */
function getDefaultCategory(type) {
    const defaults = {
        'chatmodes': 'ai-ml',
        'instructions': 'architecture',
        'prompts': 'ai-ml',
        'tasks': 'automation',
        'mcp': 'ai-ml'
    };
    return defaults[type] || 'other';
}

/**
 * Generate ContextShare API payload
 * @param {object} metadata - Extracted metadata
 * @param {string} contentUrl - GitHub URL
 * @param {number} catalogId - Target catalog ID
 * @returns {object} API payload
 */
function generateApiPayload(metadata, contentUrl, catalogId) {
    return {
        catalogId,
        type: metadata.type,
        filename: metadata.filename,
        title: metadata.title,
        description: metadata.description,
        category: metadata.category,
        tags: metadata.tags,
        contentUrl,
        resourceType: 'url',
        metadata: {
            source: 'resource-processor',
            processedAt: new Date().toISOString(),
            version: '1.0.0'
        }
    };
}

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
 * @returns {Promise<object>} Processing result
 */
async function processFile(fileInfo, repoConfig, config) {
    const logger = new Logger(config.logLevel);
    
    try {
        // Read file content
        const content = fs.readFileSync(fileInfo.filePath, 'utf8');
        
        // Transform path to GitHub URL
        const contentUrl = transformToGitHubUrl(fileInfo.filePath, repoConfig);
        
        // Check if resource already exists
        if (config.apiKey) {
            const exists = await checkResourceExists(config.serverUrl, config.apiKey, contentUrl);
            if (exists) {
                return {
                    success: false,
                    filePath: fileInfo.filePath,
                    reason: 'Resource already exists in catalog',
                    skipped: true
                };
            }
        }
        
        // Analyze content
        const metadata = analyzeContent(content, fileInfo.filename, fileInfo.type);
        
        // Generate API payload
        const apiPayload = generateApiPayload(metadata, contentUrl, config.catalogId);
        
        const result = {
            success: true,
            filePath: fileInfo.filePath,
            contentUrl,
            metadata,
            apiPayload,
            contentPreview: content.substring(0, 200) + '...'
        };
        
        // Handle approval workflow
        if (config.approvalMode === 'manual') {
            const approved = await requestApproval(result);
            if (!approved) {
                return {
                    success: false,
                    filePath: fileInfo.filePath,
                    reason: 'User rejected',
                    skipped: true
                };
            }
        }
        
        // Submit to API if not dry-run
        if (config.approvalMode !== 'dry-run' && config.apiKey) {
            try {
                const apiResponse = await submitResource(config.serverUrl, config.apiKey, apiPayload);
                result.apiResponse = apiResponse;
                result.submitted = true;
                logger.success(`✅ Submitted: ${fileInfo.filename}`);
            } catch (error) {
                result.success = false;
                result.error = `API submission failed: ${error.message}`;
                logger.error(`❌ API Error for ${fileInfo.filename}: ${error.message}`);
            }
        } else {
            result.submitted = false;
            if (config.approvalMode === 'dry-run') {
                logger.info(`🔍 Dry-run: ${fileInfo.filename} (would be submitted)`);
            }
        }
        
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
    
    // Process files in batches
    const results = [];
    const batchSize = config.batchSize;
    
    for (let i = 0; i < discoveredFiles.length; i += batchSize) {
        const batch = discoveredFiles.slice(i, i + batchSize);
        logger.info(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(discoveredFiles.length/batchSize)}`);
        
        const batchPromises = batch.map(file => processFile(file, repoConfig, config));
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // Brief pause between batches to avoid overwhelming the API
        if (i + batchSize < discoveredFiles.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
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
    analyzeContent,
    generateApiPayload,
    processFile,
    processRepository,
    discoverResourceFiles,
    detectRepoConfig,
    checkResourceExists,
    submitResource,
    
    // Utility functions
    createAnalyzer: (config = {}) => new CatalogResourceAnalyzer(config),
    
    // Quick analysis function for LLMs
    quickAnalyze: async (filePath, repoConfig = null) => {
        const analyzer = new CatalogResourceAnalyzer();
        return await analyzer.analyzeFile(filePath, repoConfig);
    },
    
    // Analyze content without file system access
    analyzeContentDirect: (content, filename, contentUrl, config = {}) => {
        const analyzer = new CatalogResourceAnalyzer(config);
        return analyzer.analyzeContent(content, filename, contentUrl);
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
  --batch-size <size>      Processing batch size (default: 10)
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