import { DatabaseService } from '../database/service';
import { SqliteCatalogProvider } from '../catalog/sqliteCatalogProvider';
import { FileSystemCatalogProvider } from '../catalog/fileSystemCatalogProvider';
import { logger } from '../logging/logger';
import path from 'path';
import fs from 'fs/promises';

export interface MigrationOptions {
  catalogRoot: string;
  catalogName: string;
  sourceType?: 'local' | 'remote';
  displayName?: string;
  dryRun?: boolean;
}

export class FileToDatabaseMigrator {
  constructor(
    private dbService: DatabaseService,
    private dbProvider: SqliteCatalogProvider
  ) {}

  async migrateCatalog(options: MigrationOptions): Promise<MigrationResult> {
    const { catalogRoot, catalogName, sourceType = 'local', displayName, dryRun = false } = options;
    
    logger.info({ catalogName, catalogRoot, dryRun }, 'Starting catalog migration');
    
    const result: MigrationResult = {
      catalogName,
      catalogId: 0,
      categoriesMigrated: {},
      totalFiles: 0,
      errors: []
    };

    try {
      // Create file system provider for source data
      const fileProvider = new FileSystemCatalogProvider(catalogRoot);
      
      if (!dryRun) {
        // Create catalog record in database
        const db = this.dbService.getKysely();
        const catalogRecord = await db
          .insertInto('catalogs')
          .values({
            name: catalogName,
            display_name: displayName ?? catalogName,
            source_type: sourceType,
            source_url: sourceType === 'local' ? catalogRoot : null,
            enabled: 1 // SQLite boolean as integer
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        
        result.catalogId = catalogRecord.id;
      }
      
      // Migrate each category
      const categories = ['chatmodes', 'instructions', 'prompts', 'tasks', 'mcp'];
      
      for (const category of categories) {
        try {
          const categoryResult = await this.migrateCategory(
            fileProvider, 
            result.catalogId, 
            category, 
            catalogRoot,
            dryRun
          );
          
          result.categoriesMigrated[category] = categoryResult;
          result.totalFiles += categoryResult.filesProcessed;
        } catch (error) {
          const errorMsg = `Failed to migrate category ${category}: ${error}`;
          logger.error({ error, category }, errorMsg);
          result.errors.push(errorMsg);
        }
      }
      
      logger.info({ 
        catalogName: result.catalogName,
        catalogId: result.catalogId,
        totalFiles: result.totalFiles,
        categoriesMigrated: Object.keys(result.categoriesMigrated).length,
        errors: result.errors.length
      }, 'Catalog migration completed');
      return result;
      
    } catch (error) {
      const errorMsg = `Failed to migrate catalog ${catalogName}: ${error}`;
      logger.error({ error, catalogName }, errorMsg);
      result.errors.push(errorMsg);
      throw new Error(errorMsg);
    }
  }

  private async migrateCategory(
    fileProvider: FileSystemCatalogProvider,
    catalogId: number,
    category: string,
    catalogRoot: string,
    dryRun: boolean
  ): Promise<CategoryMigrationResult> {
    const result: CategoryMigrationResult = {
      category,
      filesProcessed: 0,
      filesSkipped: 0,
      errors: []
    };

    try {
      // Check if category directory exists
      const categoryPath = path.join(catalogRoot, category);
      try {
        await fs.access(categoryPath);
      } catch {
        logger.info({ category, categoryPath }, 'Category directory does not exist, skipping');
        return result;
      }

      // List files in category
      const files = await fileProvider.list(category);
      logger.info({ category, fileCount: files.length }, 'Migrating category');
      
      for (const filename of files) {
        try {
          // Read file content
          const content = await fileProvider.read(category, filename);
          
          if (!dryRun) {
            // Check if resource already exists
            const exists = await this.dbProvider.exists(category, filename);
            if (exists) {
              logger.warn({ category, filename }, 'Resource already exists, skipping');
              result.filesSkipped++;
              continue;
            }
            
            // Create resource in database
            await this.dbProvider.create(
              catalogId,
              category,
              filename,
              content.toString()
            );
          }
          
          result.filesProcessed++;
          logger.info({ category, filename }, 'Migrated file');
          
        } catch (error) {
          const errorMsg = `Failed to migrate file ${filename}: ${error}`;
          logger.error({ error, category, filename }, errorMsg);
          result.errors.push(errorMsg);
        }
      }
      
    } catch (error) {
      const errorMsg = `Failed to process category ${category}: ${error}`;
      logger.error({ error, category }, errorMsg);
      result.errors.push(errorMsg);
    }
    
    return result;
  }

  async migrateMultipleCatalogs(catalogConfigs: MigrationOptions[]): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    
    for (const config of catalogConfigs) {
      try {
        const result = await this.migrateCatalog(config);
        results.push(result);
      } catch (error) {
        logger.error({ error, catalogName: config.catalogName }, 'Failed to migrate catalog');
        results.push({
          catalogName: config.catalogName,
          catalogId: 0,
          categoriesMigrated: {},
          totalFiles: 0,
          errors: [`Migration failed: ${error}`]
        });
      }
    }
    
    return results;
  }

  async generateMigrationReport(results: MigrationResult[]): Promise<string> {
    const report = [
      '# Catalog Migration Report',
      `Generated: ${new Date().toISOString()}`,
      '',
      '## Summary',
      `- Total catalogs processed: ${results.length}`,
      `- Successful migrations: ${results.filter(r => r.errors.length === 0).length}`,
      `- Failed migrations: ${results.filter(r => r.errors.length > 0).length}`,
      `- Total files migrated: ${results.reduce((sum, r) => sum + r.totalFiles, 0)}`,
      ''
    ];

    for (const result of results) {
      report.push(`## Catalog: ${result.catalogName}`);
      
      if (result.errors.length === 0) {
        report.push('✅ **Status**: Success');
      } else {
        report.push('❌ **Status**: Failed');
      }
      
      report.push(`- Database ID: ${result.catalogId}`);
      report.push(`- Total files migrated: ${result.totalFiles}`);
      report.push('');
      
      // Category details
      if (Object.keys(result.categoriesMigrated).length > 0) {
        report.push('### Categories:');
        for (const [category, categoryResult] of Object.entries(result.categoriesMigrated)) {
          report.push(`- **${category}**: ${categoryResult.filesProcessed} files processed, ${categoryResult.filesSkipped} skipped`);
          if (categoryResult.errors.length > 0) {
            report.push(`  - Errors: ${categoryResult.errors.length}`);
          }
        }
        report.push('');
      }
      
      // Errors
      if (result.errors.length > 0) {
        report.push('### Errors:');
        for (const error of result.errors) {
          report.push(`- ${error}`);
        }
        report.push('');
      }
    }
    
    return report.join('\n');
  }
}

export interface MigrationResult {
  catalogName: string;
  catalogId: number;
  categoriesMigrated: Record<string, CategoryMigrationResult>;
  totalFiles: number;
  errors: string[];
}

export interface CategoryMigrationResult {
  category: string;
  filesProcessed: number;
  filesSkipped: number;
  errors: string[];
}