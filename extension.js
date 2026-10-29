const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { MODULES, fontPrelude } = require('./css/modules');

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

const LOADER_ID = 'be5invis.vscode-custom-css';
const IMPORTS_KEY = 'vscode_custom_css.imports';
const CSS_STATE_KEY = '3anakib.css.modules';

function uiFont() {
  const config = vscode.workspace.getConfiguration();
  return config.get('terminal.integrated.fontFamily') || config.get('editor.fontFamily');
}

function cssTarget(context, mod) {
  return path.join(context.globalStorageUri.fsPath, `3anakib-${mod.file}`);
}

function writeCss(context, ids) {
  fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });
  let changed = false;
  for (const mod of MODULES.filter((m) => ids.includes(m.id))) {
    const source = fs.readFileSync(context.asAbsolutePath(path.join('css', mod.file)), 'utf8');
    const content = (mod.id === 'mono-ui' ? fontPrelude(uiFont()) : '') + source;
    const target = cssTarget(context, mod);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current !== content) {
      fs.writeFileSync(target, content);
      changed = true;
    }
  }
  return changed;
}

function isOurImport(context, url) {
  return typeof url === 'string' && url.startsWith(pathToFileURL(context.globalStorageUri.fsPath).href);
}

async function setImports(context, ids) {
  const config = vscode.workspace.getConfiguration();
  const others = (config.get(IMPORTS_KEY) || []).filter((url) => !isOurImport(context, url));
  const ours = MODULES.filter((m) => ids.includes(m.id)).map((m) => pathToFileURL(cssTarget(context, m)).href);
  const imports = [...others, ...ours];
  await config.update(IMPORTS_KEY, imports, vscode.ConfigurationTarget.Global);
  return imports;
}

async function offerApply(message, imports) {
  if (!vscode.extensions.getExtension(LOADER_ID)) return;
  const apply = imports.length ? 'Apply and restart' : 'Remove patch and restart';
  const choice = await vscode.window.showInformationMessage(message, apply);
  if (choice !== apply) return;
  await vscode.commands.executeCommand(imports.length ? 'extension.installCustomCSS' : 'extension.uninstallCustomCSS');
}

async function ensureLoader() {
  if (vscode.extensions.getExtension(LOADER_ID)) return true;
  const install = 'Install loader';
  const choice = await vscode.window.showWarningMessage(
    '3anakib CSS extras need the "Custom CSS and JS Loader" extension. It patches VS Code\'s files, ' +
      'so VS Code will report the installation as corrupted (harmless, see the 3anakib README).',
    { modal: true },
    install
  );
  if (choice !== install) return false;
  await vscode.commands.executeCommand('workbench.extensions.installExtension', LOADER_ID);
  return true;
}

async function chooseCss(context) {
  const enabled = context.globalState.get(CSS_STATE_KEY, []);
  const picks = await vscode.window.showQuickPick(
    MODULES.map((m) => ({ ...m, picked: enabled.length ? enabled.includes(m.id) : m.id === 'spotlight' })),
    { canPickMany: true, title: '3anakib CSS extras', placeHolder: 'Pick the extras to load' }
  );
  if (!picks) return;
  if (!picks.length) return removeCss(context);
  if (!(await ensureLoader())) return;

  const ids = picks.map((p) => p.id);
  writeCss(context, ids);
  const imports = await setImports(context, ids);
  await context.globalState.update(CSS_STATE_KEY, ids);
  await offerApply('3anakib CSS extras are set. VS Code needs a restart to load them.', imports);
}

async function removeCss(context) {
  const imports = await setImports(context, []);
  await context.globalState.update(CSS_STATE_KEY, []);
  await offerApply('3anakib CSS extras removed from the loader. Restart to unload them.', imports);
}

async function syncCss(context) {
  const ids = context.globalState.get(CSS_STATE_KEY, []);
  if (!ids.length) return;
  try {
    if (!writeCss(context, ids)) return;
  } catch (err) {
    console.warn('3anakib: could not update CSS extras:', err && err.message);
    return;
  }
  const imports = vscode.workspace.getConfiguration().get(IMPORTS_KEY) || [];
  await offerApply('3anakib CSS extras were updated. Apply them?', imports);
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

  context.subscriptions.push(
    toggle,
    vscode.commands.registerCommand('3anakib.chooseCss', () => chooseCss(context)),
    vscode.commands.registerCommand('3anakib.removeCss', () => removeCss(context)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('terminal.integrated.fontFamily') || e.affectsConfiguration('editor.fontFamily')) {
        syncCss(context);
      }
    })
  );
  syncCss(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
