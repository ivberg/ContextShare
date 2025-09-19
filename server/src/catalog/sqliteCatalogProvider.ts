import { CatalogProvider } from './types';
import { DatabaseService } from '../database/service';
import { logger } from '../logging/logger';

const MAX_FILE_BYTES = 1_000_000; // 1MB safety cap

export class SqliteCatalogProvider implements CatalogProvider {
  constructor(private dbService: DatabaseService) {}

  async list(category: string): Promise<string[]> {
    try {
      const db = this.dbService.getKysely();
      
      const resources = await db
        .selectFrom('resources')
        .innerJoin('catalogs', 'resources.catalog_id', 'catalogs.id')
        .select('resources.filename')
        .where('resources.type', '=', category as 'chatmodes' | 'instructions' | 'prompts' | 'tasks' | 'mcp')
        .where('resources.enabled', '=', 1) // SQLite boolean as integer
        .where('catalogs.enabled', '=', 1) // SQLite boolean as integer
        .execute();

      return resources.map(r => r.filename);
    } catch (error) {
      logger.error({ error: String(error), category }, 'Failed to list resources');
      return [];
    }
  }

  async read(category: string, fileName: string): Promise<Buffer | string> {
    try {
      const db = this.dbService.getKysely();
      
      const resource = await db
        .selectFrom('resources')
        .innerJoin('catalogs', 'resources.catalog_id', 'catalogs.id')
        .select(['resources.content', 'resources.content_type', 'resources.resource_type', 'resources.content_url'])
        .where('resources.type', '=', category as 'chatmodes' | 'instructions' | 'prompts' | 'tasks' | 'mcp')
        .where('resources.filename', '=', fileName)
        .where('resources.enabled', '=', 1) // SQLite boolean as integer
        .where('catalogs.enabled', '=', 1) // SQLite boolean as integer
        .executeTakeFirst();

      if (!resource) {
        const error: any = new Error('not found');
        error.code = 'not_found';
        throw error;
      }

      // Handle URL-based resources
      if (resource.resource_type === 'url') {
        if (!resource.content_url) {
          const error: any = new Error('URL resource missing content_url');
          error.code = 'not_found';
          throw error;
        }

        // For URL resources, throw a special error that includes the URL for redirection
        const redirectError: any = new Error('redirect to url');
        redirectError.code = 'redirect_to_url';
        redirectError.url = resource.content_url;
        throw redirectError;
      }

      // Handle content-based resources (existing logic)
      const contentSize = Buffer.byteLength(resource.content, 'utf8');
      if (contentSize > MAX_FILE_BYTES) {
        const error: any = new Error('file too large');
        error.code = 'file_too_large';
        throw error;
      }

      return resource.content;
    } catch (error: any) {
      if (error.code === 'not_found' || error.code === 'file_too_large' || error.code === 'redirect_to_url') {
        throw error;
      }
      logger.error({ error: String(error), category, fileName }, 'Failed to read resource');
      const notFoundError: any = new Error('not found');
      notFoundError.code = 'not_found';
      throw notFoundError;
    }
  }

  async exists(category: string, fileName: string): Promise<boolean> {
    try {
      const db = this.dbService.getKysely();
      
      const resource = await db
        .selectFrom('resources')
        .innerJoin('catalogs', 'resources.catalog_id', 'catalogs.id')
        .select('resources.id')
        .where('resources.type', '=', category as 'chatmodes' | 'instructions' | 'prompts' | 'tasks' | 'mcp')
        .where('resources.filename', '=', fileName)
        .where('resources.enabled', '=', 1) // SQLite boolean as integer
        .where('catalogs.enabled', '=', 1) // SQLite boolean as integer
        .executeTakeFirst();

      return !!resource;
    } catch (error) {
      logger.error({ error: String(error), category, fileName }, 'Failed to check resource existence');
      return false;
    }
  }

  // Additional methods for database-backed operations  
  async create(
    catalogId: number, 
    type: 'chatmodes' | 'instructions' | 'prompts' | 'tasks' | 'mcp', 
    fileName: string, 
    content: string | undefined, 
    metadata?: Record<string, any>, 
    resourceType: 'content' | 'url' = 'content',
    contentUrl?: string,
    title?: string,
    description?: string,
    category?: string,
    tags?: string
  ): Promise<void> {
    const db = this.dbService.getKysely();
    
    const contentType = this.inferContentType(fileName);
    const inferredTitle = title || (resourceType === 'content' && content 
      ? this.inferTitle(fileName, content) 
      : this.inferTitleFromFilename(fileName));
    
    if (resourceType === 'content' && !content) {
      throw new Error('Content is required for content-type resources');
    }
    
    if (resourceType === 'url' && !contentUrl) {
      throw new Error('Content URL is required for URL-type resources');
    }
    
    await db
      .insertInto('resources')
      .values({
        catalog_id: catalogId,
        type: type,
        filename: fileName,
        title: inferredTitle,
        description: description || null,
        category: category || null,
        tags: tags || null,
        content: resourceType === 'content' ? content! : '',
        content_type: contentType,
        resource_type: resourceType,
        content_url: resourceType === 'url' ? contentUrl! : null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        enabled: 1, // SQLite boolean as integer
      })
      .execute();
  }

  async update(catalogId: number, category: string, fileName: string, content?: string, metadata?: Record<string, any>, resourceType?: 'content' | 'url', contentUrl?: string): Promise<void> {
    const db = this.dbService.getKysely();
    
    // Get current resource to determine what to update
    const currentResource = await db
      .selectFrom('resources')
      .select(['resource_type', 'content', 'content_url'])
      .where('catalog_id', '=', catalogId)
      .where('category', '=', category as any)
      .where('filename', '=', fileName)
      .executeTakeFirst();
    
    if (!currentResource) {
      throw new Error('Resource not found');
    }
    
    const finalResourceType = resourceType || currentResource.resource_type;
    const title = finalResourceType === 'content' && content 
      ? this.inferTitle(fileName, content) 
      : this.inferTitleFromFilename(fileName);
    
    // Validate inputs based on resource type
    if (finalResourceType === 'content' && !content) {
      throw new Error('Content is required for content-type resources');
    }
    
    if (finalResourceType === 'url' && !contentUrl) {
      throw new Error('Content URL is required for URL-type resources');
    }
    
    const updateData: any = {
      title,
      metadata: metadata ? JSON.stringify(metadata) : null,
      resource_type: finalResourceType,
    };
    
    if (finalResourceType === 'content') {
      updateData.content = content!;
      updateData.content_url = null;
    } else {
      updateData.content = '';
      updateData.content_url = contentUrl!;
    }
    
    await db
      .updateTable('resources')
      .set(updateData)
      .where('catalog_id', '=', catalogId)
      .where('category', '=', category as any)
      .where('filename', '=', fileName)
      .execute();
  }

  async delete(catalogId: number, category: string, fileName: string): Promise<void> {
    const db = this.dbService.getKysely();
    
    await db
      .deleteFrom('resources')
      .where('catalog_id', '=', catalogId)
      .where('category', '=', category as any)
      .where('filename', '=', fileName)
      .execute();
  }

  private inferTitleFromFilename(fileName: string): string | null {
    // Fall back to filename without extension
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    return baseName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  private inferContentType(fileName: string): string {
    if (fileName.endsWith('.json')) {return 'application/json';}
    if (fileName.endsWith('.md')) {return 'text/markdown';}
    return 'text/plain';
  }

  private inferTitle(fileName: string, content: string): string | null {
    // Try to extract title from markdown header or filename
    if (fileName.endsWith('.md')) {
      const lines = content.split('\n');
      const titleLine = lines.find(line => line.startsWith('# '));
      if (titleLine) {
        return titleLine.substring(2).trim();
      }
    }
    
    return this.inferTitleFromFilename(fileName);
  }
}