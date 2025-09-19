import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Alert from '@/components/ui/Alert';

jest.mock('lucide-react', () => ({
  AlertCircle: (p: any) => <svg data-testid="icon-alert" {...p} />,
  CheckCircle: (p: any) => <svg data-testid="icon-check" {...p} />,
  Info: (p: any) => <svg data-testid="icon-info" {...p} />,
  XCircle: (p: any) => <svg data-testid="icon-x" {...p} />,
}));

describe('Alert', () => {
  it('renders title and message', () => {
    render(<Alert type="success" title="Done" message="All good" />);
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.getByTestId('icon-check')).toBeInTheDocument();
  });

  it('handles close click', () => {
    const onClose = jest.fn();
    render(<Alert type="error" message="Failed" onClose={onClose} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalled();
  });
});
