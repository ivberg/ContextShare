// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// Basic regression test for filename filter command integration.
// This runs in a lightweight fashion by importing the extension module and simulating a subset
// of behaviors. We cannot easily trigger the VS Code command palette here, but we can
// ensure the command is registered and callable.

import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Filename Filter Command', () => {
  test('Command is registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('copilotCatalog.filterFilename'), 'filterFilename command should be contributed');
  });
});
