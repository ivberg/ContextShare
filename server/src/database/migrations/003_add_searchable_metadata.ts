import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Step 1: Drop the existing category index before renaming (if it exists)
  try {
    await db.schema.dropIndex('idx_resources_category').execute();
  } catch {
    // Index might not exist, that's okay
  }

  // Step 2: Rename 'category' to 'type' (this field represents resource type) - only if not already renamed
  try {
    await db.schema
      .alterTable('resources')
      .renameColumn('category', 'type')
      .execute();
  } catch {
    // Column might already be renamed, that's okay
  }

  // Step 3: Add new searchable metadata columns (only if they don't exist)
  try {
    await db.schema
      .alterTable('resources')
      .addColumn('category', 'text') // Domain/technology category (web-development, cloud, database, etc.)
      .execute();
  } catch {
    // Column might already exist, that's okay
  }

  try {
    await db.schema
      .alterTable('resources')
      .addColumn('tags', 'text') // Comma-separated searchable tags (react,typescript,beginner)
      .execute();
  } catch {
    // Column might already exist, that's okay
  }

  // Step 4: Create indexes for efficient searching (only if they don't exist)
  try {
    await db.schema
      .createIndex('idx_resources_type')
      .on('resources')
      .column('type')
      .execute();
  } catch {
    // Index might already exist, that's okay
  }

  try {
    await db.schema
      .createIndex('idx_resources_category')
      .on('resources')
      .column('category')
      .execute();
  } catch {
    // Index might already exist, that's okay
  }

  // Note: We'll search title, description, tags, and category using basic LIKE queries
  // No FTS complexity needed for now - can be added later if advanced search is required
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex('idx_resources_category').execute();
  await db.schema.dropIndex('idx_resources_type').execute();

  // Remove new columns
  await db.schema
    .alterTable('resources')
    .dropColumn('tags')
    .dropColumn('category')
    .execute();

  // Rename back to original
  await db.schema
    .alterTable('resources')
    .renameColumn('type', 'category')
    .execute();
}
