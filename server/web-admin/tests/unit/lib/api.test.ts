// Custom axios mock with functional response interceptors
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

import { catalogApi, healthApi } from '@/lib/api';

// Helper wrappers that pass through interceptor chain
const resolved = <T,>(data: T) => applyInterceptors(Promise.resolve({ data }));
const rejected = (data: any) => applyInterceptors(Promise.reject({ response: { data } }));

describe('catalogApi.list', () => {
  it('returns catalog list on success', async () => {
  get.mockImplementationOnce(() => resolved([
      { id: 1, name: 'one', display_name: 'One', enabled: 1, source_type: 'local', created_at: '', updated_at: '' }
    ]));

    const result = await catalogApi.list();
    expect(result).toHaveLength(1);
    expect(result[0].display_name).toBe('One');
  expect(get).toHaveBeenCalledWith('/admin/catalogs');
  });

  it('throws ApiError from server payload', async () => {
  get.mockImplementationOnce(() => rejected({ error: 'boom', details: ['x'] }));
    await expect(catalogApi.list()).rejects.toMatchObject({ error: 'boom' });
  });
});

describe('healthApi.check', () => {
  it('returns status on success', async () => {
  get.mockImplementationOnce(() => resolved({ status: 'ok' }));
    const res = await healthApi.check();
    expect(res.status).toBe('ok');
  expect(get).toHaveBeenCalledWith('/healthz');
  });

  it('normalizes network error when no response payload', async () => {
    get.mockImplementationOnce(() => applyInterceptors(Promise.reject(new Error('connection lost'))));
    await expect(healthApi.check()).rejects.toMatchObject({ error: 'network_error' });
  });
});
