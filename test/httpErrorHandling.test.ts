// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as assert from 'assert';
import { createTestRunner } from './testUtils';
import { ResourceService } from '../src/services/resourceService';
import { MockFileService } from './fileService.mock';
import * as http from 'http';

async function run() {
  console.log('Testing HTTP error message improvements...\n');
  
  const testCases = [
    { code: 401, expected: 'Authentication required' },
    { code: 403, expected: 'Access forbidden (VPN required?)' },
    { code: 404, expected: 'Resource not found' },
    { code: 500, expected: 'Server error (HTTP 500)' },
    { code: 502, expected: 'Server error (HTTP 502)' },
    { code: 503, expected: 'Server error (HTTP 503)' }
  ];

  // Create a temporary HTTP server to test error handling
  const server = http.createServer((req, res) => {
    const codeParam = new URL(req.url || '', `http://localhost`).searchParams.get('code');
    const statusCode = codeParam ? parseInt(codeParam, 10) : 500;
    res.writeHead(statusCode);
    res.end();
  });
  
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const port = (server.address() as any).port;
  const baseUrl = `http://localhost:${port}`;
  
  try {
    const mockFileService = new MockFileService({});
    const resourceService = new ResourceService(mockFileService);
    
    // Enable insecure HTTP for dev testing
    resourceService.enableInsecureHttpForDev(true);

    // Test each HTTP error code
    for (const tc of testCases) {
      const testUrl = `${baseUrl}/?code=${tc.code}`;
      try {
        // This should throw an error with the expected message
        await (resourceService as any).fetchRemote(testUrl);
        throw new Error(`Expected fetchRemote to throw for HTTP ${tc.code}`);
      } catch (error: any) {
        const errorMessage = error.message || '';
        assert.strictEqual(
          errorMessage, 
          tc.expected, 
          `HTTP ${tc.code} should return "${tc.expected}" but got "${errorMessage}"`
        );
        console.log(`✅ HTTP ${tc.code} → "${tc.expected}"`);
      }
    }

    console.log('\n🎉 HTTP error message improvements verified!');
    console.log('📋 Key improvements:');
    console.log('  - 401: Suggests authentication needed');
    console.log('  - 403: Suggests VPN may be required');
    console.log('  - 404: Clear "not found" message');
    console.log('  - 5xx: Identifies server errors with specific code');
    
  } finally {
    server.close();
  }
}

createTestRunner('httpErrorHandling', run);

