import { Kysely } from 'kysely';
import { DatabaseService } from './service';
import { logger } from '../logging/logger';

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
    
    // For now, manually import migrations
    // In a full implementation, this would dynamically load from the migrations directory
    const { up, down } = await import('./migrations/001_initial_schema');
    migrations.set('001_initial_schema', { up, down });
    
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