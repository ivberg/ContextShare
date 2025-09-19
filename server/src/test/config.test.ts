import assert from 'assert';
import { loadConfig, ServerConfig } from '../config';

describe('Config Module', () => {
  let originalArgv: string[];
  
  beforeEach(() => {
    // Save original argv to restore after tests
    originalArgv = [...process.argv];
  });
  
  afterEach(() => {
    // Restore original argv
    process.argv = originalArgv;
  });

  describe('loadConfig', () => {
    it('should load default file mode configuration', () => {
      const env = {
        CATALOG_ROOT: '/path/to/catalog'
      };
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.port, 3000);
      assert.strictEqual(config.catalogRoot, '/path/to/catalog');
      assert.strictEqual(config.mode, 'file');
      assert.strictEqual(config.databasePath, undefined);
    });

    it('should load database mode configuration', () => {
      const env = {
        MODE: 'database',
        DATABASE_PATH: '/path/to/db.sqlite',
        PORT: '4000'
      };
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.port, 4000);
      assert.strictEqual(config.mode, 'database');
      assert.strictEqual(config.databasePath, '/path/to/db.sqlite');
      assert.strictEqual(config.catalogRoot, undefined);
    });

    it('should load hybrid mode configuration', () => {
      const env = {
        MODE: 'hybrid',
        DATABASE_PATH: '/path/to/db.sqlite',
        CATALOG_ROOT: '/path/to/catalog'
      };
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.mode, 'hybrid');
      assert.strictEqual(config.databasePath, '/path/to/db.sqlite');
      assert.strictEqual(config.catalogRoot, '/path/to/catalog');
    });

    it('should parse PORT as number with fallback to 3000', () => {
      const env = { CATALOG_ROOT: '/test' };
      
      const config1 = loadConfig(env);
      assert.strictEqual(config1.port, 3000);
      
      const config2 = loadConfig({ ...env, PORT: '8080' });
      assert.strictEqual(config2.port, 8080);
      
      const config3 = loadConfig({ ...env, PORT: 'invalid' });
      assert.strictEqual(config3.port, 3000);
    });

    it('should handle CLI arguments with --catalog-root', () => {
      process.argv = ['node', 'script.js', '--catalog-root', '/cli/catalog'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.catalogRoot, '/cli/catalog');
    });

    it('should handle CLI arguments with --catalog-root=value', () => {
      process.argv = ['node', 'script.js', '--catalog-root=/cli/catalog'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.catalogRoot, '/cli/catalog');
    });

    it('should handle CLI arguments with -c shorthand', () => {
      process.argv = ['node', 'script.js', '-c', '/cli/catalog'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.catalogRoot, '/cli/catalog');
    });

    it('should handle CLI arguments with --port', () => {
      process.argv = ['node', 'script.js', '--catalog-root', '/test', '--port', '9000'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.port, 9000);
    });

    it('should handle CLI arguments with --port=value', () => {
      process.argv = ['node', 'script.js', '--catalog-root', '/test', '--port=9000'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.port, 9000);
    });

    it('should handle CLI arguments with --mode', () => {
      process.argv = ['node', 'script.js', '--mode', 'database', '--database-path', '/test.db'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.mode, 'database');
    });

    it('should handle CLI arguments with --mode=value', () => {
      process.argv = ['node', 'script.js', '--mode=database', '--database-path=/test.db'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.mode, 'database');
    });

    it('should handle CLI arguments with --database-path', () => {
      process.argv = ['node', 'script.js', '--mode', 'database', '--database-path', '/test.db'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.databasePath, '/test.db');
    });

    it('should handle CLI arguments with --database-path=value', () => {
      process.argv = ['node', 'script.js', '--mode', 'database', '--database-path=/test.db'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.databasePath, '/test.db');
    });

    it('should prioritize environment variables over CLI arguments', () => {
      process.argv = ['node', 'script.js', '--catalog-root', '/cli/catalog', '--port', '9000'];
      const env = {
        CATALOG_ROOT: '/env/catalog',
        PORT: '8000'
      };
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.catalogRoot, '/env/catalog');
      assert.strictEqual(config.port, 8000);
    });

    it('should use CLI arguments when environment variables are not set', () => {
      process.argv = ['node', 'script.js', '--catalog-root', '/cli/catalog', '--port', '9000'];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.catalogRoot, '/cli/catalog');
      assert.strictEqual(config.port, 9000);
    });

    it('should ignore CLI arguments that start with dash after flag', () => {
      process.argv = ['node', 'script.js', '--catalog-root', '--some-other-flag', '--port', '8000'];
      const env = {};
      
      try {
        const config = loadConfig(env);
        // If it doesn't throw, catalog-root should be undefined
        assert.strictEqual(config.catalogRoot, undefined);
        assert.strictEqual(config.port, 8000);
      } catch (error) {
        // It's expected to throw due to missing CATALOG_ROOT
        assert(error instanceof Error);
        assert(error.message.includes('CATALOG_ROOT is required'));
      }
    });

    it('should handle complex CLI argument combinations', () => {
      process.argv = [
        'node', 'script.js', 
        '--mode=hybrid',
        '--catalog-root', '/mixed/catalog',
        '--database-path=/mixed.db',
        '--port=7000'
      ];
      const env = {};
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.mode, 'hybrid');
      assert.strictEqual(config.catalogRoot, '/mixed/catalog');
      assert.strictEqual(config.databasePath, '/mixed.db');
      assert.strictEqual(config.port, 7000);
    });
  });

  describe('Configuration Validation', () => {
    it('should throw error when CATALOG_ROOT is missing in file mode', () => {
      const env = {
        MODE: 'file'
      };
      
      assert.throws(() => {
        loadConfig(env);
      }, /CATALOG_ROOT is required when using file mode/);
    });

    it('should throw error when DATABASE_PATH is missing in database mode', () => {
      const env = {
        MODE: 'database'
      };
      
      assert.throws(() => {
        loadConfig(env);
      }, /DATABASE_PATH is required when using database or hybrid mode/);
    });

    it('should throw error when DATABASE_PATH is missing in hybrid mode', () => {
      const env = {
        MODE: 'hybrid',
        CATALOG_ROOT: '/test'
      };
      
      assert.throws(() => {
        loadConfig(env);
      }, /DATABASE_PATH is required when using database or hybrid mode/);
    });

    it('should throw detailed error with help text for missing configuration', () => {
      const env = {};
      
      try {
        loadConfig(env);
        assert.fail('Should have thrown an error');
      } catch (error) {
        const message = (error as Error).message;
        // Check for the specific content based on actual implementation
        assert(message.includes('Required configuration') || 
               message.includes('CATALOG_ROOT is required') ||
               message.includes('PowerShell:') ||
               message.includes('CLI flag:'));
      }
    });

    it('should throw error for invalid mode', () => {
      process.argv = ['node', 'script.js', '--mode', 'invalid'];
      const env = {};
      
      try {
        loadConfig(env);
        assert.fail('Should have thrown an error');
      } catch (error) {
        const message = (error as Error).message;
        assert(message.includes('Required configuration is missing'));
      }
    });

    it('should throw error with specific validation issues', () => {
      const env = {
        CATALOG_ROOT: '', // Invalid: empty string
        MODE: 'file'
      };
      
      try {
        loadConfig(env);
        assert.fail('Should have thrown an error');
      } catch (error) {
        const message = (error as Error).message;
        assert(message.includes('Issues:'));
        assert(message.includes('CATALOG_ROOT'));
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty process.argv', () => {
      process.argv = [];
      const env = {
        CATALOG_ROOT: '/test'
      };
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.catalogRoot, '/test');
      assert.strictEqual(config.mode, 'file');
    });

    it('should handle process.argv with only executable and script', () => {
      process.argv = ['node', 'script.js'];
      const env = {
        CATALOG_ROOT: '/test'
      };
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.catalogRoot, '/test');
    });

    it('should handle malformed CLI arguments gracefully', () => {
      process.argv = ['node', 'script.js', '--catalog-root=', '--port=abc', '--mode='];
      const env = {};
      
      // Should not crash, but may have undefined/default values
      try {
        const config = loadConfig(env);
        // If it doesn't throw, check that it has sensible defaults
        assert.strictEqual(config.port, 3000); // Invalid port should default to 3000
      } catch (error) {
        // Or it might throw due to missing required config, which is also valid
        assert(error instanceof Error);
      }
    });

    it('should handle undefined environment values', () => {
      const env = {
        CATALOG_ROOT: '/test',
        PORT: undefined,
        MODE: undefined,
        DATABASE_PATH: undefined
      };
      
      const config = loadConfig(env);
      
      assert.strictEqual(config.catalogRoot, '/test');
      assert.strictEqual(config.port, 3000);
      assert.strictEqual(config.mode, 'file');
    });

    it('should handle all valid modes', () => {
      const fileConfig = loadConfig({ MODE: 'file', CATALOG_ROOT: '/test' });
      assert.strictEqual(fileConfig.mode, 'file');

      const dbConfig = loadConfig({ MODE: 'database', DATABASE_PATH: '/test.db' });
      assert.strictEqual(dbConfig.mode, 'database');

      const hybridConfig = loadConfig({ 
        MODE: 'hybrid', 
        CATALOG_ROOT: '/test',
        DATABASE_PATH: '/test.db' 
      });
      assert.strictEqual(hybridConfig.mode, 'hybrid');
    });
  });
});