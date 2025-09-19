import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  catalogApi: { list: jest.fn().mockResolvedValue([]) },
  healthApi: { check: jest.fn().mockRejectedValue({ error: 'server_down' }) }
}));

import Dashboard from '@/app/page';

jest.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('Dashboard unhealthy server', () => {
  it('shows server unhealthy indicator', async () => {
    render(<Dashboard />);
    await waitFor(() => {
      const status = screen.getByText(/Server is not responding/i);
      expect(status).toBeInTheDocument();
    });
  });
});
