import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  catalogApi: { list: jest.fn().mockResolvedValue([]) },
  healthApi: { check: jest.fn().mockResolvedValue({ status: 'ok' }) }
}));

import Dashboard from '@/app/page';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('Dashboard empty state', () => {
  it('shows empty catalogs prompt', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText(/No catalogs yet/i)).toBeInTheDocument();
    });
  });
});
