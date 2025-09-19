import fs from 'fs/promises';
import path from 'path';
import { CatalogProvider } from './types';

const MAX_FILE_BYTES = 1_000_000; // 1MB safety cap

function sanitizeName(name: string): string {
  if(name.includes('..') || name.includes('/') || name.includes('\\')){
    throw new Error('invalid_name');
  }
  return name;
}

export class FileSystemCatalogProvider implements CatalogProvider {
  constructor(private root: string){}

  private categoryDir(category: string): string {
    return path.join(this.root, category);
  }

  async list(category: string): Promise<string[]> {
    const dir = this.categoryDir(category);
    const entries = await fs.readdir(dir).catch(()=> []);
    return entries.filter(e => !e.startsWith('.') && !e.endsWith('index.json'));
  }

  async read(category: string, fileName: string): Promise<Buffer | string> {
    const safe = sanitizeName(fileName);
    const full = path.join(this.categoryDir(category), safe);
    try {
      const data = await fs.readFile(full);
      if(data.byteLength > MAX_FILE_BYTES){
        const err = new Error('file too large') as Error & { code: string };
        err.code = 'file_too_large';
        throw err;
      }
      return data;
    } catch (e: unknown){
      if(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT'){
        const nf = new Error('not found') as Error & { code: string };
        nf.code = 'not_found';
        throw nf;
      }
      throw e;
    }
  }

  async exists(category: string, fileName: string): Promise<boolean> {
    try {
      const safe = sanitizeName(fileName);
      const full = path.join(this.categoryDir(category), safe);
      await fs.access(full);
      return true;
    } catch { return false; }
  }
}
