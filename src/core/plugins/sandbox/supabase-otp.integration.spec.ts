import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import AdmZip from 'adm-zip';
import { WorkerThreadChannel } from './worker-thread-channel';
import { PluginWorkerHost } from './plugin-worker-host';
import { parsePluginPackage } from '../../../modules/plugins/plugin-installer';

const ROOT = path.resolve(__dirname, '../../../..');
const SOURCE = path.join(ROOT, 'integrations/supabase-otp-hook');

describe('bundled Supabase OTP plugin', () => {
  jest.setTimeout(30000);

  it('is accepted as an installable plugin package with a self-contained editor', () => {
    const zip = new AdmZip();
    for (const file of ['manifest.json', 'index.js', 'message-config.js', 'README.md']) {
      zip.addFile(file, readFileSync(path.join(SOURCE, file)));
    }
    const html = readFileSync(path.join(SOURCE, 'config-ui.html'), 'utf8').replace('/*__OTP_MESSAGE_CONFIG__*/', () =>
      readFileSync(path.join(SOURCE, 'message-config.js'), 'utf8'),
    );
    zip.addFile('config-ui.html', Buffer.from(html));
    const parsed = parsePluginPackage(zip.toBuffer());
    expect(parsed.manifest.id).toBe('supabase-otp-hook');
    expect(parsed.manifest.configUi?.entry).toBe('config-ui.html');
    expect(html).not.toContain('/*__OTP_MESSAGE_CONFIG__*/');
  });

  it('delivers CTA + Reply through a real worker capability round-trip, retaining per-instance config', async () => {
    const dispatcher = jest.fn().mockResolvedValue({ messageId: 'cta-1' });
    const channel = new WorkerThreadChannel({
      workerEntry: path.join(__dirname, 'worker-bootstrap.ts'),
      execArgv: ['-r', 'ts-node/register/transpile-only'],
      env: {
        ...process.env,
        TS_NODE_COMPILER_OPTIONS: JSON.stringify({
          module: 'commonjs',
          moduleResolution: 'node',
          resolvePackageJsonExports: false,
          ignoreDeprecations: '6.0',
        }),
      },
    });
    const host = new PluginWorkerHost(channel, dispatcher);
    try {
      await host.load(path.join(SOURCE, 'index.js'), { pluginId: 'supabase-otp-hook', config: { appName: 'Base' } });
      await host.runLifecycle('onEnable');
      const payload = JSON.stringify({ user: { phone: '+919999999999' }, sms: { otp: '123456' } });
      const request = {
        instanceId: 'test',
        route: 'send-sms',
        method: 'POST',
        headers: {},
        query: {},
        body: payload,
        rawBody: payload,
        verified: true,
        deliveryId: 'd1',
        sessionId: 'session-1',
        timeoutMs: 5000,
        config: { appName: 'Tenant', messageMode: 'cta_reply' },
      };
      await expect(host.dispatchWebhook(request)).resolves.toMatchObject({ ok: true, status: 200 });
      expect(dispatcher).toHaveBeenCalledWith('messages.sendButtons', [
        'session-1',
        '919999999999@c.us',
        expect.objectContaining({
          title: 'Tenant verification',
          buttons: [
            { type: 'copy', displayText: 'Copy code', copyCode: '123456' },
            { type: 'reply', displayText: "I didn't request this", id: 'otp_not_requested' },
          ],
        }),
      ]);
      dispatcher.mockClear();
      await expect(host.dispatchWebhook({ ...request, verified: false })).resolves.toMatchObject({ ok: false });
      expect(dispatcher).not.toHaveBeenCalled();
    } finally {
      await host.terminate();
    }
  });
});
