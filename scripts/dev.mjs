#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cssModules from '../css/modules.js';
import { BASE_THEME, THEMES_DIR, VARIANTS_DIR, buildAll } from './build-themes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = path.join(ROOT, '.dev-profile');
const CSS_DIR = path.join(ROOT, 'css');
const PORT = Number(process.env.DEV_PORT || 9333);
const STYLE_ID = 'anakib-live-css';

const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);

function codeBinary() {
  if (process.env.CODE_BIN) return process.env.CODE_BIN;
  if (process.platform === 'darwin') {
    for (const dir of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      const bin = path.join(dir, 'Visual Studio Code.app/Contents/MacOS/Code');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return 'code';
}

function realSettingsPath() {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library/Application Support/Code/User/settings.json');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || '', 'Code/User/settings.json');
  return path.join(home, '.config/Code/User/settings.json');
}

function seedProfile() {
  const target = path.join(PROFILE, 'User/settings.json');
  if (fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const src = realSettingsPath();
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, target);
    log('seeded dev profile from', src);
  } else {
    fs.writeFileSync(target, JSON.stringify({ 'workbench.colorTheme': '3anakib theme' }, null, 2));
  }
}

function launch() {
  seedProfile();
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(codeBinary(), [
    `--user-data-dir=${PROFILE}`,
    `--extensionDevelopmentPath=${ROOT}`,
    `--remote-debugging-port=${PORT}`,
    '--new-window',
    ROOT
  ], { stdio: 'ignore', env });
  child.on('error', (err) => {
    console.error('Could not start VS Code:', err.message, '\nSet CODE_BIN to the VS Code executable.');
    process.exit(1);
  });
  child.on('exit', () => {
    log('dev window closed');
    process.exit(0);
  });
  process.on('SIGINT', () => child.kill());
  process.on('SIGTERM', () => child.kill());
}

const sessions = new Map();

function injectExpression(css) {
  return `(() => {
    const apply = () => {
      let el = document.getElementById(${JSON.stringify(STYLE_ID)});
      if (!el) {
        el = document.createElement('style');
        el.id = ${JSON.stringify(STYLE_ID)};
        document.head.appendChild(el);
      }
      el.textContent = ${JSON.stringify(css)};
    };
    if (document.head) apply(); else document.addEventListener('DOMContentLoaded', apply, { once: true });
  })()`;
}

function devUiFont() {
  try {
    const settings = fs.readFileSync(path.join(PROFILE, 'User/settings.json'), 'utf8');
    const font = (key) => settings.match(new RegExp(`"${key.replace(/\./g, '\\.')}"\\s*:\\s*"([^"]*)"`))?.[1];
    return font('terminal.integrated.fontFamily') || font('editor.fontFamily');
  } catch {
    return undefined;
  }
}

function readCss() {
  return cssModules.MODULES.map((m) => {
    try {
      const css = fs.readFileSync(path.join(CSS_DIR, m.file), 'utf8');
      return (m.id === 'mono-ui' ? cssModules.fontPrelude(devUiFont()) : '') + css;
    } catch {
      return '';
    }
  }).join('\n');
}

function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
  const inject = () => send('Runtime.evaluate', { expression: injectExpression(readCss()) });

  ws.addEventListener('open', () => {
    sessions.set(target.id, { inject });
    send('Runtime.enable');
    log('attached to dev window');
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.executionContextCreated' && msg.params.context.auxData?.isDefault) inject();
  });
  ws.addEventListener('close', () => sessions.delete(target.id));
  ws.addEventListener('error', () => {});
}

async function discover() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    for (const t of await res.json()) {
      if (t.type === 'page' && t.url.includes('workbench') && !sessions.has(t.id)) {
        sessions.set(t.id, { inject() {} });
        attach(t);
      }
    }
  } catch {
  }
}

function debounce(fn, ms = 60) {
  const timers = new Map();
  return (key) => {
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => fn(key), ms));
  };
}

const onCssChange = debounce((name) => {
  if (!name?.endsWith('.css')) return;
  for (const s of sessions.values()) s.inject();
  log(`css applied to ${sessions.size} window(s)`);
});
fs.watch(CSS_DIR, (_event, name) => onCssChange(name));

function rebuild() {
  try {
    log(`✓ built ${buildAll().join(', ')}`);
  } catch (err) {
    log(`✗ build failed: ${err.message} — VS Code keeps the last valid version`);
  }
}

const onThemeChange = debounce((name) => {
  if (name !== BASE_THEME) return;
  rebuild();
});
const onVariantChange = debounce((name) => {
  if (name?.endsWith('.json')) rebuild();
});
fs.watch(THEMES_DIR, (_event, name) => onThemeChange(name));
fs.watch(VARIANTS_DIR, (_event, name) => onVariantChange(name));

rebuild();
launch();
setInterval(discover, 1000);
log(`dev window starting… edit themes/*.json, themes/variants/*.json or css/*.css and save. Ctrl+C to quit.`);
