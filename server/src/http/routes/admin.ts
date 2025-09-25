import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { z } from 'zod';
import { SqliteCatalogProvider } from '../../catalog/sqliteCatalogProvider';
import type { CatalogExport, CatalogResourceType, ResourceExportSummary } from '../../../../shared/catalogExportTypes';
import type { Catalog } from '../../database/schema';
import { DatabaseService } from '../../database/service';
import { logger } from '../../logging/logger';
import { LruCache } from '../../cache/lru';

// API Response Types - these should match the client types exactly
interface ResourceContentResponse {
  content?: string | null;
  content_type: string;
  resource_type: 'content' | 'url';
  content_url?: string | null;
  metadata?: Record<string, unknown> | null;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: string | null;
}

// Validation schemas
const resourceTypeSchema = z.enum(['chatmodes', 'instructions', 'prompts', 'tasks', 'mcp']);

// Accept both 'type' (preferred) and legacy 'category' field pointing to resource type (instructions, prompts, etc.)
const createResourceSchema = z.object({
  catalogId: z.number().int().positive(),
  type: resourceTypeSchema.optional(),
  // legacy alias (tests used 'category' originally to mean resource type)
  category: resourceTypeSchema.optional(),
  filename: z.string().min(1).max(255),
  title: z.string().optional(),
  description: z.string().optional(),
  // domainCategory: domain classification separate from resource type (retain legacy naming confusion)
  domainCategory: z.string().optional(),
  tags: z.string().optional(),
  content: z.string().optional(),
  contentUrl: z.string().url().optional(),
  resourceType: z.enum(['content', 'url']).default('content'),
  metadata: z.record(z.any()).optional(),
}).refine((data) => {
  // Require at least one of type/category alias (strict comparison per lint)
  return (data.type ?? data.category) !== null && (data.type ?? data.category) !== undefined;
}, { message: 'type (or legacy category) is required' })
  .refine((data) => {
    if (data.resourceType === 'content' && !data.content) { return false; }
    if (data.resourceType === 'url' && !data.contentUrl) { return false; }
    return true;
  }, { message: 'Content is required for content resources, contentUrl is required for URL resources' })
  .transform((data) => {
    const normalizedType = data.type ?? data.category; // guaranteed by refine above
    return {
      ...data,
      type: normalizedType as typeof normalizedType & NonNullable<typeof normalizedType>,
      category: data.domainCategory ?? undefined
    };
  });

const updateResourceSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(), // Domain/technology category
  tags: z.string().optional(),     // Comma-separated tags
  content: z.string().optional(),
  contentUrl: z.string().url().optional(),
  resourceType: z.enum(['content', 'url']).optional(),
  metadata: z.record(z.any()).optional(),
}).refine((data) => {
  if (data.resourceType === 'content' && !data.content) {
    return false;
  }
  if (data.resourceType === 'url' && !data.contentUrl) {
    return false;
  }
  return true;
}, {
  message: "Content is required for content resources, contentUrl is required for URL resources"
});

const createCatalogSchema = z.object({
  name: z.string().min(1).max(100),
  displayName: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
  sourceType: z.enum(['local', 'remote']),
  sourcePath: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});

export function createAdminRoutes(dbService: DatabaseService, indexCache?: LruCache<string, string[]>): Router {
  const router = Router();
  const catalogProvider = new SqliteCatalogProvider(dbService);
  const db = dbService.getKysely();

  // Helper function to invalidate cache for a category
  const invalidateCache = (category: string): void => {
    if (indexCache) {
      const cacheKey = `idx:${category}`;
      indexCache.delete(cacheKey);
    }
  };

  // Middleware to parse JSON
  router.use(express.json({ limit: '10mb' }));

  // GET /admin/catalogs - List all catalogs
  router.get('/catalogs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const catalogs = await db
        .selectFrom('catalogs')
        .leftJoin('resources', 'catalogs.id', 'resources.catalog_id')
        .select([
          'catalogs.id',
          'catalogs.name',
          'catalogs.display_name',
          'catalogs.description',
          'catalogs.source_type',
          'catalogs.source_path',
          'catalogs.source_url',
          'catalogs.enabled',
          'catalogs.created_at',
          'catalogs.updated_at',
          // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
          (eb) => eb.fn.count('resources.id').as('resource_count')
        ])
        .groupBy(['catalogs.id'])
        .execute();

      res.json(catalogs);
    } catch (error) {
      next(error);
    }
  });

  // POST /admin/catalogs - Create new catalog
  router.post('/catalogs', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createCatalogSchema.parse(req.body);
      
      const result = await db
        .insertInto('catalogs')
        .values({
          name: data.name,
          display_name: data.displayName ?? null,
          description: data.description ?? null,
          source_type: data.sourceType,
          source_path: data.sourcePath ?? null,
          source_url: data.sourceUrl ?? null,
          enabled: 1, // SQLite boolean as integer
        })
        .returning(['id', 'name', 'display_name', 'description', 'source_type', 'source_path', 'source_url', 'enabled', 'created_at', 'updated_at'])
        .executeTakeFirstOrThrow();

      logger.info({ catalogId: result.id, name: data.name }, 'Catalog created');
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  // GET /admin/catalogs/:id/resources - List resources in a catalog
  router.get('/catalogs/:id/resources', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const catalogId = parseInt(req.params.id);
      if (isNaN(catalogId)) {
        return res.status(400).json({ error: 'Invalid catalog ID' });
      }

      const resources = await db
        .selectFrom('resources')
        .innerJoin('catalogs', 'resources.catalog_id', 'catalogs.id')
        .select([
          'resources.id',
          'resources.type',          // Resource type (chatmodes, instructions, etc.)
          'resources.category',      // Domain category (automation, web-development, etc.)
          'resources.tags',          // Searchable tags
          'resources.filename',
          'resources.title',
          'resources.description',
          'resources.content_type',
          'resources.resource_type', // Storage type (content or url)
          'resources.content_url',   // URL for url-type resources
          'resources.enabled',
          'resources.created_at',
          'resources.updated_at',
          'catalogs.name as catalog_name'
        ])
        .where('resources.catalog_id', '=', catalogId)
        .execute();

      res.json(resources);
    } catch (error) {
      next(error);
    }
  });

  // POST /admin/resources - Create new resource
  router.post('/resources', async (req: Request, res: Response, next: NextFunction) => {
    try {
  const data = createResourceSchema.parse(req.body);
      
      if (!catalogProvider.create) {
        return res.status(501).json({ error: 'Resource creation not supported in current mode' });
      }

      if (!data.type) {
        // Should be unreachable due to refine, but runtime guard for safety
        return res.status(400).json({ error: 'Invalid resource type (missing after validation)' });
      }
      const resourceTypeId = data.type;
      if (data.resourceType === 'content') {
        await catalogProvider.create(
          data.catalogId,
          resourceTypeId,
          data.filename,
          data.content ?? '',
          data.metadata,
          'content',
          undefined,
          data.title,
          data.description,
          data.category,
          data.tags
        );
      } else {
        await catalogProvider.create(
          data.catalogId,
          resourceTypeId,
          data.filename,
          undefined as never,
          data.metadata,
          'url',
          data.contentUrl ?? '',
          data.title,
          data.description,
          data.category,
          data.tags
        );
      }

      // Fetch the created resource to return complete data
      const resource = await db
        .selectFrom('resources')
        .selectAll()
        .where('catalog_id', '=', data.catalogId)
        .where('type', '=', resourceTypeId)
        .where('filename', '=', data.filename)
        .executeTakeFirstOrThrow();

      logger.info({ 
        catalogId: data.catalogId, 
        type: data.type, 
        filename: data.filename,
        resourceType: data.resourceType
      }, 'Resource created');
      
      // Invalidate index cache for this resource type
  invalidateCache(resourceTypeId);
      
      res.status(201).json(resource);
    } catch (error) {
      next(error);
    }
  });

  // PUT /admin/resources/:catalogId/:category/:filename - Update resource
  router.put('/resources/:catalogId/:category/:filename', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const catalogId = parseInt(req.params.catalogId);
      const category = req.params.category;
      const filename = req.params.filename;
      
      if (isNaN(catalogId)) {
        return res.status(400).json({ error: 'Invalid catalog ID' });
      }

      // Validate that category is a valid resource type
      const resourceTypeResult = resourceTypeSchema.safeParse(category);
      if (!resourceTypeResult.success) {
        return res.status(400).json({ error: 'Invalid resource type' });
      }
      const resourceType = resourceTypeResult.data;

      const data = updateResourceSchema.parse(req.body);
      
      await catalogProvider.update(
        catalogId,
        resourceType,
        filename,
        data.content,
        data.metadata,
        data.resourceType,
        data.contentUrl
      );

      logger.info({ catalogId, resourceType, filename, storageType: data.resourceType }, 'Resource updated');
      
      // Invalidate index cache for this category
      invalidateCache(resourceType);
      
      res.json({ message: 'Resource updated successfully' });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /admin/resources/:catalogId/:category/:filename - Delete resource
  router.delete('/resources/:catalogId/:category/:filename', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const catalogId = parseInt(req.params.catalogId);
      const category = req.params.category;
      const filename = req.params.filename;
      
      if (isNaN(catalogId)) {
        return res.status(400).json({ error: 'Invalid catalog ID' });
      }

      // Validate that category is a valid resource type
      const resourceTypeResult = resourceTypeSchema.safeParse(category);
      if (!resourceTypeResult.success) {
        return res.status(400).json({ error: 'Invalid resource type' });
      }
      const resourceType = resourceTypeResult.data;

      await catalogProvider.delete(catalogId, resourceType, filename);

      logger.info({ catalogId, resourceType, filename }, 'Resource deleted');
      
      // Invalidate index cache for this category
      invalidateCache(resourceType);
      
      res.json({ message: 'Resource deleted successfully' });
    } catch (error) {
      next(error);
    }
  });

  // GET /admin/resources/:catalogId/:category/:filename - Get resource content
  router.get('/resources/:catalogId/:category/:filename', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const catalogId = parseInt(req.params.catalogId);
      const category = req.params.category;
      const filename = req.params.filename;
      
      if (isNaN(catalogId)) {
        return res.status(400).json({ error: 'Invalid catalog ID' });
      }

      // Validate that category is a valid resource type
      const resourceTypeResult = resourceTypeSchema.safeParse(category);
      if (!resourceTypeResult.success) {
        return res.status(400).json({ error: 'Invalid resource type' });
      }
      const resourceType = resourceTypeResult.data;

      const resource = await db
        .selectFrom('resources')
        .select(['content', 'content_type', 'resource_type', 'content_url', 'metadata', 'title', 'description', 'category', 'tags'])
        .where('catalog_id', '=', catalogId)
        .where('type', '=', resourceType)  // Now properly typed
        .where('filename', '=', filename)
        .executeTakeFirst();

      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Strongly typed response - TypeScript will catch mismatches
      const response: ResourceContentResponse = {
        content: resource.content,
        content_type: resource.content_type,
        resource_type: resource.resource_type,
        content_url: resource.content_url,
        metadata: resource.metadata ? JSON.parse(resource.metadata) : null,
        title: resource.title,
        description: resource.description,
        category: resource.category,
        tags: resource.tags,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  // GET /admin/catalog-export - Aggregate all catalogs with resources
  // Simple, single call for clients needing full metadata dump.
  // Simplified response shape (fields trimmed):
  // {
  //   generated_at: ISO8601,
  //   catalogs: [{ name, display_name, description, source_type, source_path?, source_url?, created_at, updated_at, resources: { chatmodes: RS[], instructions: RS[], prompts: RS[], tasks: RS[], mcp: RS[] } }],
  //   counts: { catalogs, resources }
  // }
  // RS (ResourceSummary): { filename, title?, description?, category?, tags?, content_type, resource_type, content_url?, metadata?, created_at, updated_at, content?, truncated?, size? }
  router.get('/catalog-export', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = dbService.getKysely();
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

  return router;
}