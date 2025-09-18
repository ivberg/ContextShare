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
        .where('resources.category', '=', category as any)
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
        .select(['resources.content', 'resources.content_type'])
        .where('resources.category', '=', category as any)
        .where('resources.filename', '=', fileName)
        .where('resources.enabled', '=', 1) // SQLite boolean as integer
        .where('catalogs.enabled', '=', 1) // SQLite boolean as integer
        .executeTakeFirst();

      if (!resource) {
        const error: any = new Error('not found');
        error.code = 'not_found';
        throw error;
      }

      // Check size limit
      const contentSize = Buffer.byteLength(resource.content, 'utf8');
      if (contentSize > MAX_FILE_BYTES) {
        const error: any = new Error('file too large');
        error.code = 'file_too_large';
        throw error;
      }

      return resource.content;
    } catch (error: any) {
      if (error.code === 'not_found' || error.code === 'file_too_large') {
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
        .where('resources.category', '=', category as any)
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
  async create(catalogId: number, category: string, fileName: string, content: string, metadata?: Record<string, any>): Promise<void> {
    const db = this.dbService.getKysely();
    
    const contentType = this.inferContentType(fileName);
    const title = this.inferTitle(fileName, content);
    
    await db
      .insertInto('resources')
      .values({
        catalog_id: catalogId,
        category: category as any,
        filename: fileName,
        title,
        content,
        content_type: contentType,
        metadata: metadata ? JSON.stringify(metadata) : null,
        enabled: 1, // SQLite boolean as integer
      })
      .execute();
  }

  async update(catalogId: number, category: string, fileName: string, content: string, metadata?: Record<string, any>): Promise<void> {
    const db = this.dbService.getKysely();
    
    const title = this.inferTitle(fileName, content);
    
    await db
      .updateTable('resources')
      .set({
        content,
        title,
        metadata: metadata ? JSON.stringify(metadata) : null,
      })
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
    
    // Fall back to filename without extension
    const baseName = fileName.replace(/\.[^/.]+$/, '');
    return baseName.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}