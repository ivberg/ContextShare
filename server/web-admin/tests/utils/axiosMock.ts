// Shared axios mock & helpers for API unit tests
// Provides interceptor pass-through behavior identical to existing inline mocks

let responseSuccess: any = (r: any) => r;
let responseError: any = (e: any) => Promise.reject(e);

export const get = jest.fn();
export const post = jest.fn();
export const put = jest.fn();
export const del = jest.fn();

function applyInterceptors<T>(p: Promise<T>) {
  return p.then((r: any) => responseSuccess(r), (e) => responseError(e));
}

// Factory registration — each test file that imports this must run the jest.mock below once.
export function mockAxiosModule() {
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
}

export const resolved = <T,>(data: T) => applyInterceptors(Promise.resolve({ data }));
export const rejectedPayload = (data: any) => applyInterceptors(Promise.reject({ response: { data } }));
export const rejectedNetwork = (err: Error) => applyInterceptors(Promise.reject(err));

export function resetAxiosMocks() {
  get.mockReset();
  post.mockReset();
  put.mockReset();
  del.mockReset();
  responseSuccess = (r: any) => r;
  responseError = (e: any) => Promise.reject(e);
}
