import * as path from 'path';
import Mocha = require('mocha');
import { glob } from 'glob';

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = path.resolve(__dirname, '..');
  
  console.log('\n🧪 Mocha Test Runner Starting...');
  console.log(`Tests root: ${testsRoot}`);

  return new Promise((c, e) => {
    glob('**/**.test.js', { cwd: testsRoot }).then(files => {
        console.log(`\n📁 Found ${files.length} test files:`);
        files.forEach(f => console.log(`  - ${f}`));
        
        // Add files to the test suite
        files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

        try {
            console.log('\n▶️  Running Mocha tests...\n');
            // Run the mocha test
            mocha.run((failures: number) => {
            console.log(`\n✅ Mocha completed with ${failures} failures`);
            if (failures > 0) {
                e(new Error(`${failures} tests failed.`));
            } else {
                c();
            }
            });
        } catch (err) {
            console.error('❌ Mocha run error:', err);
            e(err);
        }
    }).catch(err => {
        console.error('❌ Glob error:', err);
        return e(err);
    });
  });
}
