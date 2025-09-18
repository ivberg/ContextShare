import { z } from 'zod';

// Basic CLI arg parsing (supports: --catalog-root, -c, --port)
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
    }
  }
  return out;
}

const configSchema = z.object({
  PORT: z.string().optional(),
  CATALOG_ROOT: z.string().min(1, 'CATALOG_ROOT is required (e.g. ../example-catalog)').describe('Path to catalog root'),
});

export interface ServerConfig { port: number; catalogRoot: string; }

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  // Merge CLI args (do not overwrite explicit env if already set)
  const cli = parseArgv(process.argv.slice(2));
  const merged: Record<string,string|undefined> = { ...env } as any;
  if(!merged.CATALOG_ROOT && cli.CATALOG_ROOT) merged.CATALOG_ROOT = cli.CATALOG_ROOT;
  if(!merged.PORT && cli.PORT) merged.PORT = cli.PORT;

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
      'Issues:',
      ...lines
    ].join('\n');
    throw new Error(help);
  }
  return {
    port: parsed.data.PORT ? Number(parsed.data.PORT) || 3000 : 3000,
    catalogRoot: parsed.data.CATALOG_ROOT,
  };
}
