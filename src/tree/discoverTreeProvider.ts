// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { getVSCode } from '../utils/vscode';
import { CatalogTreeItem } from '../models';

const vscode = getVSCode();

export class DiscoverTreeProvider {
  private _onDidChangeTreeData = vscode ? new vscode.EventEmitter<CatalogTreeItem|void>() : { fire: (_?:any)=>{} } as any;
  readonly onDidChangeTreeData = (this._onDidChangeTreeData as any).event || (()=>{});

  refresh(){ this._onDidChangeTreeData.fire(); }
  getTreeItem(e: CatalogTreeItem){ return e; }

  getChildren(): CatalogTreeItem[] {
    const item = new CatalogTreeItem('Begin Discovery', vscode ? vscode.TreeItemCollapsibleState.None : 0, { type:'discover-action'});
    if(vscode){
      (item as any).iconPath = new vscode.ThemeIcon('search');
      (item as any).command = { command: 'copilotCatalog.discover.begin', title: 'Begin Discovery' };
    }
    item.contextValue = 'discover-action';
    return [item];
  }
}
