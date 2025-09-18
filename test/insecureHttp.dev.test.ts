import * as assert from 'assert';
import { ResourceService } from '../src/services/resourceService';
import { MockFileService } from './fileService.mock';
import { Repository, ResourceCategory } from '../src/models';

suite('dev allowInsecureHttp flag', () => {
  const fileService = new MockFileService({});
  const rs = new ResourceService(fileService as any);
  const repo: Repository = { id: 'r', name: 'r', rootPath: '/repo', catalogPath: '/repo/catalog', runtimePath: '/repo/runtime', isActive: true } as any;

  test('skips http URL by default', async () => {
    rs.setSourceOverrides({ [ResourceCategory.INSTRUCTIONS]: 'http://localhost:3000/catalog/instructions/' } as any);
    const resources = await rs.discoverResources(repo);
    assert.strictEqual(resources.length, 0, 'Should not include insecure resource');
  });

  test('enables flag (cannot fetch remote without network mock)', async () => {
    (rs as any).enableInsecureHttpForDev(true);
    rs.setSourceOverrides({ [ResourceCategory.INSTRUCTIONS]: 'http://localhost:3000/catalog/instructions/' } as any);
    assert.ok((rs as any).allowInsecureHttp, 'Dev flag should be enabled');
  });
});