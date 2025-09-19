import { http, HttpResponse } from 'msw';
import { catalogs } from '../fixtures/catalogs';

export const handlers = [
  http.get('/api/health', () => HttpResponse.json({ status: 'ok' })),
  http.get('/api/catalogs', () => HttpResponse.json(catalogs))
];
