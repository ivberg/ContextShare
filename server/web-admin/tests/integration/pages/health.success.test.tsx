import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  healthApi: { check: jest.fn().mockResolvedValue({ status: 'ok' }) }
}));
import HealthPage from '@/app/health/page';

jest.mock('next/navigation', () => ({ usePathname: () => '/health' }));

describe('HealthPage (success)', () => {
  it('shows healthy status after check', async () => {
    render(<HealthPage />);
    expect(screen.getByText(/Performing health check/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Server is Healthy/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/UP/)).toBeInTheDocument();
  });
});
