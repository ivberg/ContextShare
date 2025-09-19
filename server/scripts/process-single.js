#!/usr/bin/env node

/**
 * Single File Processor - Process one chatmode file at a time
 * 
 * 1. Read file content
 * 2. Check if already exists in DB
 * 3. Generate metadata (call LLM analysis)
 * 4. Insert into DB if approved
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

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
                    const exists = results.some(r => r.contentUrl === contentUrl);
                    resolve(exists);
                } catch (error) {
                    resolve(false);
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

async function submitResource(serverUrl, apiKey, payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const urlObj = new url.URL(`${serverUrl}/api/admin/resources`);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
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

async function processSingleFile(filePath, config = {}) {
    const {
        serverUrl = 'http://localhost:3000',
        apiKey = process.env.CONTEXTSHARE_API_KEY,
        catalogId = 1,
        githubOwner = 'github',
        githubRepo = 'awesome-copilot',
        dryRun = false
    } = config;

    try {
        // Read file
        const content = fs.readFileSync(filePath, 'utf8');
        const filename = path.basename(filePath);
        
        // Generate GitHub URL
        const relativePath = `chatmodes/${filename}`;
        const contentUrl = `https://github.com/${githubOwner}/${githubRepo}/blob/main/${relativePath}`;
        
        console.log(`📄 Processing: ${filename}`);
        console.log(`🔗 GitHub URL: ${contentUrl}`);
        
        // Check if already exists
        if (apiKey && !dryRun) {
            console.log('🔍 Checking if resource already exists...');
            const exists = await checkResourceExists(serverUrl, apiKey, contentUrl);
            if (exists) {
                console.log('⏭️  Resource already exists in catalog - skipping');
                return { success: true, skipped: true, reason: 'Already exists' };
            }
            console.log('✅ Resource not found in catalog - proceeding');
        }
        
        // Display content preview for LLM analysis
        console.log('\n📖 Content Preview (first 500 chars):');
        console.log('='.repeat(60));
        console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
        console.log('='.repeat(60));
        
        // Extract basic info from frontmatter
        let title = filename.replace('.chatmode.md', '');
        let description = '';
        
        const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
            const frontmatter = frontmatterMatch[1];
            const titleMatch = frontmatter.match(/title:\s*['"](.+)['"]/);
            const descMatch = frontmatter.match(/description:\s*['"](.+)['"]/);
            
            if (titleMatch) title = titleMatch[1];
            if (descMatch) description = descMatch[1];
        }
        
        console.log('\n🤖 LLM ANALYSIS NEEDED:');
        console.log('Please analyze this content and provide:');
        console.log('1. Appropriate category from the ContextShare schema');
        console.log('2. Relevant tags (comma-separated)');
        console.log('3. Better title if needed');
        console.log('4. Better description if needed');
        console.log();
        console.log('Current extracted info:');
        console.log(`  Title: ${title}`);
        console.log(`  Description: ${description}`);
        console.log();
        
        if (dryRun) {
            return {
                success: true,
                dryRun: true,
                filename,
                contentUrl,
                currentInfo: { title, description },
                needsLLMAnalysis: true
            };
        }
        
        // For actual processing, we'd need the LLM-generated metadata
        console.log('⏸️  Pausing for LLM analysis...');
        console.log('Call this script with metadata once analysis is complete.');
        
        return {
            success: true,
            paused: true,
            filename,
            contentUrl,
            currentInfo: { title, description }
        };
        
    } catch (error) {
        console.error('❌ Error processing file:', error.message);
        return { success: false, error: error.message };
    }
}

async function insertWithMetadata(metadata, config = {}) {
    const {
        serverUrl = 'http://localhost:3000',
        apiKey = process.env.CONTEXTSHARE_API_KEY,
        dryRun = false
    } = config;

    if (!apiKey && !dryRun) {
        throw new Error('API key required for insertion');
    }

    console.log('📦 Preparing API payload...');
    const payload = {
        catalogId: metadata.catalogId,
        type: metadata.type,
        filename: metadata.filename,
        title: metadata.title,
        description: metadata.description,
        category: metadata.category,
        tags: metadata.tags,
        contentUrl: metadata.contentUrl,
        resourceType: 'url',
        metadata: {
            source: 'single-file-processor',
            processedAt: new Date().toISOString()
        }
    };

    console.log('Generated payload:', JSON.stringify(payload, null, 2));

    if (dryRun) {
        console.log('🔍 Dry run - would submit the above payload');
        return { success: true, dryRun: true, payload };
    }

    try {
        console.log('🚀 Submitting to ContextShare...');
        const response = await submitResource(serverUrl, apiKey, payload);
        console.log('✅ Successfully inserted!', response);
        return { success: true, response, payload };
    } catch (error) {
        console.error('❌ Insertion failed:', error.message);
        return { success: false, error: error.message };
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Single File Processor for ContextShare
=====================================

Usage: 
  node process-single.js <file-path> [options]           # Analyze file
  node process-single.js --insert <metadata-json>        # Insert with metadata

Options:
  --server-url <url>     ContextShare server (default: http://localhost:3000)
  --api-key <key>        API key (or set CONTEXTSHARE_API_KEY)
  --catalog-id <id>      Catalog ID (default: 1)
  --github-owner <owner> GitHub owner (default: github)
  --github-repo <repo>   GitHub repo (default: awesome-copilot)
  --dry-run             Don't actually insert

Examples:
  # Analyze a file
  node process-single.js "temp-analysis/1-4.1-Beast.chatmode.md"
  
  # Insert with LLM-generated metadata
  node process-single.js --insert '{"type":"chatmodes","filename":"4.1-Beast.chatmode.md","title":"...","category":"automation","tags":"autonomous,agent"}'
        `);
        process.exit(1);
    }
    
    const config = {};
    let filePath = null;
    let metadata = null;
    let insertMode = false;
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--insert') {
            insertMode = true;
            metadata = JSON.parse(args[i + 1]);
            i++;
        } else if (arg === '--server-url') {
            config.serverUrl = args[i + 1];
            i++;
        } else if (arg === '--api-key') {
            config.apiKey = args[i + 1];
            i++;
        } else if (arg === '--catalog-id') {
            config.catalogId = parseInt(args[i + 1]);
            i++;
        } else if (arg === '--github-owner') {
            config.githubOwner = args[i + 1];
            i++;
        } else if (arg === '--github-repo') {
            config.githubRepo = args[i + 1];
            i++;
        } else if (arg === '--dry-run') {
            config.dryRun = true;
        } else if (!arg.startsWith('--') && !filePath) {
            filePath = arg;
        }
    }
    
    if (insertMode) {
        insertWithMetadata(metadata, config)
            .then(result => {
                if (!result.success) {
                    process.exit(1);
                }
            })
            .catch(error => {
                console.error('❌ Error:', error.message);
                process.exit(1);
            });
    } else {
        if (!filePath) {
            console.error('❌ File path required');
            process.exit(1);
        }
        
        if (!fs.existsSync(filePath)) {
            console.error('❌ File does not exist:', filePath);
            process.exit(1);
        }
        
        processSingleFile(filePath, config)
            .then(result => {
                if (!result.success) {
                    process.exit(1);
                }
            })
            .catch(error => {
                console.error('❌ Error:', error.message);
                process.exit(1);
            });
    }
}

module.exports = { processSingleFile, insertWithMetadata, checkResourceExists };