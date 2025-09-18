#!/usr/bin/env node

import { Command } from 'commander';
import { createDatabaseService } from '../database/service.js';
import { SqliteCatalogProvider } from '../catalog/sqliteCatalogProvider.js';
import { MigrationRunner } from '../database/migrationRunner.js';
import { FileToDatabaseMigrator, MigrationOptions } from './migrate.js';
import { loadConfig as _loadConfig } from '../config';
import { logger as _logger } from '../logging/logger';
import fs from 'fs/promises';
import path from 'path';

const program = new Command();

program
  .name('migrate-catalog')
  .description('Migrate file-based catalogs to SQLite database')
  .version('1.0.0');

program
  .command('single')
  .description('Migrate a single catalog directory to database')
  .requiredOption('-r, --root <path>', 'Path to catalog root directory')
  .requiredOption('-n, --name <name>', 'Catalog name')
  .requiredOption('-d, --database <path>', 'Path to SQLite database file')
  .option('-t, --type <type>', 'Source type (local|remote)', 'local')
  .option('--display-name <name>', 'Display name for catalog')
  .option('--dry-run', 'Perform dry run without making changes')
  .action(async (options) => {
    try {
      const dbService = createDatabaseService({ filename: options.database });
      await dbService.initialize();
      
      // Run database migrations
      const migrationRunner = new MigrationRunner(dbService);
      await migrationRunner.runMigrations();
      
      const dbProvider = new SqliteCatalogProvider(dbService);
      const migrator = new FileToDatabaseMigrator(dbService, dbProvider);
      
      const migrationOptions: MigrationOptions = {
        catalogRoot: options.root,
        catalogName: options.name,
        sourceType: options.type,
        displayName: options.displayName,
        dryRun: options.dryRun
      };
      
      const result = await migrator.migrateCatalog(migrationOptions);
      
      console.log('\n🎉 Migration completed!');
      console.log(`📁 Catalog: ${result.catalogName}`);
      console.log(`🆔 Database ID: ${result.catalogId}`);
      console.log(`📄 Files migrated: ${result.totalFiles}`);
      
      if (result.errors.length > 0) {
        console.log(`❌ Errors: ${result.errors.length}`);
        result.errors.forEach(error => console.log(`   - ${error}`));
      }
      
      await dbService.close();
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('Migrate multiple catalogs from a configuration file')
  .requiredOption('-c, --config <path>', 'Path to migration configuration JSON file')
  .requiredOption('-d, --database <path>', 'Path to SQLite database file')
  .option('--dry-run', 'Perform dry run without making changes')
  .action(async (options) => {
    try {
      // Read configuration file
      const configPath = path.resolve(options.config);
      const configData = await fs.readFile(configPath, 'utf-8');
      const config: BatchMigrationConfig = JSON.parse(configData);
      
      const dbService = createDatabaseService({ filename: options.database });
      await dbService.initialize();
      
      // Run database migrations
      const migrationRunner = new MigrationRunner(dbService);
      await migrationRunner.runMigrations();
      
      const dbProvider = new SqliteCatalogProvider(dbService);
      const migrator = new FileToDatabaseMigrator(dbService, dbProvider);
      
      // Prepare migration options
      const migrationOptions: MigrationOptions[] = config.catalogs.map(catalog => ({
        catalogRoot: catalog.root,
        catalogName: catalog.name,
        sourceType: catalog.type ?? 'local',
        displayName: catalog.displayName,
        dryRun: options.dryRun
      }));
      
      console.log(`🚀 Starting batch migration of ${migrationOptions.length} catalogs...`);
      
      const results = await migrator.migrateMultipleCatalogs(migrationOptions);
      
      // Generate and save report
      const report = await migrator.generateMigrationReport(results);
      const reportPath = path.join(path.dirname(configPath), 'migration-report.md');
      await fs.writeFile(reportPath, report);
      
      console.log('\n🎉 Batch migration completed!');
      console.log(`📄 Report saved to: ${reportPath}`);
      
      const successful = results.filter(r => r.errors.length === 0).length;
      const failed = results.filter(r => r.errors.length > 0).length;
      const totalFiles = results.reduce((sum, r) => sum + r.totalFiles, 0);
      
      console.log(`✅ Successful: ${successful}/${results.length} catalogs`);
      console.log(`📄 Total files migrated: ${totalFiles}`);
      
      if (failed > 0) {
        console.log(`❌ Failed migrations: ${failed}`);
        process.exit(1);
      }
      
      await dbService.close();
      
    } catch (error) {
      console.error('❌ Batch migration failed:', error);
      process.exit(1);
    }
  });

program
  .command('init-config')
  .description('Generate a sample migration configuration file')
  .option('-o, --output <path>', 'Output path for config file', './migration-config.json')
  .action(async (options) => {
    const sampleConfig: BatchMigrationConfig = {
      catalogs: [
        {
          name: 'main-catalog',
          root: './catalogs/main',
          type: 'local',
          displayName: 'Main Catalog'
        },
        {
          name: 'example-catalog', 
          root: './example-catalog',
          type: 'local',
          displayName: 'Example Catalog'
        }
      ]
    };
    
    const configPath = path.resolve(options.output);
    await fs.writeFile(configPath, JSON.stringify(sampleConfig, null, 2));
    
    console.log(`📝 Sample configuration created: ${configPath}`);
    console.log('Edit the configuration file and run:');
    console.log(`   migrate-catalog batch -c ${configPath} -d ./catalog.db`);
  });

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();

interface BatchMigrationConfig {
  catalogs: {
    name: string;
    root: string;
    type?: 'local' | 'remote';
    displayName?: string;
  }[];
}