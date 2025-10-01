#!/usr/bin/env node
/**
 * Azure deployment helper for ContextShare example server.
 * (Relocated under server/scripts)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync, copyFileSync, readdirSync, lstatSync, writeFileSync, readFileSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { ZipFile } from 'yazl';

function color(enabled, code){ return enabled ? `\u001b[${code}m` : ''; }
const args = process.argv.slice(2);
const SERVER_DIR = path.resolve(process.cwd());
function getFlag(name){
	const long = `--${name}`;
	const idx = args.findIndex(a => a === long || a.startsWith(long + '='));
	if(idx === -1) return undefined;
	const val = args[idx].includes('=') ? args[idx].split('=')[1] : args[idx+1];
	return val && !val.startsWith('--') ? val : (args[idx].includes('=') ? val : undefined);
}
function hasFlag(name){ return args.includes(`--${name}`); }

const noColor = hasFlag('no-color');
const cyan = (s)=> color(!noColor,'36')+s+color(!noColor,'0');
const green= (s)=> color(!noColor,'32')+s+color(!noColor,'0');
const yellow=(s)=> color(!noColor,'33')+s+color(!noColor,'0');
const red   =(s)=> color(!noColor,'31')+s+color(!noColor,'0');

const isWindows = () => process.platform === 'win32';

function sanitizePathEntry(entry){
	if(!entry) return entry;
	return entry.replace(/^"(.*)"$/, '$1');
}

function resolveExecutable(command){
	if(!isWindows()) return command;
	if(!command) return command;
	if(command.includes('\\') || command.includes('/')) return command;
	const pathValue = process.env.PATH ?? process.env.Path ?? process.env.path ?? '';
	const pathEntries = pathValue
		.split(';')
		.map(part => sanitizePathEntry(part.trim()))
		.filter(Boolean);
	const pathext = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
		.split(';')
		.map(ext => ext.trim())
		.filter(Boolean);
	const lowerCommand = command.toLowerCase();
	const hasExtension = pathext.some(ext => lowerCommand.endsWith(ext.toLowerCase()));
	const candidates = hasExtension ? [command] : pathext.map(ext => command + ext);
	for(const dir of pathEntries){
		for(const candidate of candidates){
			const fullPath = path.join(dir, candidate);
			if(existsSync(fullPath)){
				return fullPath;
			}
		}
	}
	return command;
}

function isCmdLike(command){
	if(!command) return false;
	const lower = command.toLowerCase();
	return lower.endsWith('.cmd') || lower.endsWith('.bat');
}

function log(msg){ process.stdout.write(msg + '\n'); }

function parseJson(raw, context){
	if(!raw) return undefined;
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw new Error(`Failed parsing JSON from ${context ?? 'az cli'}: ${error.message}`);
	}
}

const packageJsonPath = path.join(SERVER_DIR, 'package.json');
let serverPackageJson = {};
try {
	const packageJsonRaw = readFileSync(packageJsonPath, 'utf8');
	serverPackageJson = JSON.parse(packageJsonRaw);
} catch {}
const NATIVE_DEPENDENCY_HINTS = new Set(['better-sqlite3', 'sqlite3']);
function detectNativeDependencies(pkg){
	if(!pkg || typeof pkg !== 'object') return false;
	const dependencyKeys = new Set([
		...Object.keys(pkg.dependencies || {}),
		...Object.keys(pkg.optionalDependencies || {})
	]);
	for(const hint of NATIVE_DEPENDENCY_HINTS){
		if(dependencyKeys.has(hint)) return true;
	}
	return false;
}
const hasNativeDependencies = detectNativeDependencies(serverPackageJson);

function toDockerVolumePath(p){
	const resolved = path.resolve(p);
	if(!isWindows()) return resolved;
	const match = resolved.match(/^([A-Za-z]):\\(.*)$/);
	if(!match) return resolved.replace(/\\/g,'/');
	const drive = match[1].toLowerCase();
	const rest = match[2].replace(/\\/g,'/');
	return `//${drive}/${rest}`;
}

function detectDocker(){
	try {
		const result = spawnSync('docker', ['--version'], { stdio: 'ignore' });
		return result.status === 0;
	} catch {
		return false;
	}
}

const dockerAvailable = detectDocker();

const envSources = new Map();

function setEnvValue(key, value, { overwrite = false } = {}){
	const existing = process.env[key];
	if(existing !== undefined){
		if(!overwrite) return false;
		if(envSources.get(key) !== 'envFile') return false;
	}
	process.env[key] = value;
	envSources.set(key, 'envFile');
	return true;
}

function loadEnvFromFile(filePath, { overwrite = false } = {}){
	if(!filePath || !existsSync(filePath)) return;
	const content = readFileSync(filePath, 'utf8');
	for(const line of content.split(/\r?\n/)){
		const trimmed = line.trim();
		if(!trimmed || trimmed.startsWith('#')) continue;
		const idx = trimmed.indexOf('=');
		if(idx === -1) continue;
		const key = trimmed.slice(0, idx).trim();
		if(!key) continue;
		let value = trimmed.slice(idx + 1).trim();
		if((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))){
			value = value.slice(1, -1);
		}
		setEnvValue(key, value, { overwrite });
	}
}

function loadEnvDefaults(){
	const cwd = process.cwd();
	const candidates = [
		{ file: path.join(cwd, '.env'), overwrite: false },
		{ file: path.join(cwd, '.env.local'), overwrite: true }
	];
	for(const candidate of candidates){
		loadEnvFromFile(candidate.file, { overwrite: candidate.overwrite });
	}
}

loadEnvDefaults();

const ENV_KEYS = {
	resourceGroup: 'CONTEXTSHARE_AZURE_RESOURCE_GROUP',
	location: 'CONTEXTSHARE_AZURE_LOCATION',
	appName: 'CONTEXTSHARE_AZURE_APP_NAME',
	planName: 'CONTEXTSHARE_AZURE_PLAN_NAME',
	planSku: 'CONTEXTSHARE_AZURE_PLAN_SKU',
	sku: 'CONTEXTSHARE_AZURE_SKU',
	mode: 'CONTEXTSHARE_AZURE_MODE',
	catalogRoot: 'CONTEXTSHARE_AZURE_CATALOG_ROOT',
	includeCatalog: 'CONTEXTSHARE_AZURE_INCLUDE_CATALOG',
	includeAdminUi: 'CONTEXTSHARE_AZURE_INCLUDE_ADMIN_UI',
	databasePath: 'CONTEXTSHARE_AZURE_DATABASE_PATH',
	adminApiKey: 'CONTEXTSHARE_AZURE_ADMIN_API_KEY',
	nodeFxVersion: 'CONTEXTSHARE_AZURE_NODE_VERSION'
,
	remoteBuild: 'CONTEXTSHARE_AZURE_REMOTE_BUILD'
};

const VALID_MODES = new Set(['file', 'database', 'hybrid']);
const MODE_ALIASES = new Map([
	['catalog', 'file'],
	['files', 'file'],
	['db', 'database'],
	['sql', 'database'],
	['hybrid', 'hybrid']
]);

function readEnv(envKey){
	const raw = process.env[envKey];
	if(typeof raw !== 'string') return undefined;
	const trimmed = raw.trim();
	return trimmed === '' ? undefined : trimmed;
}

function parseBooleanValue(value){
	if(value === undefined) return undefined;
	const normalized = value.trim().toLowerCase();
	if(['false','0','no','off',''].includes(normalized)) return false;
	return true;
}

function parseNodeMajor(value){
	if(!value) return undefined;
	const match = String(value).match(/(\d{1,2})/);
	if(!match) return undefined;
	const major = Number.parseInt(match[1], 10);
	return Number.isNaN(major) ? undefined : major;
}

function getOption(flagName, envKey, defaultValue){
	const flagValue = getFlag(flagName);
	if(flagValue !== undefined) return flagValue;
	const envValue = readEnv(envKey);
	if(envValue !== undefined) return envValue;
	return defaultValue;
}

function getBooleanOption(flagName, envKey, defaultValue = false){
	if(hasFlag(flagName)) return true;
	const flagValue = getFlag(flagName);
	if(flagValue !== undefined){
		const parsed = parseBooleanValue(flagValue);
		return parsed ?? defaultValue;
	}
	const envValue = readEnv(envKey);
	if(envValue !== undefined){
		const parsed = parseBooleanValue(envValue);
		if(parsed !== undefined) return parsed;
	}
	return defaultValue;
}

const SUPPORTED_NODE_CHANNELS = new Set(['18-lts', '20-lts']);

function normalizeNodeFxVersion(value){
	const fallback = 'NODE|20-lts';
	if(!value) return fallback;
	const trimmed = value.trim();
	const channel = trimmed.toUpperCase().startsWith('NODE|') ? trimmed.slice(5) : trimmed;
	const normalizedChannel = channel.toLowerCase();
	if(!SUPPORTED_NODE_CHANNELS.has(normalizedChannel)){
		log(yellow(`Requested Node version "${value}" is not in the supported list (${[...SUPPORTED_NODE_CHANNELS].join(', ')}). Falling back to Node 20 LTS.`));
		return fallback;
	}
	return `NODE|${normalizedChannel}`;
}

function formatCommand(command, args){
	return [command, ...args].map(arg => {
		if(arg === undefined || arg === null) return '';
		if(/[^A-Za-z0-9_.:\\/@=-]/.test(arg)){
			return `"${arg.replace(/"/g,'\\"')}"`;
		}
		return arg;
	}).filter(Boolean).join(' ');
}

function spawnSafe(command, args = [], options = {}){
	const { silent = false, allowFailure = false, ...rawSpawnOptions } = options;
	const spawnOptions = { stdio: 'inherit', shell: false, ...rawSpawnOptions };
	if(!silent){ log(cyan(`> ${formatCommand(command, args)}`)); }
	const runCommand = (cmd, opts) => {
		const needsShell = opts.shell || (isWindows() && isCmdLike(cmd));
		if(needsShell){
			const commandLine = formatCommand(cmd, args);
			return spawnSync(commandLine, [], { ...opts, shell: true });
		}
		return spawnSync(cmd, args, opts);
	};
	let result = runCommand(command, spawnOptions);
	if(result.error && result.error.code === 'ENOENT' && isWindows() && !spawnOptions.shell){
		const resolved = resolveExecutable(command);
		if(resolved && resolved !== command){
			if(!silent){ log(yellow(`  resolved ${command} -> ${resolved}`)); }
			result = runCommand(resolved, spawnOptions);
		}
	}
	if(result.error && ['ENOENT','EINVAL'].includes(result.error.code || '') && isWindows() && !spawnOptions.shell){
		if(!silent){ log(yellow('  retrying via cmd.exe')); }
		const commandLine = formatCommand(command, args);
		result = spawnSync(commandLine, [], { ...spawnOptions, shell: true });
	}
	if(result.error){ throw result.error; }
	if(result.status !== 0 && !allowFailure){
		throw new Error(`${command} exited with code ${result.status}`);
	}
	return result;
}

function az(args, options = {}){
	return spawnSafe('az', args, options);
}

function azJson(args, options = {}){
	const finalArgs = [...args];
	if(!finalArgs.includes('--output') && !finalArgs.includes('-o')){
		finalArgs.push('--output', 'json');
	}
	const spawnOptions = { silent: true, stdio: 'pipe', ...options };
	const result = az(finalArgs, spawnOptions);
	const stdout = result.stdout?.toString('utf8')?.trim();
	return parseJson(stdout, finalArgs.join(' '));
}

function normalizeMode(modeRaw){
	const fallback = 'file';
	if(!modeRaw) return fallback;
	const lower = modeRaw.trim().toLowerCase();
	const mapped = MODE_ALIASES.get(lower) ?? lower;
	if(!VALID_MODES.has(mapped)){
		log(red(`Invalid --mode value '${modeRaw}'. Supported values: ${[...VALID_MODES].join(', ')}.`));
		process.exit(1);
	}
	if(mapped !== lower){
		log(yellow(`Interpreting mode '${modeRaw}' as '${mapped}'.`));
	}
	return mapped;
}

function parse(){
	const normalizedMode = normalizeMode(getOption('mode', ENV_KEYS.mode, 'file'));
	const remoteBuildFlagProvided = args.some(arg => arg === '--remote-build' || arg.startsWith('--remote-build='));
	const remoteBuildEnvProvided = readEnv(ENV_KEYS.remoteBuild) !== undefined;
	const defaultRemoteBuild = false;
	const p = {
		resourceGroup: getOption('resource-group', ENV_KEYS.resourceGroup),
		location: getOption('location', ENV_KEYS.location),
		appName: getOption('app-name', ENV_KEYS.appName),
		planName: getOption('plan-name', ENV_KEYS.planName),
		planSku: undefined,
		mode: normalizedMode,
		catalogRoot: getOption('catalog-root', ENV_KEYS.catalogRoot, 'example-catalog'),
		includeCatalog: getBooleanOption('include-catalog', ENV_KEYS.includeCatalog),
		includeAdminUi: getBooleanOption('include-admin-ui', ENV_KEYS.includeAdminUi),
		databasePath: getOption('database-path', ENV_KEYS.databasePath),
		adminApiKey: getOption('admin-api-key', ENV_KEYS.adminApiKey),
		__nodeFxOverride: getOption('node-fx-version', ENV_KEYS.nodeFxVersion),
		__nodeVersionOverride: getOption('node-version', ENV_KEYS.nodeFxVersion),
		remoteBuild: getBooleanOption('remote-build', ENV_KEYS.remoteBuild, defaultRemoteBuild)
	};
	p.nodeFxVersion = normalizeNodeFxVersion(p.__nodeFxOverride ?? p.__nodeVersionOverride ?? 'NODE|20-lts');
	if(!p.planSku){
		p.planSku = getFlag('plan-sku')
			?? getFlag('sku')
			?? readEnv(ENV_KEYS.planSku)
			?? readEnv(ENV_KEYS.sku)
			?? 'B1';
	}
	const missing = [];
	if(!p.resourceGroup) missing.push('--resource-group');
	if(!p.location) missing.push('--location');
	if(!p.appName) missing.push('--app-name');
	if(['database','hybrid'].includes(p.mode) && !p.databasePath) missing.push('--database-path (required for database/hybrid)');
	if(missing.length){
		log(red('Missing required flags: ' + missing.join(', ')));
		process.exit(1);
	}
	p.planName = p.planName || `${p.appName}-plan`;
	p.nodeVersionSetting = p.nodeFxVersion.split('|')[1] || '20-lts';
	const expectedNodeMajor = parseNodeMajor(p.nodeVersionSetting);
	const localNodeMajor = parseNodeMajor(process.version);
	let remoteBuildAutoReason;
	if(!p.remoteBuild && hasNativeDependencies && process.platform !== 'linux'){
		const nodeMajorMismatch = expectedNodeMajor && localNodeMajor && expectedNodeMajor !== localNodeMajor;
		if(nodeMajorMismatch && !remoteBuildFlagProvided && !remoteBuildEnvProvided){
			p.remoteBuild = true;
			remoteBuildAutoReason = `Local Node ${process.version} differs from target Node ${p.nodeVersionSetting}`;
		}
	}
	if(p.remoteBuild){
		if(remoteBuildAutoReason){
			log(yellow(`${remoteBuildAutoReason}; enabling remote build so Azure installs native modules with the correct runtime.`));
		} else if(!remoteBuildFlagProvided && !remoteBuildEnvProvided){
			log(yellow('Remote build enabled via defaults; Azure will restore dependencies during deployment.'));
		}
	} else if(hasNativeDependencies && process.platform !== 'linux'){
		if(dockerAvailable){
			log(green('Docker detected; native dependencies will be installed inside a node:20 container for Linux compatibility.'));
		} else if(!remoteBuildFlagProvided && expectedNodeMajor && localNodeMajor && expectedNodeMajor !== localNodeMajor){
			log(yellow(`Warning: Local Node ${process.version} differs from target Node ${p.nodeVersionSetting}. Consider installing Docker or pass --remote-build=true.`));
		} else {
			log(yellow('Docker not detected; will install dependencies locally targeting linux-x64. Set --remote-build=true to let Azure restore dependencies instead.'));
		}
	}
	delete p.__nodeFxOverride;
	delete p.__nodeVersionOverride;
	return p;
}

function ensureAzCli(){
	const version = az(['--version'], { silent: true, stdio: 'ignore', allowFailure: true });
	if(version.status !== 0){
		log(red('Azure CLI not found. Install from https://learn.microsoft.com/cli/azure/install-azure-cli'));
		process.exit(1);
	}
	const account = az(['account', 'show'], { silent: true, stdio: 'ignore', allowFailure: true });
	if(account.status !== 0){
		log(red('Not logged in. Run: az login'));
		process.exit(1);
	}
}

function ensureResourceGroup(rg, location){
	const exists = az(['group', 'show', '--name', rg], { silent: true, stdio: 'ignore', allowFailure: true });
	if(exists.status === 0){
		log(green(`Resource group ${rg} exists`));
		return;
	}
	az(['group', 'create', '--name', rg, '--location', location]);
}
function ensurePlan(rg, planName, sku){
	const exists = az(['appservice', 'plan', 'show', '--name', planName, '--resource-group', rg], { silent: true, stdio: 'ignore', allowFailure: true });
	if(exists.status === 0){
		log(green(`App Service plan ${planName} exists`));
		return;
	}
	az(['appservice', 'plan', 'create', '--name', planName, '--resource-group', rg, '--sku', sku, '--is-linux']);
}
function ensureWebApp(rg, appName, planName){
	const exists = az(['webapp', 'show', '--name', appName, '--resource-group', rg], { silent: true, stdio: 'ignore', allowFailure: true });
	if(exists.status === 0){
		log(green(`WebApp ${appName} exists`));
		return;
	}
	az(['webapp', 'create', '--name', appName, '--resource-group', rg, '--plan', planName, '--runtime', 'NODE|20-lts']);
}

function getRuntimeConfig(rg, appName){
	return azJson([
		'webapp','config','show',
		'--resource-group', rg,
		'--name', appName,
		'--query','{linuxFxVersion:linuxFxVersion,nodeVersion:siteConfig.nodeVersion}'
	]);
}

function logRuntimeState(label, config){
	if(!config) return;
	const linuxFxVersion = config.linuxFxVersion || '(unset)';
	const nodeVersion = config.nodeVersion || '(unset)';
	log(cyan(`${label}: linuxFxVersion=${linuxFxVersion}; siteConfig.nodeVersion=${nodeVersion}`));
	const linuxMajor = parseNodeMajor(linuxFxVersion);
	const kuduMajor = parseNodeMajor(nodeVersion);
	if(linuxMajor && kuduMajor && linuxMajor !== kuduMajor){
		log(yellow(`  Warning: SCM is still reporting Node ${nodeVersion}. Restart may be required to align with ${linuxFxVersion}.`));
	}
}

function ensureRuntimeVersion(rg, appName, nodeFxVersion){
	const before = getRuntimeConfig(rg, appName);
	const current = before?.linuxFxVersion?.trim();
	if(current !== nodeFxVersion){
		log(yellow(`Updating runtime stack to ${nodeFxVersion}`));
		az(['webapp','config','set','--resource-group', rg, '--name', appName, '--linux-fx-version', nodeFxVersion]);
		const after = getRuntimeConfig(rg, appName);
		return { changed: true, before, after };
	}
	return { changed: false, before, after: before };
}
function configureAppSettings(rg, appName, settings){
	const kv = Object.entries(settings)
		.map(([k,v]) => v === undefined ? undefined : `${k}=${v}`)
		.filter(Boolean);
	if(kv.length){
		az(['webapp', 'config', 'appsettings', 'set', '--resource-group', rg, '--name', appName, '--settings', ...kv]);
	}
}

function deployZipPackage(opts, zipPath){
	const deploymentHelp = () => {
		log(yellow(`Review Kudu logs with: az webapp log deployment show --resource-group ${opts.resourceGroup} --name ${opts.appName}`));
		log(yellow('If access is blocked, temporarily relax App Service access restrictions to allow your IP.'));
	};
	
	// Use config-zip which is more reliable for Node.js deployments with remote build
	log(green('Deploying zip package via az webapp deployment source config-zip...'));
	log(yellow('This may take several minutes. Deployment is in progress...'));
	
	try {
		az([
			'webapp','deployment','source','config-zip',
			'--resource-group', opts.resourceGroup,
			'--name', opts.appName,
			'--src', zipPath
		]);
		log(green('Deployment command completed successfully'));
	} catch (error){
		log(red('Azure deployment failed.'));
		deploymentHelp();
		throw error;
	}
}
function recursiveCopy(srcDir, destDir){
	if(!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
	for(const entry of readdirSync(srcDir)){
		const s = path.join(srcDir, entry);
		const d = path.join(destDir, entry);
		const st = lstatSync(s);
		if(st.isDirectory()) recursiveCopy(s,d); else copyFileSync(s,d);
	}
}

function addDirectoryToZip(zipfile, directory, relative = ''){
	const entries = readdirSync(directory);
	for(const entry of entries){
		const fullPath = path.join(directory, entry);
		const stat = lstatSync(fullPath);
		const relativePath = relative ? `${relative}/${entry}` : entry;
		const normalizedPath = relativePath.split(path.sep).join('/');
		if(stat.isDirectory()){
			addDirectoryToZip(zipfile, fullPath, relativePath);
		} else if(stat.isFile()){
			zipfile.addFile(fullPath, normalizedPath);
		}
	}
}

function createZipArchive(sourceDir, zipPath){
	return new Promise((resolve, reject) => {
		const zipfile = new ZipFile();
		const output = zipfile.outputStream.pipe(createWriteStream(zipPath));
		let settled = false;
		const onResolve = () => { if(!settled){ settled = true; resolve(); } };
		const onReject = (error) => { if(!settled){ settled = true; reject(error); } };
		output.on('close', onResolve);
		output.on('error', onReject);
		try {
			addDirectoryToZip(zipfile, sourceDir);
			zipfile.end();
		} catch (error){
			zipfile.end();
			onReject(error);
		}
	});
}

async function buildAndPackage(opts){
	const distDir = path.join(SERVER_DIR, 'dist');
	spawnSafe('npm', ['run', 'build'], { cwd: SERVER_DIR });
	const workDir = path.join(SERVER_DIR, '.azure-deploy');
	if(existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
	mkdirSync(workDir, { recursive: true });
	copyFileSync(path.join(SERVER_DIR, 'package.json'), path.join(workDir, 'package.json'));
	try { copyFileSync(path.join(SERVER_DIR, 'package-lock.json'), path.join(workDir, 'package-lock.json')); } catch {}
	try { copyFileSync(path.join(SERVER_DIR, '.deployment'), path.join(workDir, '.deployment')); } catch {}
	// Copy and adjust TypeScript config for remote build (different directory structure in deployment)
	try {
		const tsconfigPath = path.join(SERVER_DIR, 'tsconfig.json');
		const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
		// Adjust paths for deployment package structure (src/ and shared/ at root level)
		tsconfig.compilerOptions.rootDir = '.';
		tsconfig.compilerOptions.baseUrl = '.';
		tsconfig.include = ['src', 'shared/catalogExportTypes.ts'];
		writeFileSync(path.join(workDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
	} catch {}
	const installArgs = ['install', '--omit=dev', '--no-audit', '--no-fund'];
	let dependenciesInstalled = false;
	let remoteBuildActive = opts.remoteBuild;
	if(!remoteBuildActive){
		if(process.platform !== 'linux' && hasNativeDependencies){
			if(dockerAvailable){
				const volumePath = toDockerVolumePath(workDir);
				log(green('Installing production dependencies inside node:20 container for Linux compatibility...'));
				spawnSafe('docker', [
					'run','--rm',
					'-v', `${volumePath}:/workspace`,
					'-w','/workspace',
					'node:20',
					'npm',
					...installArgs
				]);
				dependenciesInstalled = true;
			} else {
				const linuxEnv = {
					...process.env,
					npm_config_platform: 'linux',
					npm_config_arch: 'x64',
					npm_config_target_platform: 'linux',
					npm_config_target_arch: 'x64',
					npm_config_target_libc: 'glibc',
					npm_config_force: 'true'
				};
				try {
					log(green('Installing production dependencies locally with npm (platform=linux, arch=x64)...'));
					spawnSafe('npm', installArgs, { cwd: workDir, env: linuxEnv });
					dependenciesInstalled = true;
				} catch (error){
					log(yellow(`npm install targeting linux-x64 failed (${error?.message ?? 'unknown error'}). Falling back to Azure remote build.`));
					remoteBuildActive = true;
				}
			}
		}
		if(!remoteBuildActive && !dependenciesInstalled){
			spawnSafe('npm', installArgs, { cwd: workDir });
			dependenciesInstalled = true;
		}
	}
	if(remoteBuildActive){
		log(yellow('Remote build enabled; skipping local npm install so Azure can restore dependencies.'));
		// For remote build, copy source files instead of dist (Azure will compile)
		const srcDir = path.join(SERVER_DIR, 'src');
		if(existsSync(srcDir)){
			recursiveCopy(srcDir, path.join(workDir, 'src'));
			log(green('Copied source files for remote build'));
		}
		// Copy shared types directory (required by tsconfig includes)
		const repoRoot = path.resolve(SERVER_DIR, '..');
		const sharedDir = path.join(repoRoot, 'shared');
		if(existsSync(sharedDir)){
			recursiveCopy(sharedDir, path.join(workDir, 'shared'));
			log(green('Copied shared types directory for remote build'));
		}
	} else {
		// For local build, copy compiled dist directory
		writeFileSync(path.join(workDir, 'server.js'), `// bootstrap\nimport('./dist/index.js');\n`);
		recursiveCopy(distDir, path.join(workDir, 'dist'));
	}
	
	// Copy existing SQLite database seed file if INCLUDE_CATALOG is true (for database mode)
	// This will be used as a seed/initial database that gets copied to persistent storage on first run
	if(opts.includeCatalog && (opts.mode === 'database' || opts.mode === 'hybrid') && opts.databasePath){
		const localDbPath = path.join(SERVER_DIR, 'catalog.db');
		if(!existsSync(localDbPath)){
			log(red(`Database file not found: ${localDbPath}`));
			log(red('Set CONTEXTSHARE_AZURE_INCLUDE_CATALOG=false if you want to start with empty database'));
			throw new Error(`Database file catalog.db not found at ${localDbPath}`);
		}
		// Copy database as seed file to wwwroot - startup script will copy to /home/site/data if needed
		copyFileSync(localDbPath, path.join(workDir, 'catalog.db.seed'));
		log(green(`Copied SQLite database as seed file from ${localDbPath} to deployment package`));
	} else if((opts.mode === 'database' || opts.mode === 'hybrid')){
		log(yellow('INCLUDE_CATALOG=false - no seed file included. Will use existing database or create empty one if none exists.'));
	}
	
	// Copy file-based catalog directory for file mode or hybrid mode
	if(opts.includeCatalog && (opts.mode === 'file' || opts.mode === 'hybrid')){
		const repoRoot = path.resolve(SERVER_DIR, '..');
		const catalogSource = path.resolve(repoRoot, opts.catalogRoot);
		const catalogRelative = path.relative(repoRoot, catalogSource);
		if(catalogRelative.startsWith('..') || path.isAbsolute(catalogRelative)){
			throw new Error('catalog-root must resolve inside the repository root');
		}
		if(!existsSync(catalogSource)){
			log(red(`Catalog directory not found: ${catalogSource}`));
			log(red('Set CONTEXTSHARE_AZURE_INCLUDE_CATALOG=false or provide valid CATALOG_ROOT path'));
			throw new Error(`Catalog root ${opts.catalogRoot} not found at ${catalogSource}`);
		}
		const catalogDestination = path.join(workDir, opts.catalogRoot);
		const catalogDestResolved = path.resolve(catalogDestination);
		const destRelative = path.relative(workDir, catalogDestResolved);
		if(destRelative.startsWith('..') || path.isAbsolute(destRelative)){
			throw new Error('Resolved catalog destination escapes deployment workspace');
		}
		recursiveCopy(catalogSource, catalogDestination);
		log(green(`Copied file-based catalog from ${catalogSource} to deployment package`));
	}
	if(opts.includeAdminUi){
		const adminDir = path.join(SERVER_DIR, 'web-admin');
		if(!existsSync(adminDir)) { log(yellow('Admin UI directory missing, skipping include-admin-ui')); }
		else {
			log(green('Building admin UI (Next.js static export)...'));
			spawnSafe('npm', ['install', '--no-audit', '--no-fund'], { cwd: adminDir });
			// Set NEXT_PUBLIC_API_BASE_URL before building so it's baked into the static export
			const adminBuildEnv = {
				...process.env,
				NEXT_PUBLIC_API_BASE_URL: '/'
			};
			log(yellow('Setting NEXT_PUBLIC_API_BASE_URL=/ for static build'));
			spawnSafe('npm', ['run', 'build'], { cwd: adminDir, env: adminBuildEnv });
			const outDir = path.join(adminDir, 'out');
			if(existsSync(outDir)) {
				recursiveCopy(outDir, path.join(workDir, 'admin-ui'));
				log(green('Copied Next.js static export to admin-ui/'));
			}
			else log(yellow('Static export not found (out/). Did next.config output=export?'));
		}
	}
	const zipPath = path.join(SERVER_DIR, `contextshare-deploy-${Date.now()}.zip`);
	// Zip the contents of workDir at the root of the zip, not the folder itself
	const entries = readdirSync(workDir);
	const zipfile = new ZipFile();
	const output = zipfile.outputStream.pipe(createWriteStream(zipPath));
	let settled = false;
	const onResolve = () => { if(!settled){ settled = true; }; };
	const onReject = (error) => { if(!settled){ settled = true; throw error; } };
	output.on('close', onResolve);
	output.on('error', onReject);
	try {
		for(const entry of entries){
			const fullPath = path.join(workDir, entry);
			const stat = lstatSync(fullPath);
			if(stat.isDirectory()){
				addDirectoryToZip(zipfile, fullPath, entry);
			} else if(stat.isFile()){
				zipfile.addFile(fullPath, entry);
			}
		}
		zipfile.end();
	} catch (error){
		zipfile.end();
		onReject(error);
	}
	await new Promise((resolve, reject) => {
		output.on('close', resolve);
		output.on('error', reject);
	});
	return { zipPath, remoteBuild: remoteBuildActive };
}

async function main(){
	const opts = parse();
	ensureAzCli();
	log(green('Starting Azure deployment...'));
	ensureResourceGroup(opts.resourceGroup, opts.location);
	ensurePlan(opts.resourceGroup, opts.planName, opts.planSku);
	ensureWebApp(opts.resourceGroup, opts.appName, opts.planName);
	const runtimeState = ensureRuntimeVersion(opts.resourceGroup, opts.appName, opts.nodeFxVersion);
	if(runtimeState.before && runtimeState.changed){
		logRuntimeState('Runtime config (before update)', runtimeState.before);
	}
	logRuntimeState(runtimeState.changed ? 'Runtime config (after update)' : 'Runtime config', runtimeState.after);
	const expectedNodeMajor = parseNodeMajor(opts.nodeVersionSetting);
	const hasMismatch = (config) => {
		if(!config) return false;
		const kuduMajor = parseNodeMajor(config.nodeVersion);
		return Boolean(expectedNodeMajor && kuduMajor && expectedNodeMajor !== kuduMajor);
	};
	const mismatchBeforeRestart = hasMismatch(runtimeState.after);
	if(runtimeState.changed || mismatchBeforeRestart){
		log(yellow('Restarting web app to apply runtime configuration changes...'));
		az(['webapp','restart','--resource-group', opts.resourceGroup, '--name', opts.appName]);
		const postRestart = getRuntimeConfig(opts.resourceGroup, opts.appName);
		logRuntimeState('Runtime config (post-restart)', postRestart);
		if(hasMismatch(postRestart)){
			log(yellow('If SCM still reports an unexpected Node version, ensure the App Service plan runtime is updated and allowlist your IP to inspect Kudu logs.'));
		}
	}
	const buildResult = await buildAndPackage(opts);
	opts.remoteBuild = buildResult.remoteBuild;
	
	// CRITICAL: Configure remote build settings BEFORE deploying the zip
	// so Azure knows to run npm install during deployment
	if(opts.remoteBuild){
		log(yellow('Configuring remote build settings before deployment...'));
		configureAppSettings(opts.resourceGroup, opts.appName, {
			SCM_DO_BUILD_DURING_DEPLOYMENT: 'true',
			NPM_CONFIG_PRODUCTION: 'false'
		});
	} else {
		// Ensure remote build is disabled if not needed
		log(yellow('Ensuring remote build is disabled (dependencies pre-installed locally)...'));
		configureAppSettings(opts.resourceGroup, opts.appName, {
			SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
		});
	}
	
	deployZipPackage(opts, buildResult.zipPath);
	const settings = {
		MODE: opts.mode,
		CATALOG_ROOT: opts.mode === 'file' || opts.mode === 'hybrid' ? `./${opts.catalogRoot}` : undefined,
		DATABASE_PATH: (opts.mode === 'database' || opts.mode === 'hybrid') ? (opts.databasePath || '/home/site/data/catalog.db') : undefined,
		NODE_ENV: 'production',
		ADMIN_API_KEY: opts.adminApiKey,
		ENABLE_ADMIN_UI: opts.includeAdminUi ? 'true' : undefined,
		NEXT_PUBLIC_API_BASE_URL: opts.includeAdminUi ? '/' : undefined,
		WEBSITE_NODE_DEFAULT_VERSION: opts.nodeVersionSetting,
		SCM_NODE_VERSION: opts.nodeVersionSetting,
		SCM_DO_BUILD_DURING_DEPLOYMENT: opts.remoteBuild ? 'true' : 'false',
		NPM_CONFIG_PRODUCTION: opts.remoteBuild ? 'false' : undefined
	};
	configureAppSettings(opts.resourceGroup, opts.appName, settings);
	log(green('Deployment completed. Browse your app at:'));
	log(yellow(`  https://${opts.appName}.azurewebsites.net/healthz`));
}
main().catch(err => { console.error(red(String(err?.stack || err))); process.exit(1); });

