import * as assert from 'assert';
import { transformToRawUrl, isRawUrl, getUrlPlatform } from '../src/utils/urlTransform';

describe('URL Transform Utilities', () => {
  describe('transformToRawUrl', () => {
    it('transforms GitHub blob URLs to raw URLs', () => {
      const input = 'https://github.com/github/awesome-copilot/blob/main/chatmodes/4.1-Beast.chatmode.md';
      const expected = 'https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/4.1-Beast.chatmode.md';
      assert.strictEqual(transformToRawUrl(input), expected);
    });

    it('transforms GitLab blob URLs to raw URLs', () => {
      const input = 'https://gitlab.com/group/project/-/blob/main/file.md';
      const expected = 'https://gitlab.com/group/project/-/raw/main/file.md';
      assert.strictEqual(transformToRawUrl(input), expected);
    });

    it('transforms Azure DevOps URLs to API URLs', () => {
      const input = 'https://dev.azure.com/org/project/_git/repo?path=/file.md&version=GBmain';
      const expected = 'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=/file.md&version=main&includeContent=true';
      assert.strictEqual(transformToRawUrl(input), expected);
    });

    it('returns unchanged URL for already raw URLs', () => {
      const input = 'https://raw.githubusercontent.com/github/awesome-copilot/main/chatmodes/4.1-Beast.chatmode.md';
      assert.strictEqual(transformToRawUrl(input), input);
    });

    it('returns unchanged URL for non-repository URLs', () => {
      const input = 'https://example.com/file.md';
      assert.strictEqual(transformToRawUrl(input), input);
    });

    it('handles null and undefined inputs', () => {
      assert.strictEqual(transformToRawUrl(null as any), null);
      assert.strictEqual(transformToRawUrl(undefined as any), undefined);
      assert.strictEqual(transformToRawUrl(''), '');
    });
  });

  describe('isRawUrl', () => {
    it('identifies GitHub raw URLs', () => {
      assert.strictEqual(isRawUrl('https://raw.githubusercontent.com/owner/repo/branch/file.md'), true);
    });

    it('identifies GitLab raw URLs', () => {
      assert.strictEqual(isRawUrl('https://gitlab.com/group/project/-/raw/main/file.md'), true);
    });

    it('identifies Azure DevOps API URLs', () => {
      assert.strictEqual(isRawUrl('https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=/file.md&includeContent=true'), true);
    });

    it('returns false for blob URLs', () => {
      assert.strictEqual(isRawUrl('https://github.com/owner/repo/blob/main/file.md'), false);
    });

    it('returns false for non-repository URLs', () => {
      assert.strictEqual(isRawUrl('https://example.com/file.md'), false);
    });
  });

  describe('getUrlPlatform', () => {
    it('identifies GitHub platforms', () => {
      assert.strictEqual(getUrlPlatform('https://github.com/owner/repo/blob/main/file.md'), 'github');
      assert.strictEqual(getUrlPlatform('https://raw.githubusercontent.com/owner/repo/main/file.md'), 'github');
    });

    it('identifies GitLab platforms', () => {
      assert.strictEqual(getUrlPlatform('https://gitlab.com/group/project/-/blob/main/file.md'), 'gitlab');
    });

    it('identifies Azure DevOps platforms', () => {
      assert.strictEqual(getUrlPlatform('https://dev.azure.com/org/project/_git/repo'), 'azure-devops');
    });

    it('returns unknown for unrecognized URLs', () => {
      assert.strictEqual(getUrlPlatform('https://example.com/file.md'), 'unknown');
      assert.strictEqual(getUrlPlatform(''), 'unknown');
      assert.strictEqual(getUrlPlatform(null as any), 'unknown');
    });
  });
});