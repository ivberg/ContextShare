// Shared types for /catalog/catalog-export endpoint.
// Consumed by both the server and the VS Code extension (client) via TS path mapping.

export type CatalogResourceType = 'chatmodes' | 'instructions' | 'prompts' | 'tasks' | 'mcp';

export interface ResourceExportSummary {
  filename: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string;
  content_type: string;
  resource_type: string; // 'content' | 'url'
  content_url?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;       // Serialized as ISO strings when over the wire
  updated_at: Date;       // (consumer can treat as string if desired)
  content?: string;       // Inlined only if small
  truncated?: boolean;    // True if content omitted due to size
  size?: number;          // Original size when known
}

export interface CatalogExport {
  name: string;
  display_name: string | null;
  description: string | null;
  source_type: string; // 'local' | 'remote'
  source_path?: string;
  source_url?: string;
  created_at: Date;
  updated_at: Date;
  resources: Record<CatalogResourceType, ResourceExportSummary[]>;
}

export interface CatalogExportResponse {
  generated_at: string;
  catalogs: CatalogExport[];
  counts: { catalogs: number; resources: number };
}
