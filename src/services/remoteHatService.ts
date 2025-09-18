// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export interface RemoteHatSummary {
  id: string;
  name: string;
  description?: string;
  resources: string[];
  rating?: number;
  author?: string;
}

export class RemoteHatService {
  private readonly remoteStoreBasePath = 'D:\\ctxremote';
  private readonly storeJsonPath = path.join(this.remoteStoreBasePath, 'store.json');
  private hatsCache: RemoteHatSummary[] | null = null;

  private async loadHats(): Promise<RemoteHatSummary[]> {
    if (this.hatsCache) {
      return this.hatsCache;
    }

    try {
      if (!fs.existsSync(this.storeJsonPath)) {
        await logger.warn(`Remote store not found at ${this.storeJsonPath}`);
        return [];
      }

      const storeContent = fs.readFileSync(this.storeJsonPath, 'utf8');
      const hats = JSON.parse(storeContent) as RemoteHatSummary[];
      this.hatsCache = hats;
      await logger.info(`Loaded ${hats.length} hats from remote store`);
      return hats;
    } catch (error) {
      await logger.error(`Failed to load remote store: ${error}`);
      return [];
    }
  }

  async queryHats(query: string): Promise<RemoteHatSummary[]> {
    const q = (query || '').trim().toLowerCase();
    const hats = await this.loadHats();
    
    if (!q) {
      // Return all hats when no query is provided
      await logger.info(`RemoteHatService.queryHats no query -> ${hats.length} total hats`);
      return hats;
    }
    
    const res = hats.filter((h: RemoteHatSummary) =>
      h.name.toLowerCase().includes(q) ||
      (h.description || '').toLowerCase().includes(q) ||
      h.id.toLowerCase().includes(q)
    );
    await logger.info(`RemoteHatService.queryHats q="${q}" -> ${res.length}`);
    return res;
  }

  async getHat(id: string): Promise<RemoteHatSummary | undefined> {
    const hats = await this.loadHats();
    const hat = hats.find((h: RemoteHatSummary) => h.id === id);
    await logger.info(`RemoteHatService.getHat id=${id} found=${!!hat}`);
    return hat;
  }

  async pullHat(id: string, targetWorkspacePath: string): Promise<boolean> {
    try {
      const hat = await this.getHat(id);
      if (!hat) {
        await logger.error(`Hat with id ${id} not found`);
        return false;
      }

      // Create the hat JSON file with resource references
      const hatFileName = `${hat.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()}.json`;
      const hatFilePath = path.join(targetWorkspacePath, '.github', 'hats', hatFileName);
      
      // Ensure the hats directory exists
      const hatsDir = path.dirname(hatFilePath);
      if (!fs.existsSync(hatsDir)) {
        fs.mkdirSync(hatsDir, { recursive: true });
      }

      // Create hat content with collected resources
      const collectedResources: string[] = [];
      
      // Copy each resource from remote to local
      for (const resourcePath of hat.resources) {
        const remoteResourcePath = path.join(this.remoteStoreBasePath, resourcePath);
        
        if (fs.existsSync(remoteResourcePath)) {
          const targetResourcePath = path.join(targetWorkspacePath, '.github', resourcePath);
          const targetResourceDir = path.dirname(targetResourcePath);
          
          // Ensure target directory exists
          if (!fs.existsSync(targetResourceDir)) {
            fs.mkdirSync(targetResourceDir, { recursive: true });
          }
          
          // Copy the resource file
          fs.copyFileSync(remoteResourcePath, targetResourcePath);
          collectedResources.push(resourcePath);
          await logger.info(`Copied resource: ${resourcePath}`);
        } else {
          await logger.warn(`Resource not found: ${remoteResourcePath}`);
        }
      }

      // Create the hat file with metadata and resource list
      const hatContent = {
        id: hat.id,
        name: hat.name,
        description: hat.description,
        author: hat.author,
        rating: hat.rating,
        resources: collectedResources,
        pulledAt: new Date().toISOString()
      };

      fs.writeFileSync(hatFilePath, JSON.stringify(hatContent, null, 2), 'utf8');
      await logger.info(`Created hat file: ${hatFilePath} with ${collectedResources.length} resources`);
      
      return true;
    } catch (error) {
      await logger.error(`Failed to pull hat ${id}: ${error}`);
      return false;
    }
  }

  clearCache(): void {
    this.hatsCache = null;
  }
}
