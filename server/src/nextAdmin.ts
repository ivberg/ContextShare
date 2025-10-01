import type { Application } from 'express';
import path from 'path';
import { logger } from './logging/logger';

// Mount Next.js admin UI under /admin-ui (basePath handled in next.config)
export async function mountAdminUi(app: Application): Promise<void> {
  // Dynamic import to avoid build-time dependency when admin UI not bundled
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const next = require('next');
  const dir = path.join(__dirname, '..', 'web-admin');
  const nextApp = next({ dev: false, dir });
  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();
  app.all('/admin-ui*', (req, res) => { handle(req, res); });
  logger.info({ event: 'admin_ui_mounted', basePath: '/admin-ui' });
}