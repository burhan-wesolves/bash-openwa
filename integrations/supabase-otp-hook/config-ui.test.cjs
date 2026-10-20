'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('../../dashboard/node_modules/jsdom');

function editor(config = {}) {
  const html = fs
    .readFileSync(path.join(__dirname, 'config-ui.html'), 'utf8')
    .replace('/*__OTP_MESSAGE_CONFIG__*/', () => fs.readFileSync(path.join(__dirname, 'message-config.js'), 'utf8'));
  const messages = [];
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', e => errors.push(e));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://openwa.example/',
    virtualConsole,
    beforeParse(window) {
      window.postMessage = message => messages.push(message);
    },
  });
  const w = dom.window;
  const $ = id => w.document.getElementById(id);
  const receive = data => w.dispatchEvent(new w.MessageEvent('message', { source: w, data }));
  receive({ type: 'config:value', config, theme: 'dark' });
  const input = (id, value) => {
    const el = $(id);
    el.value = value;
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  return { dom, w, $, receive, input, messages, errors };
}
test('editor loads old config, previews CTA + Reply and saves through the dashboard bridge', () => {
  const f = editor({ appName: 'Wesolves' });
  try {
    assert.equal(f.w.document.documentElement.dataset.theme, 'dark');
    assert.equal(f.$('save').disabled, false);
    assert.equal(f.$('cta-section').hidden, true);
    f.input('messageMode', 'cta_reply');
    assert.equal(f.$('cta-section').hidden, false);
    assert.equal(f.$('reply-section').hidden, false);
    assert.match(f.$('preview-buttons').textContent, /Copy code.*123456/);
    assert.match(f.$('preview-buttons').textContent, /otp_not_requested/);
    f.$('add-cta').click();
    assert.equal(f.$('add-cta').disabled, true);
    const urlInput = f.$('cta-rows').querySelectorAll('input')[3];
    urlInput.value = 'https://wesolves.example/login';
    urlInput.dispatchEvent(new f.w.Event('input'));
    f.$('editor').dispatchEvent(new f.w.Event('submit', { cancelable: true }));
    const save = f.messages.find(m => m.type === 'config:save');
    assert.equal(save.config.messageMode, 'cta_reply');
    assert.equal(save.config.ctaButtons[1].value, 'https://wesolves.example/login');
    assert.equal(f.$('save').disabled, true);
    f.receive({ type: 'config:saved' });
    assert.equal(f.$('status').textContent, 'Configuration saved.');
    assert.deepEqual(f.errors, []);
  } finally {
    f.dom.window.close();
  }
});
test('invalid config blocks save, failed save is shown, preview never renders injected HTML', () => {
  const f = editor();
  try {
    f.input('messageTemplate', 'Missing code');
    assert.equal(f.$('save').disabled, true);
    f.$('editor').dispatchEvent(new f.w.Event('submit', { cancelable: true }));
    assert.equal(
      f.messages.some(m => m.type === 'config:save'),
      false,
    );
    f.input('messageTemplate', '<img src=x onerror=alert(1)> {otp}');
    assert.equal(f.$('preview-body').querySelector('img'), null);
    assert.match(f.$('preview-body').textContent, /<img/);
    f.$('editor').dispatchEvent(new f.w.Event('submit', { cancelable: true }));
    f.receive({ type: 'config:error', message: 'Could not save configuration' });
    assert.equal(f.$('status').textContent, 'Could not save configuration');
    assert.equal(f.$('save').disabled, false);
    assert.deepEqual(f.errors, []);
  } finally {
    f.dom.window.close();
  }
});
