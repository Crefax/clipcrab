import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = process.cwd();

function createClassList() {
  return {
    add() {},
    remove() {},
    toggle() {},
    contains() {
      return false;
    }
  };
}

function createElement(id = '') {
  return {
    id,
    checked: false,
    className: '',
    dataset: {},
    disabled: false,
    innerHTML: '',
    parentElement: { appendChild() {} },
    style: {},
    textContent: '',
    value: '',
    addEventListener() {},
    appendChild() {},
    blur() {},
    click() {},
    focus() {},
    querySelector() {
      return createElement();
    },
    querySelectorAll() {
      return [];
    },
    remove() {},
    removeChild() {},
    scrollIntoView() {},
    setAttribute() {},
    classList: createClassList()
  };
}

function installBrowserGlobals() {
  const elements = new Map();
  const document = {
    hidden: false,
    documentElement: { classList: createClassList() },
    body: createElement('body'),
    addEventListener(event, callback) {
      if (event === 'DOMContentLoaded') callback();
    },
    createElement,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement(id));
      return elements.get(id);
    },
    querySelector() {
      return createElement();
    },
    querySelectorAll() {
      return [];
    }
  };

  globalThis.document = document;
  globalThis.localStorage = {
    data: new Map(),
    getItem(key) {
      return this.data.get(key) || null;
    },
    setItem(key, value) {
      this.data.set(key, String(value));
    }
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      platform: 'Win32',
      userAgent: 'Windows',
      clipboard: {
        async write() {},
        async writeText() {}
      }
    }
  });
  globalThis.window = {
    __TAURI__: {
      app: { async getVersion() { return '0.6.3'; } },
      core: {
        async invoke(command) {
          invokeCalls.push(command);
          if (command === 'copy_clipboard_item') return null;
          if (command === 'get_clipboard_count') return 0;
          if (command === 'get_clipboard_history') return [];
          if (command === 'get_settings') {
            return {
              retention_enabled: false,
              max_history: 1000,
              max_db_size_mb: 250,
              max_text_size_kb: 512,
              max_image_size_mb: 5,
              auto_clear_days: 0,
              capture_images: true,
              capture_large_text: false,
              show_notifications: true,
              ignore_apps: []
            };
          }
          return null;
        }
      },
      event: {
        listen() {
          return Promise.resolve();
        }
      },
      plugins: {}
    },
    addEventListener() {},
    matchMedia() {
      return { matches: false };
    },
    requestAnimationFrame(callback) {
      return setTimeout(callback, 0);
    }
  };
  globalThis.ClipboardItem = class ClipboardItem {
    constructor(items) {
      this.items = items;
    }
  };
  globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');
  globalThis.Blob = class Blob {
    constructor(parts, options = {}) {
      this.parts = parts;
      this.type = options.type || '';
    }
  };
  return elements;
}

const invokeCalls = [];
installBrowserGlobals();

const i18nSource = fs.readFileSync(path.join(root, 'src/locales/i18n.js'), 'utf8');
assert.equal(i18nSource.includes('fetch('), false, 'i18n must not fetch locale JSON in release');

const i18nContext = {
  console,
  document: globalThis.document,
  localStorage: globalThis.localStorage,
  window: {},
  fetch() {
    throw new Error('fetch should not be used by i18n');
  }
};
i18nContext.window = i18nContext;
vm.runInNewContext(i18nSource, i18nContext);
assert.notEqual(await i18nContext.window.i18n.t('time.days_ago'), 'time.days_ago');

globalThis.window.i18n = {
  async t() {
    throw new Error('translation failure should not break callers');
  },
  tSync(key) {
    return key;
  }
};

const utils = await import(pathToFileURL(path.join(root, 'src/script/utils.js')).href);
assert.equal(await utils.formatTimeAgo(new Date(Date.now() - 90_000).toISOString()), '1 minutes ago');
assert.equal(await utils.getPlatform(), 'windows');

const clipboard = await import(pathToFileURL(path.join(root, 'src/script/clipboard.js')).href);
await clipboard.copyToClipboard({ id: 42, content_type: 'text' });
assert.deepEqual(invokeCalls.includes('copy_clipboard_item'), true);

const uiSource = fs.readFileSync(path.join(root, 'src/script/ui.js'), 'utf8');
assert.equal(uiSource.includes('input.disabled = !enabled'), false, 'history limit inputs must stay editable');

console.log('frontend smoke passed');
