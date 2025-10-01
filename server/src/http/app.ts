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
import type { CatalogExport, CatalogResourceType, ResourceExportSummary } from '@contextshare/shared/catalogExportTypes';
import type { Catalog } from '../database/schema';

function adminKeyGuard(expectedKey?: string){
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if(!expectedKey){ return next(); }
    const header = req.headers['x-admin-api-key'] || req.headers['authorization'];
    if(typeof header === 'string'){
      // Allow either raw key via X-Admin-Api-Key or Authorization: Bearer <key>
      const token = header.startsWith('Bearer ') ? header.slice(7) : header;
      if(token === expectedKey){ return next(); }
    }
    return res.status(401).json({ error: 'unauthorized' });
  };
}

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
    
    // Ensure the database directory exists before initializing
    const dbDir = _path.dirname(config.databasePath);
    await _fs.mkdir(dbDir, { recursive: true });
    logger.info({ databasePath: config.databasePath, directory: dbDir }, 'Database directory ensured');
    
    // Check if database exists, if not try to copy from seed file (Azure deployment)
    try {
      await _fs.access(config.databasePath);
      logger.info({ databasePath: config.databasePath }, 'Database file exists');
    } catch {
      // Database doesn't exist, try to copy from seed file
      const seedPath = _path.join(process.cwd(), 'catalog.db.seed');
      try {
        await _fs.access(seedPath);
        await _fs.copyFile(seedPath, config.databasePath);
        logger.info({ seedPath, databasePath: config.databasePath }, 'Initialized database from seed file');
      } catch {
        logger.info({ databasePath: config.databasePath }, 'No seed file found, will create new empty database');
      }
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
    app.use('/admin', adminKeyGuard(config.adminApiKey), createAdminRoutes(opts.dbService, indexCache));
  }

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', mode: config.mode });
  });

  // GET /catalog/catalog-export - Aggregate all catalogs with resources
  app.get('/catalog/catalog-export', async (_req: Request, res: Response, next: NextFunction) => {
    // Only works in database mode
    if (config.mode !== 'database' && config.mode !== 'hybrid') {
      return res.status(404).json({ error: 'not_available_in_file_mode' });
    }
    if (!opts.dbService) {
      return res.status(503).json({ error: 'database_service_unavailable' });
    }

    try {
      const db = opts.dbService.getKysely();
      type CatalogMap = Record<number, CatalogExport>;
      // Fetch all catalogs
      const catalogs = await db
        .selectFrom('catalogs')
        .selectAll()
  .where('enabled', '=', 1)
        .execute();

      if (catalogs.length === 0) {
        return res.json({ generated_at: new Date().toISOString(), catalogs: [], counts: { catalogs: 0, resources: 0 } });
      }

      // Fetch all resources for these catalogs in one query
      const catalogIds = catalogs.map((c: Catalog) => c.id);
      const resources = await db
        .selectFrom('resources')
        .selectAll()
  .where('catalog_id', 'in', catalogIds)
  .where('enabled', '=', 1)
        .execute();

      // Size guard: limit to 10,000 resources to protect server memory
      if (resources.length > 10_000) {
        return res.status(413).json({ error: 'export_too_large', max: 10000 });
      }

      // Group resources by catalog and type
  const byCatalog: CatalogMap = {};
      for (const cat of catalogs) {
        byCatalog[cat.id] = {
          // id intentionally omitted for lightweight export
          name: cat.name,
          display_name: cat.display_name,
          description: cat.description,
          source_type: cat.source_type,
          source_path: cat.source_path ?? undefined,
          source_url: cat.source_url ?? undefined,
          // enabled always filtered to 1 so omitted
          created_at: cat.created_at,
          updated_at: cat.updated_at,
          resources: {
            chatmodes: [],
            instructions: [],
            prompts: [],
            tasks: [],
            mcp: []
          }
        };
      }

      const INLINE_CONTENT_LIMIT = 50 * 1024; // 50KB to avoid huge payloads

      for (const r of resources) {
        const cat = byCatalog[r.catalog_id];
        if (!cat) { continue; }
        // Parse metadata JSON if present
        let parsedMeta: Record<string, unknown> | null = null;
        if (r.metadata) {
          try { parsedMeta = JSON.parse(r.metadata); } catch { parsedMeta = null; }
        }
        const summary: ResourceExportSummary = {
          filename: r.filename,
          title: r.title ?? undefined,
          description: r.description ?? undefined,
          category: r.category ?? undefined,
          tags: r.tags ?? undefined,
          content_type: r.content_type,
          resource_type: r.resource_type,
          content_url: r.content_url ?? undefined,
          metadata: parsedMeta ?? undefined,
          created_at: r.created_at,
          updated_at: r.updated_at,
          content: (r.resource_type === 'content' && typeof r.content === 'string' && r.content.length <= INLINE_CONTENT_LIMIT) ? r.content : undefined,
          truncated: (r.resource_type === 'content' && typeof r.content === 'string' && r.content.length > INLINE_CONTENT_LIMIT) ? true : undefined,
          size: r.resource_type === 'content' ? (typeof r.content === 'string' ? r.content.length : undefined) : undefined
        };
        const keyCandidate = r.type as string;
        if(['chatmodes','instructions','prompts','tasks','mcp'].includes(keyCandidate)) {
          const key = keyCandidate as CatalogResourceType;
          cat.resources[key].push(summary);
        }
      }

  const exportPayload: CatalogExport[] = Object.values(byCatalog);
      const totalResources = resources.length;

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        generated_at: new Date().toISOString(),
        catalogs: exportPayload,
        counts: { catalogs: catalogs.length, resources: totalResources }
      });
    } catch (error) {
      next(error);
    }
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
      const { category, file } = req.params as { category: string; file: string };
      if(!allowedCategories.has(category)) {return res.status(404).json({ error: 'category_not_found' });}
      const buf = await provider.read(category, file);
      const data = Buffer.isBuffer(buf) ? buf.toString('utf8') : buf;
      res.setHeader('Content-Type', inferContentType(file));
      res.send(data);
    } catch (e: unknown) { 
      // Handle URL-based resources with redirect
      if (e && typeof e === 'object' && 'code' in e && e.code === 'redirect_to_url' && 'url' in e) {
        return res.redirect(302, e.url as string);
      }
      next(e); 
    }
  });

  // 404 handler for catalog namespace (only if previous handlers didn't match)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if(req.path.startsWith('/catalog/')){
      return res.status(404).json({ error: 'not_found' });
    }
    next();
  });

  // Basic error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let code = 'internal';
    let status = 500;
    if(err && typeof err === 'object'){
      if('code' in err && err.code === 'file_too_large'){ code = 'file_too_large'; status = 413; }
      else if('code' in err && err.code === 'not_found'){ code = 'not_found'; status = 404; }
      // Handle Zod validation errors
      else if(('name' in err && err.name === 'ZodError') || 'issues' in err){ 
        code = 'validation_error'; 
        status = 400; 
        const issues = 'issues' in err ? err.issues : ('errors' in err ? err.errors : undefined);
        logger.error({ err: JSON.stringify(issues), code });
        return res.status(status).json({ error: code, details: issues });
      }
    }
    const message = err && typeof err === 'object' && 'message' in err ? err.message : err;
    logger.error({ err: String(message), code });
    res.status(status).json({ error: code });
  });

  return app;
}

function inferContentType(file: string): string {
  if(file.endsWith('.json')) {return 'application/json';}
  if(file.endsWith('.md')) {return 'text/markdown; charset=utf-8';}
  return 'text/plain; charset=utf-8';
}
