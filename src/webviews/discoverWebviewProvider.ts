// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import * as vscode from 'vscode';
import { HatService } from '../services/hatService';
import { RemoteHatService } from '../services/remoteHatService';
import { Repository } from '../models';

interface DiscoverResult { id: string; label: string; description?: string }

export class DiscoverWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'copilotCatalogDiscover';
  private _view?: vscode.WebviewView;
  private lastQuery: string = '';
  private results: DiscoverResult[] = [];

  private repo?: Repository;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly hatService: HatService,
    private readonly remote: RemoteHatService
  ){ }

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true }; // allow script for UI interactions
    this.render();

    webviewView.webview.onDidReceiveMessage(async msg => {
      switch(msg.type){
        case 'discover.search':
          this.lastQuery = (msg.query||'').trim();
          await this.performSearch(this.lastQuery);
          break;
        case 'discover.begin':
          vscode.window.showInformationMessage('Discovery starting… (placeholder)');
          break;
        case 'discover.action':
          if(msg.action === 'activate' && msg.id){
            await this.pullHatToWorkspace(String(msg.id));
          }
          break;
      }
    });
  }

  private async performSearch(q: string){
    if(!q){ this.results = []; this.render(); return; }
    const items = await this.remote.queryHats(q);
    this.results = items.map(i => ({ id: i.id, label: i.name, description: i.description }));
    this.render();
  }

  setRepository(repo: Repository | undefined){ this.repo = repo; }

  private async pullHatToWorkspace(id: string){
    try {
      if(!this.repo){ vscode.window.showWarningMessage('No repository available to save hat.'); return; }
      const hat = await this.remote.getHat(id);
      if(!hat){ vscode.window.showWarningMessage('Hat not found in remote store.'); return; }
      // Save as a workspace hat using HatService
      const saved = await this.hatService.createHatFromActive(hat.name, hat.description, [], 'workspace', this.repo);
      // Overwrite the just-created placeholder with remote resources list
      // Re-save to workspace with remote resource list
      await this.hatService.saveHatToWorkspace(this.repo, { ...saved, resources: hat.resources });
      vscode.window.showInformationMessage(`Saved Hat "${hat.name}" to workspace.`);
    } catch (e:any) {
      vscode.window.showErrorMessage('Failed to save hat: ' + (e?.message || e));
    }
  }

  private getHtml(): string {
    const nonce = String(Date.now());
    const escape = (s:string) => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]||c));

    const resultsHtml = this.results.length === 0 ? `
      <div class="empty">No results</div>
    ` : this.results.map(r => `
      <div class="result" data-id="${escape(r.id)}">
        <div class="title">${escape(r.label)}</div>
        ${r.description ? `<div class="desc">${escape(r.description)}</div>`: ''}
        <div class="actions">
          <button data-action="preview" data-id="${escape(r.id)}">Preview</button>
          <button data-action="activate" data-id="${escape(r.id)}">Activate</button>
        </div>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: var(--vscode-font-family); padding: 0 8px 16px; color: var(--vscode-foreground); }
  h2 { font-size: 13px; font-weight: 600; margin: 12px 0 6px; }
  .row { display: flex; gap: 6px; align-items: center; }
  input[type=text] { flex: 1; padding: 4px 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border)); color: var(--vscode-input-foreground); border-radius: 4px; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-border, transparent); padding: 4px 10px; border-radius: 4px; cursor: pointer; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  .results { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .result { border: 1px solid var(--vscode-editorWidget-border); padding: 8px; border-radius: 4px; background: var(--vscode-editor-background); }
  .title { font-weight: 600; margin-bottom: 2px; }
  .desc { font-size: 11px; opacity: 0.8; margin-bottom: 6px; }
  .actions { display: flex; gap: 6px; }
  .empty { opacity: 0.6; font-style: italic; }
  .divider { margin: 14px 0 8px; height: 1px; background: var(--vscode-panel-border); }
</style>
</head>
<body>
  <div class="row" style="margin-top:8px;">
    <input id="discoverSearch" type="text" placeholder="Search hats..." value="${escape(this.lastQuery)}" />
    <button id="searchBtn">Search</button>
  </div>
  <div class="row" style="margin-top:6px;">
    <button id="beginBtn">Begin Discovery</button>
  </div>
  <div class="divider"></div>
  <h2>Results</h2>
  <div class="results" id="results">${resultsHtml}</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const searchInput = document.getElementById('discoverSearch');
  const searchBtn = document.getElementById('searchBtn');
  const beginBtn = document.getElementById('beginBtn');
  function doSearch(){ vscode.postMessage({ type: 'discover.search', query: searchInput.value }); }
  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });
  beginBtn.addEventListener('click', () => vscode.postMessage({ type: 'discover.begin' }));
  document.getElementById('results').addEventListener('click', e => {
    const t = e.target;
    if(!(t instanceof HTMLElement)) return;
    const action = t.getAttribute('data-action');
    if(!action) return;
    const id = t.getAttribute('data-id');
    vscode.postMessage({ type: 'discover.action', action, id });
  });
</script>
</body>
</html>`;
  }

  private render(){
    if(this._view){
      this._view.webview.html = this.getHtml();
    }
  }

  public setResults(query: string, results: DiscoverResult[]){
    this.lastQuery = query;
    this.results = results;
    this.render();
  }
}
