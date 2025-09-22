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
  resourceDetails?: RemoteResourceDetail[]; // Full resource metadata
  rating?: number;
  author?: string;
}

export interface RemoteResourceDetail {
  id: number;
  type: string;
  category: string;
  tags: string;
  filename: string;
  title: string;
  description: string;
  content_url: string;
  catalog_name: string;
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
            if (res.statusCode === 302) {
              const location = res.headers.location;
              if (location) {
                // Follow redirect
                this.makeRequest(location).then(resolve).catch(reject);
                return;
              }
            }
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
      const adminUrl = this.baseUrl.replace('/catalog', '/admin/catalogs/1');
      const indexUrl = `${adminUrl}/resources`;
      const resources: any[] = await this.makeRequest(indexUrl);

      // Group resources by category for creating themed hats
      const categorizedResources = new Map<string, any[]>();
      
      for (const resource of resources) {
        const category = resource.category || 'general';
        if (!categorizedResources.has(category)) {
          categorizedResources.set(category, []);
        }
        categorizedResources.get(category)!.push(resource);
      }

      // Create hats for each category
      for (const [category, categoryResources] of categorizedResources) {
        if (categoryResources.length === 0) continue;

        // Create a single hat for the category
        hats.push({
          id: `catalog-${category}`,
          name: `${category} collection`,
          description: `All available ${category} resources (${categoryResources.length} items)`,
          resources: categoryResources.map(r => r.content_url || r.filename),
          resourceDetails: categoryResources, // Include full resource metadata
          author: categoryResources[0].catalog_name || 'Catalog',
          rating: undefined
        });
      }

      this.hatsCache = hats;
      this.cacheTimestamp = now;
      
      await logger.info(`RemoteHatService: Generated ${hats.length} hats from ${resources.length} resources`);
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

  async applyHatToWorkspace(id: string): Promise<{ success: boolean; message?: string; appliedCount?: number }> {
    try {
      // Get the hat details
      const hat = await this.getHat(id);
      if (!hat) {
        return { success: false, message: 'Hat not found' };
      }

      // Import necessary modules
      const vscode = await import('vscode');
      const { ResourceService } = await import('./resourceService');
      const { FileService } = await import('./fileService');
      
      // Get current workspace
      if (!vscode.workspace.workspaceFolders?.length) {
        return { success: false, message: 'No workspace is open' };
      }
      
      const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
      
      // Create service instances
      const fileService = new FileService();
      const resourceService = new ResourceService(fileService);
      resourceService.setCurrentWorkspaceRoot(workspaceRoot);

      let appliedCount = 0;
      const errors: string[] = [];

      // Apply each resource directly from remote
      for (const resourcePath of hat.resources) {
        try {
          // Download resource content
          const content = await this.downloadResourceContent(resourcePath);
          if (!content) {
            errors.push(`Failed to download ${resourcePath}`);
            continue;
          }

          // Apply to workspace based on resource type
          const result = await this.applyResourceToWorkspace(resourcePath, content, workspaceRoot, fileService);
          if (result.success) {
            appliedCount++;
          } else {
            errors.push(`${resourcePath}: ${result.message}`);
          }
        } catch (error: any) {
          errors.push(`${resourcePath}: ${error?.message || 'Unknown error'}`);
        }
      }

      const success = appliedCount > 0;
      const message = errors.length > 0 ? `Applied ${appliedCount} resources with ${errors.length} errors` : undefined;
      
      return { success, message, appliedCount };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Unknown error' };
    }
  }

  async applyHatToUser(id: string): Promise<{ success: boolean; message?: string; appliedCount?: number }> {
    try {
      // Get the hat details
      const hat = await this.getHat(id);
      if (!hat) {
        return { success: false, message: 'Hat not found' };
      }

      // Import necessary modules
      const { FileService } = await import('./fileService');
      
      // Create service instances
      const fileService = new FileService();
      
      // Get VS Code user data path
      const userDataPath = this.getVSCodeUserDataPath();
      if (!userDataPath) {
        return { success: false, message: 'Could not determine VS Code user data directory' };
      }

      let appliedCount = 0;
      const errors: string[] = [];

      // Apply each resource directly from remote to user settings
      for (const resourcePath of hat.resources) {
        try {
          // Download resource content
          const content = await this.downloadResourceContent(resourcePath);
          if (!content) {
            errors.push(`Failed to download ${resourcePath}`);
            continue;
          }

          // Apply to user settings based on resource type
          const result = await this.applyResourceToUser(resourcePath, content, userDataPath, fileService);
          if (result.success) {
            appliedCount++;
          } else {
            errors.push(`${resourcePath}: ${result.message}`);
          }
        } catch (error: any) {
          errors.push(`${resourcePath}: ${error?.message || 'Unknown error'}`);
        }
      }

      const success = appliedCount > 0;
      const message = errors.length > 0 ? `Applied ${appliedCount} resources with ${errors.length} errors` : undefined;
      
      return { success, message, appliedCount };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Unknown error' };
    }
  }

  private async downloadResourceContent(resourcePath: string): Promise<string | null> {
    try {
      // If resourcePath is already a full URL (from content_url), use it directly
      let url: string;
      if (resourcePath.startsWith('http://') || resourcePath.startsWith('https://')) {
        url = resourcePath;
      } else {
        // Fallback to old path construction for compatibility
        const category = resourcePath.split('/')[0];
        const filename = resourcePath.split('/').slice(1).join('/');
        url = `${this.baseUrl}/${category}/${filename}`;
      }
      
      const response = await this.makeRequest(url);
      return response.content || response || null;
    } catch (error) {
      await logger.error(`Failed to download resource ${resourcePath}: ${getErrorMessage(error)}`);
      return null;
    }
  }

  private async applyResourceToWorkspace(resourcePath: string, content: string, workspaceRoot: string, fileService: any): Promise<{ success: boolean; message: string }> {
    try {
      const path = await import('path');
      const category = resourcePath.split('/')[0];
      const filename = path.basename(resourcePath);
      
      // Determine target directory based on category
      let targetDir: string;
      switch (category) {
        case 'tasks':
        case 'mcp':
          targetDir = path.join(workspaceRoot, '.vscode');
          break;
        default:
          targetDir = path.join(workspaceRoot, '.github', category);
          break;
      }
      
      const targetPath = path.join(targetDir, filename);
      
      // Ensure directory exists
      await fileService.ensureDirectory(targetDir);
      
      // Write the file
      await fileService.writeFile(targetPath, content);
      
      return {
        success: true,
        message: `Applied ${filename} to workspace`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to apply resource: ${error?.message || 'Unknown error'}`
      };
    }
  }

  private async applyResourceToUser(resourcePath: string, content: string, userDataPath: string, fileService: any): Promise<{ success: boolean; message: string }> {
    try {
      const path = await import('path');
      const category = resourcePath.split('/')[0];
      const filename = path.basename(resourcePath);
      
      // Determine target path based on category
      let targetPath: string;
      switch (category) {
        case 'tasks':
          // Merge with existing tasks.json
          targetPath = path.join(userDataPath, 'tasks.json');
          return await this.mergeTasksToUser(content, targetPath, fileService);
        
        case 'mcp':
          // Merge with existing mcp.json
          targetPath = path.join(userDataPath, 'mcp.json');
          return await this.mergeMcpToUser(content, targetPath, fileService);
        
        default:
          // Copy to copilot-catalog subdirectory
          const effectiveCategory = category === 'chatmodes' && 'prompts' || category;
          const targetDir = path.join(userDataPath, effectiveCategory);
          targetPath = path.join(targetDir, filename);
          
          await fileService.ensureDirectory(targetDir);
          await fileService.writeFile(targetPath, content);
          
          return {
            success: true,
            message: `Applied ${filename} to user ${category}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to apply resource: ${error?.message || 'Unknown error'}`
      };
    }
  }

  private getVSCodeUserDataPath(): string | null {
    try {
      const os = require('os');
      const path = require('path');
      const homeDir = os.homedir();
      return path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User');
    } catch {
      return null;
    }
  }

  private async mergeTasksToUser(content: string, targetPath: string, fileService: any): Promise<{ success: boolean; message: string }> {
    try {
      const sourceTasks = JSON.parse(content);
      
      let existingTasks = { tasks: [] };
      if (await fileService.pathExists(targetPath)) {
        const existingContent = await fileService.readFile(targetPath);
        existingTasks = JSON.parse(existingContent);
      }
      
      // Merge tasks (simple append for now)
      const mergedTasks = { ...existingTasks, ...sourceTasks };
      
      const path = await import('path');
      await fileService.ensureDirectory(path.dirname(targetPath));
      await fileService.writeFile(targetPath, JSON.stringify(mergedTasks, null, 2));
      
      return {
        success: true,
        message: 'Tasks merged successfully'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to merge tasks: ${error?.message || 'Unknown error'}`
      };
    }
  }

  private async mergeMcpToUser(content: string, targetPath: string, fileService: any): Promise<{ success: boolean; message: string }> {
    try {
      const sourceMcp = JSON.parse(content);
      
      let existingMcp = { mcpServers: {} };
      if (await fileService.pathExists(targetPath)) {
        const existingContent = await fileService.readFile(targetPath);
        existingMcp = JSON.parse(existingContent);
      }
      
      // Merge MCP servers
      if (sourceMcp.mcpServers) {
        Object.assign(existingMcp.mcpServers, sourceMcp.mcpServers);
      }
      
      const path = await import('path');
      await fileService.ensureDirectory(path.dirname(targetPath));
      await fileService.writeFile(targetPath, JSON.stringify(existingMcp, null, 2));
      
      return {
        success: true,
        message: 'MCP servers merged successfully'
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to merge MCP config: ${error?.message || 'Unknown error'}`
      };
    }
  }

  clearCache(): void {
    this.hatsCache = null;
    this.cacheTimestamp = 0;
  }
}
