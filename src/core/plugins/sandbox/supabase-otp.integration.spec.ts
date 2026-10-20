import * as path from 'node:path';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import AdmZip from 'adm-zip';
import { WorkerThreadChannel } from './worker-thread-channel';
import { PluginWorkerHost } from './plugin-worker-host';
import { parsePluginPackage } from '../../../modules/plugins/plugin-installer';

const ROOT = path.resolve(__dirname, '../../../..');
const SOURCE = path.join(ROOT, 'integrations/supabase-otp-hook');
function packageFiles(): Map<string, Buffer> {
  const files = new Map(
    ['manifest.json', 'index.js', 'README.md'].map(file => [file, readFileSync(path.join(SOURCE, file))]),
  );
  files.set(
    'message-config.js',
    Buffer.from(
      transpileModule(readFileSync(path.join(ROOT, 'shared/supabase-otp-message.mjs'), 'utf8'), {
        fileName: 'message-config.js',
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, allowJs: true },
      }).outputText,
    ),
  );
  return files;
}

describe('bundled Supabase OTP plugin', () => {
  jest.setTimeout(30000);

  it('is accepted as an installable plugin package with a native dashboard schema', () => {
    const zip = new AdmZip();
    for (const [file, content] of packageFiles()) zip.addFile(file, content);
    const parsed = parsePluginPackage(zip.toBuffer());
    expect(parsed.manifest.id).toBe('supabase-otp-hook');
    expect(parsed.manifest.configUi).toBeUndefined();
    expect(parsed.manifest.configSchema?.properties.messageMode.enum).toContain('cta_reply');
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
    const packageDir = mkdtempSync(path.join(tmpdir(), 'owa-otp-package-'));
    try {
      for (const [file, content] of packageFiles()) writeFileSync(path.join(packageDir, file), content);
      await host.load(path.join(packageDir, 'index.js'), {
        pluginId: 'supabase-otp-hook',
        config: { appName: 'Base' },
      });
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
      rmSync(packageDir, { recursive: true, force: true });
    }
  });
});
