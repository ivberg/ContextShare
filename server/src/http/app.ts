import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as _path from 'path';
import * as _fs from 'fs/promises';
import { logger } from '../logging/logger';
import { ServerConfig } from '../config';
import { FileSystemCatalogProvider } from '../catalog/fileSystemCatalogProvider';
import { SqliteCatalogProvider } from '../catalog/sqliteCatalogProvider';
import { CatalogProvider } from '../catalog/types';
import { createDatabaseService, DatabaseService } from '../database/service';
import { MigrationRunner } from '../database/migrationRunner';
import { LruCache } from '../cache/lru';
import { requestId } from './middleware/requestId';
import { authGuard } from './middleware/authGuard';
import { createAdminRoutes } from './routes/admin';

// Factory function to create the appropriate catalog provider
function createProvider(config: ServerConfig, dbService?: DatabaseService): CatalogProvider {
  switch (config.mode) {
    case 'file':
      if (!config.catalogRoot) {
        throw new Error('CATALOG_ROOT is required for file mode');
      }
      return new FileSystemCatalogProvider(config.catalogRoot);
    
    case 'database':
    case 'hybrid':
      if (!config.databasePath) {
        throw new Error('DATABASE_PATH is required for database mode');
      }
      if (!dbService) {
        throw new Error('Database service is required for database mode');
      }
      return new SqliteCatalogProvider(dbService);
    
    default:
      throw new Error(`Unsupported mode: ${config.mode}`);
  }
}

// Helper function to initialize database if needed
export async function initializeDatabase(config: ServerConfig): Promise<DatabaseService | undefined> {
  if (config.mode === 'database' || config.mode === 'hybrid') {
    if (!config.databasePath) {
      throw new Error('DATABASE_PATH is required for database mode');
    }
    
    const dbService = createDatabaseService({ 
      filename: config.databasePath,
      readonly: false 
    });
    
    try {
      await dbService.initialize();
      
      // Run migrations
      const migrationRunner = new MigrationRunner(dbService);
      await migrationRunner.runMigrations();
      
      logger.info({ databasePath: config.databasePath }, 'Database initialized successfully');
      return dbService;
    } catch (error) {
      logger.error({ error: String(error), databasePath: config.databasePath }, 'Failed to initialize database');
      if (config.mode === 'database') {
        throw error;  // Fail hard in database-only mode
      }
      logger.warn('Falling back to file mode due to database initialization failure');
      return undefined;
    }
  }
  
  return undefined;
}

export function createApp(opts: { config: ServerConfig, provider?: CatalogProvider, dbService?: DatabaseService }): express.Application {
  const { config } = opts;
  const app = express();
  
  // Enable CORS for web admin interface
  app.use(cors({
    origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));
  
  // Create provider based on config mode if not provided
  let provider: CatalogProvider;
  if (opts.provider) {
    provider = opts.provider;
  } else {
    provider = createProvider(config, opts.dbService);
  }
  
  const indexCache = new LruCache<string,string[]>({ max: 100, ttlMs: 60_000 });
  const allowedCategories = new Set(['chatmodes','instructions','prompts','tasks','mcp']);

  app.use(requestId());
  app.use(authGuard());

  // Add admin routes for database mode
  if ((config.mode === 'database' || config.mode === 'hybrid') && opts.dbService) {
    app.use('/admin', createAdminRoutes(opts.dbService, indexCache));
  }

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', mode: config.mode });
  });

  // Minimal index.json & file serving (Phase 0, no auth)
  app.get('/catalog/:category/index.json', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const category = req.params.category;
      if(!allowedCategories.has(category)) {return res.status(404).json({ error: 'category_not_found' });}
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
      if(!allowedCategories.has(category)) {return res.status(404).json({ error: 'category_not_found' });}
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
      // Handle Zod validation errors
      else if(err.name === 'ZodError' || err.issues){ 
        code = 'validation_error'; 
        status = 400; 
        logger.error({ err: JSON.stringify(err.issues ?? err.errors), code });
        return res.status(status).json({ error: code, details: err.issues ?? err.errors });
      }
    }
    logger.error({ err: String(err?.message ?? err), code });
    res.status(status).json({ error: code });
  });

  return app;
}

function inferContentType(file: string): string {
  if(file.endsWith('.json')) {return 'application/json';}
  if(file.endsWith('.md')) {return 'text/markdown; charset=utf-8';}
  return 'text/plain; charset=utf-8';
}
