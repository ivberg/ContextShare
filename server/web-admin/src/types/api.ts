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
  category: ResourceCategory;
  filename: string;
  title?: string;
  description?: string;
  content: string;
  content_type: string;
  metadata?: string; // JSON string
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CreateResourceRequest {
  catalogId: number;
  category: ResourceCategory;
  filename: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateResourceRequest {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ResourceContent {
  content: string;
  content_type: string;
  metadata?: string;
  title?: string;
  description?: string;
}

export type ResourceCategory = 'chatmodes' | 'instructions' | 'prompts' | 'tasks' | 'mcp';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  details?: string[];
}

export interface ApiError {
  error: string;
  details?: string[];
}