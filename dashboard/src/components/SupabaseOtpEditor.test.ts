import '../test-helpers/register-hooks.ts';
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Plugin } from '../services/api';
import { configWithDefaults } from '../../../shared/supabase-otp-message.mjs';

const ID = 'supabase-otp-hook';
const calls: { path: string; method: string; body?: Record<string, unknown> }[] = [];
let rejectSave = false;
let rtl: typeof import('@testing-library/react');
let Editor: (typeof import('./SupabaseOtpEditor.tsx'))['SupabaseOtpEditor'];
let Plugins: (typeof import('../pages/Plugins.tsx'))['default'];
let ToastProvider: (typeof import('./Toast.tsx'))['ToastProvider'];
let client: QueryClient | undefined;

function plugin(): Plugin {
  return {
    id: ID,
    name: 'Supabase Auth OTP',
    version: '0.5.0',
    type: 'extension',
    status: 'enabled',
    builtIn: false,
    provides: [],
    ingressCapable: true,
    sessionScoped: true,
    activeSessions: ['*'],
    config: configWithDefaults({ appName: 'Wesolves' }),
    sessionConfig: {},
    configSchema: {
      type: 'object',
      properties: {
        messageMode: { type: 'string', enum: ['text', 'cta', 'cta_reply'] },
        messageTemplate: { type: 'textarea' },
        appName: { type: 'string' },
      },
    },
    // Even a cached/older manifest must not make this first-party editor load an iframe.
    configUi: { entry: 'config-ui.html' },
  } as Plugin;
}
before(async () => {
  const { installJsdomGlobals } = await import('../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = init?.method ?? 'GET';
    calls.push({ path, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    let data: unknown =
      method === 'PUT'
        ? { success: !rejectSave, message: rejectSave ? 'Server rejected this configuration' : 'Saved' }
        : path === '/api/plugins'
          ? [plugin()]
          : path === '/api/sessions'
            ? [{ id: 'session-1', name: 'snap-testing', status: 'ready' }]
            : [];
    if (path.endsWith('/config-ui')) data = { message: 'Unexpected iframe request' };
    return new Response(JSON.stringify(data), {
      status: path.endsWith('/config-ui') ? 404 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  const { i18nReady } = await import('../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');
  ({ SupabaseOtpEditor: Editor } = await import('./SupabaseOtpEditor.tsx'));
  ({ default: Plugins } = await import('../pages/Plugins.tsx'));
  ({ ToastProvider } = await import('./Toast.tsx'));
});
afterEach(() => {
  rtl.cleanup();
  client?.clear();
  client = undefined;
  calls.length = 0;
  rejectSave = false;
});
function renderEditor(sessionId?: string, p = plugin()) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 } } });
  return rtl.render(createElement(QueryClientProvider, { client }, createElement(Editor, { plugin: p, sessionId })));
}
test('native CTA + Reply controls save through the API and show the persisted result', async () => {
  renderEditor();
  rtl.fireEvent.change(rtl.screen.getByLabelText('Message format'), { target: { value: 'cta_reply' } });
  rtl.fireEvent.change(rtl.screen.getByLabelText('CTA 1 label'), { target: { value: 'Copy verification code' } });
  rtl.fireEvent.change(rtl.screen.getByLabelText('Reply 1 callback ID'), { target: { value: 'report_auth_request' } });
  assert.equal(document.querySelector('iframe'), null);
  assert.match(rtl.screen.getByLabelText('Message preview').textContent ?? '', /Copy verification code/);
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Save configuration' }));
  await rtl.waitFor(() => assert.match(rtl.screen.getByRole('status').textContent ?? '', /Configuration saved/));
  const saved = calls.find(c => c.method === 'PUT')!;
  assert.equal(saved.path, `/api/plugins/${ID}/config`);
  const config = saved.body?.config as Record<string, unknown>;
  assert.equal(config.messageMode, 'cta_reply');
  assert.equal((config.replyButtons as { id: string }[])[0].id, 'report_auth_request');
  assert.equal(
    calls.some(c => c.path.endsWith('/config-ui')),
    false,
  );
});
test('session saves use the session endpoint, preserve overrides, and support resetting to global', async () => {
  const p = plugin();
  p.sessionConfig = { 'session-1': { messageTemplate: 'Session code: {otp}' } };
  renderEditor('session-1', p);
  assert.equal((rtl.screen.getByLabelText('Message body') as HTMLTextAreaElement).value, 'Session code: {otp}');
  rtl.fireEvent.change(rtl.screen.getByLabelText('Message format'), { target: { value: 'cta' } });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Save configuration' }));
  await rtl.waitFor(() => assert.match(rtl.screen.getByRole('status').textContent ?? '', /Configuration saved/));
  const saved = calls.find(c => c.method === 'PUT')!;
  assert.equal(saved.path, `/api/plugins/${ID}/config/session-1`);
  const config = saved.body?.config as Record<string, unknown>;
  assert.equal(config.messageTemplate, 'Session code: {otp}');
  assert.equal(config.appName, undefined);
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Use global settings' }));
  await rtl.waitFor(() => assert.match(rtl.screen.getByRole('status').textContent ?? '', /Session overrides cleared/));
  assert.deepEqual(calls.filter(c => c.method === 'PUT').at(-1)?.body, { config: {} });
  assert.equal((rtl.screen.getByLabelText('Message format') as HTMLSelectElement).value, 'text');
});
test('validation blocks invalid OTP settings and server rejections keep the editor usable', async () => {
  renderEditor();
  rtl.fireEvent.change(rtl.screen.getByLabelText('Message body'), { target: { value: 'No OTP placeholder' } });
  assert.equal((rtl.screen.getByRole('button', { name: 'Save configuration' }) as HTMLButtonElement).disabled, true);
  assert.equal(
    calls.some(c => c.method === 'PUT'),
    false,
  );
  rtl.fireEvent.change(rtl.screen.getByLabelText('Message body'), { target: { value: 'Code: {otp}' } });
  rejectSave = true;
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Save configuration' }));
  await rtl.screen.findByText('Server rejected this configuration');
  assert.equal((rtl.screen.getByRole('button', { name: 'Save configuration' }) as HTMLButtonElement).disabled, false);
  assert.doesNotMatch(rtl.screen.getByRole('status').textContent ?? '', /saved/);
});
test('Plugins renders the native editor in both Configuration and Sessions without fetching an iframe', async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 1000 } } });
  rtl.render(
    createElement(QueryClientProvider, { client }, createElement(ToastProvider, null, createElement(Plugins))),
  );
  rtl.fireEvent.click(await rtl.screen.findByTitle('Configure'));
  await rtl.screen.findByLabelText('Message format');
  assert.equal(document.querySelector('iframe'), null);
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Sessions' }));
  const select = await rtl.screen.findByRole('combobox', { name: /select.*session/i });
  await rtl.screen.findByRole('option', { name: 'snap-testing' });
  rtl.fireEvent.change(select, { target: { value: 'session-1' } });
  await rtl.screen.findByLabelText('Message format');
  assert.equal(document.querySelector('iframe'), null);
  assert.equal(
    calls.some(c => c.path.endsWith('/config-ui')),
    false,
  );
});
