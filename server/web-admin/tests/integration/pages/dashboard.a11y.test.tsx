import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

jest.mock('@/lib/api', () => ({
  catalogApi: { list: jest.fn().mockResolvedValue([]) },
  healthApi: { check: jest.fn().mockResolvedValue({ status: 'ok' }) }
}));

import Dashboard from '@/app/page';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('Dashboard accessibility', () => {
  it('has no major a11y violations', async () => {
    const { container } = render(<Dashboard />);
    await waitFor(() => screen.getByText(/ContextShare Admin Dashboard/i));
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
