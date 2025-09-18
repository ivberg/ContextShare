import assert from 'assert';
import { createDatabaseService, DatabaseService } from '../database/service';
import { SqliteCatalogProvider } from '../catalog/sqliteCatalogProvider';
import { MigrationRunner } from '../database/migrationRunner';

describe('Performance Tests', () => {
  let dbService: DatabaseService;
  let catalogProvider: SqliteCatalogProvider;
  let catalogId: number;

  before(function() {
    // Skip these tests if better-sqlite3 is not available
    try {
      require('better-sqlite3');
    } catch {
      this.skip();
    }
  });

  beforeEach(async () => {
    // Create test database in memory
    dbService = createDatabaseService({
      filename: ':memory:'
    });
    await dbService.initialize();
    
    const migrationRunner = new MigrationRunner(dbService);
    await migrationRunner.runMigrations();
    
    catalogProvider = new SqliteCatalogProvider(dbService);

    // Create a catalog for testing
    const db = dbService.getKysely();
    const result = await db.insertInto('catalogs')
      .values({
        name: 'perf-test',
        display_name: 'Performance Test',
        source_type: 'local',
        enabled: 1 // SQLite boolean as integer
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    
    catalogId = result.id;
  });

  afterEach(async () => {
    if (dbService) {
      await dbService.close();
    }
  });

  it('should handle 1000 resources efficiently', async function() {
    // Increase timeout for performance test
    this.timeout(10000);

    const startTime = Date.now();
    
    // Create 1000 resources
    for (let i = 0; i < 1000; i++) {
      await catalogProvider.create(
        catalogId, 
        'instructions', 
        `test-${i}.instructions.md`, 
        `# Test ${i}\n\nThis is test instruction number ${i}`
      );
    }
    
    const createTime = Date.now() - startTime;
    console.log(`Created 1000 resources in ${createTime}ms`);
    assert(createTime < 10000, 'Creation should be under 10 seconds');
    
    // Test listing performance
    const listStart = Date.now();
    const resources = await catalogProvider.list('instructions');
    const listTime = Date.now() - listStart;
    
    console.log(`Listed ${resources.length} resources in ${listTime}ms`);
    assert.strictEqual(resources.length, 1000);
    assert(listTime < 500, 'Listing should be under 500ms');
  });

  it('should handle concurrent reads efficiently', async function() {
    this.timeout(5000);

    // Create test resources
    const numResources = 10;
    for (let i = 0; i < numResources; i++) {
      await catalogProvider.create(
        catalogId, 
        'instructions', 
        `concurrent-test-${i}.instructions.md`, 
        `# Concurrent Test ${i}\n\nContent for concurrent read test ${i}`
      );
    }

    // Perform concurrent reads
    const startTime = Date.now();
    const readPromises = [];
    
    for (let i = 0; i < 100; i++) {
      const resourceIndex = i % numResources;
      const promise = catalogProvider.read('instructions', `concurrent-test-${resourceIndex}.instructions.md`);
      readPromises.push(promise);
    }
    
    const results = await Promise.all(readPromises);
    const totalTime = Date.now() - startTime;
    
    console.log(`Performed 100 concurrent reads in ${totalTime}ms`);
    assert.strictEqual(results.length, 100);
    assert(totalTime < 2000, 'Concurrent reads should complete under 2 seconds');
    
    // Verify content is correct
    results.forEach((content, index) => {
      const resourceIndex = index % numResources;
      const expectedContent = `# Concurrent Test ${resourceIndex}\n\nContent for concurrent read test ${resourceIndex}`;
      assert.strictEqual(content.toString(), expectedContent);
    });
  });

  it('should handle mixed operations efficiently', async function() {
    this.timeout(5000);

    const startTime = Date.now();
    const operations = [];
    
    // Mix of create, read, update, and list operations
    for (let i = 0; i < 50; i++) {
      // Create
      operations.push(
        catalogProvider.create(
          catalogId, 
          'instructions', 
          `mixed-${i}.instructions.md`, 
          `# Mixed Test ${i}\n\nInitial content`
        )
      );
      
      // Read (will fail initially but that's ok)
      if (i > 0) {
        operations.push(
          catalogProvider.read('instructions', `mixed-${i-1}.instructions.md`).catch(() => 'failed')
        );
      }
      
      // List every 10 operations
      if (i % 10 === 0) {
        operations.push(catalogProvider.list('instructions'));
      }
    }
    
    const _results = await Promise.all(operations);
    const totalTime = Date.now() - startTime;
    
    console.log(`Performed ${operations.length} mixed operations in ${totalTime}ms`);
    assert(totalTime < 5000, 'Mixed operations should complete under 5 seconds');
    
    // Verify final state
    const finalList = await catalogProvider.list('instructions');
    assert.strictEqual(finalList.length, 50, 'Should have 50 resources after mixed operations');
  });

  it('should maintain performance with large content', async function() {
    this.timeout(5000);

    // Create large content (approaching file size limit)
    const largeContent = '# Large Content Test\n\n' + 'A'.repeat(500000); // ~500KB
    
    const startTime = Date.now();
    
    // Create resource with large content
    await catalogProvider.create(
      catalogId, 
      'instructions', 
      'large-content.instructions.md', 
      largeContent
    );
    
    const createTime = Date.now() - startTime;
    console.log(`Created large resource in ${createTime}ms`);
    assert(createTime < 1000, 'Large content creation should be under 1 second');
    
    // Read large content
    const readStart = Date.now();
    const readContent = await catalogProvider.read('instructions', 'large-content.instructions.md');
    const readTime = Date.now() - readStart;
    
    console.log(`Read large resource in ${readTime}ms`);
    assert(readTime < 500, 'Large content read should be under 500ms');
    assert.strictEqual(readContent.toString(), largeContent);
  });
});