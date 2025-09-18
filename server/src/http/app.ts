import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '../logging/logger';
import { ServerConfig } from '../config';
import { FileSystemCatalogProvider } from '../catalog/fileSystemCatalogProvider';
import { LruCache } from '../cache/lru';
import { requestId } from './middleware/requestId';
import { authGuard } from './middleware/authGuard';

export function createApp(opts: { config: ServerConfig, provider?: FileSystemCatalogProvider }){
  const { config } = opts;
  const app = express();
  const provider = opts.provider || new FileSystemCatalogProvider(config.catalogRoot);
  const indexCache = new LruCache<string,string[]>({ max: 100, ttlMs: 60_000 });
  const allowedCategories = new Set(['chatmodes','instructions','prompts','tasks','mcp']);

  app.use(requestId());
  app.use(authGuard());

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Minimal index.json & file serving (Phase 0, no auth)
  app.get('/catalog/:category/index.json', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = req.params.category;
      if(!allowedCategories.has(category)) return res.status(404).json({ error: 'category_not_found' });
      const cacheKey = `idx:${category}`;
      const cached = indexCache.get(cacheKey);
      if(cached){
        res.setHeader('Cache-Control', 'no-store');
        return res.json(cached);
      }
      const list = await provider.list(category);
      indexCache.set(cacheKey, list);
      res.setHeader('Cache-Control', 'no-store');
      res.json(list);
    } catch (e){ next(e); }
  });

  app.get('/catalog/:category/:file', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, file } = req.params as any;
      if(!allowedCategories.has(category)) return res.status(404).json({ error: 'category_not_found' });
      const buf = await provider.read(category, file);
      const data = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
      res.setHeader('Content-Type', inferContentType(file));
      res.send(data);
    } catch (e){ next(e); }
  });

  // 404 handler for catalog namespace (only if previous handlers didn't match)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if(req.path.startsWith('/catalog/')){
      return res.status(404).json({ error: 'not_found' });
    }
    next();
  });

  // Basic error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    let code = 'internal';
    let status = 500;
    if(err && typeof err === 'object'){
      if(err.code === 'file_too_large'){ code = 'file_too_large'; status = 413; }
      else if(err.code === 'not_found'){ code = 'not_found'; status = 404; }
    }
    logger.error({ err: String(err?.message || err), code });
    res.status(status).json({ error: code });
  });

  return app;
}

function inferContentType(file: string): string {
  if(file.endsWith('.json')) return 'application/json';
  if(file.endsWith('.md')) return 'text/markdown; charset=utf-8';
  return 'text/plain; charset=utf-8';
}
