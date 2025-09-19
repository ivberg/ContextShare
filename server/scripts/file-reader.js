#!/usr/bin/env node

/**
 * File Reader for LLM Analysis
 * 
 * Simple script to read file contents from any path and output for LLM processing
 */

const fs = require('fs');
const path = require('path');

function readFileForLLM(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return {
                success: false,
                error: `File does not exist: ${filePath}`
            };
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const filename = path.basename(filePath);
        
        return {
            success: true,
            filePath,
            filename,
            content,
            size: content.length
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

function listFilesInDirectory(dirPath, extension = null) {
    try {
        if (!fs.existsSync(dirPath)) {
            return {
                success: false,
                error: `Directory does not exist: ${dirPath}`
            };
        }

        const files = fs.readdirSync(dirPath);
        let filteredFiles = files;
        
        if (extension) {
            filteredFiles = files.filter(file => file.endsWith(extension));
        }

        const fileInfos = filteredFiles.map(file => {
            const fullPath = path.join(dirPath, file);
            const stats = fs.statSync(fullPath);
            return {
                filename: file,
                fullPath,
                size: stats.size,
                isFile: stats.isFile()
            };
        }).filter(info => info.isFile);

        return {
            success: true,
            directory: dirPath,
            files: fileInfos,
            count: fileInfos.length
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log(`
File Reader for LLM Analysis
============================

Usage:
  node file-reader.js <file-path>              Read a single file
  node file-reader.js <directory> --list       List files in directory
  node file-reader.js <directory> --ext .md    List files with specific extension

Examples:
  node file-reader.js "s:\\src\\awesome-copilot\\chatmodes\\file.chatmode.md"
  node file-reader.js "s:\\src\\awesome-copilot\\chatmodes" --list
  node file-reader.js "s:\\src\\awesome-copilot\\chatmodes" --ext .chatmode.md
        `);
        process.exit(1);
    }

    const targetPath = args[0];
    
    if (args.includes('--list')) {
        const extension = args.includes('--ext') ? args[args.indexOf('--ext') + 1] : null;
        const result = listFilesInDirectory(targetPath, extension);
        
        if (result.success) {
            console.log(`\n📁 Directory: ${result.directory}`);
            console.log(`📊 Found ${result.count} files:\n`);
            
            result.files.forEach((file, index) => {
                console.log(`${index + 1}. ${file.filename}`);
                console.log(`   Path: ${file.fullPath}`);
                console.log(`   Size: ${file.size} bytes\n`);
            });
        } else {
            console.error(`❌ Error: ${result.error}`);
            process.exit(1);
        }
    } else {
        const result = readFileForLLM(targetPath);
        
        if (result.success) {
            console.log(`\n📄 File: ${result.filename}`);
            console.log(`📁 Path: ${result.filePath}`);
            console.log(`📊 Size: ${result.size} bytes`);
            console.log(`\n📝 Content:`);
            console.log('='.repeat(60));
            console.log(result.content);
            console.log('='.repeat(60));
        } else {
            console.error(`❌ Error: ${result.error}`);
            process.exit(1);
        }
    }
}

module.exports = { readFileForLLM, listFilesInDirectory };