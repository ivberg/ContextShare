import React from 'react';
import { render, screen } from '@testing-library/react';

let currentPath = '/';
jest.mock('next/navigation', () => ({ usePathname: () => currentPath }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, className }: any) => (
    <a href={href} className={className} data-testid={`nav-${href}`}>{children}</a>
  )
}));

import Navigation from '@/components/layout/Navigation';

describe('Navigation', () => {
  const renderNav = () => render(<Navigation><div>Content</div></Navigation>);

  it('highlights active link (/health)', () => {
    currentPath = '/health';
    renderNav();
    const healthLink = screen.getByTestId('nav-/health');
    expect(healthLink.className).toMatch(/bg-blue-100/);
  });

  it('does not highlight catalogs when on root', () => {
    currentPath = '/';
    renderNav();
    const catalogsLink = screen.getByTestId('nav-/catalogs');
    expect(catalogsLink.className).not.toMatch(/bg-blue-100/);
  });
});
