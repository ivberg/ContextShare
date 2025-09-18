// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { HatService } from '../services/hatService';
import { RemoteHatService } from '../services/remoteHatService';
import { Repository } from '../models';

interface DiscoverResult { id: string; label: string; description?: string }

export class DiscoverPanelProvider {
  private static readonly viewType = 'copilotCatalogDiscover';
  private static currentPanel: DiscoverPanelProvider | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private lastQuery: string = '';
  private results: DiscoverResult[] = [];
  private repo?: Repository;

  public static createOrShow(
    context: vscode.ExtensionContext,
    hatService: HatService,
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
      hatService,
      remoteHatService,
      repository
    );
  }

  public static revive(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    hatService: HatService,
    remoteHatService: RemoteHatService,
    repository?: Repository
  ) {
    DiscoverPanelProvider.currentPanel = new DiscoverPanelProvider(
      panel,
      context,
      hatService,
      remoteHatService,
      repository
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly hatService: HatService,
    private readonly remoteHatService: RemoteHatService,
    repository?: Repository
  ) {
    this._panel = panel;
    this.repo = repository;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'discover.search':
            this.lastQuery = (message.query || '').trim();
            await this.performSearch(this.lastQuery);
            break;
          case 'discover.begin':
            vscode.window.showInformationMessage('Discovery starting… (placeholder)');
            break;
          case 'discover.action':
            if (message.action === 'activate' && message.id) {
              await this.pullHatToWorkspace(String(message.id));
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
  }

  private async performSearch(q: string) {
    if (!q) {
      this.results = [];
      this._update();
      return;
    }
    const items = await this.remoteHatService.queryHats(q);
    this.results = items.map(i => ({ id: i.id, label: i.name, description: i.description }));
    this._update();
  }

  private async pullHatToWorkspace(id: string) {
    try {
      if (!this.repo) {
        vscode.window.showWarningMessage('No repository available to save hat.');
        return;
      }

      const hat = await this.remoteHatService.getHat(id);
      if (!hat) {
        vscode.window.showWarningMessage('Hat not found in remote store.');
        return;
      }

      // Use the new pullHat method to fetch resources and create local hat file
      const success = await this.remoteHatService.pullHat(id, this.repo.rootPath);

      if (success) {
        vscode.window.showInformationMessage(`Successfully pulled hat "${hat.name}" with ${hat.resources.length} resources to workspace.`);
      } else {
        vscode.window.showErrorMessage(`Failed to pull hat "${hat.name}". Check that remote resources exist.`);
      }
    } catch (e: any) {
      vscode.window.showErrorMessage('Failed to pull hat: ' + (e?.message || e));
    }
  }

  public dispose() {
    DiscoverPanelProvider.currentPanel = undefined;

    // Clean up our resources
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

    const resultsHtml = this.results.length === 0 ? `
      <div class="empty">
        ${this.lastQuery ? 'No results found. Try a different search term.' : 'Enter a search term to discover remote AI resources.'}
      </div>
    ` : this.results.map(r => `
      <div class="result" data-id="${escape(r.id)}">
        <div class="title">${escape(r.label)}</div>
        ${r.description ? `<div class="desc">${escape(r.description)}</div>` : ''}
        <div class="actions">
          <button data-action="preview" data-id="${escape(r.id)}">Preview</button>
          <button data-action="activate" data-id="${escape(r.id)}">Pull to Workspace</button>
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
        
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        button:active {
            background: var(--vscode-button-activeBackground, var(--vscode-button-hoverBackground));
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
        
        .result .title {
            font-weight: 600;
            margin-bottom: 4px;
            font-size: 14px;
        }
        
        .result .desc {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
            line-height: 1.4;
        }
        
        .result .actions {
            display: flex;
            gap: 8px;
        }
        
        .result .actions button {
            padding: 6px 12px;
            font-size: 12px;
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
        <p>Search and discover remote AI resources like prompts, instructions, and presets from the community.</p>
    </div>
    
    ${repoStatus}
    
    <div class="search-section">
        <div class="search-row">
            <input id="discoverSearch" type="text" placeholder="Search for AI resources, hats, prompts..." value="${escape(this.lastQuery)}" />
            <button id="searchBtn">Search</button>
        </div>
        <div class="search-row">
            <button id="beginBtn">Begin Discovery</button>
        </div>
    </div>
    
    <div class="results-section">
        <h2>Results ${this.results.length > 0 ? `(${this.results.length})` : ''}</h2>
        <div class="results" id="results">${resultsHtml}</div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const searchInput = document.getElementById('discoverSearch');
        const searchBtn = document.getElementById('searchBtn');
        const beginBtn = document.getElementById('beginBtn');
        
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
        
        beginBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'discover.begin' });
        });
        
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
