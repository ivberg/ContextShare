import { Generated, Insertable, Selectable, Updateable } from 'kysely';

// Database table definitions
export interface Database {
  catalogs: CatalogTable;
  resources: ResourceTable;
}

export interface CatalogTable {
  id: Generated<number>;
  name: string;
  display_name: string | null;
  description: string | null;
  source_type: 'local' | 'remote';
  source_path: string | null;  // File path for local catalogs
  source_url: string | null;   // URL for remote catalogs
  enabled: number; // SQLite stores booleans as integers (0/1)
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ResourceTable {
  id: Generated<number>;
  catalog_id: number;
  type: 'chatmodes' | 'instructions' | 'prompts' | 'tasks' | 'mcp';
  filename: string;
  title: string | null;
  description: string | null;
  category: string | null;         // Domain/technology category (web-development, cloud, database, etc.)
  tags: string | null;             // Comma-separated searchable tags (react,typescript,beginner)
  content: string;             // The actual file content (for content type resources)
  content_type: string;        // MIME type or file extension
  resource_type: 'content' | 'url'; // Type of resource: stored content or URL reference
  content_url: string | null;  // URL for url type resources
  metadata: string | null;     // JSON metadata
  enabled: number; // SQLite stores booleans as integers (0/1)
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

// Type helpers for CRUD operations
export type Catalog = Selectable<CatalogTable>;
export type NewCatalog = Insertable<CatalogTable>;
export type CatalogUpdate = Updateable<CatalogTable>;

export type Resource = Selectable<ResourceTable>;
export type NewResource = Insertable<ResourceTable>;
export type ResourceUpdate = Updateable<ResourceTable>;

// Additional types for API responses
export interface CatalogWithStats extends Catalog {
  resource_count: number;
}

export interface ResourceWithCatalog extends Resource {
  catalog_name: string;
  catalog_display_name: string | null;
}