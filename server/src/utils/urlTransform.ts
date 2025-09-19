/**
 * URL transformation utilities for converting repository URLs to raw content URLs
 * 
 * This module handles automatic transformation of repository URLs to their raw content
 * equivalents for better performance and direct content access.
 */

/**
 * Transform GitHub URLs from blob view to raw content URL
 * 
 * Transforms:
 * - https://github.com/owner/repo/blob/branch/path/file.ext
 * To:
 * - https://raw.githubusercontent.com/owner/repo/branch/path/file.ext
 * 
 * @param url - The GitHub URL to transform
 * @returns Transformed raw URL or original URL if no transformation needed
 */
function transformGitHubUrl(url: string): string {
  // Match GitHub blob URLs: github.com/user/repo/blob/branch/path
  const githubBlobRegex = /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)$/;
  const match = url.match(githubBlobRegex);
  
  if (match) {
    const [, owner, repo, branch, path] = match;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }
  
  return url;
}

/**
 * Transform Azure DevOps URLs to raw content URLs
 * 
 * Transforms:
 * - https://dev.azure.com/org/project/_git/repo?path=/file.ext&version=GBbranch
 * To:
 * - https://dev.azure.com/org/project/_apis/git/repositories/repo/items?path=/file.ext&version=branch&includeContent=true
 * 
 * @param url - The Azure DevOps URL to transform
 * @returns Transformed raw URL or original URL if no transformation needed
 */
function transformAzureDevOpsUrl(url: string): string {
  // Match Azure DevOps URLs
  const azureRegex = /^https:\/\/dev\.azure\.com\/([^\/]+)\/([^\/]+)\/_git\/([^\/\?]+)\?.*path=([^&]+).*version=GB([^&]+)/;
  const match = url.match(azureRegex);
  
  if (match) {
    const [, org, project, repo, path, branch] = match;
    return `https://dev.azure.com/${org}/${project}/_apis/git/repositories/${repo}/items?path=${path}&version=${branch}&includeContent=true`;
  }
  
  return url;
}

/**
 * Transform GitLab URLs to raw content URLs
 * 
 * Transforms:
 * - https://gitlab.com/group/project/-/blob/branch/path/file.ext
 * To:
 * - https://gitlab.com/group/project/-/raw/branch/path/file.ext
 * 
 * @param url - The GitLab URL to transform
 * @returns Transformed raw URL or original URL if no transformation needed
 */
function transformGitLabUrl(url: string): string {
  // Match GitLab blob URLs
  const gitlabBlobRegex = /^https:\/\/gitlab\.com\/([^\/]+\/[^\/]+)\/-\/blob\/([^\/]+)\/(.+)$/;
  const match = url.match(gitlabBlobRegex);
  
  if (match) {
    const [, projectPath, branch, filePath] = match;
    return `https://gitlab.com/${projectPath}/-/raw/${branch}/${filePath}`;
  }
  
  return url;
}

/**
 * Transform any supported repository URL to its raw content equivalent
 * 
 * Currently supports:
 * - GitHub (github.com)
 * - Azure DevOps (dev.azure.com)
 * - GitLab (gitlab.com)
 * 
 * @param url - The repository URL to transform
 * @returns Transformed raw URL or original URL if no transformation is possible
 */
export function transformToRawUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // Try GitHub transformation first (most common)
  let transformed = transformGitHubUrl(url);
  if (transformed !== url) {
    return transformed;
  }

  // Try Azure DevOps transformation
  transformed = transformAzureDevOpsUrl(url);
  if (transformed !== url) {
    return transformed;
  }

  // Try GitLab transformation
  transformed = transformGitLabUrl(url);
  if (transformed !== url) {
    return transformed;
  }

  // Return original URL if no transformation was applied
  return url;
}

/**
 * Check if a URL is already a raw content URL
 * 
 * @param url - The URL to check
 * @returns true if the URL appears to be a raw content URL
 */
export function isRawUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Check for common raw URL patterns
  const rawPatterns = [
    /^https:\/\/raw\.githubusercontent\.com\//,
    /^https:\/\/dev\.azure\.com\/.*\/_apis\/git\/repositories\/.*\/items\?.*includeContent=true/,
    /^https:\/\/gitlab\.com\/.*\/-\/raw\//,
  ];

  return rawPatterns.some(pattern => pattern.test(url));
}

/**
 * Get the platform type from a repository URL
 * 
 * @param url - The repository URL
 * @returns Platform type or 'unknown' if not recognized
 */
export function getUrlPlatform(url: string): 'github' | 'azure-devops' | 'gitlab' | 'unknown' {
  if (!url || typeof url !== 'string') {
    return 'unknown';
  }

  if (url.includes('github.com') || url.includes('raw.githubusercontent.com')) {
    return 'github';
  }

  if (url.includes('dev.azure.com')) {
    return 'azure-devops';
  }

  if (url.includes('gitlab.com')) {
    return 'gitlab';
  }

  return 'unknown';
}