export function mockDashboardApis({ catalogs = [], healthOk = true }: { catalogs?: any[]; healthOk?: boolean }) {
  // Avoid resetting modules (can duplicate React and cause invalid hook errors)
  jest.doMock('@/lib/api', () => ({
    catalogApi: { list: jest.fn().mockResolvedValue(catalogs) },
    healthApi: { check: healthOk ? jest.fn().mockResolvedValue({ status: 'ok' }) : jest.fn().mockRejectedValue({ error: 'fail' }) }
  }));
}
