// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { getVSCode } from '../utils/vscode';
import { CatalogTreeItem, IResourceService, Repository, Resource, ResourceCategory, ResourceState } from '../models';
import { computeIconId } from './catalogTreeProvider';
import { getDisplayName } from '../utils/display';

const vscode = getVSCode();

export class CategoryTreeProvider {
  private _onDidChangeTreeData = vscode ? new vscode.EventEmitter<CatalogTreeItem|void>() : { fire: (_?:any)=>{} } as any;
  readonly onDidChangeTreeData = (this._onDidChangeTreeData as any).event || (()=>{});
  private resources: Resource[] = [];
  private repo?: Repository;
  private catalogFilter?: string;
  private searchFilter?: string;
  private showFilterItem = false;
  private loading = false;
  private remoteError?: string; // Track remote fetch errors for this category
  
  constructor(private category: ResourceCategory, private resourceService?: IResourceService) {}
  
  setCatalogFilter(filter?: string) {
    this.catalogFilter = filter;
    this.refresh();
  }

  setFilenameFilterState(filter: string | undefined, show: boolean){
    this.searchFilter = filter;
    this.showFilterItem = show;
    this.refresh();
  }

  setLoading(flag: boolean){
    if(this.loading !== flag){ this.loading = flag; this.refresh(); }
  }
  
  setRepository(repo: Repository|undefined, resources: Resource[]){ 
    this.repo = repo; 
    // Filter by category and optionally by catalog name
    this.resources = resources.filter(r => {
      if (r.category !== this.category) return false;
      if (this.catalogFilter && r.catalogName !== this.catalogFilter) return false;
      return true;
    });
    
    // Check for remote errors for this category
    if (this.resourceService && this.resourceService.getLastRemoteError) {
      this.remoteError = this.resourceService.getLastRemoteError(this.category);
    }
    
    this.refresh(); 
  }
  
  refresh(){ this._onDidChangeTreeData.fire(); }
  getTreeItem(e: CatalogTreeItem){ return e; }
  
  getChildren(e?: CatalogTreeItem): CatalogTreeItem[] {
    if(!this.repo){
  return [this.placeholderItem('No repository found with a ContextShare catalog.')];
    }
    
    if(this.loading){
      return [this.placeholderItem('Loading…')];
    }
    if(this.resources.length === 0){
      // Show remote error if present, otherwise generic "not found" message
      const message = this.remoteError 
        ? `Remote fetch failed: ${this.remoteError}` 
        : `No ${this.category} resources found.`;
      return [this.placeholderItem(message)];
    }
    
    // Return resources directly (no grouping needed since this is category-specific)
    const items: CatalogTreeItem[] = [];
    if(!e && this.showFilterItem){
      items.push(this.filterControlItem());
    }
    const resourceItems = this.resources.map(r => {
      const label = this.decorateLabel(r);
      const ti = new CatalogTreeItem(label, vscode ? vscode.TreeItemCollapsibleState.None : 0, { type:'resource', resourceState: r.state});
      (ti as any).id = r.id;
      
      // Enhanced tooltip with metadata for lazy resources
      let tooltip = '';
      
      // Add metadata if available (for lazy remote resources)
      const lazyResource = r as any;
      if (lazyResource.lazy && (lazyResource.description || lazyResource.tags || lazyResource.size || lazyResource.domainCategory)) {
        const metaParts = [];
        if (lazyResource.description) {
          metaParts.push(`Description: ${lazyResource.description}`);
        }
        if (lazyResource.domainCategory) {
          metaParts.push(`Category: ${lazyResource.domainCategory}`);
        }
        if (lazyResource.tags) {
          metaParts.push(`Tags: ${lazyResource.tags}`);
        }
        if (lazyResource.size) {
          const sizeKB = Math.round(lazyResource.size / 1024);
          metaParts.push(`Size: ${sizeKB > 0 ? sizeKB + ' KB' : lazyResource.size + ' bytes'}`);
        }
        if (lazyResource.truncated) {
          metaParts.push(`(Content truncated in bulk export)`);
        }
        tooltip = metaParts.join('\n');
      } else {
        // Fallback for non-lazy resources - just show the path
        tooltip = r.relativePath;
      }
      
      (ti as any).tooltip = tooltip;
      
      const iconId = computeIconId(r);
      if(iconId && vscode) (ti as any).iconPath = new vscode.ThemeIcon(iconId);
      
      // Enable double-click open
      (ti as any).command = { command: 'copilotCatalog.openResource', title: 'Open Resource', arguments: [ti] };
      
      const suffix = r.state === ResourceState.ACTIVE ? 'active' : r.state === ResourceState.MODIFIED ? 'modified' : 'inactive';
      const isUser = (r as any).origin === 'user';
      let context = isUser ? 'resource-user' : `resource-${suffix}`;
      if(isUser && (r as any).disabled){ context = 'resource-user-disabled'; }
      ti.contextValue = context;
      (ti as any).viewItem = context;
      return ti;
    });
    return [...items, ...resourceItems];
  }
  
  private placeholderItem(message: string){
    const item = new CatalogTreeItem(message, vscode ? vscode.TreeItemCollapsibleState.None : 0, { type:'placeholder'});
    if(vscode) (item as any).iconPath = new vscode.ThemeIcon('info');
    item.contextValue = 'placeholder';
    return item;
  }
  
  private decorateLabel(r: Resource){ 
    const filename = r.relativePath.split(/[\\/]/).pop() || r.relativePath;
    const base = getDisplayName(filename, r.category);
    let label = base;
    
    if((r as any).origin==='user'){ 
      label = (r as any).disabled ? `${base} (user, disabled)` : `${base} (user)`; 
    }
    
    // Add catalog name if available and not filtered
    if (r.catalogName && !this.catalogFilter) {
      label += ` [${r.catalogName}]`;
    }
    
    return label;
  }

  private filterControlItem(){
    const active = !!this.searchFilter;
    const label = active ? `Search: "${this.searchFilter}" (Edit)` : 'Search: (None)';
    const item = new CatalogTreeItem(label, vscode ? vscode.TreeItemCollapsibleState.None : 0, { type:'filter-control'});
    (item as any).contextValue = 'filter-control';
    (item as any).command = { command: 'copilotCatalog.filterFilename', title: 'Edit' };
    if(vscode){ (item as any).iconPath = new vscode.ThemeIcon('search'); }
    return item;
  }
}
