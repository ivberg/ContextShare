// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { IFileService, Repository } from '../models';
import { logger } from '../utils/logger';

/**
 * Service to manage a persistent local repository for AI resources.
 * This service maintains a clean separation between workspace/user settings 
 * and local resource storage by using a dedicated app data directory.
 */
export class LocalRepoService {
  private _localRepoPath: string | undefined;
  private _initialized = false;

  constructor(private fileService: IFileService) {}

  /**
   * Initialize the local repository in app data directory.
   * This creates a persistent location separate from workspace or VS Code settings.
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Create app data path: ~/AppData/Local/ContextShare (Windows) or ~/.local/share/ContextShare (Linux/Mac)
    const appDataRoot = this.getAppDataPath();
    this._localRepoPath = path.join(appDataRoot, 'ContextShare', 'local-repo');

    try {
      await this.fileService.ensureDirectory(this._localRepoPath);
      await this.initializeRepoStructure();
      this._initialized = true;
      await logger.info(`[LocalRepoService] Initialized local repository at: ${this._localRepoPath}`);
    } catch (error) {
      await logger.error(`[LocalRepoService] Failed to initialize local repository: ${error}`);
      throw error;
    }
  }

  /**
   * Get the local repository path. Must call initialize() first.
   */
  getLocalRepoPath(): string {
    if (!this._initialized || !this._localRepoPath) {
      throw new Error('LocalRepoService not initialized. Call initialize() first.');
    }
    return this._localRepoPath;
  }

  /**
   * Get the local repository as a Repository object for use with existing services.
   */
  getLocalRepository(): Repository {
    const localPath = this.getLocalRepoPath();
    return {
      id: 'local-repo',
      name: 'Local Repository',
      rootPath: localPath,
      catalogPath: path.join(localPath, 'catalog'),
      runtimePath: path.join(localPath, 'runtime'),
      isActive: true
    };
  }

  /**
   * Get the path for storing local hats.
   */
  getLocalHatsPath(): string {
    return path.join(this.getLocalRepoPath(), 'catalog', 'hats');
  }

  /**
   * Get the path for runtime resources (.github equivalent).
   */
  getLocalRuntimePath(): string {
    return path.join(this.getLocalRepoPath(), 'runtime');
  }

  /**
   * Check if the local repository has been initialized.
   */
  isInitialized(): boolean {
    return this._initialized && !!this._localRepoPath;
  }

  /**
   * Reset/clean the local repository (useful for troubleshooting).
   */
  async reset(): Promise<void> {
    if (!this._localRepoPath) return;

    try {
      // Remove the entire local repo directory
      const stat = await this.fileService.stat(this._localRepoPath);
      if (stat === 'dir') {
        // Recursively delete directory contents
        await this.deleteDirectory(this._localRepoPath);
      }
      
      this._initialized = false;
      await logger.info(`[LocalRepoService] Reset local repository at: ${this._localRepoPath}`);
      
      // Re-initialize
      await this.initialize();
    } catch (error) {
      await logger.error(`[LocalRepoService] Failed to reset local repository: ${error}`);
      throw error;
    }
  }

  private getAppDataPath(): string {
    switch (process.platform) {
      case 'win32':
        // On Windows, use LOCALAPPDATA or fallback to default path
        const localAppData = (process as any).env?.LOCALAPPDATA;
        return localAppData || path.join(os.homedir(), 'AppData', 'Local');
      case 'darwin':
        return path.join(os.homedir(), 'Library', 'Application Support');
      default: // Linux and others
        const xdgDataHome = (process as any).env?.XDG_DATA_HOME;
        return xdgDataHome || path.join(os.homedir(), '.local', 'share');
    }
  }

  private async initializeRepoStructure(): Promise<void> {
    if (!this._localRepoPath) return;

    // Create the standard catalog structure
    const catalogPath = path.join(this._localRepoPath, 'catalog');
    const runtimePath = path.join(this._localRepoPath, 'runtime');
    
    await this.fileService.ensureDirectory(catalogPath);
    await this.fileService.ensureDirectory(runtimePath);
    
    // Create category directories in catalog
    const categories = ['hats', 'chatmodes', 'instructions', 'prompts', 'tasks', 'mcp'];
    for (const category of categories) {
      await this.fileService.ensureDirectory(path.join(catalogPath, category));
    }

    // Create runtime category directories 
    const runtimeCategories = ['chatmodes', 'instructions', 'prompts', 'tasks'];
    for (const category of runtimeCategories) {
      await this.fileService.ensureDirectory(path.join(runtimePath, category));
    }

    // Create .vscode directory for MCP configs
    await this.fileService.ensureDirectory(path.join(runtimePath, '.vscode'));

    // Create a README to document the purpose
    const readmePath = path.join(this._localRepoPath, 'README.md');
    const readmeContent = `# ContextShare Local Repository

This directory contains locally managed AI resources that are separate from workspace and user settings.

## Structure

- \`catalog/\` - Local catalog resources (hats, templates, etc.)
- \`runtime/\` - Active/applied resources (equivalent to .github in workspace)

This location is managed by the ContextShare VS Code extension and provides a clean separation between:
- Remote catalogs (discovered from URLs)
- Workspace catalogs (in project repositories) 
- Local resources (in this persistent app data location)

Created: ${new Date().toISOString()}
`;
    
    try {
      await this.fileService.stat(readmePath);
      // README already exists, don't overwrite
    } catch {
      // README doesn't exist, create it
      await this.fileService.writeFile(readmePath, readmeContent);
    }
  }

  private async deleteDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await this.fileService.listDirectory(dirPath);
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = await this.fileService.stat(fullPath);
        if (stat === 'dir') {
          await this.deleteDirectory(fullPath);
        } else if (stat === 'file') {
          if (this.fileService.deleteFile) {
            await this.fileService.deleteFile(fullPath);
          }
        }
      }
      // After clearing contents, remove the directory itself
      await fs.rmdir(dirPath);
    } catch (error) {
      await logger.warn(`[LocalRepoService] Error deleting directory ${dirPath}: ${error}`);
    }
  }
}
