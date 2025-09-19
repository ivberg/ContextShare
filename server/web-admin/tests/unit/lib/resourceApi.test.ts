// Inline axios interceptor-aware mock mirroring api.test pattern to ensure error normalization is exercised.
let responseSuccess: any = (r: any) => r;
let responseError: any = (e: any) => Promise.reject(e);

const get = jest.fn();
const post = jest.fn();
const put = jest.fn();
const del = jest.fn();

function applyInterceptors(p: Promise<any>) {
  return p.then((r) => responseSuccess(r), (e) => responseError(e));
}

jest.mock('axios', () => {
  const interceptors = {
    response: {
      use: (onSuccess: any, onError: any) => {
        if (onSuccess) responseSuccess = onSuccess;
        if (onError) responseError = onError;
      }
    }
  };
  const instance = { get, post, put, delete: del, interceptors };
  return {
    __esModule: true,
    default: { create: () => instance },
    create: () => instance,
  };
});

import { resourceApi } from '@/lib/api';

// Helper wrappers that pass through interceptor chain
const resolved = <T,>(data: T) => applyInterceptors(Promise.resolve({ data }));
const rejected = (data: any) => applyInterceptors(Promise.reject({ response: { data } }));
const networkError = (msg: string) => applyInterceptors(Promise.reject(new Error(msg)));

beforeEach(() => {
  get.mockReset(); post.mockReset(); put.mockReset(); del.mockReset();
});

describe('resourceApi.create', () => {
  it('returns created resource', async () => {
    const resource = { id: 10, catalog_id: 1, type: 'prompts', filename: 'file.prompt.md', content: 'hi', content_type: 'text/markdown', resource_type: 'content', enabled: 1, created_at: '', updated_at: '' };
    post.mockImplementationOnce(() => resolved(resource));
    const result = await resourceApi.create({ catalogId: 1, type: 'prompts', filename: 'file.prompt.md', resourceType: 'content', content: 'hi' });
    expect(result.id).toBe(10);
    expect(post).toHaveBeenCalledWith('/admin/resources', { catalogId: 1, type: 'prompts', filename: 'file.prompt.md', resourceType: 'content', content: 'hi' });
  });

  it('throws ApiError from server', async () => {
    post.mockImplementationOnce(() => rejected({ error: 'invalid', details: ['bad'] }));
    await expect(resourceApi.create({ catalogId: 1, type: 'prompts', filename: 'f', resourceType: 'content' })).rejects.toMatchObject({ error: 'invalid' });
  });

  it('normalizes network error', async () => {
    post.mockImplementationOnce(() => networkError('timeout'));
    await expect(resourceApi.create({ catalogId: 1, type: 'prompts', filename: 'f', resourceType: 'content' })).rejects.toMatchObject({ error: 'network_error' });
  });
});

describe('resourceApi.update', () => {
  it('returns success message', async () => {
    put.mockImplementationOnce(() => resolved({ message: 'updated' }));
    const res = await resourceApi.update(1, 'prompts', 'file.prompt.md', { title: 'T' });
    expect(res.message).toBe('updated');
    expect(put).toHaveBeenCalledWith('/admin/resources/1/prompts/file.prompt.md', { title: 'T' });
  });

  it('propagates ApiError', async () => {
    put.mockImplementationOnce(() => rejected({ error: 'conflict' }));
    await expect(resourceApi.update(1, 'prompts', 'f', {})).rejects.toMatchObject({ error: 'conflict' });
  });
});

describe('resourceApi.delete', () => {
  it('returns success message', async () => {
    del.mockImplementationOnce(() => resolved({ message: 'deleted' }));
    const res = await resourceApi.delete(1, 'prompts', 'f');
    expect(res.message).toBe('deleted');
    expect(del).toHaveBeenCalledWith('/admin/resources/1/prompts/f');
  });

  it('handles ApiError', async () => {
    del.mockImplementationOnce(() => rejected({ error: 'not_found' }));
    await expect(resourceApi.delete(1, 'prompts', 'missing')).rejects.toMatchObject({ error: 'not_found' });
  });
});

describe('resourceApi.getContent', () => {
  it('returns resource content', async () => {
    const payload = { content: 'hello', content_type: 'text/markdown', resource_type: 'content', metadata: null };
    get.mockImplementationOnce(() => resolved(payload));
    const res = await resourceApi.getContent(1, 'prompts', 'f');
    expect(res.content).toBe('hello');
    expect(get).toHaveBeenCalledWith('/admin/resources/1/prompts/f');
  });

  it('throws ApiError payload', async () => {
    get.mockImplementationOnce(() => rejected({ error: 'denied' }));
    await expect(resourceApi.getContent(1, 'prompts', 'f')).rejects.toMatchObject({ error: 'denied' });
  });
});
