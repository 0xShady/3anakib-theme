const MODULES = [
  {
    id: 'spotlight',
    file: 'spotlight.css',
    label: 'Spotlight command palette',
    detail: 'Centered, Raycast-style Quick Open / Command Palette with a blurred backdrop'
  },
  {
    id: 'mono-ui',
    file: 'mono-ui.css',
    label: 'Monospace UI',
    detail: 'Explorer, tabs, status bar and menus use your terminal (or editor) font'
  },
  {
    id: 'quiet-chrome',
    file: 'quiet-chrome.css',
    label: 'Quiet title & status bar',
    detail: 'Hides Agents Window, notifications bell, Discord, Live Share, Live Server, Prettier items'
  }
];

function fontPrelude(fontFamily) {
  const font = String(fontFamily || '').replace(/[;{}<>]/g, '').trim();
  return font ? `.monaco-workbench { --anakib-ui-font-user: ${font}; }\n\n` : '';
}

module.exports = { MODULES, fontPrelude };
