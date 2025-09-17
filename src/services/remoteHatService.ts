// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
import { logger } from '../utils/logger';

export interface RemoteHatSummary {
  id: string;
  name: string;
  description?: string;
  resources: string[];
  rating?: number;
  author?: string;
}

export class RemoteHatService {
  // Simple in-memory mock catalog
  private hats: RemoteHatSummary[] = [
    {
      id: 'remote:quick-start',
      name: 'Quick Start Catalog Setup',
      description: 'Bootstrap catalog setup with example chatmode, instruction, and prompt.',
      resources: [
        'chatmodes/catalog-manager-agent.chatmode.md',
        'instructions/catalog-setup-guardrails.instructions.md',
        'prompts/init-catalog.prompt.md'
      ],
      rating: 4.6,
      author: 'ContextShare Team'
    },
    {
      id: 'remote:task-tools',
      name: 'Task Runner Essentials',
      description: 'A curated set of VS Code tasks for common workflows.',
      resources: [
        'tasks/catalog-setup-walkthrough.task.json'
      ],
      rating: 4.2,
      author: 'OSS'
    },
    {
      id: 'remote:mcp-starter',
      name: 'MCP Starter Pack',
      description: 'Basic MCP servers configuration example.',
      resources: [
        'mcp/catalog-servers.mcp.json'
      ],
      rating: 4.0,
      author: 'Community'
    }
  ];

  async queryHats(query: string): Promise<RemoteHatSummary[]> {
    const q = (query || '').trim().toLowerCase();
    if(!q) return [];
    const res = this.hats.filter(h =>
      h.name.toLowerCase().includes(q) ||
      (h.description || '').toLowerCase().includes(q) ||
      h.id.toLowerCase().includes(q)
    );
    await logger.info(`RemoteHatService.queryHats q="${q}" -> ${res.length}`);
    return res;
  }

  async getHat(id: string): Promise<RemoteHatSummary | undefined> {
    const hat = this.hats.find(h => h.id === id);
    await logger.info(`RemoteHatService.getHat id=${id} found=${!!hat}`);
    return hat;
  }
}
