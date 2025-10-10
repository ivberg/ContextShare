// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as https from 'https';
import * as http from 'http';
import { logger } from '../utils/logger';
import { getErrorMessage } from '../utils/errors';
import { ResourceService } from './resourceService';
import { Repository, Resource } from 'src/models';

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
  private resourceService: ResourceService;
  private repo: Repository | null = null;
  private hatsCache: RemoteHatSummary[] | null = null;
  private cacheTimestamp: number = 0;
  private cacheTtlMs: number = 5 * 60 * 1000; // 5 minutes

  constructor(
    resourceService: ResourceService,
  )
  {
    this.resourceService = resourceService;
  }

  init(repo: Repository): void {
    this.repo = repo;
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
    if (!this.repo) {
      await logger.warn('RemoteHatService: No repo configured')
      return [];
    }

    // Check cache
    const now = Date.now();
    if (this.hatsCache && (now - this.cacheTimestamp) < this.cacheTtlMs) {
      return this.hatsCache;
    }

    try {
      const hats: RemoteHatSummary[] = [];
      const resources: Resource[] = await this.resourceService.discoverResources(this.repo);

      // Filter to only show remote resources (not local catalog files)
      const remoteResources = resources.filter(r => r.origin === 'remote');

      // Check if there were any remote errors during discovery
      // If all/most categories failed, we should show the error instead of partial results
      const remoteErrors: string[] = [];
      const categories = ['chatmodes', 'instructions', 'prompts', 'tasks', 'mcp'];
      for (const cat of categories) {
        const error = this.resourceService.getLastRemoteError(cat as any);
        if (error) {
          remoteErrors.push(`${cat}: ${error}`);
        }
      }
      
      // If we have remote errors and no remote resources, propagate the first error
      if (remoteErrors.length > 0 && remoteResources.length === 0) {
        throw new Error(remoteErrors[0].split(': ')[1] || remoteErrors[0]);
      }

      // Group resources by their domainCategory for creating themed hats
      const categorizedResources = new Map<string, any[]>();
      
      for (const resource of remoteResources) {
        const category = resource.domainCategory || 'general';
        if (!categorizedResources.has(category)) {
          categorizedResources.set(category, []);
        }
        categorizedResources.get(category)!.push(resource);
      }

      // Create hats for each category
      for (const [category, categoryResources] of categorizedResources) {
        if (categoryResources.length === 0) continue;

        // Validate and map resources with explicit error handling
        const resourcePaths = categoryResources.map(r => {
          if (r.remoteUrl) return r.remoteUrl;
          if (r.absolutePath) return r.absolutePath;
          // Log warning but continue - don't fail the entire operation
          void logger.warn(`RemoteHatService: Resource ${r.id || '[unknown]'} missing both remoteUrl and absolutePath`);
          return null;
        }).filter((path): path is string => path !== null);

        if (resourcePaths.length === 0) {
          void logger.warn(`RemoteHatService: No valid resources for category ${category}`);
          continue;
        }

        // Create a single hat for the category
        hats.push({
          id: `catalog-${category}`,
          name: `${category} collection`,
          description: `All available ${category} resources (${resourcePaths.length} items)`,
          resources: resourcePaths,
          resourceDetails: categoryResources, // Include full resource metadata
          author: categoryResources[0].catalog_name || 'Catalog',
          rating: undefined
        });
      }

      this.hatsCache = hats;
      this.cacheTimestamp = now;
      
      await logger.info(`RemoteHatService: Generated ${hats.length} hats from ${remoteResources.length} remote resources`);
      return hats;
    } catch (error) {
      await logger.error(`RemoteHatService: Failed to load hats from server: ${getErrorMessage(error)}`);
      // Re-throw the error so the UI can display it to the user
      throw error;
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
      let url: string = resourcePath;
      
      const response = await this.makeRequest(url);
      return response.content || response || null;
    } catch (error) {
      await logger.error(`Failed to download resource ${resourcePath}: ${getErrorMessage(error)}`);
      return null;
    }
  }

  private async applyResourceToWorkspace(resourcePath: string, content: string, workspaceRoot: string, fileService: any): Promise<{ success: boolean; message: string }> {
    try {
      if (!resourcePath || typeof resourcePath !== 'string') {
        return { success: false, message: 'Invalid resource path' };
      }
      
      const path = await import('path');
      const split = resourcePath.split('/');
      const category = split.length > 2 && split[split.length - 2] || 'general';
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
      if (!resourcePath || typeof resourcePath !== 'string') {
        return { success: false, message: 'Invalid resource path' };
      }
      
      const path = await import('path');
      const split = resourcePath.split('/');
      const category = split.length > 2 && split[split.length - 2] || 'general';
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
