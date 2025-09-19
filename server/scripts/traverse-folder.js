#!/usr/bin/env node

/**
 * Traverse Folder Script - Extract content from external repositories
 * 
 * Discovers all resource files (.chatmode.md, .instructions.md, etc.)
 * Extracts content to temporary files for LLM analysis
 * Generates a summary JSON with file information
 * Preserves original file structure and metadata
 */

const fs = require('fs');
const path = require('path');

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
                        const stats = fs.statSync(fullPath);
                        discovered.push({
                            filePath: fullPath,
                            filename: entry.name,
                            type: RESOURCE_EXTENSIONS[ext],
                            relativePath: path.relative(rootPath, fullPath),
                            size: stats.size,
                            modified: stats.mtime.toISOString(),
                            index: discovered.length + 1
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
 * Extract content from files to temporary directory
 * @param {Array} discoveredFiles - Files to extract
 * @param {string} outputDir - Output directory for extracted files
 * @returns {Object} Extraction results
 */
function extractContent(discoveredFiles, outputDir) {
    const logger = new Logger();
    const extracted = [];
    const failed = [];
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        logger.info(`Created output directory: ${outputDir}`);
    }
    
    for (const file of discoveredFiles) {
        try {
            // Read original file content
            const content = fs.readFileSync(file.filePath, 'utf8');
            
            // Generate temp filename with index prefix
            const tempFilename = `${file.index}-${file.filename}`;
            const tempPath = path.join(outputDir, tempFilename);
            
            // Write content to temp file
            fs.writeFileSync(tempPath, content, 'utf8');
            
            const extractedFile = {
                ...file,
                tempPath,
                tempFilename,
                contentLength: content.length,
                extracted: true
            };
            
            extracted.push(extractedFile);
            logger.debug(`Extracted: ${file.filename} → ${tempFilename}`);
            
        } catch (error) {
            logger.error(`Failed to extract ${file.filename}: ${error.message}`);
            failed.push({
                ...file,
                error: error.message,
                extracted: false
            });
        }
    }
    
    logger.success(`Successfully extracted ${extracted.length} files`);
    if (failed.length > 0) {
        logger.warn(`Failed to extract ${failed.length} files`);
    }
    
    return {
        extracted,
        failed,
        summary: {
            total: discoveredFiles.length,
            successful: extracted.length,
            failed: failed.length
        }
    };
}

/**
 * Generate summary JSON file
 * @param {Object} extractionResults - Results from extraction
 * @param {string} outputDir - Output directory
 * @param {string} sourceFolder - Original source folder
 */
function generateSummary(extractionResults, outputDir, sourceFolder) {
    const logger = new Logger();
    
    const summary = {
        metadata: {
            sourceFolder: path.resolve(sourceFolder),
            outputDirectory: path.resolve(outputDir),
            processedAt: new Date().toISOString(),
            version: '1.0.0'
        },
        summary: extractionResults.summary,
        files: extractionResults.extracted,
        errors: extractionResults.failed
    };
    
    const summaryPath = path.join(outputDir, 'extraction-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
    
    logger.success(`Summary written to: ${summaryPath}`);
    return summaryPath;
}

/**
 * Main traverse function
 * @param {string} folderPath - Path to folder to traverse
 * @param {string} outputDir - Output directory for extracted files
 * @returns {Promise<Object>} Traversal results
 */
async function traverseFolder(folderPath, outputDir = './temp-analysis') {
    const logger = new Logger();
    
    logger.info(`🚀 Traverse Folder Script v1.0.0`);
    logger.info(`📁 Source: ${folderPath}`);
    logger.info(`📂 Output: ${outputDir}`);
    
    // Validate source folder exists
    if (!fs.existsSync(folderPath)) {
        const error = `Source folder does not exist: ${folderPath}`;
        logger.error(error);
        return { success: false, error };
    }
    
    try {
        // Step 1: Discover resource files
        logger.info(`🔍 Discovering resource files...`);
        const discoveredFiles = discoverResourceFiles(folderPath);
        
        if (discoveredFiles.length === 0) {
            logger.warn(`No resource files found in ${folderPath}`);
            return { 
                success: false, 
                message: 'No resource files found',
                discovered: []
            };
        }
        
        // Group by type for reporting
        const byType = discoveredFiles.reduce((acc, file) => {
            acc[file.type] = (acc[file.type] || 0) + 1;
            return acc;
        }, {});
        
        logger.info(`📊 Found ${discoveredFiles.length} files:`, byType);
        
        // Step 2: Extract content to temp files
        logger.info(`📄 Extracting content...`);
        const extractionResults = extractContent(discoveredFiles, outputDir);
        
        // Step 3: Generate summary
        logger.info(`📋 Generating summary...`);
        const summaryPath = generateSummary(extractionResults, outputDir, folderPath);
        
        // Step 4: Display next steps
        logger.info('\n' + '='.repeat(60));
        logger.info('📋 EXTRACTION COMPLETE');
        logger.info('='.repeat(60));
        logger.success(`✅ Successfully extracted: ${extractionResults.summary.successful}`);
        if (extractionResults.summary.failed > 0) {
            logger.warn(`⚠️  Failed: ${extractionResults.summary.failed}`);
        }
        logger.info(`📁 Files available in: ${path.resolve(outputDir)}`);
        logger.info(`📄 Summary: ${summaryPath}`);
        
        logger.info('\n🔄 Next Steps:');
        logger.info('1. Review extracted files in temp directory');
        logger.info('2. Process files one at a time with process-single.js:');
        
        // Show examples for first few files
        const examples = extractionResults.extracted.slice(0, 3);
        for (const file of examples) {
            logger.info(`   node scripts/process-single.js "${file.tempPath}" --dry-run`);
        }
        
        if (extractionResults.extracted.length > 3) {
            logger.info(`   ... and ${extractionResults.extracted.length - 3} more files`);
        }
        
        return {
            success: true,
            discovered: discoveredFiles,
            extracted: extractionResults.extracted,
            failed: extractionResults.failed,
            summary: extractionResults.summary,
            summaryPath,
            outputDir: path.resolve(outputDir)
        };
        
    } catch (error) {
        logger.error(`Unexpected error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Export for module use
module.exports = {
    traverseFolder,
    discoverResourceFiles,
    extractContent,
    generateSummary
};

// CLI usage when run directly
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
Traverse Folder Script for ContextShare
=======================================

Extracts content from external repository folders for LLM analysis.

Usage: node traverse-folder.js <folder-path> [output-directory]

Arguments:
  folder-path         Path to folder containing resource files
  output-directory    Output directory for extracted files (default: ./temp-analysis)

Examples:
  # Basic usage
  node traverse-folder.js "s:\\src\\awesome-copilot\\chatmodes"
  
  # Custom output directory  
  node traverse-folder.js "s:\\src\\awesome-copilot\\chatmodes" "./my-analysis"
  
  # Process all resource types
  node traverse-folder.js "s:\\src\\awesome-copilot"

Output:
  - Temporary files with extracted content (indexed for easy reference)
  - Summary JSON with file metadata
  - Ready for LLM analysis with process-single.js

Supported File Types:
  - .chatmode.md     (AI assistant conversation modes)
  - .instructions.md (Coding guidelines and best practices)  
  - .instruction.md  (Legacy instruction files)
  - .prompt.md       (Reusable AI prompts)
  - .task.json       (Automation task definitions)
  - .mcp.json        (Model Context Protocol servers)
        `);
        process.exit(1);
    }
    
    const folderPath = args[0];
    const outputDir = args[1] || './temp-analysis';
    
    // Run the traversal
    traverseFolder(folderPath, outputDir)
        .then(result => {
            if (result.success) {
                process.exit(0);
            } else {
                console.error(`❌ Traversal failed: ${result.error || result.message}`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`❌ Unexpected error: ${error.message}`);
            process.exit(1);
        });
}