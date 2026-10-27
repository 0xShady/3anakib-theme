const vscode = require('vscode');

const ZEN_SETTINGS = {
  'window.commandCenter': true,
  'workbench.layoutControl.enabled': false,
  'workbench.navigationControl.enabled': false,
  'chat.agentsControl.enabled': false,
  'window.menuBarVisibility': 'compact',
  'window.title': '${rootName}',
  'editor.minimap.enabled': false,
  'breadcrumbs.enabled': false,
  'editor.glyphMargin': false,
  'editor.folding': false,
  'workbench.editor.editorActionsLocation': 'hidden'
};

const STATE_KEY = '3anakib.zen.on';
const BACKUP_KEY = '3anakib.zen.backup';

function isRegistered(config, key) {
  return config.inspect(key) !== undefined;
}

async function safeUpdate(config, key, value) {
  try {
    await config.update(key, value, vscode.ConfigurationTarget.Global);
    return true;
  } catch (err) {
    console.warn(`3anakib Zen: could not set ${key}:`, err && err.message);
    return false;
  }
}

function activate(context) {
  const toggle = vscode.commands.registerCommand('3anakib.toggleZen', async () => {
    const on = context.globalState.get(STATE_KEY, false);
    const config = vscode.workspace.getConfiguration();

    if (!on) {
      const backup = {};
      for (const [key, zenValue] of Object.entries(ZEN_SETTINGS)) {
        if (!isRegistered(config, key)) continue;
        backup[key] = config.inspect(key).globalValue;
        await safeUpdate(config, key, zenValue);
      }
      await context.globalState.update(BACKUP_KEY, backup);
      await context.globalState.update(STATE_KEY, true);
      vscode.window.setStatusBarMessage('$(eye-closed) 3anakib Zen on', 2000);
    } else {
      const backup = context.globalState.get(BACKUP_KEY, {});
      for (const key of Object.keys(backup)) {
        await safeUpdate(config, key, backup[key]);
      }
      await context.globalState.update(STATE_KEY, false);
      vscode.window.setStatusBarMessage('$(eye) 3anakib Zen off', 2000);
    }
  });

  context.subscriptions.push(toggle);
}

function deactivate() {}

module.exports = { activate, deactivate };
