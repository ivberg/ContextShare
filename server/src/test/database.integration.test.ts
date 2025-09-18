import assert from 'assert';
import { createDatabaseService, DatabaseService } from '../database/service';
import { SqliteCatalogProvider } from '../catalog/sqliteCatalogProvider';
import { MigrationRunner } from '../database/migrationRunner';

describe('Database Integration (Real)', () => {
  let dbService: DatabaseService;
  let catalogProvider: SqliteCatalogProvider;

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
  });

  afterEach(async () => {
    if (dbService) {
      await dbService.close();
    }
  });

  it('should create and retrieve catalogs', async () => {
    const db = dbService.getKysely();
    const _catalog = await db.insertInto('catalogs')
      .values({
        name: 'test-catalog',
        display_name: 'Test Catalog',
        source_type: 'local',
        enabled: 1 // SQLite boolean as integer
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const catalogs = await db.selectFrom('catalogs').selectAll().execute();
    assert.strictEqual(catalogs.length, 1);
    assert.strictEqual(catalogs[0].name, 'test-catalog');
    assert.strictEqual(catalogs[0].display_name, 'Test Catalog');
  });

  it('should create and list resources', async () => {
    const db = dbService.getKysely();
    
    // Create catalog first
    const catalogResult = await db.insertInto('catalogs')
      .values({ 
        name: 'test', 
        display_name: 'Test',
        source_type: 'local', 
        enabled: 1 // SQLite boolean as integer 
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // Create resource
    await catalogProvider.create(
      catalogResult.id,
      'instructions',
      'test.instructions.md',
      '# Test Instruction\n\nContent here'
    );

    // List resources
    const resources = await catalogProvider.list('instructions');
    assert.deepStrictEqual(resources, ['test.instructions.md']);
  });

  it('should read resource content', async () => {
    const db = dbService.getKysely();
    
    // Setup catalog
    const catalogResult = await db.insertInto('catalogs')
      .values({ 
        name: 'test', 
        display_name: 'Test',
        source_type: 'local', 
        enabled: 1 // SQLite boolean as integer 
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // Create resource
    await catalogProvider.create(
      catalogResult.id,
      'instructions',
      'test.instructions.md',
      '# Test Instruction\n\nContent here'
    );

    // Read resource content
    const content = await catalogProvider.read('instructions', 'test.instructions.md');
    assert.strictEqual(content.toString(), '# Test Instruction\n\nContent here');
  });

  it('should update existing resources', async () => {
    const db = dbService.getKysely();
    
    // Setup catalog and resource
    const catalogResult = await db.insertInto('catalogs')
      .values({ 
        name: 'test', 
        display_name: 'Test',
        source_type: 'local', 
        enabled: 1 // SQLite boolean as integer 
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await catalogProvider.create(
      catalogResult.id,
      'instructions',
      'test.instructions.md',
      '# Original Content'
    );

    // Update resource
    await catalogProvider.update(
      catalogResult.id,
      'instructions',
      'test.instructions.md',
      '# Updated Content'
    );

    // Verify update
    const content = await catalogProvider.read('instructions', 'test.instructions.md');
    assert.strictEqual(content.toString(), '# Updated Content');
  });

  it('should delete resources', async () => {
    const db = dbService.getKysely();
    
    // Setup catalog and resource
    const catalogResult = await db.insertInto('catalogs')
      .values({ 
        name: 'test', 
        display_name: 'Test',
        source_type: 'local', 
        enabled: 1 // SQLite boolean as integer 
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await catalogProvider.create(
      catalogResult.id,
      'instructions',
      'test.instructions.md',
      '# Test Content'
    );

    // Verify resource exists
    let resources = await catalogProvider.list('instructions');
    assert.strictEqual(resources.length, 1);

    // Delete resource
    await catalogProvider.delete(catalogResult.id, 'instructions', 'test.instructions.md');

    // Verify resource is gone
    resources = await catalogProvider.list('instructions');
    assert.strictEqual(resources.length, 0);
  });

  it('should handle multiple catalogs and resources', async () => {
    const db = dbService.getKysely();
    
    // Create multiple catalogs
    const catalog1 = await db.insertInto('catalogs')
      .values({ 
        name: 'catalog1', 
        display_name: 'Catalog 1',
        source_type: 'local', 
        enabled: 1 // SQLite boolean as integer 
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const catalog2 = await db.insertInto('catalogs')
      .values({ 
        name: 'catalog2', 
        display_name: 'Catalog 2',
        source_type: 'remote', 
        enabled: 1 // SQLite boolean as integer 
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    // Create resources in different catalogs
    await catalogProvider.create(catalog1.id, 'instructions', 'test1.instructions.md', '# Test 1');
    await catalogProvider.create(catalog2.id, 'instructions', 'test2.instructions.md', '# Test 2');
    await catalogProvider.create(catalog1.id, 'prompts', 'test1.prompt.md', '# Prompt 1');

    // List all resources (should aggregate across catalogs)
    const instructions = await catalogProvider.list('instructions');
    const prompts = await catalogProvider.list('prompts');

    assert.strictEqual(instructions.length, 2);
    assert(instructions.includes('test1.instructions.md'));
    assert(instructions.includes('test2.instructions.md'));
    
    assert.strictEqual(prompts.length, 1);
    assert(prompts.includes('test1.prompt.md'));
  });
});
