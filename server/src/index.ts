import { createApp, initializeDatabase } from './http/app';
import { loadConfig } from './config';
import { logger } from './logging/logger';

async function main(): Promise<void> {
  try {
    const config = loadConfig(process.env);
    
    // Initialize database if needed
    const dbService = await initializeDatabase(config);
    
    const app = createApp({ config, dbService });
    const port = config.port;
    app.listen(port, () => {
      logger.info({ 
        event: 'server_listen', 
        port, 
        mode: config.mode,
        catalogRoot: config.catalogRoot,
        databasePath: config.databasePath 
      }, 'Server listening');
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Startup failure:', err);
    process.exit(1);
  }
}

void main();
