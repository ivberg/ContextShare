export function mockIntersectionObserver() {
  class IO {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() { return []; }
  }
  // @ts-ignore
  global.IntersectionObserver = IO as any;
}
