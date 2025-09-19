import React from 'react';
import { render } from '@testing-library/react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('applies size classes', () => {
    const { rerender, container } = render(<LoadingSpinner size="sm" />);
    expect(container.firstChild).toHaveClass('h-4');
    rerender(<LoadingSpinner size="md" />);
    expect(container.firstChild).toHaveClass('h-8');
    rerender(<LoadingSpinner size="lg" />);
    expect(container.firstChild).toHaveClass('h-12');
  });
});
