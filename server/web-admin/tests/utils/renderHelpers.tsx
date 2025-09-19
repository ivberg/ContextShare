import React from 'react';
import { render } from '@testing-library/react';

interface ApiOverrides {
  catalogs?: any[];
  healthOk?: boolean;
}

export function renderWithApis<T>(ui: React.ReactElement, { catalogs = [], healthOk = true }: ApiOverrides = {}) {
  jest.doMock('@/lib/api', () => ({
    catalogApi: { list: jest.fn().mockResolvedValue(catalogs) },
    healthApi: { check: healthOk ? jest.fn().mockResolvedValue({ status: 'ok' }) : jest.fn().mockRejectedValue({ error: 'fail' }) }
  }));
  return render(ui);
}

export function mockPathname(path: string) {
  jest.doMock('next/navigation', () => ({ usePathname: () => path }));
}
