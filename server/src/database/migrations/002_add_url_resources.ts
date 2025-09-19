import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  // Add new columns to resources table (only if they don't exist)
  try {
    await db.schema
      .alterTable('resources')
      .addColumn('resource_type', 'text', (col) => 
        col.notNull().defaultTo('content').check(sql`resource_type IN ('content', 'url')`)
      )
      .execute();
  } catch {
    // Column might already exist, that's okay
  }

  try {
    await db.schema
      .alterTable('resources')
      .addColumn('content_url', 'text')
      .execute();
  } catch {
    // Column might already exist, that's okay
  }

  // Update existing resources to have resource_type = 'content' (only if needed)
  try {
    await sql`UPDATE resources SET resource_type = 'content' WHERE resource_type IS NULL`.execute(db);
  } catch {
    // Might fail if column doesn't exist or is already set, that's okay
  }

  // Add triggers (only if they don't exist)
  try {
    await sql`
      CREATE TRIGGER check_resource_content_or_url
      BEFORE INSERT ON resources
      BEGIN
        SELECT CASE
          WHEN NEW.resource_type = 'content' AND (NEW.content IS NULL OR LENGTH(TRIM(NEW.content)) = 0) THEN
            RAISE(ABORT, 'Content resources must have content')
          WHEN NEW.resource_type = 'url' AND (NEW.content_url IS NULL OR LENGTH(TRIM(NEW.content_url)) = 0) THEN
            RAISE(ABORT, 'URL resources must have content_url')
          WHEN NEW.resource_type = 'url' AND NEW.content_url NOT LIKE 'http%' THEN
            RAISE(ABORT, 'content_url must be a valid HTTP/HTTPS URL')
          WHEN NEW.resource_type = 'content' AND NEW.content_url IS NOT NULL THEN
            RAISE(ABORT, 'Content resources cannot have content_url')
          WHEN NEW.resource_type = 'url' AND NEW.content IS NOT NULL AND LENGTH(TRIM(NEW.content)) > 0 THEN
            RAISE(ABORT, 'URL resources should not have content')
        END;
      END
    `.execute(db);
  } catch {
    // Trigger might already exist, that's okay
  }

  try {
    await sql`
      CREATE TRIGGER check_resource_content_or_url_update
      BEFORE UPDATE ON resources
      BEGIN
        SELECT CASE
          WHEN NEW.resource_type = 'content' AND (NEW.content IS NULL OR LENGTH(TRIM(NEW.content)) = 0) THEN
            RAISE(ABORT, 'Content resources must have content')
          WHEN NEW.resource_type = 'url' AND (NEW.content_url IS NULL OR LENGTH(TRIM(NEW.content_url)) = 0) THEN
            RAISE(ABORT, 'URL resources must have content_url')
          WHEN NEW.resource_type = 'url' AND NEW.content_url NOT LIKE 'http%' THEN
            RAISE(ABORT, 'content_url must be a valid HTTP/HTTPS URL')
          WHEN NEW.resource_type = 'content' AND NEW.content_url IS NOT NULL THEN
            RAISE(ABORT, 'Content resources cannot have content_url')
          WHEN NEW.resource_type = 'url' AND NEW.content IS NOT NULL AND LENGTH(TRIM(NEW.content)) > 0 THEN
            RAISE(ABORT, 'URL resources should not have content')
        END;
      END
    `.execute(db);
  } catch {
    // Trigger might already exist, that's okay
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Drop triggers
  await sql`DROP TRIGGER IF EXISTS check_resource_content_or_url`.execute(db);
  await sql`DROP TRIGGER IF EXISTS check_resource_content_or_url_update`.execute(db);
  
  // Remove columns
  await db.schema
    .alterTable('resources')
    .dropColumn('content_url')
    .execute();

  await db.schema
    .alterTable('resources')
    .dropColumn('resource_type')
    .execute();
}
