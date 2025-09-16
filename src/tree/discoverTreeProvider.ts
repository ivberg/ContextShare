// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { getVSCode } from '../utils/vscode';
import { CatalogTreeItem } from '../models';

const vscode = getVSCode();

export class DiscoverTreeProvider {
  private _onDidChangeTreeData = vscode ? new vscode.EventEmitter<CatalogTreeItem|void>() : { fire: (_?:any)=>{} } as any;
  readonly onDidChangeTreeData = (this._onDidChangeTreeData as any).event || (()=>{});

  private lastQuery: string | undefined;
  private results: Array<{ id: string; label: string; description?: string }> = [];

  setResults(query: string, items: Array<{ id: string; label: string; description?: string }>) {
    this.lastQuery = query;
    this.results = items;
    this.refresh();
  }

  refresh(){ this._onDidChangeTreeData.fire(); }
  getTreeItem(e: CatalogTreeItem){ return e; }

  getChildren(): CatalogTreeItem[] {
    const items: CatalogTreeItem[] = [];

    // Pseudo input line (click to open real input box)
    const searchLabel = this.lastQuery ? `$(search) ${this.lastQuery}` : '$(search) Enter search…';
    const search = new CatalogTreeItem(searchLabel, vscode ? vscode.TreeItemCollapsibleState.None : 0, { type:'discover-search' });
    if(vscode){
      (search as any).command = { command: 'copilotCatalog.discover.search', title: 'Search Hats' };
    }
    search.contextValue = 'discover-search';
    items.push(search);

    // Begin discovery as a button-like entry
    const begin = new CatalogTreeItem('$(play) Begin Discovery', vscode ? vscode.TreeItemCollapsibleState.None : 0, { type:'discover-begin' });
    if(vscode){
      (begin as any).command = { command: 'copilotCatalog.discover.begin', title: 'Begin Discovery' };
    }
    begin.contextValue = 'discover-begin';
    items.push(begin);

    // Divider (simple visual spacer)
    const divider = new CatalogTreeItem('──────── Results ────────', vscode ? vscode.TreeItemCollapsibleState.None : 0, { type:'discover-divider' });
    divider.contextValue = 'discover-divider';
    items.push(divider);

    if(this.results.length === 0){
      const empty = new CatalogTreeItem('No results yet', vscode ? vscode.TreeItemCollapsibleState.None : 0, { type:'discover-empty' });
      empty.contextValue = 'discover-empty';
      items.push(empty);
    } else {
      for(const r of this.results){
        const ti = new CatalogTreeItem(r.label, vscode ? vscode.TreeItemCollapsibleState.None : 0, { type:'discover-result' });
        (ti as any).id = r.id;
        ti.contextValue = 'discover-result';
        if(vscode && r.description){ (ti as any).tooltip = r.description; }
        items.push(ti);
      }
    }
    return items;
  }
}
