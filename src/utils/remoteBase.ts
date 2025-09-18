// Remote base normalization utilities
// Accepts inputs with or without trailing slash and optionally already ending in a category subfolder.
// Examples accepted:
//  https://host/catalog
//  https://host/catalog/
//  https://host/catalog/instructions (will step up one level)
//  C:\absolute\catalog
// Normalization picks the parent path that contains category folders.

const CATEGORIES = ['chatmodes','instructions','prompts','tasks','mcp'];

export interface RemoteBaseInfo {
  base: string;              // normalized base with trailing slash
  derived: Record<string,string>; // per-category overrides (each with trailing slash)
}

export function normalizeRemoteBase(input: string): RemoteBaseInfo | undefined {
  if(!input || !input.trim()) return undefined;
  let raw = input.trim();
  // Remove surrounding quotes if user pasted
  raw = raw.replace(/^"|"$/g,'');

  // If path ends with one of the categories (with or without trailing slash), strip that segment
  const lowered = raw.toLowerCase();
  for(const cat of CATEGORIES){
    if(lowered.endsWith('/'+cat) || lowered.endsWith('\\'+cat) || lowered.endsWith('/'+cat+'/') || lowered.endsWith('\\'+cat+'\\')){
      // Remove that segment
      raw = raw.replace(/[\\/]+$/,'');
      raw = raw.slice(0, raw.toLowerCase().lastIndexOf(cat));
      raw = raw.replace(/[\\/]+$/,'');
      break;
    }
  }
  // Ensure single trailing slash (use forward slash for URLs; preserve backslash for Windows local paths only if drive letter)
  let trailing = raw;
  const isUrl = /^https?:\/\//i.test(trailing);
  trailing = trailing.replace(/[\\/]+$/,'');
  trailing += '/';
  if(!isUrl && /^[a-zA-Z]:\\/.test(trailing)){
    // Windows absolute path: keep backslashes when joining
    trailing = trailing.replace(/\//g,'\\');
    if(!trailing.endsWith('\\')) trailing += '\\';
  }

  const base = trailing;
  const derived: Record<string,string> = {};
  for(const c of CATEGORIES){
    if(/^[a-zA-Z]:\\/.test(base)){
      // Windows path
      derived[c] = base + c + '\\';
    } else {
      derived[c] = base + c + '/';
    }
  }
  return { base, derived };
}
