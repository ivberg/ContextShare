// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { ResourceService } from '../src/services/resourceService';
import { MockFileService } from './fileService.mock';
import { createTestPaths } from './testUtils';
import { Repository, ResourceCategory } from '../src/models';
import * as http from 'http';

suite('Bulk Lazy Loading Tests', () => {
  
  test('should create lazy placeholders from bulk export and fetch on demand', async function() {
    // Increase timeout for this test since it involves async HTTP
    this.timeout(5000);
    
    const testPaths = createTestPaths('bulk-lazy-test');
    const fileService = new MockFileService({});
    
    // Track network calls
    const fetchCalls: string[] = [];
    
    // Create a real HTTP server to mock responses
    const server = http.createServer((req, res) => {
      const url = req.url || '';
      fetchCalls.push(url);
      
      if (url.includes('/catalog/catalog-export')) {
        // Return mock bulk export response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          generated_at: new Date().toISOString(),
          catalogs: [{
            name: 'test-catalog',
            display_name: 'Test Catalog',
            description: 'Test catalog for lazy loading',
            source_type: 'remote',
            source_url: 'http://localhost/catalog/',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            resources: {
              chatmodes: [{
                filename: 'test.chatmode.md',
                title: 'Test Chat Mode',
                description: 'A test chat mode',
                content_type: 'text/markdown',
                resource_type: 'content',
                size: 1024,
                truncated: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }],
              instructions: [{
                filename: 'test.instructions.md',
                title: 'Test Instructions',
                description: 'Test instructions',
                content_type: 'text/markdown',
                resource_type: 'content',
                size: 2048,
                truncated: true,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }],
              prompts: [],
              tasks: [],
              mcp: []
            }
          }],
          counts: { catalogs: 1, resources: 2 }
        }));
      } else if (url.includes('test.chatmode.md')) {
        res.writeHead(200, { 'Content-Type': 'text/markdown' });
        res.end('# Test Chat Mode\n\nThis is test content for lazy loading.');
      } else if (url.includes('test.instructions.md')) {
        res.writeHead(200, { 'Content-Type': 'text/markdown' });
        res.end('# Test Instructions\n\nThese are test instructions for lazy loading.');
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    // Start the server on a random port
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const port = (server.address() as any).port;
    const baseUrl = `http://localhost:${port}`;
    
    try {
      const resourceService = new ResourceService(fileService);
      resourceService.enableInsecureHttpForDev(true); // Allow HTTP for testing
      
      const repository: Repository = {
        id: 'test-repo',
        name: 'test-repo',
        rootPath: testPaths.repoRoot,
        catalogPath: testPaths.catalogPath,
        runtimePath: testPaths.runtimePath,
        isActive: true
      };
      
      // Enable lazy fetch and set remote overrides
      resourceService.setEnableLazyRemote(true);
      resourceService.setSourceOverrides({
        [ResourceCategory.CHATMODES]: `${baseUrl}/catalog/chatmodes/`,
        [ResourceCategory.INSTRUCTIONS]: `${baseUrl}/catalog/instructions/`
      });
      
      // Test bulk discovery creates lazy placeholders
      const discoveries = await resourceService.discoverResources(repository);
      
      // Should have made bulk export attempt
      const bulkCalls = fetchCalls.filter(url => url.includes('/catalog/catalog-export'));
      assert.ok(bulkCalls.length > 0, 'Expected bulk export call, but none found');
      
      // Should NOT have made individual file calls during discovery
      const individualCalls = fetchCalls.filter(url => 
        url.includes('.chatmode.md') || url.includes('.instructions.md')
      );
      assert.strictEqual(individualCalls.length, 0, `Unexpected individual file calls during discovery: ${individualCalls.join(', ')}`);
      
      // Should have discovered lazy resources
      const chatmodeResources = discoveries.filter(r => r.category === ResourceCategory.CHATMODES);
      const instructionResources = discoveries.filter(r => r.category === ResourceCategory.INSTRUCTIONS);
      
      assert.ok(chatmodeResources.length > 0, 'Expected lazy chatmode resources to be discovered');
      assert.ok(instructionResources.length > 0, 'Expected lazy instruction resources to be discovered');
      
      // Resources should be marked as lazy
      const lazyResource = chatmodeResources[0];
      assert.ok((lazyResource as any).lazy, 'Expected resource to be marked as lazy');
      assert.ok((lazyResource as any).remoteUrl, 'Expected lazy resource to have remoteUrl');
      
      // Test on-demand fetch functionality
      fetchCalls.length = 0; // Clear previous fetch calls
      
      // Simulate opening a lazy resource
      await (resourceService as any).ensureRemoteContent(lazyResource);
      
      // Should have made individual file call now
      const onDemandCalls = fetchCalls.filter(url => url.includes('test.chatmode.md'));
      assert.ok(onDemandCalls.length > 0, 'Expected on-demand fetch call for individual file');
      
      // Resource should now have content and not be lazy
      assert.ok(!(lazyResource as any).lazy, 'Expected resource to no longer be lazy after fetch');
      
    } finally {
      server.close();
    }
  });
});

export { };