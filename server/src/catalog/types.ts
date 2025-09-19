export interface CatalogProvider {
  list(category: string): Promise<string[]>;
  read(category: string, fileName: string): Promise<Buffer | string>;
  exists(category: string, fileName: string): Promise<boolean>;
  create?(
    catalogId: number,
    type: 'chatmodes' | 'instructions' | 'prompts' | 'tasks' | 'mcp',
    fileName: string,
    content: string | undefined,
    metadata?: Record<string, any>,
    resourceType?: 'content' | 'url',
    contentUrl?: string,
    title?: string,
    description?: string,
    category?: string,
    tags?: string
  ): Promise<void>;
}
