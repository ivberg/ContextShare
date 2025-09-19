// API types matching the ContextShare Admin API

export interface Catalog {
  id: number;
  name: string;
  display_name: string;
  description?: string;
  source_type: 'local' | 'remote';
  source_path?: string;
  source_url?: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  resource_count?: number;
}

export interface CreateCatalogRequest {
  name: string;
  displayName: string;
  description?: string;
  sourceType: 'local' | 'remote';
  sourcePath?: string;
  sourceUrl?: string;
}

export interface Resource {
  id: number;
  catalog_id: number;
  type: ResourceType;
  filename: string;
  title?: string;
  description?: string;
  category?: string; // Domain/technology category (web-development, cloud, database, etc.)
  tags?: string;     // Comma-separated searchable tags (react,typescript,beginner)
  content: string;
  content_type: string;
  resource_type: 'content' | 'url';
  content_url?: string;
  metadata?: string; // JSON string
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CreateResourceRequest {
  catalogId: number;
  type: ResourceType;
  filename: string;
  title?: string;
  description?: string;
  category?: string;  // Domain/technology category
  tags?: string;      // Comma-separated tags
  content?: string;
  contentUrl?: string;
  resourceType: 'content' | 'url';
  metadata?: Record<string, unknown>;
}

export interface UpdateResourceRequest {
  title?: string;
  description?: string;
  category?: string;   // Domain/technology category
  tags?: string;       // Comma-separated tags
  content?: string;
  contentUrl?: string;
  resourceType?: 'content' | 'url';
  metadata?: Record<string, unknown>;
}

export interface ResourceContent {
  content?: string | null;
  content_type: string;
  resource_type: 'content' | 'url';
  content_url?: string | null;
  metadata?: string | null;
  title?: string | null;
  description?: string | null;
  category?: string | null;  // Domain/technology category
  tags?: string | null;      // Comma-separated tags
}

export type ResourceType = 'chatmodes' | 'instructions' | 'prompts' | 'tasks' | 'mcp';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  details?: string[];
}

export interface ApiError {
  error: string;
  details?: string[];
}