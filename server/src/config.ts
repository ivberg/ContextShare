import { z } from 'zod';

// Basic CLI arg parsing (supports: --catalog-root, -c, --port, --mode, --database-path)
function parseArgv(argv: string[]): Record<string,string> {
  const out: Record<string,string> = {};
  for(let i=0;i<argv.length;i++){
    const a = argv[i];
    if(a === '--catalog-root' || a === '-c'){
      const v = argv[i+1]; if(v && !v.startsWith('-')) { out.CATALOG_ROOT = v; i++; }
    } else if(a.startsWith('--catalog-root=')){
      out.CATALOG_ROOT = a.split('=')[1];
    } else if(a === '--port'){
      const v = argv[i+1]; if(v && !v.startsWith('-')) { out.PORT = v; i++; }
    } else if(a.startsWith('--port=')){
      out.PORT = a.split('=')[1];
    } else if(a === '--mode'){
      const v = argv[i+1]; if(v && !v.startsWith('-')) { out.MODE = v; i++; }
    } else if(a.startsWith('--mode=')){
      out.MODE = a.split('=')[1];
    } else if(a === '--database-path'){
      const v = argv[i+1]; if(v && !v.startsWith('-')) { out.DATABASE_PATH = v; i++; }
    } else if(a.startsWith('--database-path=')){
      out.DATABASE_PATH = a.split('=')[1];
    }
  }
  return out;
}

const configSchema = z.object({
  PORT: z.string().optional(),
  CATALOG_ROOT: z.string().min(1, 'CATALOG_ROOT is required (e.g. ../example-catalog)').describe('Path to catalog root').optional(),
  DATABASE_PATH: z.string().describe('Path to SQLite database file').optional(),
  MODE: z.enum(['file', 'database', 'hybrid']).default('file').describe('Server mode: file, database, or hybrid'),
  ADMIN_API_KEY: z.string().min(10).describe('Shared secret for protecting /admin routes').optional(),
});

export interface ServerConfig { 
  port: number; 
  catalogRoot?: string;
  databasePath?: string;
  mode: 'file' | 'database' | 'hybrid';
  adminApiKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  // Merge CLI args (do not overwrite explicit env if already set)
  const cli = parseArgv(process.argv.slice(2));
  const merged: Record<string,string|undefined> = { ...env };
  if(!merged.CATALOG_ROOT && cli.CATALOG_ROOT) {merged.CATALOG_ROOT = cli.CATALOG_ROOT;}
  if(!merged.PORT && cli.PORT) {merged.PORT = cli.PORT;}
  if(!merged.MODE && cli.MODE) {merged.MODE = cli.MODE;}
  if(!merged.DATABASE_PATH && cli.DATABASE_PATH) {merged.DATABASE_PATH = cli.DATABASE_PATH;}

  const parsed = configSchema.safeParse(merged);
  if(!parsed.success){
    const lines = parsed.error.issues.map(issue => ` - ${issue.path.join('.') || 'value'}: ${issue.message}`);
    const help = [
      'Required configuration is missing or invalid. You can provide it via:',
      '  PowerShell:  $env:CATALOG_ROOT = "../example-catalog"',
      '  CMD (Win):   set CATALOG_ROOT=..\\example-catalog',
      '  Bash/Zsh:    export CATALOG_ROOT=../example-catalog',
      '  CLI flag:    node dist/index.js --catalog-root ../example-catalog',
      '',
      'Database mode configuration:',
      '  PowerShell:  $env:MODE = "database"; $env:DATABASE_PATH = "./catalog.db"',
      '  CLI flag:    node dist/index.js --mode database --database-path ./catalog.db',
      '',
      'Issues:',
      ...lines
    ].join('\n');
    throw new Error(help);
  }

  const mode = (parsed.data.MODE || 'file');
  
  // Validate configuration based on mode
  if (mode === 'file' && !parsed.data.CATALOG_ROOT) {
    throw new Error('CATALOG_ROOT is required when using file mode');
  }
  if ((mode === 'database' || mode === 'hybrid') && !parsed.data.DATABASE_PATH) {
    throw new Error('DATABASE_PATH is required when using database or hybrid mode');
  }

  return {
    port: parsed.data.PORT ? Number(parsed.data.PORT) || 3000 : 3000,
    catalogRoot: parsed.data.CATALOG_ROOT,
    databasePath: parsed.data.DATABASE_PATH,
    mode,
    adminApiKey: parsed.data.ADMIN_API_KEY,
  };
}
