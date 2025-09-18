import assert from 'assert';
import request from 'supertest';
import { createApp } from '../http/app';

const app = createApp({ config: { port: 0, catalogRoot: '../../example-catalog' } });

describe('health endpoint', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/healthz');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { status: 'ok' });
  });
});
