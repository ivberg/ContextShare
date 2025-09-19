import { Kysely, SqliteDialect, sql } from 'kysely';
import { Database } from './schema';
import type BetterSqlite3 from 'better-sqlite3';

export interface DatabaseConfig {
  filename: string;
  readonly?: boolean;
}

// Abstract database service interface
export interface DatabaseService {
  getKysely(): Kysely<Database>;
  initialize(): Promise<void>;
  close(): Promise<void>;
  backup(targetPath: string): Promise<void>;
}

// SQLite implementation using better-sqlite3
export class SqliteDatabaseService implements DatabaseService {
  private db: Kysely<Database> | null = null;
  private sqliteDb: BetterSqlite3.Database | null = null;
  
  constructor(private config: DatabaseConfig) {}

  getKysely(): Kysely<Database> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  async initialize(): Promise<void> {
    try {
      // Import better-sqlite3 dynamically to handle cases where it's not available
      const BetterSqlite3 = require('better-sqlite3');
      
      this.sqliteDb = new BetterSqlite3(this.config.filename, {
        readonly: this.config.readonly ?? false,
        verbose: process.env.NODE_ENV === 'development' ? (message?: unknown): void => {
          // eslint-disable-next-line no-console
          console.debug(`[sqlite] ${message}`);
        } : undefined,
      });

      if (!this.sqliteDb) {
        throw new Error('SQLite database not initialized');
      }
      
      const dialect = new SqliteDialect({
        database: this.sqliteDb
      });

      this.db = new Kysely<Database>({ dialect });
      
      // Configure SQLite for optimal performance
      await this.db.executeQuery(sql`PRAGMA journal_mode = WAL`.compile(this.db));
      await this.db.executeQuery(sql`PRAGMA synchronous = NORMAL`.compile(this.db));
      await this.db.executeQuery(sql`PRAGMA foreign_keys = ON`.compile(this.db));
      await this.db.executeQuery(sql`PRAGMA busy_timeout = 5000`.compile(this.db));
      
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'MODULE_NOT_FOUND') {
        throw new Error('better-sqlite3 is not installed. Please run: npm install better-sqlite3');
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.destroy();
      this.db = null;
    }
    if (this.sqliteDb) {
      this.sqliteDb.close();
      this.sqliteDb = null;
    }
  }

  async backup(targetPath: string): Promise<void> {
    if (!this.sqliteDb) {
      throw new Error('Database not initialized');
    }
    
    // Use SQLite's VACUUM INTO command for atomic backup
    await this.db?.executeQuery(sql`VACUUM INTO ${targetPath}`.compile(this.db));
  }
}

// Factory function to create database service
export function createDatabaseService(config: DatabaseConfig): DatabaseService {
  return new SqliteDatabaseService(config);
}