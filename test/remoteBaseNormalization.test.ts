import * as assert from 'assert';
import { normalizeRemoteBase } from '../src/utils/remoteBase';

suite('remoteBase normalization', () => {
  test('adds trailing slash when missing', () => {
    const info = normalizeRemoteBase('https://example.com/catalog');
    assert.ok(info);
    assert.strictEqual(info!.base, 'https://example.com/catalog/');
    assert.ok(info!.derived.instructions.endsWith('/instructions/'));
  });

  test('strips category suffix', () => {
    const info = normalizeRemoteBase('https://example.com/catalog/instructions');
    assert.ok(info);
    assert.strictEqual(info!.base, 'https://example.com/catalog/');
  });

  test('windows path without slash', () => {
    const info = normalizeRemoteBase('C:\\data\\catalog');
    assert.ok(info);
    assert.ok(info!.base.endsWith('\\'));
    assert.ok(info!.derived.chatmodes.endsWith('chatmodes\\'));
  });

  test('empty input returns undefined', () => {
    const info = normalizeRemoteBase('');
    assert.strictEqual(info, undefined);
  });
});
