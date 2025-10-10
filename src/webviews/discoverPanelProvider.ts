// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RemoteHatService } from '../services/remoteHatService';
import { Repository } from '../models';

interface DiscoverResult { 
  id: string; 
  label: string; 
  description?: string;
  resourceBreakdown?: string; // Category breakdown of resources
  resources?: ResourceDetail[]; // Detailed resource information for expansion
  isLocal?: boolean; // For local resources
  isPulled?: boolean; // For remote resources that exist locally
  isAppliedToWorkspace?: boolean; // For remote resources applied to workspace
  isAppliedToUser?: boolean; // For remote resources applied to user settings
}

interface ResourceDetail {
  filename: string;
  title?: string;
  description?: string;
  type: string;
  url?: string;
}

export class DiscoverPanelProvider {
  private static readonly viewType = 'copilotCatalogDiscover';
  private static currentPanel: DiscoverPanelProvider | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private lastQuery: string = '';
  private remoteResults: DiscoverResult[] = [];
  private repo?: Repository;
  private errorMessage?: string;

  public static createOrShow(
    context: vscode.ExtensionContext,
    remoteHatService: RemoteHatService,
    repository?: Repository
  ) {
    const column = vscode.window.activeTextEditor?.viewColumn;

    // If we already have a panel, show it.
    if (DiscoverPanelProvider.currentPanel) {
      DiscoverPanelProvider.currentPanel._panel.reveal(column);
      DiscoverPanelProvider.currentPanel.setRepository(repository);
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
      remoteHatService,
      repository
    );
  }

  public static revive(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    remoteHatService: RemoteHatService,
    repository?: Repository
  ) {
    DiscoverPanelProvider.currentPanel = new DiscoverPanelProvider(
      panel,
      context,
      remoteHatService,
      repository
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly remoteHatService: RemoteHatService,
    repository?: Repository
  ) {
    this._panel = panel;
    this.remoteHatService = remoteHatService;
    this.repo = repository;

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
          case 'discover.action':
            if (message.action === 'apply-workspace-remote' && message.id) {
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

  private async loadInitialData() {
    await this.loadAllRemoteResources();
  }

  private async performSearch(q: string) {
    try {
      this.errorMessage = undefined; // Clear any previous errors
      const items = await this.remoteHatService.queryHats(q);
      this.remoteResults = await Promise.all(items.map(async i => {
        // Get full hat data to calculate resource breakdown
        const fullHat = await this.remoteHatService.getHat(i.id);
        const resourceBreakdown = fullHat ? this.calculateResourceBreakdown(fullHat.resources) : 'Loading...';
        
        // Get detailed resource information for expansion
        let resources: ResourceDetail[] = [];
        if (fullHat) {
          if (fullHat.resourceDetails && fullHat.resourceDetails.length > 0) {
            // Use detailed resource metadata from admin API
            resources = fullHat.resourceDetails.map((resource: any) => ({
              filename: resource.filename || '',
              title: this.extractTitle(resource.relativePath) || 'Unnamed Resource',
              description: resource.description || 'No description available',
              type: resource.category || 'unknown',
              url: resource.remoteUrl || ''
            }));
          } else {
            // Fallback to inferring from resource URLs
            resources = await this.getResourceDetails(fullHat.resources);
          }
        }
        
        // Check application status
        const isAppliedToWorkspace = await this.checkWorkspaceApplicationStatus(i.id);
        const isAppliedToUser = await this.checkUserApplicationStatus(i.id);
        
        return {
          id: i.id,
          label: i.name,
          description: i.description,
          resourceBreakdown,
          resources,
          isAppliedToWorkspace,
          isAppliedToUser
        };
      }));
    } catch (error: any) {
      console.error('Failed to search remote resources:', error);
      this.errorMessage = this.getErrorMessage(error);
      this.remoteResults = [];
    }

    this._update();
  }

  private calculateResourceBreakdown(resources: string[]): string {
    const categoryCounts = new Map<string, number>();
    
    resources.forEach(resourcePath => {
      const split = resourcePath.split('/');
      const category = split.length > 2 && split[split.length - 2] || 'general';
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });

    const breakdown = Array.from(categoryCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([category, count]) => `${count} ${category}`)
      .join(', ');
    
    return breakdown || 'No resources';
  }

  private async getResourceDetails(resources: string[]): Promise<ResourceDetail[]> {
    // For now, extract basic info from the resource paths/URLs
    // This could be enhanced to fetch more metadata from the admin API in the future
    return resources.map(resourcePath => {
      if (resourcePath.startsWith('http://') || resourcePath.startsWith('https://')) {
        // Extract filename from URL
        const urlParts = resourcePath.split('/');
        const filename = urlParts[urlParts.length - 1];
        const type = this.inferCategoryFromFilename(filename);
        
        return {
          filename,
          title: filename.replace(/\.(chatmode|instructions|instruction|prompt|task|mcp)\.(md|json)$/, ''),
          description: `${type} resource`, // Basic description - could be enhanced
          type,
          url: resourcePath
        };
      } else {
        // Handle local path format
        const pathParts = resourcePath.split('/');
        const filename = pathParts[pathParts.length - 1];
        const type = pathParts.length > 1 ? pathParts[0] : this.inferCategoryFromFilename(filename);
        
        return {
          filename,
          title: filename.replace(/\.(chatmode|instructions|instruction|prompt|task|mcp)\.(md|json)$/, ''),
          description: `${type} resource`,
          type,
          url: resourcePath
        };
      }
    });
  }

  private inferCategoryFromFilename(filename: string): string {
    if (filename.endsWith('.chatmode.md')) return 'chatmodes';
    if (filename.endsWith('.instructions.md') || filename.endsWith('.instruction.md')) return 'instructions';
    if (filename.endsWith('.prompt.md')) return 'prompts';
    if (filename.endsWith('.task.json')) return 'tasks';
    if (filename.endsWith('.mcp.json')) return 'mcp';
    return 'unknown';
  }

  private getResourceIcon(type: string): string {
    switch (type) {
      case 'chatmodes': return '💬';
      case 'instructions': return '📋';
      case 'prompts': return '🎯';
      case 'tasks': return '⚙️';
      case 'mcp': return '🔗';
      default: return '📄';
    }
  }

  private getErrorMessage(error: any): string {
    if (!error) return 'Unknown error occurred';
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    return String(error);
  }

  private extractTitle(path: string | null): string | null {
    if (!path) return null;

    let r = new RegExp('\\S+\\\\(\\S+)\\.\\w+\\.\\w+');
    let m = r.exec(path);
    return m?.[1] || null;
  }

  private async loadAllRemoteResources() {
    try {
      // Clear any previous errors and show loading state
      this.errorMessage = undefined;
      this.remoteResults = [];
      this._update();

      // Load all available remote resources and check local status
      const items = await this.remoteHatService.queryHats('');
      
      this.remoteResults = await Promise.all(items.map(async i => {
        // Get full hat data to calculate resource breakdown
        const fullHat = await this.remoteHatService.getHat(i.id);
        const resourceBreakdown = fullHat ? this.calculateResourceBreakdown(fullHat.resources) : 'Loading...';
        
        // Get detailed resource information for expansion
        let resources: ResourceDetail[] = [];
        if (fullHat) {
          if (fullHat.resourceDetails && fullHat.resourceDetails.length > 0) {
            // Use detailed resource metadata from admin API
            resources = fullHat.resourceDetails.map((resource: any) => ({
              filename: resource.filename || '',
              title: this.extractTitle(resource.relativePath) || 'Unnamed Resource',
              description: resource.description || 'No description available',
              type: resource.category || 'unknown',
              url: resource.remoteUrl || ''
            }));
          } else {
            // Fallback to inferring from resource URLs
            resources = await this.getResourceDetails(fullHat.resources);
          }
        }
        
        // Check application status
        const isAppliedToWorkspace = await this.checkWorkspaceApplicationStatus(i.id);
        const isAppliedToUser = await this.checkUserApplicationStatus(i.id);
        
        return {
          id: i.id,
          label: i.name,
          description: i.description,
          resourceBreakdown,
          resources,
          isAppliedToWorkspace,
          isAppliedToUser
        };
      }));
      this._update();
    } catch (error: any) {
      console.error('Failed to load remote resources:', error);
      this.errorMessage = this.getErrorMessage(error);
      this.remoteResults = [];
      this._update();
    }
  }

  private getVSCodeUserDataPath(): string {
    // Get the VS Code user data directory for Windows
    const os = require('os');
    const homeDir = os.homedir();
    return path.join(homeDir, 'AppData', 'Roaming', 'Code', 'User');
  }

  private async checkWorkspaceApplicationStatus(hatId: string): Promise<boolean> {
    try {
      if (!vscode.workspace.workspaceFolders?.length) {
        return false;
      }
      
      const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const trackingFile = path.join(workspaceRoot, '.vscode', 'copilot-applied-hats.json');
      
      const tracking = await this.readTrackingFile(trackingFile);
      return tracking.appliedHats.includes(hatId);
    } catch (error) {
      return false;
    }
  }

  private async checkUserApplicationStatus(hatId: string): Promise<boolean> {
    try {
    const globalStoragePath = this.getVSCodeUserDataPath();
    const trackingFile = path.join(globalStoragePath, 'copilot-applied-hats.json');
      
      const tracking = await this.readTrackingFile(trackingFile);
      return tracking.appliedHats.includes(hatId);
    } catch (error) {
      return false;
    }
  }

  private async readTrackingFile(filePath: string): Promise<{ appliedHats: string[] }> {
    try {
      if (!fs.existsSync(filePath)) {
        return { appliedHats: [] };
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      return { appliedHats: parsed.appliedHats || [] };
    } catch (error) {
      return { appliedHats: [] };
    }
  }

  private async writeTrackingFile(filePath: string, tracking: { appliedHats: string[] }): Promise<void> {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, JSON.stringify(tracking, null, 2), 'utf8');
    } catch (error) {
      console.warn('Failed to write tracking file:', error);
    }
  }

  private async markHatAsAppliedToWorkspace(hatId: string): Promise<void> {
    if (!vscode.workspace.workspaceFolders?.length) {
      return;
    }
    
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const trackingFile = path.join(workspaceRoot, '.vscode', 'copilot-applied-hats.json');
    
    const tracking = await this.readTrackingFile(trackingFile);
    if (!tracking.appliedHats.includes(hatId)) {
      tracking.appliedHats.push(hatId);
      await this.writeTrackingFile(trackingFile, tracking);
    }
  }

  private async markHatAsAppliedToUser(hatId: string): Promise<void> {
    const globalStoragePath = this.getVSCodeUserDataPath();
    const trackingFile = path.join(globalStoragePath, 'copilot-applied-hats.json');
    
    const tracking = await this.readTrackingFile(trackingFile);
    if (!tracking.appliedHats.includes(hatId)) {
      tracking.appliedHats.push(hatId);
      await this.writeTrackingFile(trackingFile, tracking);
    }
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
        // Mark the hat as applied to workspace
        await this.markHatAsAppliedToWorkspace(id);
        
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
        // Mark the hat as applied to user
        await this.markHatAsAppliedToUser(id);
        
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

    const currentResults = this.remoteResults;
    const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
    
    // Show error message if present
    const errorHtml = this.errorMessage ? `
      <div class="error-banner">
        <span class="codicon codicon-error"></span>
        <div class="error-content">
          <div class="error-title">Failed to load remote resources</div>
          <div class="error-message">${escape(this.errorMessage)}</div>
        </div>
      </div>
    ` : '';
    
    const resultsHtml = currentResults.length === 0 ? `
      <div class="empty">
        ${this.errorMessage ? '' : 
          (this.lastQuery ? `No results found for "${escape(this.lastQuery)}". Try a different search term.` : 
          'Loading remote AI resources...')}
      </div>
    ` : currentResults.map((r: DiscoverResult) => `
      <div class="result" data-id="${escape(r.id)}">
        <div class="result-content">
          <div class="result-main">
            <div class="result-header">
              <div class="title-row">
                <div class="title">${escape(r.label)}</div>
                ${r.resources && r.resources.length > 0 ? `<button class="expand-btn" data-action="toggle-expand" data-id="${escape(r.id)}">▼</button>` : ''}
              </div>
              <div class="badges">
                ${r.isLocal ? '<div class="status-badge local">Local</div>' : ''}
                ${r.isAppliedToWorkspace ? '<div class="status-badge applied-workspace">Applied to Workspace</div>' : ''}
                ${r.isAppliedToUser ? '<div class="status-badge applied-user">Applied to User</div>' : ''}
              </div>
            </div>
            ${r.description ? `<div class="desc">${escape(r.description)}</div>` : ''}
            ${r.resourceBreakdown ? `
              <div class="resource-breakdown">
                <span class="breakdown-label">Resources:</span>
                <span class="breakdown-content">${escape(r.resourceBreakdown)}</span>
              </div>
            ` : ''}
            ${r.resources && r.resources.length > 0 ? `
              <div class="resource-list" data-id="${escape(r.id)}" style="display: none;">
                <div class="resource-list-header">Resource Details:</div>
                ${r.resources.map(resource => `
                  <div class="resource-item" title="${escape(resource.description || '')}">
                    <div class="resource-icon">${this.getResourceIcon(resource.type)}</div>
                    <div class="resource-info">
                      <div class="resource-name">${escape(resource.title || resource.filename)}</div>
                      <div class="resource-type">${escape(resource.type)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div class="actions">
            <button data-action="apply-workspace-remote" data-id="${escape(r.id)}" ${!hasWorkspace || r.isAppliedToWorkspace ? 'disabled' : ''}>
              ${r.isAppliedToWorkspace ? 'Applied to Workspace' : 'Apply to Workspace'}
            </button>
            <button data-action="apply-user-remote" data-id="${escape(r.id)}" ${r.isAppliedToUser ? 'disabled' : ''}>
              ${r.isAppliedToUser ? 'Applied to User' : 'Apply to User'}
            </button>
          </div>
        </div>
      </div>
    `).join('');

    const repoStatus = this.repo ? `
      <div class="status-bar">
        <span class="status-item">
          <span class="codicon codicon-repo"></span>
          Catalog: ${escape(this.repo.name)}
        </span>
      </div>
    ` : `
      <div class="status-bar warning">
        <span class="status-item">
          <span class="codicon codicon-warning"></span>
          No catalog selected. Select a catalog to pull resources.
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
        
        .error-banner {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding: 12px 16px;
            margin-bottom: 16px;
            border-radius: 6px;
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-inputValidation-errorForeground);
        }
        
        .error-banner .codicon {
            font-size: 16px;
            margin-top: 2px;
            flex-shrink: 0;
        }
        
        .error-content {
            flex: 1;
            min-width: 0;
        }
        
        .error-title {
            font-weight: 600;
            margin-bottom: 4px;
        }
        
        .error-message {
            font-size: 12px;
            line-height: 1.4;
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
            flex-direction: column;
            gap: 8px;
            margin-bottom: 4px;
        }
        
        .title-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .badges {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .expand-btn {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 12px;
            padding: 2px 4px;
            border-radius: 3px;
            transition: background-color 0.2s;
        }
        
        .expand-btn:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        
        .expand-btn.expanded {
            transform: rotate(180deg);
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
        
        .status-badge.applied-workspace {
            background: var(--vscode-notificationsInfoIcon-foreground);
            color: white;
        }
        
        .status-badge.applied-user {
            background: var(--vscode-charts-purple);
            color: white;
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
        
        .resource-list {
            margin-top: 12px;
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 4px;
            padding: 8px;
            background: var(--vscode-editorWidget-background);
        }
        
        .resource-list-header {
            font-weight: 600;
            font-size: 12px;
            margin-bottom: 8px;
            color: var(--vscode-descriptionForeground);
        }
        
        .resource-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
            cursor: help;
        }
        
        .resource-item:last-child {
            border-bottom: none;
        }
        
        .resource-item:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-radius: 3px;
        }
        
        .resource-icon {
            font-size: 14px;
            width: 16px;
            text-align: center;
        }
        
        .resource-info {
            flex: 1;
            min-width: 0;
        }
        
        .resource-name {
            font-size: 12px;
            font-weight: 500;
            color: var(--vscode-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .resource-type {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
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
        .codicon-error:before { content: "\\ea87"; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Discover AI Resources</h1>
        <p>Browse and search AI resources from connected catalogs.</p>
    </div>
    
    ${repoStatus}
    
    ${errorHtml}
    
    <div class="page-title">
        <h2>Search Catalog Resources</h2>
    </div>
    
    <div class="search-section">
        <div class="search-row">
            <input id="discoverSearch" type="text" placeholder="Search catalog resources..." value="${escape(this.lastQuery)}" />
            <button id="searchBtn">Search</button>
        </div>
    </div>
    
    <div class="results-section">
        <h2>Results ${currentResults.length > 0 ? `(${currentResults.length})` : ''}</h2>
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
        
        // Action handling
        document.getElementById('results').addEventListener('click', e => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            
            const action = target.getAttribute('data-action');
            if (!action) return;
            
            if (action === 'toggle-expand') {
                const id = target.getAttribute('data-id');
                if (!id) return;
                
                // Find the resource list element
                const resourceList = document.querySelector('[data-id="' + id + '"].resource-list');
                const expandBtn = target;
                
                if (resourceList) {
                    const isVisible = resourceList.style.display !== 'none';
                    resourceList.style.display = isVisible ? 'none' : 'block';
                    expandBtn.classList.toggle('expanded', !isVisible);
                    expandBtn.textContent = isVisible ? '▼' : '▲';
                }
            } else {
                // Handle other actions (apply buttons, etc.)
                const id = target.getAttribute('data-id');
                vscode.postMessage({ type: 'discover.action', action, id });
            }
        });
        
        // Focus search input on load
        searchInput.focus();
    </script>
</body>
</html>`;
  }
}
