// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as https from 'https';
import * as http from 'http';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';

export interface RemoteHatSummary {
  id: string;
  name: string;
  description?: string;
  resources: string[];
  rating?: number;
  author?: string;
}

export class RemoteHatService {
  private baseUrl: string = '';
  private hatsCache: RemoteHatSummary[] | null = null;
  private cacheTimestamp: number = 0;
  private cacheTtlMs: number = 5 * 60 * 1000; // 5 minutes

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, ''); // Remove trailing slash
    this.clearCache();
  }

  private async makeRequest(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https:') ? https : http;
      
      client.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              return;
            }
            
            // Try to parse as JSON first, fallback to raw text
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data); // Return raw text for non-JSON responses
            }
          } catch (error) {
            reject(new Error(`Response processing error: ${getErrorMessage(error)}`));
          }
        });
      }).on('error', reject);
    });
  }

  private async loadHatsFromServer(): Promise<RemoteHatSummary[]> {
    if (!this.baseUrl) {
      await logger.warn('RemoteHatService: No base URL configured');
      return [];
    }

    // Check cache
    const now = Date.now();
    if (this.hatsCache && (now - this.cacheTimestamp) < this.cacheTtlMs) {
      return this.hatsCache;
    }

    try {
      const hats: RemoteHatSummary[] = [];
      const categories = ['chatmodes', 'instructions', 'prompts', 'tasks', 'mcp'];

      // For each category, get the index and create category-based hats
      for (const category of categories) {
        try {
          const indexUrl = `${this.baseUrl}/${category}/index.json`;
          const filenames: string[] = await this.makeRequest(indexUrl);
          
          if (filenames && filenames.length > 0) {
            // Create a category-based hat
            const resourcePaths = filenames.map(filename => `${category}/${filename}`);

            // If there are many resources, create smaller themed hats based on filename patterns
            if (filenames.length > 10) {
              // Group by common prefixes or keywords in filenames
              const groups = new Map<string, string[]>();
              filenames.forEach(filename => {
                const baseName = filename.replace(/\.(chatmode|instructions|prompt|task|mcp)\.md$/, '');
                const words = baseName.split(/[-_\s]+/);
                
                // Use first meaningful word as grouping key
                const groupKey = words.find(w => w.length > 3) || words[0] || 'misc';
                if (!groups.has(groupKey)) {
                  groups.set(groupKey, []);
                }
                groups.get(groupKey)!.push(`${category}/${filename}`);
              });

              // Create hats for groups with multiple items
              for (const [groupKey, groupResources] of groups) {
                if (groupResources.length >= 2) {
                  hats.push({
                    id: `catalog-${category}-${groupKey}`,
                    name: `${groupKey} ${category}`,
                    description: `${groupKey}-related ${category} resources`,
                    resources: groupResources,
                    author: 'Catalog',
                    rating: undefined
                  });
                }
              }
            }
          }
        } catch (error) {
          await logger.warn(`RemoteHatService: Failed to load ${category}: ${getErrorMessage(error)}`);
          // Continue with other categories
        }
      }

      this.hatsCache = hats;
      this.cacheTimestamp = now;
      
      await logger.info(`RemoteHatService: Generated ${hats.length} hats from catalog API`);
      return hats;
    } catch (error) {
      await logger.error(`RemoteHatService: Failed to load hats from server: ${getErrorMessage(error)}`);
      return [];
    }
  }

  async queryHats(query: string): Promise<RemoteHatSummary[]> {
    const q = (query || '').trim().toLowerCase();
    const hats = await this.loadHatsFromServer();
    
    if (!q) {
      // Return all hats when no query is provided
      await logger.info(`RemoteHatService.queryHats no query -> ${hats.length} total hats`);
      return hats;
    }
    
    const res = hats.filter((h: RemoteHatSummary) =>
      h.name.toLowerCase().includes(q) ||
      (h.description || '').toLowerCase().includes(q) ||
      h.id.toLowerCase().includes(q) ||
      (h.author || '').toLowerCase().includes(q)
    );
    await logger.info(`RemoteHatService.queryHats q="${q}" -> ${res.length}`);
    return res;
  }

  async getHat(id: string): Promise<RemoteHatSummary | undefined> {
    const hats = await this.loadHatsFromServer();
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

      if (!this.baseUrl) {
        await logger.error('RemoteHatService: No base URL configured');
        return false;
      }

      // Create the hat JSON file with resource references
      const hatFileName = `${hat.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()}.json`;
      const hatFilePath = require('path').join(targetWorkspacePath, '.github', 'hats', hatFileName);
      
      // Ensure the hats directory exists
      const fs = require('fs');
      const path = require('path');
      const hatsDir = path.dirname(hatFilePath);
      if (!fs.existsSync(hatsDir)) {
        fs.mkdirSync(hatsDir, { recursive: true });
      }

      // Download each resource from server to local
      const collectedResources: string[] = [];
      
      for (const resourcePath of hat.resources) {
        try {
          // Parse resource path (e.g., "instructions/example.instructions.md")
          const [category, filename] = resourcePath.split('/');
          const resourceUrl = `${this.baseUrl}/catalog/${category}/${filename}`;
          
          // Download resource content
          const content = await this.makeRequest(resourceUrl);
          
          // Save to local runtime directory
          const targetResourcePath = path.join(targetWorkspacePath, '.github', resourcePath);
          const targetResourceDir = path.dirname(targetResourcePath);
          
          // Ensure target directory exists
          if (!fs.existsSync(targetResourceDir)) {
            fs.mkdirSync(targetResourceDir, { recursive: true });
          }
          
          // Write the resource file
          fs.writeFileSync(targetResourcePath, content, 'utf8');
          collectedResources.push(resourcePath);
          await logger.info(`Downloaded and saved resource: ${resourcePath}`);
        } catch (error) {
          await logger.warn(`Failed to download resource ${resourcePath}: ${getErrorMessage(error)}`);
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
        pulledAt: new Date().toISOString(),
        sourceServer: this.baseUrl
      };

      fs.writeFileSync(hatFilePath, JSON.stringify(hatContent, null, 2), 'utf8');
      await logger.info(`Created hat file: ${hatFilePath} with ${collectedResources.length} resources`);
      
      return true;
    } catch (error) {
      await logger.error(`Failed to pull hat ${id}: ${getErrorMessage(error)}`);
      return false;
    }
  }

  /**
   * Pull a hat and its resources to the local repository structure.
   * Uses catalog/runtime structure instead of .github structure.
   */
  async pullHatToLocal(id: string, localRepoPath: string): Promise<boolean> {
    try {
      const hat = await this.getHat(id);
      if (!hat) {
        await logger.error(`Hat with id ${id} not found`);
        return false;
      }

      if (!this.baseUrl) {
        await logger.error('RemoteHatService: No base URL configured');
        return false;
      }

      // Create the hat JSON file in the catalog/hats directory
      const fs = require('fs');
      const path = require('path');
      const hatFileName = `${hat.name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()}.json`;
      const hatFilePath = path.join(localRepoPath, 'catalog', 'hats', hatFileName);
      
      // Ensure the hats directory exists
      const hatsDir = path.dirname(hatFilePath);
      if (!fs.existsSync(hatsDir)) {
        fs.mkdirSync(hatsDir, { recursive: true });
      }

      // Download each resource from server to local catalog structure
      const collectedResources: string[] = [];
      
      for (const resourcePath of hat.resources) {
        try {
          // Parse resource path (e.g., "instructions/example.instructions.md")
          const [category, filename] = resourcePath.split('/');
          const resourceUrl = `${this.baseUrl}/catalog/${category}/${filename}`;
          
          // Download resource content
          const content = await this.makeRequest(resourceUrl);
          
          // Place resources in catalog directory (not runtime)
          const targetResourcePath = path.join(localRepoPath, 'catalog', resourcePath);
          const targetResourceDir = path.dirname(targetResourcePath);
          
          // Ensure target directory exists
          if (!fs.existsSync(targetResourceDir)) {
            fs.mkdirSync(targetResourceDir, { recursive: true });
          }
          
          // Write the resource file
          fs.writeFileSync(targetResourcePath, content, 'utf8');
          collectedResources.push(resourcePath);
          await logger.info(`Downloaded resource to local catalog: ${resourcePath}`);
        } catch (error) {
          await logger.warn(`Failed to download resource ${resourcePath}: ${getErrorMessage(error)}`);
        }
      }

      // Create the hat file with metadata and resource list
      const hatContent = {
        name: hat.name,
        description: hat.description,
        resources: collectedResources,
        // Store metadata about the remote source
        _metadata: {
          remoteId: hat.id,
          author: hat.author,
          rating: hat.rating,
          pulledAt: new Date().toISOString(),
          sourceServer: this.baseUrl
        }
      };

      fs.writeFileSync(hatFilePath, JSON.stringify(hatContent, null, 2), 'utf8');
      await logger.info(`Created local hat file: ${hatFilePath} with ${collectedResources.length} resources`);
      
      return true;
    } catch (error) {
      await logger.error(`Failed to pull hat ${id} to local repository: ${getErrorMessage(error)}`);
      return false;
    }
  }

  clearCache(): void {
    this.hatsCache = null;
    this.cacheTimestamp = 0;
  }
}
