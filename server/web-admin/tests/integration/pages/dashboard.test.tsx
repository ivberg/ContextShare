import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from '@/app/page';

// Mock API layer instead of network/MSW for initial test baseline
jest.mock('@/lib/api', () => {
  return {
    catalogApi: {
      list: jest.fn().mockResolvedValue([
        { id: 'cat-1', display_name: 'Main Catalog', resource_count: 5, enabled: true },
        { id: 'cat-2', display_name: 'Legacy Catalog', resource_count: 0, enabled: false }
      ])
    },
    healthApi: {
      check: jest.fn().mockResolvedValue({ status: 'ok' })
    }
  };
});

// Minimal mock for next/link (Jest + jsdom friendly)
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: any) => <a href={href}>{children}</a> }));

// Mock next/navigation usePathname for components that may consume it indirectly
jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

describe('Dashboard page', () => {
  it('renders loading then dashboard stats', async () => {
    render(<Dashboard />);

    expect(screen.getByText(/Loading dashboard/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/ContextShare Admin Dashboard/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Total Catalogs/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // from fixtures
    expect(screen.getByText(/Active Catalogs/i)).toBeInTheDocument();
  });
});
