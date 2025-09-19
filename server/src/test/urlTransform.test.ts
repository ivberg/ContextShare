import assert from 'assert';
import { transformToRawUrl, isRawUrl, getUrlPlatform } from '../utils/urlTransform';

describe('URL Transform Utilities', () => {
  
  describe('transformToRawUrl', () => {
    
    describe('GitHub URL Transformations', () => {
      it('should transform GitHub blob URLs to raw URLs', () => {
        const input = 'https://github.com/owner/repo/blob/main/path/file.txt';
        const expected = 'https://raw.githubusercontent.com/owner/repo/main/path/file.txt';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should transform GitHub URLs with different branches', () => {
        const input = 'https://github.com/owner/repo/blob/develop/src/index.js';
        const expected = 'https://raw.githubusercontent.com/owner/repo/develop/src/index.js';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should transform GitHub URLs with nested paths', () => {
        const input = 'https://github.com/owner/repo/blob/main/deep/nested/path/file.md';
        const expected = 'https://raw.githubusercontent.com/owner/repo/main/deep/nested/path/file.md';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should transform GitHub URLs with special characters in filename', () => {
        const input = 'https://github.com/owner/repo/blob/main/file-name_with.special.chars.txt';
        const expected = 'https://raw.githubusercontent.com/owner/repo/main/file-name_with.special.chars.txt';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should not transform GitHub URLs that are not blob URLs', () => {
        const nonBlobUrls = [
          'https://github.com/owner/repo',
          'https://github.com/owner/repo/tree/main',
          'https://github.com/owner/repo/issues',
          'https://github.com/owner/repo/pull/123',
        ];

        nonBlobUrls.forEach(url => {
          const result = transformToRawUrl(url);
          assert.strictEqual(result, url);
        });
      });

      it('should not transform already raw GitHub URLs', () => {
        const rawUrl = 'https://raw.githubusercontent.com/owner/repo/main/file.txt';
        const result = transformToRawUrl(rawUrl);
        
        assert.strictEqual(result, rawUrl);
      });
    });

    describe('Azure DevOps URL Transformations', () => {
      it('should transform Azure DevOps blob URLs to raw URLs', () => {
        const input = 'https://dev.azure.com/org/project/_git/repo?path=/file.txt&version=GBmain';
        const expected = 'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=/file.txt&version=main&includeContent=true';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should transform Azure DevOps URLs with different branches', () => {
        const input = 'https://dev.azure.com/myorg/myproject/_git/myrepo?path=/src/index.js&version=GBdevelop';
        const expected = 'https://dev.azure.com/myorg/myproject/_apis/git/repositories/myrepo/items?path=/src/index.js&version=develop&includeContent=true';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should transform Azure DevOps URLs with nested paths', () => {
        const input = 'https://dev.azure.com/org/project/_git/repo?path=/deep/nested/file.md&version=GBfeature-branch';
        const expected = 'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=/deep/nested/file.md&version=feature-branch&includeContent=true';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should handle Azure DevOps URLs with additional query parameters', () => {
        const input = 'https://dev.azure.com/org/project/_git/repo?path=/file.txt&version=GBmain&_a=contents';
        const expected = 'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=/file.txt&version=main&includeContent=true';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should not transform Azure DevOps URLs without proper format', () => {
        const nonTransformableUrls = [
          'https://dev.azure.com/org/project',
          'https://dev.azure.com/org/project/_git/repo',
          'https://dev.azure.com/org/project/_git/repo?path=/file.txt', // Missing version
        ];

        nonTransformableUrls.forEach(url => {
          const result = transformToRawUrl(url);
          assert.strictEqual(result, url);
        });
      });
    });

    describe('GitLab URL Transformations', () => {
      it('should transform GitLab blob URLs to raw URLs', () => {
        const input = 'https://gitlab.com/group/project/-/blob/main/file.txt';
        const expected = 'https://gitlab.com/group/project/-/raw/main/file.txt';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should transform GitLab URLs with different branches', () => {
        const input = 'https://gitlab.com/mygroup/myproject/-/blob/develop/src/index.js';
        const expected = 'https://gitlab.com/mygroup/myproject/-/raw/develop/src/index.js';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should transform GitLab URLs with nested paths', () => {
        const input = 'https://gitlab.com/group/project/-/blob/main/deep/nested/file.md';
        const expected = 'https://gitlab.com/group/project/-/raw/main/deep/nested/file.md';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should transform GitLab URLs with subgroups', () => {
        const input = 'https://gitlab.com/group/subgroup/project/-/blob/main/file.txt';
        const expected = 'https://gitlab.com/group/subgroup/project/-/raw/main/file.txt';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });

      it('should not transform GitLab URLs that are not blob URLs', () => {
        const nonBlobUrls = [
          'https://gitlab.com/group/project',
          'https://gitlab.com/group/project/-/tree/main',
          'https://gitlab.com/group/project/-/issues',
        ];

        nonBlobUrls.forEach(url => {
          const result = transformToRawUrl(url);
          assert.strictEqual(result, url);
        });
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle null and undefined inputs', () => {
        assert.strictEqual(transformToRawUrl(null as any), null);
        assert.strictEqual(transformToRawUrl(undefined as any), undefined);
      });

      it('should handle non-string inputs', () => {
        assert.strictEqual(transformToRawUrl(123 as any), 123);
        assert.deepStrictEqual(transformToRawUrl({} as any), {});
        assert.deepStrictEqual(transformToRawUrl([] as any), []);
      });

      it('should handle empty string', () => {
        assert.strictEqual(transformToRawUrl(''), '');
      });

      it('should handle invalid URLs', () => {
        const invalidUrls = [
          'not-a-url',
          'http://example.com',
          'ftp://example.com/file.txt',
          'github.com/owner/repo', // Missing protocol
        ];

        invalidUrls.forEach(url => {
          const result = transformToRawUrl(url);
          assert.strictEqual(result, url);
        });
      });

      it('should handle URLs with missing components', () => {
        const incompleteUrls = [
          'https://github.com/owner/blob/main/file.txt', // Missing repo
          'https://github.com/owner/repo/blob/file.txt', // Missing branch
          'https://github.com/owner/repo/blob/main/', // Missing file
        ];

        incompleteUrls.forEach(url => {
          const result = transformToRawUrl(url);
          assert.strictEqual(result, url);
        });
      });

      it('should handle very long URLs', () => {
        const longPath = 'a'.repeat(1000);
        const longUrl = `https://github.com/owner/repo/blob/main/${longPath}.txt`;
        const expected = `https://raw.githubusercontent.com/owner/repo/main/${longPath}.txt`;
        const result = transformToRawUrl(longUrl);
        
        assert.strictEqual(result, expected);
      });

      it('should handle URLs with special characters', () => {
        const input = 'https://github.com/owner/repo/blob/main/path with spaces/file%20name.txt';
        const expected = 'https://raw.githubusercontent.com/owner/repo/main/path with spaces/file%20name.txt';
        const result = transformToRawUrl(input);
        
        assert.strictEqual(result, expected);
      });
    });
  });

  describe('isRawUrl', () => {
    
    describe('Raw URL Detection', () => {
      it('should detect GitHub raw URLs', () => {
        const rawUrls = [
          'https://raw.githubusercontent.com/owner/repo/main/file.txt',
          'https://raw.githubusercontent.com/owner/repo/develop/path/file.js',
        ];

        rawUrls.forEach(url => {
          assert.strictEqual(isRawUrl(url), true);
        });
      });

      it('should detect Azure DevOps raw URLs', () => {
        const rawUrls = [
          'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=/file.txt&version=main&includeContent=true',
          'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=/path/file.js&version=develop&includeContent=true&other=param',
        ];

        rawUrls.forEach(url => {
          assert.strictEqual(isRawUrl(url), true);
        });
      });

      it('should detect GitLab raw URLs', () => {
        const rawUrls = [
          'https://gitlab.com/group/project/-/raw/main/file.txt',
          'https://gitlab.com/group/subgroup/project/-/raw/develop/path/file.js',
        ];

        rawUrls.forEach(url => {
          assert.strictEqual(isRawUrl(url), true);
        });
      });

      it('should not detect non-raw URLs', () => {
        const nonRawUrls = [
          'https://github.com/owner/repo/blob/main/file.txt',
          'https://dev.azure.com/org/project/_git/repo?path=/file.txt&version=GBmain',
          'https://gitlab.com/group/project/-/blob/main/file.txt',
          'https://example.com/file.txt',
          'https://raw.github.com/owner/repo/main/file.txt', // Wrong domain
        ];

        nonRawUrls.forEach(url => {
          assert.strictEqual(isRawUrl(url), false);
        });
      });
    });

    describe('Edge Cases', () => {
      it('should handle null and undefined inputs', () => {
        assert.strictEqual(isRawUrl(null as any), false);
        assert.strictEqual(isRawUrl(undefined as any), false);
      });

      it('should handle non-string inputs', () => {
        assert.strictEqual(isRawUrl(123 as any), false);
        assert.strictEqual(isRawUrl({} as any), false);
        assert.strictEqual(isRawUrl([] as any), false);
      });

      it('should handle empty string', () => {
        assert.strictEqual(isRawUrl(''), false);
      });

      it('should handle malformed URLs', () => {
        const malformedUrls = [
          'not-a-url',
          'https://',
          'raw.githubusercontent.com/owner/repo/main/file.txt', // Missing protocol
        ];

        malformedUrls.forEach(url => {
          assert.strictEqual(isRawUrl(url), false);
        });
      });
    });
  });

  describe('getUrlPlatform', () => {
    
    describe('Platform Detection', () => {
      it('should detect GitHub platform', () => {
        const githubUrls = [
          'https://github.com/owner/repo/blob/main/file.txt',
          'https://raw.githubusercontent.com/owner/repo/main/file.txt',
          'https://github.com/owner/repo',
          'https://api.github.com/repos/owner/repo',
        ];

        githubUrls.forEach(url => {
          assert.strictEqual(getUrlPlatform(url), 'github');
        });
      });

      it('should detect Azure DevOps platform', () => {
        const azureUrls = [
          'https://dev.azure.com/org/project/_git/repo',
          'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?includeContent=true',
          'https://dev.azure.com/org',
        ];

        azureUrls.forEach(url => {
          assert.strictEqual(getUrlPlatform(url), 'azure-devops');
        });
      });

      it('should detect GitLab platform', () => {
        const gitlabUrls = [
          'https://gitlab.com/group/project/-/blob/main/file.txt',
          'https://gitlab.com/group/project/-/raw/main/file.txt',
          'https://gitlab.com/group/project',
        ];

        gitlabUrls.forEach(url => {
          assert.strictEqual(getUrlPlatform(url), 'gitlab');
        });
      });

      it('should return unknown for unrecognized platforms', () => {
        const unknownUrls = [
          'https://bitbucket.org/owner/repo',
          'https://example.com/file.txt',
          'https://sourceforge.net/projects/project',
          'ftp://example.com/file.txt',
        ];

        unknownUrls.forEach(url => {
          assert.strictEqual(getUrlPlatform(url), 'unknown');
        });
      });
    });

    describe('Edge Cases', () => {
      it('should handle null and undefined inputs', () => {
        assert.strictEqual(getUrlPlatform(null as any), 'unknown');
        assert.strictEqual(getUrlPlatform(undefined as any), 'unknown');
      });

      it('should handle non-string inputs', () => {
        assert.strictEqual(getUrlPlatform(123 as any), 'unknown');
        assert.strictEqual(getUrlPlatform({} as any), 'unknown');
        assert.strictEqual(getUrlPlatform([] as any), 'unknown');
      });

      it('should handle empty string', () => {
        assert.strictEqual(getUrlPlatform(''), 'unknown');
      });

      it('should handle partial matches', () => {
        const partialUrls = [
          'github', // No .com
          'gitlab.example.com', // Wrong domain
          'dev.azure.example.com', // Wrong domain
        ];

        partialUrls.forEach(url => {
          assert.strictEqual(getUrlPlatform(url), 'unknown');
        });
      });
    });
  });

  describe('Integration Tests', () => {
    
    it('should correctly transform and identify GitHub URLs', () => {
      const originalUrl = 'https://github.com/owner/repo/blob/main/file.txt';
      
      // Should not be raw initially
      assert.strictEqual(isRawUrl(originalUrl), false);
      
      // Should be GitHub platform
      assert.strictEqual(getUrlPlatform(originalUrl), 'github');
      
      // Should transform to raw URL
      const transformedUrl = transformToRawUrl(originalUrl);
      assert.strictEqual(transformedUrl, 'https://raw.githubusercontent.com/owner/repo/main/file.txt');
      
      // Transformed URL should be raw
      assert.strictEqual(isRawUrl(transformedUrl), true);
      
      // Transformed URL should still be GitHub platform
      assert.strictEqual(getUrlPlatform(transformedUrl), 'github');
    });

    it('should correctly transform and identify Azure DevOps URLs', () => {
      const originalUrl = 'https://dev.azure.com/org/project/_git/repo?path=/file.txt&version=GBmain';
      
      // Should not be raw initially
      assert.strictEqual(isRawUrl(originalUrl), false);
      
      // Should be Azure DevOps platform
      assert.strictEqual(getUrlPlatform(originalUrl), 'azure-devops');
      
      // Should transform to raw URL
      const transformedUrl = transformToRawUrl(originalUrl);
      assert.strictEqual(transformedUrl, 'https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=/file.txt&version=main&includeContent=true');
      
      // Transformed URL should be raw
      assert.strictEqual(isRawUrl(transformedUrl), true);
      
      // Transformed URL should still be Azure DevOps platform
      assert.strictEqual(getUrlPlatform(transformedUrl), 'azure-devops');
    });

    it('should correctly transform and identify GitLab URLs', () => {
      const originalUrl = 'https://gitlab.com/group/project/-/blob/main/file.txt';
      
      // Should not be raw initially
      assert.strictEqual(isRawUrl(originalUrl), false);
      
      // Should be GitLab platform
      assert.strictEqual(getUrlPlatform(originalUrl), 'gitlab');
      
      // Should transform to raw URL
      const transformedUrl = transformToRawUrl(originalUrl);
      assert.strictEqual(transformedUrl, 'https://gitlab.com/group/project/-/raw/main/file.txt');
      
      // Transformed URL should be raw
      assert.strictEqual(isRawUrl(transformedUrl), true);
      
      // Transformed URL should still be GitLab platform
      assert.strictEqual(getUrlPlatform(transformedUrl), 'gitlab');
    });

    it('should handle multiple transformations correctly', () => {
      const urls = [
        'https://github.com/owner/repo/blob/main/file1.txt',
        'https://gitlab.com/group/project/-/blob/develop/file2.js',
        'https://dev.azure.com/org/project/_git/repo?path=/file3.md&version=GBfeature',
        'https://example.com/file4.txt', // Should not transform
      ];

      const transformedUrls = urls.map(transformToRawUrl);
      
      // Check first three were transformed, last was not
      assert.notStrictEqual(transformedUrls[0], urls[0]);
      assert.notStrictEqual(transformedUrls[1], urls[1]);
      assert.notStrictEqual(transformedUrls[2], urls[2]);
      assert.strictEqual(transformedUrls[3], urls[3]);
      
      // Check that all transformed URLs are detected as raw
      assert.strictEqual(isRawUrl(transformedUrls[0]), true);
      assert.strictEqual(isRawUrl(transformedUrls[1]), true);
      assert.strictEqual(isRawUrl(transformedUrls[2]), true);
      assert.strictEqual(isRawUrl(transformedUrls[3]), false);
    });
  });
});