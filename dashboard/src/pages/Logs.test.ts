import '../test-helpers/register-hooks.ts';
import { test, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AuditLog } from '../services/api';

const audit: AuditLog = {
  id: 'audit',
  action: 'session_started',
  severity: 'info',
  createdAt: '2026-11-05T10:00:00Z',
  apiKeyId: null,
  apiKeyName: null,
  sessionId: null,
  sessionName: null,
  ipAddress: null,
  userAgent: null,
  method: null,
  path: null,
  statusCode: null,
  errorMessage: null,
  metadata: null,
};
const delivered: AuditLog = {
  ...audit,
  id: 'delivered',
  action: 'webhook_delivered',
  statusCode: 200,
  sessionId: 's1',
  metadata: {
    source: 'webhook',
    event: 'message.received',
    outcome: 'delivered',
    webhookId: 'wh1',
    deliveryId: 'delivery-123',
    attempt: 2,
    durationMs: 17,
  },
};
const rows = [audit, delivered];
const requests: URL[] = [];
let failList = false;
let failExport = false;
let totalOverride: number | undefined;
let rtl: typeof import('@testing-library/react');
let Logs: typeof import('./Logs.tsx').Logs;
let ToastProvider: typeof import('../components/Toast.tsx').ToastProvider;

before(async () => {
  const { installJsdomGlobals } = await import('../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  const { i18nReady } = await import('../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');
  ({ Logs } = await import('./Logs.tsx'));
  ({ ToastProvider } = await import('../components/Toast.tsx'));
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      'http://localhost',
    );
    requests.push(url);
    const params = url.searchParams;
    if (failList || (failExport && params.get('limit') === '200'))
      return Promise.resolve(new Response(JSON.stringify({ message: 'boom' }), { status: 500 }));
    let data = rows.filter(
      row =>
        (!params.get('source') || (row.metadata?.source ?? 'audit') === params.get('source')) &&
        (!params.get('search') || JSON.stringify(row).toLowerCase().includes(params.get('search')!.toLowerCase())),
    );
    if (params.get('sortOrder') === 'ASC') data = [...data].reverse();
    return Promise.resolve(
      new Response(JSON.stringify({ data, total: totalOverride ?? data.length }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }) as typeof fetch;
});
afterEach(() => {
  rtl.cleanup();
  requests.length = 0;
  failList = false;
  failExport = false;
  totalOverride = undefined;
});
function renderLogs() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return rtl.render(
    createElement(QueryClientProvider, { client }, createElement(ToastProvider, null, createElement(Logs))),
  ).container;
}

test('renders event delivery status, correlation details and audit actions', async () => {
  const container = renderLogs();
  await rtl.screen.findByText('message.received');
  assert.ok(container.textContent?.includes('HTTP 200'));
  assert.ok(container.textContent?.includes('Attempt: 2'));
  assert.ok(container.textContent?.includes('delivery-123'));
  assert.ok(rtl.screen.getByText('session_started'));
});

test('search reaches the server and resets pagination while keeping the input mounted', async () => {
  totalOverride = 60;
  renderLogs();
  await rtl.screen.findByText('message.received');
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: '2' }));
  await rtl.waitFor(() => assert.ok(requests.some(url => url.searchParams.get('offset') === '20')));
  const input = rtl.screen.getByRole('textbox', { name: 'Search all logs' });
  rtl.fireEvent.change(input, { target: { value: 'delivery-123' } });
  assert.ok(input.isConnected);
  await rtl.waitFor(() =>
    assert.ok(
      requests.some(
        url =>
          url.pathname === '/api/logs' &&
          url.searchParams.get('search') === 'delivery-123' &&
          url.searchParams.get('offset') === '0',
      ),
    ),
  );
  await rtl.waitFor(() => assert.equal(rtl.screen.queryByText('session_started'), null));
});

test('source and sort controls send server filters', async () => {
  const container = renderLogs();
  await rtl.screen.findByText('message.received');
  const labels = [...container.querySelectorAll('label')];
  const source = labels.find(label => label.textContent?.startsWith('Source'))!;
  rtl.fireEvent.click(rtl.within(source).getByRole('button'));
  rtl.fireEvent.click(rtl.screen.getByRole('option', { name: 'Webhook' }));
  await rtl.waitFor(() => assert.ok(requests.some(url => url.searchParams.get('source') === 'webhook')));
  const order = labels.find(label => label.textContent?.startsWith('Order'))!;
  rtl.fireEvent.click(rtl.within(order).getByRole('button'));
  rtl.fireEvent.click(rtl.screen.getByRole('option', { name: 'Oldest / ascending' }));
  await rtl.waitFor(() =>
    assert.ok(
      requests.some(url => url.searchParams.get('sortOrder') === 'ASC' && url.searchParams.get('source') === 'webhook'),
    ),
  );
});

test('export keeps active server filters and fixes the end time', async () => {
  const downloads: Blob[] = [];
  const original = URL.createObjectURL;
  const revoke = URL.revokeObjectURL;
  URL.createObjectURL = blob => {
    assert.ok(blob instanceof Blob);
    downloads.push(blob);
    return 'blob:export';
  };
  URL.revokeObjectURL = () => {};
  try {
    renderLogs();
    await rtl.screen.findByText('message.received');
    rtl.fireEvent.change(rtl.screen.getByRole('textbox', { name: 'Search all logs' }), {
      target: { value: 'message.received' },
    });
    await rtl.waitFor(() => assert.ok(requests.some(url => url.searchParams.get('search') === 'message.received')));
    rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Export CSV' }));
    await rtl.waitFor(() => assert.equal(downloads.length, 1));
    assert.ok(
      requests.some(
        url =>
          url.searchParams.get('limit') === '200' &&
          url.searchParams.has('endDate') &&
          url.searchParams.get('search') === 'message.received',
      ),
    );
    const csv = await downloads[0].text();
    assert.ok(csv.includes('delivery-123'));
    assert.ok(!csv.includes('session_started'));
  } finally {
    URL.createObjectURL = original;
    URL.revokeObjectURL = revoke;
  }
});

test('a failed export reports its error', async () => {
  failExport = true;
  renderLogs();
  await rtl.screen.findByText('message.received');
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Export CSV' }));
  await rtl.screen.findByRole('alert');
});

test('a failed list read never claims the log history is empty', async () => {
  failList = true;
  renderLogs();
  await rtl.screen.findByRole('alert');
  assert.equal(rtl.screen.queryByText('No logs found'), null);
});
