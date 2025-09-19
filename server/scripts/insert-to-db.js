#!/usr/bin/env node

/**
 * DB Inserter - Takes LLM-generated JSON and inserts into ContextShare
 * 
 * Reads JSON metadata file and submits resources to ContextShare API
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const url = require('url');

async function submitResource(serverUrl, apiKey, payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const urlObj = new url.URL(`${serverUrl}/admin/resources`);
        
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
        
        // Use http or https based on protocol
        const requestModule = urlObj.protocol === 'https:' ? https : http;
        const req = requestModule.request(options, (res) => {
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

async function insertFromJson(jsonFilePath, config = {}) {
    const {
        serverUrl = 'http://localhost:3000',
        apiKey = process.env.CONTEXTSHARE_API_KEY,
        dryRun = false
    } = config;

    if (!apiKey && !dryRun) {
        console.error('❌ API key required. Set CONTEXTSHARE_API_KEY environment variable.');
        process.exit(1);
    }

    try {
        // Read JSON file
        const jsonContent = fs.readFileSync(jsonFilePath, 'utf8');
        const metadata = JSON.parse(jsonContent);

        if (!Array.isArray(metadata.resources)) {
            console.error('❌ JSON must have "resources" array');
            process.exit(1);
        }

        console.log(`📦 Processing ${metadata.resources.length} resources`);
        console.log(`🌐 Server: ${serverUrl}`);
        console.log(`🔒 Dry run: ${dryRun}`);
        console.log();

        const results = [];

        for (let i = 0; i < metadata.resources.length; i++) {
            const resource = metadata.resources[i];
            console.log(`${i + 1}. ${resource.filename}`);

            // Validate required fields
            const required = ['type', 'filename', 'contentUrl', 'catalogId'];
            const missing = required.filter(field => !resource[field]);
            
            if (missing.length > 0) {
                console.log(`   ❌ Missing fields: ${missing.join(', ')}`);
                results.push({ ...resource, success: false, error: `Missing: ${missing.join(', ')}` });
                continue;
            }

            if (dryRun) {
                console.log(`   🔍 Dry run - would submit:`, {
                    type: resource.type,
                    title: resource.title,
                    category: resource.category
                });
                results.push({ ...resource, success: true, dryRun: true });
            } else {
                try {
                    const response = await submitResource(serverUrl, apiKey, resource);
                    console.log(`   ✅ Submitted successfully (ID: ${response.id || 'unknown'})`);
                    results.push({ ...resource, success: true, response });
                } catch (error) {
                    console.log(`   ❌ Failed: ${error.message}`);
                    results.push({ ...resource, success: false, error: error.message });
                }
            }

            // Brief pause between requests
            if (i < metadata.resources.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        // Summary
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;

        console.log(`\n📊 SUMMARY:`);
        console.log(`✅ Successful: ${successful}`);
        console.log(`❌ Failed: ${failed}`);

        if (failed > 0) {
            console.log(`\n❌ Failed items:`);
            results.filter(r => !r.success).forEach(r => {
                console.log(`  - ${r.filename}: ${r.error}`);
            });
        }

        return { successful, failed, results };

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
DB Inserter for ContextShare
============================

Usage: node insert-to-db.js <json-file> [options]

Options:
  --server-url <url>    ContextShare server URL (default: http://localhost:3000)
  --api-key <key>       API key (or set CONTEXTSHARE_API_KEY env var)
  --dry-run            Don't actually submit, just validate

Examples:
  node insert-to-db.js metadata.json
  node insert-to-db.js metadata.json --dry-run
  node insert-to-db.js metadata.json --server-url http://myserver:3000
        `);
        process.exit(1);
    }
    
    const jsonFile = args[0];
    const config = {};
    
    // Parse options
    for (let i = 1; i < args.length; i += 2) {
        const option = args[i];
        const value = args[i + 1];
        
        switch (option) {
            case '--server-url':
                config.serverUrl = value;
                break;
            case '--api-key':
                config.apiKey = value;
                break;
            case '--dry-run':
                config.dryRun = true;
                i--; // No value for this flag
                break;
        }
    }
    
    if (!fs.existsSync(jsonFile)) {
        console.error(`❌ JSON file does not exist: ${jsonFile}`);
        process.exit(1);
    }
    
    insertFromJson(jsonFile, config);
}

module.exports = { insertFromJson, submitResource };