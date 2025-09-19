import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  healthApi: { check: jest.fn().mockRejectedValue({ error: 'fail' }) }
}));
import HealthPage from '@/app/health/page';

jest.mock('next/navigation', () => ({ usePathname: () => '/health' }));

describe('HealthPage (error)', () => {
  it('shows unhealthy status and alert', async () => {
    render(<HealthPage />);
    await waitFor(() => {
      expect(screen.getByText(/Server is Unhealthy/i)).toBeInTheDocument();
    });
    const failMatches = screen.getAllByText(/fail/i);
    expect(failMatches.length).toBeGreaterThan(0);
    expect(screen.getByText(/DOWN/)).toBeInTheDocument();
  });
});
