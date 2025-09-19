#!/usr/bin/env node

import { Command } from 'commander';
import { SqliteDatabaseService } from '../database/service.js';
import { sql } from 'kysely';

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
        console.log(JSON.stringify(result.rows, null, 2));
      } else {
        // Table format
        if (result.rows.length === 0) {
          console.log('No results found.');
        } else {
          console.table(result.rows);
        }
      }
      
      console.log(`\n${result.rows.length} row(s) returned.`);
      
      await dbService.close();
      
    } catch (error) {
      console.error('Error executing query:', error);
      process.exit(1);
    }
  });

program.parse();