import assert from 'assert';
import path from 'path';
import fs from 'fs/promises';
import request from 'supertest';
import { createApp } from '../http/app';

const catalogRoot = path.resolve(__dirname, '../../../example-catalog');
const app = createApp({ config: { port: 0, catalogRoot } });

describe('catalog endpoints', () => {
  it('lists index.json for existing category', async () => {
    const res = await request(app).get('/catalog/instructions/index.json');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
  });

  it('returns file content', async () => {
    // pick a file from example-catalog/instructions
    const files = await fs.readdir(path.join(catalogRoot, 'instructions'));
    const candidate = files[0];
    const res = await request(app).get(`/catalog/instructions/${encodeURIComponent(candidate)}`);
    assert.strictEqual(res.status, 200);
    assert.ok(typeof res.text === 'string');
  });

  it('returns 404 for missing file', async () => {
    const res = await request(app).get('/catalog/instructions/does-not-exist.txt');
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: 'not_found' });
  });

  it('returns 404 for invalid category', async () => {
    const res = await request(app).get('/catalog/invalidcat/index.json');
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, { error: 'category_not_found' });
  });

  it('serves cached index on second request', async () => {
    const first = await request(app).get('/catalog/instructions/index.json');
    const second = await request(app).get('/catalog/instructions/index.json');
    assert.strictEqual(first.status, 200);
    assert.strictEqual(second.status, 200);
    // basic equality check
    assert.deepStrictEqual(second.body, first.body);
  });
});
