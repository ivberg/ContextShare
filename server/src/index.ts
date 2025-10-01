import { createApp, initializeDatabase } from './http/app';
import { loadConfig } from './config';
import { logger } from './logging/logger';
import { mountAdminUi } from './nextAdmin';

async function main(): Promise<void> {
  try {
    const config = loadConfig(process.env);
    
    // Initialize database if needed
    const dbService = await initializeDatabase(config);
    
    const app = createApp({ config, dbService });
    
    // Mount static admin UI if enabled
    if(process.env.ENABLE_ADMIN_UI === 'true'){
      try {
        // Mount the static Next.js export at /admin-ui
        await mountAdminUi(app);
      } catch (e){
        logger.error({ event: 'admin_ui_setup_failed', err: String(e) });
      }
    }
    
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
