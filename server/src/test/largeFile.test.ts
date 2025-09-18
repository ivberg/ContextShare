import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { createApp } from '../http/app';

const tempDir = path.join(process.cwd(), 'tmp_large');
const category = 'instructions';

async function setupLargeFile(){
  await fs.mkdir(path.join(tempDir, category), { recursive: true });
  // Create a file slightly over 1MB
  const big = Buffer.alloc(1_000_100, 65); // 'A'
  const p = path.join(tempDir, category, 'oversize.instructions.md');
  await fs.writeFile(p, big);
  return p;
}

const app = createApp({ config: { port:0, catalogRoot: tempDir, mode: 'file' } });

describe('large file handling', () => {
  before(async () => { await setupLargeFile(); });

  it('returns 413 for large file', async () => {
    const res = await request(app).get('/catalog/instructions/oversize.instructions.md');
    assert.strictEqual(res.status, 413);
    assert.deepStrictEqual(res.body, { error: 'file_too_large' });
  });
});
