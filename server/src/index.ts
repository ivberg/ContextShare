import { createApp } from './http/app';
import { loadConfig } from './config';
import { logger } from './logging/logger';

async function main(){
  try {
    const config = loadConfig(process.env);
    const app = createApp({ config });
    const port = config.port;
    app.listen(port, () => {
      logger.info({ event: 'server_listen', port }, 'Server listening');
    });
  } catch (err) {
    console.error('Startup failure:', err);
    process.exit(1);
  }
}

main();
