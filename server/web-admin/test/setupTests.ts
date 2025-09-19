import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { mockIntersectionObserver } from '../tests/utils/intersectionObserverMock';

afterEach(() => cleanup());

// Suppress Next.js link / intersection observer related act() warnings
mockIntersectionObserver();

// Lightweight Monaco mock (avoid heavy editor in tests)
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => null
}));
