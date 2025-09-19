#!/usr/bin/env node

import { Command } from 'commander';
import { SqliteDatabaseService } from '../database/service.js';
import { sql } from 'kysely';
import { logger } from '../logging/logger.js';

const program = new Command();

program
  .name('db-query')
  .description('Execute SQL queries against the ContextShare database')
  .version('1.0.0');

program
  .argument('<query>', 'SQL query to execute')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .option('-d, --database <path>', 'Database file path', './catalog.db')
  .action(async (query: string, options) => {
    try {
      const dbService = new SqliteDatabaseService({ filename: options.database });
      await dbService.initialize();
      const db = dbService.getKysely();
      
      // Execute the query
      const result = await sql`${sql.raw(query)}`.execute(db);
      
      if (options.format === 'json') {
        process.stdout.write(JSON.stringify(result.rows, null, 2) + '\n');
      } else {
        // Table format
        if (result.rows.length === 0) {
          process.stdout.write('No results found.\n');
        } else {
          // Use console.table for structured output (allowed for CLI tools)
          // eslint-disable-next-line no-console
          console.table(result.rows);
        }
      }
      
      process.stdout.write(`\n${result.rows.length} row(s) returned.\n`);
      
      await dbService.close();
      
    } catch (error) {
      logger.error({ error: String(error), query }, 'Error executing database query');
      process.stderr.write(`Error executing query: ${String(error)}\n`);
      process.exit(1);
    }
  });

program.parse();