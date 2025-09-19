import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { z } from 'zod';
import { SqliteCatalogProvider } from '../../catalog/sqliteCatalogProvider';
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

const createResourceSchema = z.object({
  catalogId: z.number().int().positive(),
  type: resourceTypeSchema,
  filename: z.string().min(1).max(255),
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(), // Domain/technology category
  tags: z.string().optional(), // Comma-separated tags
  content: z.string().optional(),
  contentUrl: z.string().url().optional(),
  resourceType: z.enum(['content', 'url']).default('content'),
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

      if (data.resourceType === 'content') {
        await catalogProvider.create(
          data.catalogId,
          data.type,
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
          data.type,
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
        .where('type', '=', data.type)
        .where('filename', '=', data.filename)
        .executeTakeFirstOrThrow();

      logger.info({ 
        catalogId: data.catalogId, 
        type: data.type, 
        filename: data.filename,
        resourceType: data.resourceType
      }, 'Resource created');
      
      // Invalidate index cache for this resource type
      invalidateCache(data.type);
      
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

  return router;
}