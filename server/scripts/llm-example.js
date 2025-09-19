#!/usr/bin/env node

/**
 * Example of how an LLM would use the Catalog Resource Processor
 * 
 * This demonstrates the LLM-friendly API for analyzing resources
 * and generating metadata suggestions.
 */

const { CatalogResourceAnalyzer, analyzeContentDirect } = require('../../scripts/catalog-resource-processor.js');

// Example: LLM analyzing a chatmode file
async function llmAnalysisExample() {
    console.log('🤖 LLM Catalog Resource Analysis Example');
    console.log('=========================================\n');

    // Method 1: Direct content analysis (most common for LLM use)
    const sampleContent = `# React TypeScript Expert

This chatmode transforms you into a React TypeScript expert developer who specializes in modern React patterns, performance optimization, and type-safe development.

## Rules
- Focus on React 18+ features and patterns
- Emphasize TypeScript best practices
- Provide performance-optimized solutions
- Use modern hooks and functional components
- Consider accessibility in all suggestions

## Expertise Areas
- Custom hooks and hook composition
- State management with Zustand/Redux Toolkit
- Performance optimization techniques
- Testing with Jest and React Testing Library
- Advanced TypeScript patterns for React
`;

    const filename = 'react-typescript-expert.chatmode.md';
    const contentUrl = 'https://github.com/example/repo/blob/main/chatmodes/react-typescript-expert.chatmode.md';

    console.log('📄 Analyzing content directly...');
    const analysis = analyzeContentDirect(sampleContent, filename, contentUrl, {
        catalogId: 1,
        logLevel: 'info'
    });

    if (analysis.success) {
        console.log('✅ Analysis successful!\n');
        
        console.log('📊 Extracted Metadata:');
        console.log(`  Type: ${analysis.type}`);
        console.log(`  Title: ${analysis.metadata.title}`);
        console.log(`  Category: ${analysis.metadata.category}`);
        console.log(`  Tags: ${analysis.metadata.tags}`);
        console.log(`  Description: ${analysis.metadata.description}\n`);
        
        console.log('💡 AI Suggestions:');
        Object.entries(analysis.suggestions).forEach(([field, suggestions]) => {
            if (suggestions.length > 0) {
                console.log(`  ${field.toUpperCase()}:`);
                suggestions.forEach(suggestion => console.log(`    - ${suggestion}`));
            }
        });
        
        console.log('\n🔗 Generated API Payload:');
        console.log(JSON.stringify(analysis.apiPayload, null, 2));
        
    } else {
        console.log('❌ Analysis failed:', analysis.error);
    }

    // Method 2: Using the analyzer class for more control
    console.log('\n' + '='.repeat(50));
    console.log('🔧 Using CatalogResourceAnalyzer class...\n');
    
    const analyzer = new CatalogResourceAnalyzer({
        catalogId: 2,
        serverUrl: 'http://localhost:3000',
        logLevel: 'debug'
    });

    // Analyze the same content
    const classAnalysis = analyzer.analyzeContent(sampleContent, filename, contentUrl);
    
    if (classAnalysis.success) {
        console.log('✅ Class analysis successful!');
        console.log('📋 Content Preview:');
        console.log(classAnalysis.contentPreview);
        
        // Show how LLM could improve the metadata
        console.log('\n🎯 LLM Recommendations:');
        if (classAnalysis.suggestions.title.length > 0) {
            console.log('Title improvements needed:', classAnalysis.suggestions.title);
        }
        if (classAnalysis.suggestions.tags.length > 0) {
            console.log('Suggested additional tags:', classAnalysis.suggestions.tags);
        }
    }
}

// Example: LLM processing multiple files from a directory
async function batchAnalysisExample() {
    console.log('\n' + '='.repeat(50));
    console.log('📁 Batch Analysis Example');
    console.log('='.repeat(50));

    const analyzer = new CatalogResourceAnalyzer();
    
    // Example files an LLM might encounter
    const exampleFiles = [
        {
            content: '# Python FastAPI Guide\n\nComplete guide to building APIs with FastAPI...',
            filename: 'fastapi-guide.instructions.md',
            url: 'https://github.com/repo/blob/main/instructions/fastapi-guide.instructions.md'
        },
        {
            content: '# Debug React Performance\n\nPrompt for debugging React performance issues...',
            filename: 'debug-react-perf.prompt.md', 
            url: 'https://github.com/repo/blob/main/prompts/debug-react-perf.prompt.md'
        }
    ];

    console.log(`📊 Analyzing ${exampleFiles.length} files...\n`);

    for (const file of exampleFiles) {
        console.log(`🔍 Analyzing: ${file.filename}`);
        const result = analyzer.analyzeContent(file.content, file.filename, file.url);
        
        if (result.success) {
            console.log(`  ✅ Type: ${result.type}, Category: ${result.metadata.category}`);
            console.log(`  🏷️  Tags: ${result.metadata.tags}`);
            
            // Show suggestions count
            const totalSuggestions = Object.values(result.suggestions).reduce((sum, arr) => sum + arr.length, 0);
            if (totalSuggestions > 0) {
                console.log(`  💡 ${totalSuggestions} improvement suggestions available`);
            }
        } else {
            console.log(`  ❌ Failed: ${result.error}`);
        }
        console.log();
    }
}

// Run examples
async function main() {
    try {
        await llmAnalysisExample();
        await batchAnalysisExample();
        
        console.log('\n🎉 Example complete! This shows how an LLM can:');
        console.log('  - Analyze resource content and extract metadata');
        console.log('  - Generate suggestions for improvement');
        console.log('  - Create API-ready payloads for ContextShare');
        console.log('  - Process multiple files efficiently');
        
    } catch (error) {
        console.error('❌ Example failed:', error.message);
    }
}

if (require.main === module) {
    main();
}

module.exports = { llmAnalysisExample, batchAnalysisExample };