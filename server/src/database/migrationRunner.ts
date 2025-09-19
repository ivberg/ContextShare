import { Kysely } from 'kysely';
import { DatabaseService } from './service';
import { logger } from '../logging/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface Migration {
  up: (db: Kysely<any>) => Promise<void>;
  down: (db: Kysely<any>) => Promise<void>;
}

export class MigrationRunner {
  constructor(private dbService: DatabaseService) {}

  async runMigrations(): Promise<void> {
    const db = this.dbService.getKysely();
    
    // Create migrations table if it doesn't exist
    await this.ensureMigrationsTable(db);

    // Import and run migrations
    const migrations = await this.loadMigrations();
    
    for (const [name, migration] of migrations) {
      const hasRun = await this.hasMigrationRun(db, name);
      if (!hasRun) {
        logger.info({ migration: name }, 'Running migration');
        await migration.up(db);
        await this.recordMigration(db, name);
        logger.info({ migration: name }, 'Migration completed');
      }
    }
  }

  private async ensureMigrationsTable(db: Kysely<any>): Promise<void> {
    await db.schema
      .createTable('_migrations')
      .ifNotExists()
      .addColumn('name', 'text', (col) => col.primaryKey())
      .addColumn('applied_at', 'datetime', (col) => col.notNull().defaultTo('CURRENT_TIMESTAMP'))
      .execute();
  }

  private async loadMigrations(): Promise<Map<string, Migration>> {
    const migrations = new Map<string, Migration>();
    
    // Dynamically discover migration files
    // In development: src/database/migrations, in production: dist/database/migrations
    const migrationsDir = path.resolve(__dirname, 'migrations');
    
    let files: string[] = [];
    try {
      files = fs.readdirSync(migrationsDir);
      logger.info({ migrationsDir, files }, 'Reading migrations directory');
    } catch (error) {
      logger.error({ migrationsDir, error: String(error) }, 'Failed to read migrations directory');
      throw new Error(`Cannot read migrations directory: ${migrationsDir}`);
    }
    
    // Filter and sort migration files by pattern: XXX_migration_name.ts/.js
    const migrationFiles = files
      .filter(file => (file.endsWith('.ts') || file.endsWith('.js')) && /^\d{3}_/.test(file))
      .map(file => file.replace(/\.(ts|js)$/, ''))
      .sort(); // Ensures migrations run in order (001, 002, 003, etc.)
    
    logger.info({ count: migrationFiles.length, files: migrationFiles }, 'Discovered migrations');
    
    // Load migrations in order
    for (const migrationName of migrationFiles) {
      try {
        const migration = await import(`./migrations/${migrationName}`);
        migrations.set(migrationName, { up: migration.up, down: migration.down });
        logger.info({ migration: migrationName }, 'Loaded migration');
      } catch (error) {
        logger.error({ migration: migrationName, error: String(error) }, 'Failed to load migration');
        throw new Error(`Failed to load migration ${migrationName}: ${error}`);
      }
    }
    
    return migrations;
  }

  private async hasMigrationRun(db: Kysely<any>, name: string): Promise<boolean> {
    const result = await db
      .selectFrom('_migrations')
      .select('name')
      .where('name', '=', name)
      .executeTakeFirst();
    
    return !!result;
  }

  private async recordMigration(db: Kysely<any>, name: string): Promise<void> {
    await db
      .insertInto('_migrations')
      .values({ name })
      .execute();
  }
}