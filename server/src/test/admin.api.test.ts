import assert from 'assert';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../http/app';
import { createDatabaseService, DatabaseService } from '../database/service';
import { MigrationRunner } from '../database/migrationRunner';

describe('Admin API', () => {
  let app: Application;
  let dbService: DatabaseService;

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
    
    // Run migrations
    const migrationRunner = new MigrationRunner(dbService);
    await migrationRunner.runMigrations();
    
    // Create app with database mode
    app = createApp({ 
      config: { 
        port: 0, 
        mode: 'database', 
        databasePath: ':memory:',
        catalogRoot: '.' 
      },
      dbService 
    });
  });

  afterEach(async () => {
    if (dbService) {
      await dbService.close();
    }
  });

  it('should create catalog via API', async () => {
    const res = await request(app)
      .post('/admin/catalogs')
      .send({
        name: 'api-catalog',
        displayName: 'API Catalog',
        sourceType: 'local'
      });
    
    assert.strictEqual(res.status, 201);
    assert(res.body.id);
    assert.strictEqual(res.body.name, 'api-catalog');
  });

  it('should list catalogs via API', async () => {
    // Create a catalog first
    const createRes = await request(app)
      .post('/admin/catalogs')
      .send({
        name: 'test-catalog',
        displayName: 'Test Catalog',
        sourceType: 'local'
      });
    
    assert.strictEqual(createRes.status, 201);

    // List catalogs
    const listRes = await request(app).get('/admin/catalogs');
    
    assert.strictEqual(listRes.status, 200);
    assert(Array.isArray(listRes.body));
    assert.strictEqual(listRes.body.length, 1);
    assert.strictEqual(listRes.body[0].name, 'test-catalog');
  });

  it('should create resource via API', async () => {
    // Create catalog first
    const catalogRes = await request(app)
      .post('/admin/catalogs')
      .send({
        name: 'test-catalog',
        displayName: 'Test Catalog',
        sourceType: 'local'
      });
    
    const catalogId = catalogRes.body.id;

    // Create resource
    const res = await request(app)
      .post('/admin/resources')
      .send({
        catalogId: catalogId,
        category: 'instructions',
        filename: 'api-test.instructions.md',
        content: '# API Test\n\nContent here'
      });
    
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.filename, 'api-test.instructions.md');
  });

  it('should list resources via public API', async () => {
    // Setup data
    const catalogRes = await request(app)
      .post('/admin/catalogs')
      .send({
        name: 'test-catalog',
        displayName: 'Test Catalog',
        sourceType: 'local'
      });
    
    const catalogId = catalogRes.body.id;

    await request(app)
      .post('/admin/resources')
      .send({
        catalogId: catalogId,
        category: 'instructions',
        filename: 'test1.instructions.md',
        content: '# Test 1'
      });

    await request(app)
      .post('/admin/resources')
      .send({
        catalogId: catalogId,
        category: 'instructions',
        filename: 'test2.instructions.md',
        content: '# Test 2'
      });

    // List resources via public API
    const res = await request(app).get('/catalog/instructions/index.json');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 2);
    assert(res.body.includes('test1.instructions.md'));
    assert(res.body.includes('test2.instructions.md'));
  });

  it('should read resource content via public API', async () => {
    // Setup data
    const catalogRes = await request(app)
      .post('/admin/catalogs')
      .send({
        name: 'test-catalog',
        displayName: 'Test Catalog',
        sourceType: 'local'
      });
    
    const catalogId = catalogRes.body.id;

    await request(app)
      .post('/admin/resources')
      .send({
        catalogId: catalogId,
        category: 'instructions',
        filename: 'read-test.instructions.md',
        content: '# Read Test\n\nThis is test content'
      });

    // Read resource via public API
    const res = await request(app).get('/catalog/instructions/read-test.instructions.md');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.text, '# Read Test\n\nThis is test content');
  });

  it('should update resource via API', async () => {
    // Setup data
    const catalogRes = await request(app)
      .post('/admin/catalogs')
      .send({
        name: 'test-catalog',
        displayName: 'Test Catalog',
        sourceType: 'local'
      });
    
    const catalogId = catalogRes.body.id;

    await request(app)
      .post('/admin/resources')
      .send({
        catalogId: catalogId,
        category: 'instructions',
        filename: 'update-test.instructions.md',
        content: '# Original Content'
      });

    // Update resource
    const updateRes = await request(app)
      .put(`/admin/resources/${catalogId}/instructions/update-test.instructions.md`)
      .send({
        content: '# Updated Content'
      });
    
    assert.strictEqual(updateRes.status, 200);

    // Verify update via public API
    const readRes = await request(app).get('/catalog/instructions/update-test.instructions.md');
    assert.strictEqual(readRes.status, 200);
    assert.strictEqual(readRes.text, '# Updated Content');
  });

  it('should delete resource via API', async () => {
    // Setup data
    const catalogRes = await request(app)
      .post('/admin/catalogs')
      .send({
        name: 'test-catalog',
        displayName: 'Test Catalog',
        sourceType: 'local'
      });
    
    const catalogId = catalogRes.body.id;

    await request(app)
      .post('/admin/resources')
      .send({
        catalogId: catalogId,
        category: 'instructions',
        filename: 'delete-test.instructions.md',
        content: '# Delete Test'
      });

    // Verify resource exists
    let listRes = await request(app).get('/catalog/instructions/index.json');
    assert(listRes.body.includes('delete-test.instructions.md'));

    // Delete resource
    const deleteRes = await request(app)
      .delete(`/admin/resources/${catalogId}/instructions/delete-test.instructions.md`);
    
    assert.strictEqual(deleteRes.status, 200);

    // Verify resource is gone
    listRes = await request(app).get('/catalog/instructions/index.json');
    assert(!listRes.body.includes('delete-test.instructions.md'));
  });

  it('should validate input for resource creation', async () => {
    const res = await request(app)
      .post('/admin/resources')
      .send({
        // Missing required fields
        category: 'instructions'
      });
    
    assert.strictEqual(res.status, 400);
    assert(res.body.error);
    assert(res.body.error.includes('validation'));
  });

  it('should handle not found resources gracefully', async () => {
    const res = await request(app).get('/catalog/instructions/nonexistent.instructions.md');
    assert.strictEqual(res.status, 404);
  });
});