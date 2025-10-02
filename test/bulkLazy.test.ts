// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { ResourceService } from '../src/services/resourceService';
import { MockFileService } from './fileService.mock';
import { createTestPaths } from './testUtils';
import { Repository, ResourceCategory } from '../src/models';

suite('Bulk Lazy Loading Tests', () => {
  
  test('should create lazy placeholders from bulk export and fetch on demand', async () => {
    const testPaths = createTestPaths('bulk-lazy-test');
    const fileService = new MockFileService({});
    
    // Track network calls
    const fetchCalls: string[] = [];
    const originalFetch = global.fetch;
    
    try {
      // Mock fetch to simulate bulk export endpoint
      global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        fetchCalls.push(url);
        
        if (url.includes('/catalog/catalog-export')) {
          // Return mock bulk export response
          return {
            ok: true,
            status: 200,
            json: async () => ({
              generated_at: new Date().toISOString(),
              catalogs: [{
                name: 'test-catalog',
                display_name: 'Test Catalog',
                description: 'Test catalog for lazy loading',
                source_type: 'remote',
                source_url: 'https://example.com/catalog/',
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
            })
          } as Response;
        } else if (url.includes('test.chatmode.md')) {
          // Return individual file content
          return {
            ok: true,
            status: 200,
            text: async () => '# Test Chat Mode\n\nThis is test content for lazy loading.'
          } as Response;
        } else if (url.includes('test.instructions.md')) {
          // Return individual file content
          return {
            ok: true,
            status: 200,
            text: async () => '# Test Instructions\n\nThese are test instructions for lazy loading.'
          } as Response;
        }
        
        throw new Error(`Unexpected fetch to: ${url}`);
      };
      
      const resourceService = new ResourceService(fileService);
      const repository: Repository = {
        id: 'test-repo',
        name: 'test-repo',
        rootPath: testPaths.repoRoot,
        catalogPath: testPaths.catalogPath,
        runtimePath: testPaths.runtimePath,
        isActive: true
      };
      
      // Enable lazy fetch and set remote overrides
      (resourceService as any).enableLazyRemote = true;
      resourceService.setSourceOverrides({
        [ResourceCategory.CHATMODES]: 'https://example.com/catalog/chatmodes/',
        [ResourceCategory.INSTRUCTIONS]: 'https://example.com/catalog/instructions/'
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
      assert.ok(lazyResource.lazy, 'Expected resource to be marked as lazy');
      assert.ok(lazyResource.remoteUrl, 'Expected lazy resource to have remoteUrl');
      
      // Test on-demand fetch functionality
      fetchCalls.length = 0; // Clear previous fetch calls
      
      // Simulate opening a lazy resource
      await (resourceService as any).ensureRemoteContent(lazyResource);
      
      // Should have made individual file call now
      const onDemandCalls = fetchCalls.filter(url => url.includes('test.chatmode.md'));
      assert.ok(onDemandCalls.length > 0, 'Expected on-demand fetch call for individual file');
      
      // Resource should now have content and not be lazy
      assert.ok(!lazyResource.lazy, 'Expected resource to no longer be lazy after fetch');
      
    } finally {
      // Restore original fetch
      global.fetch = originalFetch;
    }
  });
});

export { };