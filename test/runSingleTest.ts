// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as path from 'path';
import Mocha = require('mocha');

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    reporter: 'spec'  // Use spec reporter for detailed output
  });

  const testFile = path.resolve(__dirname, 'httpErrorHandling.test.js');
  console.log(`\n🧪 Running single test: ${testFile}\n`);
  
  mocha.addFile(testFile);

  return new Promise((c, e) => {
    try {
      mocha.run((failures: number) => {
        console.log(`\n✅ Test completed with ${failures} failures\n`);
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error('❌ Test error:', err);
      e(err);
    }
  });
}
