import type { Application } from 'express';
import express from 'express';
import path from 'path';
import { existsSync } from 'fs';
import { logger } from './logging/logger';

/**
 * Mounts the static Next.js admin UI export.
 * The Next.js app is built with output: 'export' which generates static HTML/CSS/JS files.
 * These files are served directly by Express without needing a separate Node.js process.
 */
export async function mountAdminUi(app: Application): Promise<void> {
  const adminUiPath = path.join(process.cwd(), 'admin-ui');
  
  if (!existsSync(adminUiPath)) {
    logger.warn({ 
      event: 'admin_ui_not_found', 
      path: adminUiPath,
      msg: 'Admin UI directory not found. Skipping mount.'
    });
    return;
  }
  
  logger.info({ 
    event: 'admin_ui_mounting', 
    path: adminUiPath,
    basePath: '/admin-ui'
  });
  
  // Serve static files from the Next.js export
  app.use('/admin-ui', express.static(adminUiPath, {
    index: 'index.html',
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      // Set proper cache headers for static assets
      if (filePath.includes('/_next/static/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));
  
  // Handle Next.js client-side routing - serve index.html for non-file requests
  app.get('/admin-ui/*', (req, res, next) => {
    const indexPath = path.join(adminUiPath, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
  
  logger.info({ 
    event: 'admin_ui_mounted', 
    path: adminUiPath,
    basePath: '/admin-ui'
  });
}