import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import { createLogger } from '../../common/services/logger.service';
import { installBundledOtpPlugin } from './bundled-otp-plugin';
import { PluginPackageScanner } from './plugin-package-scanner';
import { PluginStorageService } from './plugin-storage.service';
import { PluginInstance, PluginManifest, PluginStatus, PluginType } from './plugin.interfaces';

const ID = 'supabase-otp-hook';
const SOURCE = path.resolve(__dirname, '../../../integrations/supabase-otp-hook');

describe('bundled OTP plugin deployment', () => {
  let tmp: string;
  let bundles: string;
  let pluginsDir: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'owa-bundled-otp-'));
    bundles = path.join(tmp, 'bundle');
    pluginsDir = path.join(tmp, 'plugins');
    const target = path.join(bundles, ID);
    fs.mkdirSync(target, { recursive: true });
    for (const file of ['manifest.json', 'index.js', 'message-config.js', 'README.md']) {
      fs.copyFileSync(path.join(SOURCE, file), path.join(target, file));
    }
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function oldPackage(version = '0.3.11'): string {
    const target = path.join(pluginsDir, ID);
    fs.mkdirSync(target, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    manifest.version = version;
    delete manifest.configUi;
    fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(target, 'index.js'), 'module.exports = class OldPlugin {};');
    return target;
  }

  it('installs the editor into a fresh volume without enabling the plugin', () => {
    expect(installBundledOtpPlugin(bundles, pluginsDir)).toBe('0.5.1');
    const manifest = JSON.parse(fs.readFileSync(path.join(pluginsDir, ID, 'manifest.json'), 'utf8')) as PluginManifest;
    expect(manifest.configUi).toBeUndefined();
    expect(manifest.configSchema?.properties.messageMode.enum).toContain('cta_reply');
  });

  it('upgrades old code while leaving registry, instance database and plugin storage intact', () => {
    const live = oldPackage();
    fs.writeFileSync(path.join(live, 'key-c3RhdGU.json'), '{"keep":"plugin state"}');
    fs.writeFileSync(path.join(pluginsDir, 'registry.json'), '{"keep":"configuration"}');
    fs.writeFileSync(path.join(tmp, 'openwa.sqlite'), 'instance-and-secret-test-sentinel');
    expect(installBundledOtpPlugin(bundles, pluginsDir)).toBe('0.5.1');
    expect(fs.readFileSync(path.join(live, 'key-c3RhdGU.json'), 'utf8')).toBe('{"keep":"plugin state"}');
    expect(fs.readFileSync(path.join(pluginsDir, 'registry.json'), 'utf8')).toBe('{"keep":"configuration"}');
    expect(fs.readFileSync(path.join(tmp, 'openwa.sqlite'), 'utf8')).toBe('instance-and-secret-test-sentinel');
    expect(fs.existsSync(path.join(pluginsDir, '.' + ID + '.bak'))).toBe(false);
  });

  it('does not replace an equal or newer operator-installed version', () => {
    const live = oldPackage('0.6.0');
    expect(installBundledOtpPlugin(bundles, pluginsDir)).toBeNull();
    expect(fs.readFileSync(path.join(live, 'index.js'), 'utf8')).toContain('OldPlugin');
    const manifest = JSON.parse(fs.readFileSync(path.join(live, 'manifest.json'), 'utf8')) as PluginManifest;
    manifest.version = '0.5.1';
    fs.writeFileSync(path.join(live, 'manifest.json'), JSON.stringify(manifest));
    expect(installBundledOtpPlugin(bundles, pluginsDir)).toBeNull();
  });

  it('keeps the old package if the bundle is incomplete', () => {
    const live = oldPackage();
    fs.unlinkSync(path.join(bundles, ID, 'message-config.js'));
    expect(() => installBundledOtpPlugin(bundles, pluginsDir)).toThrow();
    expect(fs.readFileSync(path.join(live, 'index.js'), 'utf8')).toContain('OldPlugin');
  });

  it('rolls back when the staged code cannot be written', () => {
    const live = oldPackage();
    fs.mkdirSync(path.join(live, 'message-config.js'));
    expect(() => installBundledOtpPlugin(bundles, pluginsDir)).toThrow(/is a directory/);
    expect(fs.readFileSync(path.join(live, 'index.js'), 'utf8')).toContain('OldPlugin');
    expect(fs.existsSync(path.join(pluginsDir, '.' + ID + '.new'))).toBe(false);
  });

  it('boot scan exposes the new config UI while preserving session overrides and enable intent', () => {
    oldPackage();
    const config = new ConfigService({ dataDir: tmp });
    const storage = new PluginStorageService(config);
    storage.setPluginEntry({
      id: ID,
      name: 'Supabase Auth OTP',
      type: PluginType.EXTENSION,
      version: '0.3.11',
      status: PluginStatus.ENABLED,
      config: { appName: 'Wesolves' },
      enabledByOperator: true,
      activeSessions: ['session-1'],
      sessionConfig: { 'session-1': { messageTemplate: 'Code: {otp}' } },
      installedAt: new Date(),
      updatedAt: new Date(),
      builtIn: false,
    });
    const plugins = new Map<string, PluginInstance>();
    const scanner = new PluginPackageScanner(createLogger('test'), config, storage, pluginsDir, null, plugins, bundles);
    scanner.scanAtBoot();
    const plugin = plugins.get(ID)!;
    expect(plugin.manifest.configUi).toBeUndefined();
    expect(plugin.manifest.configSchema?.properties.messageMode.enum).toContain('cta_reply');
    expect(plugin.config.appName).toBe('Wesolves');
    expect(plugin.activeSessions).toEqual(['session-1']);
    expect(plugin.sessionConfig?.['session-1'].messageTemplate).toBe('Code: {otp}');
    expect(storage.getPluginEntry(ID)?.enabledByOperator).toBe(true);
    expect(plugin.status).toBe(PluginStatus.INSTALLED);
    // A second boot must not rewrite the same package or remove state.
    const second = new Map<string, PluginInstance>();
    new PluginPackageScanner(createLogger('test'), config, storage, pluginsDir, null, second, bundles).scanAtBoot();
    expect(second.get(ID)?.manifest.version).toBe('0.5.1');
    expect(storage.getPluginEntry(ID)?.enabledByOperator).toBe(true);
  });
});
