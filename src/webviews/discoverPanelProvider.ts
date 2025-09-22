// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import * as path from 'path';
import { HatService } from '../services/hatService';
import { RemoteHatService } from '../services/remoteHatService';
import { Repository } from '../models';

interface DiscoverResult { 
  id: string; 
  label: string; 
  description?: string;
  resourceBreakdown?: string; // Category breakdown of resources
  isLocal?: boolean; // For local resources
  isPulled?: boolean; // For remote resources that exist locally
  isAppliedToWorkspace?: boolean; // For remote resources applied to workspace
  isAppliedToUser?: boolean; // For remote resources applied to user settings
}

type TabType = 'remote' | 'local';

export class DiscoverPanelProvider {
  private static readonly viewType = 'copilotCatalogDiscover';
  private static currentPanel: DiscoverPanelProvider | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private lastQuery: string = '';
  private remoteResults: DiscoverResult[] = [];
  private localResults: DiscoverResult[] = [];
  private activeTab: TabType = 'remote';
  private repo?: Repository;
  private localRepo?: Repository;

  public static createOrShow(
    context: vscode.ExtensionContext,
    hatService: HatService,
    remoteHatService: RemoteHatService,
    repository?: Repository,
    localRepository?: Repository
  ) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    // If we already have a panel, show it.
    if (DiscoverPanelProvider.currentPanel) {
      DiscoverPanelProvider.currentPanel._panel.reveal(column);
      DiscoverPanelProvider.currentPanel.setRepository(repository);
      DiscoverPanelProvider.currentPanel.setLocalRepository(localRepository);
      return;
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      DiscoverPanelProvider.viewType,
      'Discover AI Resources',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri]
      }
    );

    DiscoverPanelProvider.currentPanel = new DiscoverPanelProvider(
      panel,
      context,
      hatService,
      remoteHatService,
      repository,
      localRepository
    );
  }

  public static revive(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    hatService: HatService,
    remoteHatService: RemoteHatService,
    repository?: Repository,
    localRepository?: Repository
  ) {
    DiscoverPanelProvider.currentPanel = new DiscoverPanelProvider(
      panel,
      context,
      hatService,
      remoteHatService,
      repository,
      localRepository
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly hatService: HatService,
    private readonly remoteHatService: RemoteHatService,
    repository?: Repository,
    localRepository?: Repository
  ) {
    this._panel = panel;
    this.repo = repository;
    this.localRepo = localRepository;

    // Set the webview's initial html content
    this._update();

    // Load initial data based on active tab
    this.loadInitialData();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'discover.search':
            this.lastQuery = (message.query || '').trim();
            await this.performSearch(this.lastQuery);
            break;
          case 'discover.switchTab':
            this.activeTab = message.tab as TabType;
            await this.loadDataForCurrentTab();
            break;
          case 'discover.action':
            if (message.action === 'activate' && message.id) {
              await this.pullHatToLocal(String(message.id));
            } else if (message.action === 'apply-workspace' && message.id) {
              await this.applyLocalHatToWorkspace(String(message.id));
            } else if (message.action === 'apply-user' && message.id) {
              await this.applyLocalHatToUser(String(message.id));
            } else if (message.action === 'apply-workspace-remote' && message.id) {
              await this.applyRemoteHatToWorkspace(String(message.id));
            } else if (message.action === 'apply-user-remote' && message.id) {
              await this.applyRemoteHatToUser(String(message.id));
            }
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public setRepository(repo: Repository | undefined) {
    this.repo = repo;
    this._update();
    // Reload data when repository changes
    this.loadInitialData();
  }

  public setLocalRepository(localRepo: Repository | undefined) {
    this.localRepo = localRepo;
    this._update();
    // Reload data when local repository changes
    this.loadInitialData();
  }

  private async loadInitialData() {
    if (this.activeTab === 'remote') {
      await this.loadAllRemoteResources();
    } else {
      await this.loadAllLocalResources();
    }
  }

  private async loadDataForCurrentTab() {
    this.lastQuery = ''; // Clear search when switching tabs
    await this.loadInitialData();
  }

  private async getLocalHats(): Promise<DiscoverResult[]> {
    if (!this.localRepo) return [];
    
    try {
      // Use the local repository for discovering local hats
      const hats = await this.hatService.discoverLocalHats();
      return hats.map(hat => ({
        id: hat.id,
        label: hat.name,
        description: hat.description,
        resourceBreakdown: this.calculateResourceBreakdown(hat.resources),
        isLocal: true
      }));
    } catch (error) {
      console.error('Failed to load local hats:', error);
      return [];
    }
  }

  private async performSearch(q: string) {
    if (this.activeTab === 'remote') {
      const items = await this.remoteHatService.queryHats(q);
      // Check which remote items are already pulled locally
      const localHats = await this.getLocalHats();
      this.remoteResults = await Promise.all(items.map(async i => {
        // Get full hat data to calculate resource breakdown
        const fullHat = await this.remoteHatService.getHat(i.id);
        const resourceBreakdown = fullHat ? this.calculateResourceBreakdown(fullHat.resources) : 'Loading...';
        
        // Check application status
        const isAppliedToWorkspace = await this.checkWorkspaceApplicationStatus(i.id);
        const isAppliedToUser = await this.checkUserApplicationStatus(i.id);
        
        return {
          id: i.id,
          label: i.name,
          description: i.description,
          resourceBreakdown,
          isPulled: localHats.some(local => local.id === i.id || local.label === i.name),
          isAppliedToWorkspace,
          isAppliedToUser
        };
      }));
    } else {
      // Search local resources
      const localHats = await this.getLocalHats();
      const query = q.toLowerCase();
      this.localResults = localHats.filter(hat => 
        !query || 
        hat.label.toLowerCase().includes(query) ||
        (hat.description || '').toLowerCase().includes(query)
      );
    }
    this._update();
  }

  private calculateResourceBreakdown(resources: string[]): string {
    const categoryCounts = new Map<string, number>();
    
    resources.forEach(resourcePath => {
      const category = resourcePath.split('/')[0];
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });

    const breakdown = Array.from(categoryCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([category, count]) => `${count} ${category}`)
      .join(', ');
    
    return breakdown || 'No resources';
  }

  private async loadAllRemoteResources() {
    try {
      // Show loading state
      this.remoteResults = [];
      this._update();

      // Load all available remote resources and check local status
      const items = await this.remoteHatService.queryHats('');
      const localHats = await this.getLocalHats();
      
      this.remoteResults = await Promise.all(items.map(async i => {
        // Get full hat data to calculate resource breakdown
        const fullHat = await this.remoteHatService.getHat(i.id);
        const resourceBreakdown = fullHat ? this.calculateResourceBreakdown(fullHat.resources) : 'Loading...';
        
        // Check application status
        const isAppliedToWorkspace = await this.checkWorkspaceApplicationStatus(i.id);
        const isAppliedToUser = await this.checkUserApplicationStatus(i.id);
        
        return {
          id: i.id,
          label: i.name,
          description: i.description,
          resourceBreakdown,
          isPulled: localHats.some(local => local.id === i.id || local.label === i.name),
          isAppliedToWorkspace,
          isAppliedToUser
        };
      }));
      this._update();
    } catch (error) {
      console.error('Failed to load remote resources:', error);
      this.remoteResults = [];
      this._update();
    }
  }

  private async loadAllLocalResources() {
    try {
      this.localResults = await this.getLocalHats();
      this._update();
    } catch (error) {
      console.error('Failed to load local resources:', error);
      this.localResults = [];
      this._update();
    }
  }

  private async pullHatToLocal(id: string) {
    try {
      if (!this.localRepo) {
        vscode.window.showWarningMessage('No local repository available to save hat.');
        return;
      }

      const hat = await this.remoteHatService.getHat(id);
      if (!hat) {
        vscode.window.showWarningMessage('Hat not found in remote store.');
        return;
      }

      // Use the new pullHatToLocal method that handles the local repository structure correctly
      const success = await this.remoteHatService.pullHatToLocal(id, this.localRepo.rootPath);

      if (success) {
        vscode.window.showInformationMessage(`Successfully pulled hat "${hat.name}" with ${hat.resources.length} resources to local repository.`);
        
        // Refresh both remote and local results to update status
        await this.loadAllRemoteResources();
        await this.loadAllLocalResources();
      } else {
        vscode.window.showErrorMessage(`Failed to pull hat "${hat.name}". Check that remote resources exist.`);
      }
      
    } catch (e: any) {
      vscode.window.showErrorMessage('Failed to pull hat: ' + (e?.message || e));
    }
  }

  private async applyLocalHatToWorkspace(id: string) {
    try {
      if (!this.localRepo) {
        vscode.window.showWarningMessage('No local repository available to apply hat.');
        return;
      }

      // Check if workspace is available
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showWarningMessage('No workspace is open. Please open a folder or workspace first.');
        return;
      }

      // Find the local hat by ID
      const localHats = await this.hatService.discoverLocalHats();
      const hat = localHats.find(h => h.id === id);
      
      if (!hat) {
        vscode.window.showWarningMessage('Local hat not found.');
        return;
      }

      // Show confirmation
      const choice = await vscode.window.showInformationMessage(
        `Apply hat "${hat.name}" to workspace?`,
        { 
          detail: `This will copy ${hat.resources.length} resources from the local repository to your workspace's .github or .vscode directory (as appropriate for each resource type).`,
          modal: true 
        },
        'Apply to Workspace', 'Cancel'
      );
      
      if (choice !== 'Apply to Workspace') {
        return;
      }

      // Create a temporary "virtual" catalog repository pointing to the local repo
      // so we can use the existing resource activation infrastructure
      const virtualRepo = {
        id: 'local-virtual',
        name: 'Local Virtual',
        rootPath: this.localRepo.rootPath,
        catalogPath: path.join(this.localRepo.rootPath, 'catalog'),
        runtimePath: path.join(this.localRepo.rootPath, '.github'),
        isActive: true
      };

      // Import necessary modules
      const { ResourceService } = await import('../services/resourceService');
      const { FileService } = await import('../services/fileService');
      const { ResourceCategory, ResourceState } = await import('../models');

      // Create service instances
      const fileService = new FileService();
      const resourceService = new ResourceService(fileService);
      
      // Configure to target current workspace
      const currentWorkspace = vscode.workspace.workspaceFolders[0].uri.fsPath;
      resourceService.setCurrentWorkspaceRoot(currentWorkspace);

      // Discover resources from the local catalog
      const allResources = await resourceService.discoverResources(virtualRepo);
      
      // Find resources that match the hat's resource list
      const resourcesToActivate = [];
      const missingResources = [];

      for (const relativePath of hat.resources) {
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const resource = allResources.find(r => 
          r.relativePath.replace(/\\/g, '/') === normalizedPath
        );
        
        if (resource) {
          resourcesToActivate.push(resource);
        } else {
          missingResources.push(relativePath);
        }
      }

      if (missingResources.length > 0) {
        const shouldContinue = await vscode.window.showWarningMessage(
          `Some resources from the hat were not found: ${missingResources.join(', ')}`,
          { modal: true },
          'Continue with Available Resources', 'Cancel'
        );
        
        if (shouldContinue !== 'Continue with Available Resources') {
          return;
        }
      }

      // Activate the resources
      let activatedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const resource of resourcesToActivate) {
        try {
          const result = await resourceService.activateResource(resource);
          if (result.success) {
            activatedCount++;
          } else {
            errorCount++;
            errors.push(`${resource.relativePath}: ${result.message}`);
          }
        } catch (error: any) {
          errorCount++;
          errors.push(`${resource.relativePath}: ${error?.message || 'Unknown error'}`);
        }
      }

      // Show results
      if (errorCount === 0) {
        vscode.window.showInformationMessage(
          `Successfully applied hat "${hat.name}" to workspace! Activated ${activatedCount} resources.`
        );
      } else {
        const message = `Applied hat "${hat.name}" with some issues. Activated: ${activatedCount}, Failed: ${errorCount}`;
        if (errors.length > 0) {
          console.error('Hat application errors:', errors);
        }
        vscode.window.showWarningMessage(message);
      }
      
      // Refresh the webview
      this._update();
      
    } catch (e: any) {
      vscode.window.showErrorMessage('Failed to apply hat to workspace: ' + (e?.message || e));
    }
  }

  private async applyLocalHatToUser(id: string) {
    try {
      if (!this.localRepo) {
        vscode.window.showWarningMessage('No local repository available to apply hat.');
        return;
      }

      // Find the local hat by ID
      const localHats = await this.hatService.discoverLocalHats();
      const hat = localHats.find(h => h.id === id);
      
      if (!hat) {
        vscode.window.showWarningMessage('Local hat not found.');
        return;
      }

      // Show confirmation and apply the hat
      const choice = await vscode.window.showInformationMessage(
        `Apply hat "${hat.name}" to user settings?`,
        { 
          detail: `This will copy ${hat.resources.length} resources to your VS Code user data directory. Tasks will be merged with your global tasks.json, other resources will be copied to appropriate user locations.`,
          modal: true 
        },
        'Apply to User', 'Cancel'
      );
      
      if (choice !== 'Apply to User') {
        return;
      }

      // Get VS Code user data path
      const userDataPath = this.getVSCodeUserDataPath();
      if (!userDataPath) {
        vscode.window.showErrorMessage('Could not determine VS Code user data directory.');
        return;
      }

      // Create a temporary "virtual" catalog repository pointing to the local repo
      const virtualRepo = {
        id: 'local-virtual',
        name: 'Local Virtual',
        rootPath: this.localRepo.rootPath,
        catalogPath: path.join(this.localRepo.rootPath, 'catalog'),
        runtimePath: path.join(this.localRepo.rootPath, '.github'),
        isActive: true
      };

      // Import necessary modules
      const { ResourceService } = await import('../services/resourceService');
      const { FileService } = await import('../services/fileService');
      const { ResourceCategory } = await import('../models');

      // Create service instances
      const fileService = new FileService();
      const resourceService = new ResourceService(fileService);

      // Discover resources from the local catalog
      const allResources = await resourceService.discoverResources(virtualRepo);
      
      // Find resources that match the hat's resource list
      const resourcesToApply = [];
      const missingResources = [];

      for (const relativePath of hat.resources) {
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const resource = allResources.find(r => 
          r.relativePath.replace(/\\/g, '/') === normalizedPath
        );
        
        if (resource) {
          resourcesToApply.push(resource);
        } else {
          missingResources.push(relativePath);
        }
      }

      if (missingResources.length > 0) {
        const shouldContinue = await vscode.window.showWarningMessage(
          `Some resources from the hat were not found: ${missingResources.join(', ')}`,
          { modal: true },
          'Continue with Available Resources', 'Cancel'
        );
        
        if (shouldContinue !== 'Continue with Available Resources') {
          return;
        }
      }

      // Apply the resources to user locations
      let appliedCount = 0;
      let errorCount = 0;
      const errors: string[] = [];

      for (const resource of resourcesToApply) {
        try {
          const result = await this.applyResourceToUser(resource, userDataPath, fileService);
          if (result.success) {
            appliedCount++;
          } else {
            errorCount++;
            errors.push(`${resource.relativePath}: ${result.message}`);
          }
        } catch (error: any) {
          errorCount++;
          errors.push(`${resource.relativePath}: ${error?.message || 'Unknown error'}`);
        }
      }

      // Save the hat definition to user hats as well
      try {
        await this.hatService.saveHatToUser(hat);
        vscode.window.showInformationMessage(`Hat "${hat.name}" definition saved to user settings.`);
      } catch (error: any) {
        errors.push(`Hat definition: ${error?.message || 'Failed to save hat definition'}`);
        errorCount++;
      }

      // Show results
      if (errorCount === 0) {
        vscode.window.showInformationMessage(
          `Successfully applied hat "${hat.name}" to user settings! Applied ${appliedCount} resources.`
        );
      } else {
        const message = `Applied hat "${hat.name}" to user settings with some issues. Applied: ${appliedCount}, Failed: ${errorCount}`;
        if (errors.length > 0) {
          console.error('Hat user application errors:', errors);
        }
        vscode.window.showWarningMessage(message);
      }
      
      // Refresh the webview
      this._update();
      
    } catch (e: any) {
      vscode.window.showErrorMessage('Failed to apply hat to user settings: ' + (e?.message || e));
    }
  }

  private getVSCodeUserDataPath(): string {
    // Get the VS Code user data directory for Windows
    const os = require('os');
    const homeDir = os.homedir();
    return path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User');
  }

  private async applyResourceToUser(resource: any, userDataPath: string, fileService: any): Promise<{ success: boolean; message: string }> {
    try {
      const resourceCategory = resource.category || 'unknown';
      let targetPath: string;

      // Determine target path based on hat resource category
      switch (resourceCategory) {
        case 'tasks':
          targetPath = path.join(userDataPath, 'tasks.json');
          return await this.mergeTasksToUser(resource, targetPath, fileService);
        
        case 'prompts':
        case 'instructions':
        case 'chatmodes':
          // These go to a custom copilot-catalog folder under user data
          const customDir = path.join(userDataPath, 'copilot-catalog', resourceCategory);
          const fileName = path.basename(resource.absolutePath);
          targetPath = path.join(customDir, fileName);
          break;
        
        case 'mcp':
          // MCP configs go to user data directory
          targetPath = path.join(userDataPath, 'mcp.json');
          return await this.mergeMcpToUser(resource, targetPath, fileService);
        
        default:
          return {
            success: false,
            message: `Unsupported resource category: ${resourceCategory}`
          };
      }

      // For prompts, instructions, chatmodes - just copy the file
      const targetDir = path.dirname(targetPath);
      await fileService.ensureDirectory(targetDir);

      const sourceContent = await fileService.readFile(resource.absolutePath);
      await fileService.writeFile(targetPath, sourceContent);
      
      return {
        success: true,
        message: `Copied ${path.basename(resource.absolutePath)} to user ${resourceCategory}`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to apply resource: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async mergeTasksToUser(resource: any, targetPath: string, fileService: any): Promise<{ success: boolean; message: string }> {
    try {
      // Read source tasks
      const sourceContent = await fileService.readFile(resource.absolutePath);
      let sourceJson: any;
      
      try {
        sourceJson = JSON.parse(sourceContent);
      } catch (error) {
        return {
          success: false,
          message: `Invalid JSON in tasks file: ${path.basename(resource.absolutePath)}`
        };
      }

      let targetJson: any = { tasks: [] };
      
      // Read existing user tasks if they exist
      if (await fileService.pathExists(targetPath)) {
        try {
          const targetContent = await fileService.readFile(targetPath);
          targetJson = JSON.parse(targetContent);
          if (!targetJson.tasks) targetJson.tasks = [];
        } catch (error) {
          console.warn(`Corrupted user tasks file, starting fresh`);
          targetJson = { tasks: [] };
        }
      }

      // Merge tasks
      if (sourceJson.tasks && Array.isArray(sourceJson.tasks)) {
        for (const task of sourceJson.tasks) {
          // Check if task already exists (by label)
          const existingIndex = targetJson.tasks.findIndex((t: any) => t.label === task.label);
          if (existingIndex >= 0) {
            // Replace existing task
            targetJson.tasks[existingIndex] = task;
          } else {
            // Add new task
            targetJson.tasks.push(task);
          }
        }
      }

      // Ensure target directory exists
      await fileService.ensureDirectory(path.dirname(targetPath));
      
      // Write merged tasks
      await fileService.writeFile(targetPath, JSON.stringify(targetJson, null, 2));
      
      return {
        success: true,
        message: `Merged tasks into user tasks.json`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to merge tasks: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async mergeMcpToUser(resource: any, targetPath: string, fileService: any): Promise<{ success: boolean; message: string }> {
    try {
      // Read source MCP config
      const sourceContent = await fileService.readFile(resource.absolutePath);
      let sourceJson: any;
      
      try {
        sourceJson = JSON.parse(sourceContent);
      } catch (error) {
        return {
          success: false,
          message: `Invalid JSON in MCP file: ${path.basename(resource.path)}`
        };
      }

      let targetJson: any = { mcpServers: {} };
      
      // Read existing user MCP config if it exists
      if (await fileService.pathExists(targetPath)) {
        try {
          const targetContent = await fileService.readFile(targetPath);
          targetJson = JSON.parse(targetContent);
          if (!targetJson.mcpServers) targetJson.mcpServers = {};
        } catch (error) {
          console.warn(`Corrupted user MCP file, starting fresh`);
          targetJson = { mcpServers: {} };
        }
      }

      // Merge MCP servers
      if (sourceJson.mcpServers) {
        Object.assign(targetJson.mcpServers, sourceJson.mcpServers);
      }

      // Ensure target directory exists
      await fileService.ensureDirectory(path.dirname(targetPath));
      
      // Write merged MCP config
      await fileService.writeFile(targetPath, JSON.stringify(targetJson, null, 2));
      
      return {
        success: true,
        message: `Merged MCP servers into user config`
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to merge MCP config: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async checkWorkspaceApplicationStatus(hatId: string): Promise<boolean> {
    // Check if the hat has been applied to the current workspace
    // This could be implemented by checking for a marker file or configuration
    // For now, we'll return false as a placeholder
    // TODO: Implement proper workspace application tracking
    return false;
  }

  private async checkUserApplicationStatus(hatId: string): Promise<boolean> {
    // Check if the hat has been applied to user settings
    // This could be implemented by checking user configuration or hat registry
    // For now, we'll return false as a placeholder
    // TODO: Implement proper user application tracking
    return false;
  }

  private async applyRemoteHatToWorkspace(id: string) {
    try {
      // Check if workspace is available
      if (!vscode.workspace.workspaceFolders?.length) {
        vscode.window.showWarningMessage('No workspace is open. Please open a folder or workspace first.');
        return;
      }

      // Get the remote hat details
      const hat = await this.remoteHatService.getHat(id);
      if (!hat) {
        vscode.window.showWarningMessage('Hat not found in remote store.');
        return;
      }

      // Show confirmation
      const choice = await vscode.window.showInformationMessage(
        `Apply hat "${hat.name}" directly to workspace?`,
        { 
          detail: `This will download and apply ${hat.resources.length} resources directly to your workspace's .github or .vscode directory (as appropriate for each resource type).`,
          modal: true 
        },
        'Apply to Workspace', 'Cancel'
      );
      
      if (choice !== 'Apply to Workspace') {
        return;
      }

      // Apply resources directly from remote
      const result = await this.remoteHatService.applyHatToWorkspace(id);
      
      if (result.success) {
        vscode.window.showInformationMessage(
          `Successfully applied hat "${hat.name}" to workspace! Applied ${result.appliedCount} resources.`
        );
        
        // Update the application status and refresh
        await this.loadAllRemoteResources();
      } else {
        vscode.window.showErrorMessage(`Failed to apply hat "${hat.name}": ${result.message}`);
      }
      
    } catch (e: any) {
      vscode.window.showErrorMessage('Failed to apply hat to workspace: ' + (e?.message || e));
    }
  }

  private async applyRemoteHatToUser(id: string) {
    try {
      // Get the remote hat details
      const hat = await this.remoteHatService.getHat(id);
      if (!hat) {
        vscode.window.showWarningMessage('Hat not found in remote store.');
        return;
      }

      // Show confirmation
      const choice = await vscode.window.showInformationMessage(
        `Apply hat "${hat.name}" directly to user settings?`,
        { 
          detail: `This will download and apply ${hat.resources.length} resources directly to your VS Code user data directory. Tasks will be merged with your global tasks.json, other resources will be copied to appropriate user locations.`,
          modal: true 
        },
        'Apply to User', 'Cancel'
      );
      
      if (choice !== 'Apply to User') {
        return;
      }

      // Apply resources directly from remote to user settings
      const result = await this.remoteHatService.applyHatToUser(id);
      
      if (result.success) {
        vscode.window.showInformationMessage(
          `Successfully applied hat "${hat.name}" to user settings! Applied ${result.appliedCount} resources.`
        );
        
        // Update the application status and refresh
        await this.loadAllRemoteResources();
      } else {
        vscode.window.showErrorMessage(`Failed to apply hat "${hat.name}": ${result.message}`);
      }
      
    } catch (e: any) {
      vscode.window.showErrorMessage('Failed to apply hat to user settings: ' + (e?.message || e));
    }
  }

  public dispose() {
    DiscoverPanelProvider.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = 'Discover AI Resources';
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = String(Date.now());
    const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c] || c));

    const currentResults = this.activeTab === 'remote' ? this.remoteResults : this.localResults;
    const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
    
    const resultsHtml = currentResults.length === 0 ? `
      <div class="empty">
        ${this.lastQuery ? `No results found for "${escape(this.lastQuery)}". Try a different search term.` : 
          this.activeTab === 'remote' ? 'Loading remote AI resources...' : 'No local resources found.'}
      </div>
    ` : currentResults.map((r: DiscoverResult) => `
      <div class="result" data-id="${escape(r.id)}">
        <div class="result-content">
          <div class="result-main">
            <div class="result-header">
              <div class="title">${escape(r.label)}</div>
              ${r.isPulled ? '<div class="status-badge pulled">Already Downloaded</div>' : ''}
              ${r.isLocal ? '<div class="status-badge local">Local</div>' : ''}
            </div>
            ${r.description ? `<div class="desc">${escape(r.description)}</div>` : ''}
            ${r.resourceBreakdown ? `
              <div class="resource-breakdown">
                <span class="breakdown-label">Resources:</span>
                <span class="breakdown-content">${escape(r.resourceBreakdown)}</span>
              </div>
            ` : ''}
          </div>
          <div class="actions">
            ${this.activeTab === 'remote' ? 
              `<button data-action="activate" data-id="${escape(r.id)}" ${r.isPulled ? 'disabled' : ''}>
                ${r.isPulled ? 'Already Downloaded' : 'Pull to Workspace'}
              </button>
              <button data-action="apply-workspace-remote" data-id="${escape(r.id)}" ${!hasWorkspace || r.isAppliedToWorkspace ? 'disabled' : ''}>
                ${r.isAppliedToWorkspace ? 'Applied to Workspace' : 'Apply to Workspace'}
              </button>
              <button data-action="apply-user-remote" data-id="${escape(r.id)}" ${r.isAppliedToUser ? 'disabled' : ''}>
                ${r.isAppliedToUser ? 'Applied to User' : 'Apply to User'}
              </button>` :
              `<button data-action="apply-workspace" data-id="${escape(r.id)}" ${!hasWorkspace ? 'disabled' : ''}>
                Apply to Workspace
              </button>
              <button data-action="apply-user" data-id="${escape(r.id)}">
                Apply to User
              </button>`
            }
          </div>
        </div>
      </div>
    `).join('');

    const repoStatus = this.repo ? `
      <div class="status-bar">
        <span class="status-item">
          <span class="codicon codicon-repo"></span>
          Repository: ${escape(this.repo.name)}
        </span>
      </div>
    ` : `
      <div class="status-bar warning">
        <span class="status-item">
          <span class="codicon codicon-warning"></span>
          No repository selected. Select a repository to pull resources.
        </span>
      </div>
    `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discover AI Resources</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 20px;
            line-height: 1.5;
        }
        
        .header {
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .header h1 {
            margin: 0 0 8px 0;
            font-size: 20px;
            font-weight: 600;
        }
        
        .header p {
            margin: 0;
            color: var(--vscode-descriptionForeground);
        }
        
        .tabs {
            display: flex;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        
        .tab {
            background: none;
            border: none;
            padding: 12px 16px;
            cursor: pointer;
            color: var(--vscode-descriptionForeground);
            border-bottom: 2px solid transparent;
            font-size: var(--vscode-font-size);
        }
        
        .tab:hover {
            color: var(--vscode-foreground);
            background: var(--vscode-list-hoverBackground);
        }
        
        .tab.active {
            color: var(--vscode-foreground);
            border-bottom-color: var(--vscode-focusBorder);
        }
        
        .search-section {
            margin-bottom: 24px;
        }
        
        .search-row {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }
        
        input[type="text"] {
            flex: 1;
            padding: 8px 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border));
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-size: var(--vscode-font-size);
        }
        
        input[type="text"]:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border, transparent);
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
        }
        
        button:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground);
        }
        
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .status-bar {
            padding: 8px 12px;
            border-radius: 4px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-size: 12px;
            margin-bottom: 16px;
        }
        
        .status-bar.warning {
            background: var(--vscode-inputValidation-warningBackground);
            color: var(--vscode-inputValidation-warningForeground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
        }
        
        .status-item {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        
        .results-section h2 {
            margin: 0 0 16px 0;
            font-size: 16px;
            font-weight: 600;
        }
        
        .results {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        
        .result {
            border: 1px solid var(--vscode-editorWidget-border);
            padding: 16px;
            border-radius: 6px;
            background: var(--vscode-editor-background);
            transition: border-color 0.2s;
        }
        
        .result:hover {
            border-color: var(--vscode-focusBorder);
        }
        
        .result-content {
            display: flex;
            align-items: flex-start;
            gap: 16px;
        }
        
        .result-main {
            flex: 1;
            min-width: 0; /* Allow content to shrink */
        }
        
        .result-header {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 4px;
        }
        
        .result .title {
            font-weight: 600;
            font-size: 14px;
            flex: 1;
            min-width: 0; /* Allow title to wrap */
        }
        
        .status-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            text-transform: uppercase;
            font-weight: 600;
        }
        
        .status-badge.pulled {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        
        .status-badge.local {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        
        .result .desc {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            line-height: 1.4;
        }
        
        .resource-breakdown {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            padding: 4px 8px;
            background: var(--vscode-editorWidget-background);
            border-radius: 3px;
            border-left: 2px solid var(--vscode-focusBorder);
        }
        
        .breakdown-label {
            font-weight: 600;
            margin-right: 4px;
        }
        
        .breakdown-content {
            font-style: italic;
        }
        
        .result .actions {
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex-shrink: 0;
            align-items: flex-end;
        }
        
        .result .actions button {
            padding: 6px 12px;
            font-size: 12px;
            white-space: nowrap;
            min-width: 120px;
        }
        
        /* Responsive behavior for smaller screens */
        @media (max-width: 600px) {
            .result-content {
                flex-direction: column;
                gap: 12px;
            }
            
            .result .actions {
                flex-direction: row;
                align-items: center;
                align-self: stretch;
            }
            
            .result .actions button {
                flex: 1;
                min-width: unset;
            }
        }
        
        .empty {
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 40px 20px;
        }
        
        .codicon {
            font-family: codicon;
            font-display: block;
            font-style: normal;
            font-variant: normal;
            font-weight: normal;
            line-height: 1;
            text-decoration: none;
            text-rendering: auto;
            text-transform: none;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        
        .codicon-repo:before { content: "\\eab2"; }
        .codicon-warning:before { content: "\\ea6c"; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Discover AI Resources</h1>
        <p>Browse and search AI resources from remote sources and your local workspace.</p>
    </div>
    
    ${repoStatus}
    
    <div class="tabs">
        <button class="tab ${this.activeTab === 'remote' ? 'active' : ''}" data-tab="remote">
            Remote Resources
        </button>
        <button class="tab ${this.activeTab === 'local' ? 'active' : ''}" data-tab="local">
            Local Resources
        </button>
    </div>
    
    <div class="search-section">
        <div class="search-row">
            <input id="discoverSearch" type="text" placeholder="${this.activeTab === 'remote' ? 'Search remote AI resources...' : 'Search local resources...'}" value="${escape(this.lastQuery)}" />
            <button id="searchBtn">Search</button>
        </div>
    </div>
    
    <div class="results-section">
        <h2>${this.activeTab === 'remote' ? 'Remote' : 'Local'} Results ${currentResults.length > 0 ? `(${currentResults.length})` : ''}</h2>
        <div class="results" id="results">${resultsHtml}</div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const searchInput = document.getElementById('discoverSearch');
        const searchBtn = document.getElementById('searchBtn');
        
        function doSearch() {
            const query = searchInput.value.trim();
            vscode.postMessage({ type: 'discover.search', query: query });
        }
        
        searchBtn.addEventListener('click', doSearch);
        searchInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                doSearch();
            }
        });
        
        // Tab switching
        document.querySelector('.tabs').addEventListener('click', e => {
            const target = e.target;
            if (target.classList.contains('tab')) {
                const tab = target.getAttribute('data-tab');
                vscode.postMessage({ type: 'discover.switchTab', tab });
            }
        });
        
        // Action handling
        document.getElementById('results').addEventListener('click', e => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            
            const action = target.getAttribute('data-action');
            if (!action) return;
            
            const id = target.getAttribute('data-id');
            vscode.postMessage({ type: 'discover.action', action, id });
        });
        
        // Focus search input on load
        searchInput.focus();
    </script>
</body>
</html>`;
  }
}
