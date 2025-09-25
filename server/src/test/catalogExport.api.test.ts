import assert from 'assert';
import request from 'supertest';
import { Application } from 'express';
import { createApp } from '../http/app';
import { createDatabaseService, DatabaseService } from '../database/service';
import { MigrationRunner } from '../database/migrationRunner';

// Tests the new /catalog/catalog-export aggregated endpoint

describe('Catalog Export API', () => {
  let app: Application;
  let dbService: DatabaseService;

  before(function() {
    try { require('better-sqlite3'); } catch { this.skip(); }
  });

  beforeEach(async () => {
    dbService = createDatabaseService({ filename: ':memory:' });
    await dbService.initialize();
    const migrationRunner = new MigrationRunner(dbService);
    await migrationRunner.runMigrations();
    app = createApp({ config: { port: 0, mode: 'database', databasePath: ':memory:', catalogRoot: '.' }, dbService });
  });

  afterEach(async () => { await dbService.close(); });

  async function createCatalog(name: string){
    const res = await request(app).post('/admin/catalogs').send({ name, sourceType: 'local' });
    assert.strictEqual(res.status, 201);
    return res.body.id as number;
  }
  async function createResource(catalogId: number, type: string, filename: string, content: string){
    const res = await request(app).post('/admin/resources').send({ catalogId, type, filename, content, resourceType: 'content' });
    assert.strictEqual(res.status, 201);
  }

  it('returns empty structure when no catalogs', async () => {
    const res = await request(app).get('/catalog/catalog-export');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.catalogs, []);
    assert.strictEqual(res.body.counts.catalogs, 0);
  });

  it('returns catalogs with grouped resources', async () => {
    const catalogId = await createCatalog('grouped');
    await createResource(catalogId, 'instructions', 'one.instructions.md', '# One');
    await createResource(catalogId, 'prompts', 'p1.prompt.md', 'Prompt 1');
    const res = await request(app).get('/catalog/catalog-export');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.catalogs));
    assert.strictEqual(res.body.counts.catalogs, 1);
    assert.strictEqual(res.body.counts.resources, 2);
    const cat = res.body.catalogs[0];
  type RS = { filename: string };
  const instr: RS[] = cat.resources.instructions;
  const prompts: RS[] = cat.resources.prompts;
  assert.ok(instr.some(r => r.filename === 'one.instructions.md'));
  assert.ok(prompts.some(r => r.filename === 'p1.prompt.md'));
  });

  it('inlines small content and flags truncation for large content', async () => {
    const catalogId = await createCatalog('sizes');
    await createResource(catalogId, 'instructions', 'small.instructions.md', 'small content');
    // Create a large string > 50KB
    const large = 'x'.repeat(60 * 1024);
    await createResource(catalogId, 'instructions', 'large.instructions.md', large);
    const res = await request(app).get('/catalog/catalog-export');
    assert.strictEqual(res.status, 200);
    const cat = res.body.catalogs[0];
  interface ExtendedRS { filename: string; content?: string; truncated?: boolean; size?: number }
  const small = (cat.resources.instructions as ExtendedRS[]).find(r => r.filename === 'small.instructions.md');
  const largeRes = (cat.resources.instructions as ExtendedRS[]).find(r => r.filename === 'large.instructions.md');
  assert.ok(small, 'expected small resource present');
  assert.ok(largeRes, 'expected large resource present');
  assert.ok(small && small.content === 'small content');
  assert.ok(largeRes && !largeRes.content); // not inlined
  assert.strictEqual(largeRes?.truncated, true);
  assert.ok((largeRes?.size ?? 0) > 50 * 1024);
  });
});
