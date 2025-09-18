export interface CatalogProvider {
  list(category: string): Promise<string[]>;
  read(category: string, fileName: string): Promise<Buffer | string>;
  exists(category: string, fileName: string): Promise<boolean>;
}
