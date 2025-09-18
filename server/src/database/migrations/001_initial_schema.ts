import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Create catalogs table
  await db.schema
    .createTable('catalogs')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('name', 'text', (col) => col.notNull().unique())
    .addColumn('display_name', 'text')
    .addColumn('description', 'text')
    .addColumn('source_type', 'text', (col) => col.notNull().check(sql`source_type IN ('local', 'remote')`))
    .addColumn('source_path', 'text')
    .addColumn('source_url', 'text')
    .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1).check(sql`enabled IN (0, 1)`))
    .addColumn('created_at', 'datetime', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Create resources table
  await db.schema
    .createTable('resources')
    .addColumn('id', 'integer', (col) => col.primaryKey().autoIncrement())
    .addColumn('catalog_id', 'integer', (col) => 
      col.notNull().references('catalogs.id').onDelete('cascade')
    )
    .addColumn('category', 'text', (col) => 
      col.notNull().check(sql`category IN ('chatmodes', 'instructions', 'prompts', 'tasks', 'mcp')`)
    )
    .addColumn('filename', 'text', (col) => col.notNull())
    .addColumn('title', 'text')
    .addColumn('description', 'text')
    .addColumn('content', 'text', (col) => col.notNull())
    .addColumn('content_type', 'text', (col) => col.notNull())
    .addColumn('metadata', 'text') // JSON
    .addColumn('enabled', 'integer', (col) => col.notNull().defaultTo(1).check(sql`enabled IN (0, 1)`))
    .addColumn('created_at', 'datetime', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn('updated_at', 'datetime', (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  // Create indexes
  await db.schema
    .createIndex('idx_resources_catalog_id')
    .on('resources')
    .column('catalog_id')
    .execute();

  await db.schema
    .createIndex('idx_resources_category')
    .on('resources')
    .column('category')
    .execute();

  await db.schema
    .createIndex('idx_resources_enabled')
    .on('resources')
    .column('enabled')
    .execute();

  // Unique constraint on catalog_id + category + filename
  await db.schema
    .createIndex('idx_resources_unique')
    .on('resources')
    .columns(['catalog_id', 'category', 'filename'])
    .unique()
    .execute();

  // Create triggers for updated_at
  await sql`
    CREATE TRIGGER update_catalogs_updated_at 
    AFTER UPDATE ON catalogs
    BEGIN
      UPDATE catalogs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `.execute(db);

  await sql`
    CREATE TRIGGER update_resources_updated_at 
    AFTER UPDATE ON resources
    BEGIN
      UPDATE resources SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('resources').execute();
  await db.schema.dropTable('catalogs').execute();
}