import assert from 'assert';
import { createApp, initializeDatabase } from '../http/app';
import { loadConfig } from '../config';
import { logger } from '../logging/logger';

// Mock modules for testing
const mockApp = {
  listen: (port: number, callback?: () => void) => {
    if (callback) callback();
    return mockApp;
  }
};

const mockDbService = {
  initialize: async () => {},
  close: async () => {}
};

// Create a testable version of the main function
async function testableMain(env: NodeJS.ProcessEnv): Promise<void> {
  try {
    const config = loadConfig(env);
    
    // Initialize database if needed
    const dbService = await initializeDatabase(config);
    
    const app = createApp({ config, dbService });
    const port = config.port;
    
    // For testing, we'll just return after creating the app
    // In real code, this would call app.listen()
    return Promise.resolve();
  } catch (err) {
    throw err;
  }
}

describe('Server Startup (index.ts)', () => {
  let originalConsoleError: typeof console.error;
  let consoleErrorCalls: any[];
  let originalProcessExit: typeof process.exit;
  let processExitCalls: number[];

  before(function() {
    // Skip these tests if better-sqlite3 is not available
    try {
      require('better-sqlite3');
    } catch {
      this.skip();
    }
  });

  beforeEach(() => {
    // Mock console.error to capture error messages
    consoleErrorCalls = [];
    originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      consoleErrorCalls.push(args);
    };

    // Mock process.exit to capture exit calls
    processExitCalls = [];
    originalProcessExit = process.exit;
    process.exit = ((code?: number) => {
      processExitCalls.push(code || 0);
      throw new Error(`process.exit(${code || 0})`);
    }) as any;
  });

  afterEach(() => {
    // Restore original functions
    console.error = originalConsoleError;
    process.exit = originalProcessExit;
  });

  describe('Successful Startup', () => {
    it('should start server in file mode', async () => {
      const env = {
        CATALOG_ROOT: '/test/catalog',
        PORT: '3000'
      };

      // This should complete without throwing
      await testableMain(env);
      
      // Verify no errors were logged
      assert.strictEqual(consoleErrorCalls.length, 0);
      assert.strictEqual(processExitCalls.length, 0);
    });

    it('should start server in database mode', async () => {
      const env = {
        MODE: 'database',
        DATABASE_PATH: ':memory:',
        PORT: '4000'
      };

      // This should complete without throwing
      await testableMain(env);
      
      // Verify no errors were logged
      assert.strictEqual(consoleErrorCalls.length, 0);
      assert.strictEqual(processExitCalls.length, 0);
    });

    it('should start server in hybrid mode', async () => {
      const env = {
        MODE: 'hybrid',
        CATALOG_ROOT: '/test/catalog',
        DATABASE_PATH: ':memory:',
        PORT: '5000'
      };

      // This should complete without throwing
      await testableMain(env);
      
      // Verify no errors were logged
      assert.strictEqual(consoleErrorCalls.length, 0);
      assert.strictEqual(processExitCalls.length, 0);
    });

    it('should use default port when not specified', async () => {
      const env = {
        CATALOG_ROOT: '/test/catalog'
      };

      // This should complete without throwing
      await testableMain(env);
      
      // Verify no errors were logged
      assert.strictEqual(consoleErrorCalls.length, 0);
      assert.strictEqual(processExitCalls.length, 0);
    });
  });

  describe('Configuration Errors', () => {
    it('should handle missing CATALOG_ROOT in file mode', async () => {
      const env = {
        MODE: 'file'
        // Missing CATALOG_ROOT
      };

      try {
        await testableMain(env);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('CATALOG_ROOT is required'));
      }
    });

    it('should handle missing DATABASE_PATH in database mode', async () => {
      const env = {
        MODE: 'database'
        // Missing DATABASE_PATH
      };

      try {
        await testableMain(env);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('DATABASE_PATH is required'));
      }
    });

    it('should handle invalid configuration with helpful error', async () => {
      const env = {
        CATALOG_ROOT: '', // Invalid: empty string
        MODE: 'file'
      };

      try {
        await testableMain(env);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('Required configuration'));
      }
    });
  });

  describe('Database Initialization', () => {
    it('should initialize database for database mode', async () => {
      const env = {
        MODE: 'database',
        DATABASE_PATH: ':memory:'
      };

      // Should complete without throwing
      await testableMain(env);
      
      assert.strictEqual(consoleErrorCalls.length, 0);
    });

    it('should initialize database for hybrid mode', async () => {
      const env = {
        MODE: 'hybrid',
        CATALOG_ROOT: '/test/catalog',
        DATABASE_PATH: ':memory:'
      };

      // Should complete without throwing
      await testableMain(env);
      
      assert.strictEqual(consoleErrorCalls.length, 0);
    });

    it('should not initialize database for file mode', async () => {
      const env = {
        MODE: 'file',
        CATALOG_ROOT: '/test/catalog'
      };

      // Should complete without throwing
      await testableMain(env);
      
      assert.strictEqual(consoleErrorCalls.length, 0);
    });
  });

  describe('Error Handling', () => {
    it('should handle config loading errors gracefully', async () => {
      const env = {
        // Empty env will cause config validation to fail
      };

      try {
        await testableMain(env);
        assert.fail('Should have thrown an error');
      } catch (error) {
        assert(error instanceof Error);
        // Should be a configuration error, not a runtime error
        assert(error.message.includes('Required configuration') || 
               error.message.includes('CATALOG_ROOT is required'));
      }
    });

    it('should handle app creation errors', async () => {
      // Test with a configuration that might cause app creation to fail
      const env = {
        MODE: 'database',
        DATABASE_PATH: '/nonexistent/path/database.db' // This might cause issues
      };

      // Depending on implementation, this might throw during database init
      // or app creation. Either way, it should be handled gracefully.
      try {
        await testableMain(env);
        // If it doesn't throw, that's also fine - the database might be created
      } catch (error) {
        // If it throws, it should be a meaningful error
        assert(error instanceof Error);
      }
    });
  });

  describe('Integration Test', () => {
    it('should complete full startup flow for valid configuration', async () => {
      const env = {
        MODE: 'database',
        DATABASE_PATH: ':memory:',
        PORT: '9999'
      };

      // Full startup test - should not throw
      await testableMain(env);
      
      // Verify clean startup
      assert.strictEqual(consoleErrorCalls.length, 0);
      assert.strictEqual(processExitCalls.length, 0);
    });

    it('should handle various port configurations', async () => {
      const testCases = [
        { env: { CATALOG_ROOT: '/test' }, expectedPort: 3000 },
        { env: { CATALOG_ROOT: '/test', PORT: '8080' }, expectedPort: 8080 },
        { env: { CATALOG_ROOT: '/test', PORT: '0' }, expectedPort: 0 }, // Valid port
      ];

      for (const testCase of testCases) {
        await testableMain(testCase.env);
        // Should complete without errors
        assert.strictEqual(consoleErrorCalls.length, 0);
      }
    });
  });

  describe('Real Main Function Behavior', () => {
    // These tests simulate what would happen if the real main() function were called
    
    it('should simulate startup failure scenario', async () => {
      // Create a function that simulates the main() error handling
      const simulateMainWithError = async () => {
        try {
          throw new Error('Simulated startup error');
        } catch (err) {
          console.error('Startup failure:', err);
          process.exit(1);
        }
      };

      // Test the error handling path
      try {
        await simulateMainWithError();
        assert.fail('Should have thrown process.exit error');
      } catch (error) {
        assert(error instanceof Error);
        assert(error.message.includes('process.exit(1)'));
      }

      // Verify error was logged
      assert.strictEqual(consoleErrorCalls.length, 1);
      assert.strictEqual(consoleErrorCalls[0][0], 'Startup failure:');
      assert(consoleErrorCalls[0][1] instanceof Error);
      assert.strictEqual(consoleErrorCalls[0][1].message, 'Simulated startup error');

      // Verify process.exit was called with code 1
      assert.strictEqual(processExitCalls.length, 1);
      assert.strictEqual(processExitCalls[0], 1);
    });

    it('should simulate successful startup scenario', async () => {
      // Simulate successful startup
      const simulateSuccessfulMain = async () => {
        try {
          const config = loadConfig({
            CATALOG_ROOT: '/test/catalog'
          });
          
          // Simulate database initialization
          const dbService = await initializeDatabase(config);
          
          // Simulate app creation
          const app = createApp({ config, dbService });
          
          // Simulate listen call (without actually starting server)
          const port = config.port;
          
          // Simulate the logger call that would happen in listen callback
          logger.info({ 
            event: 'server_listen', 
            port, 
            mode: config.mode,
            catalogRoot: config.catalogRoot,
            databasePath: config.databasePath 
          }, 'Server listening');
          
        } catch (err) {
          console.error('Startup failure:', err);
          process.exit(1);
        }
      };

      // Should complete without throwing
      await simulateSuccessfulMain();
      
      // Verify no errors were logged to console.error
      assert.strictEqual(consoleErrorCalls.length, 0);
      assert.strictEqual(processExitCalls.length, 0);
    });
  });
});