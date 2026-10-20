import * as fs from 'node:fs';
import * as path from 'node:path';
import { compareSemver } from '../../modules/plugins/catalog';
import { validatePluginManifest } from './plugin-manifest';
import { PluginManifest, validateIngressManifest } from './plugin.interfaces';
import { pluginUpdateBackupDirName, pluginUpdateStagingDirName } from './plugin-paths';

const ID = 'supabase-otp-hook';
const FILES = ['manifest.json', 'index.js', 'message-config.js', 'README.md'];

/**
 * Install the fork's versioned OTP package before the runtime scan. Only code is replaced: the
 * registry lives outside this directory, instance secrets live in the database, and plugin storage
 * is copied into the staged tree. Use the normal update names so boot crash recovery still works.
 * No plugin is enabled by this function; the operator's saved enable decision remains authoritative.
 */
export function installBundledOtpPlugin(bundlesDir: string, pluginsDir: string): string | null {
  const source = path.join(bundlesDir, ID);
  if (!fs.existsSync(path.join(source, 'manifest.json'))) return null;
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8')) as PluginManifest;
  if (manifest.id !== ID || manifest.main !== 'index.js' || manifest.configUi) {
    throw new Error('Invalid bundled OTP package');
  }
  validatePluginManifest(manifest);
  validateIngressManifest(manifest, false);
  const content = new Map<string, Buffer>();
  for (const file of FILES) {
    const filename = path.join(source, file);
    if (!fs.lstatSync(filename).isFile()) throw new Error(`Bundled OTP file missing: ${file}`);
    content.set(file, fs.readFileSync(filename));
  }

  fs.mkdirSync(pluginsDir, { recursive: true });
  const root = fs.realpathSync(pluginsDir);
  const live = path.join(root, ID);
  const staging = path.join(root, pluginUpdateStagingDirName(ID));
  const backup = path.join(root, pluginUpdateBackupDirName(ID));
  const exists = fs.existsSync(live);
  if (exists) {
    const stat = fs.lstatSync(live);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('OTP package directory must not be a symlink');
    const installedManifest = path.join(live, 'manifest.json');
    if (fs.existsSync(installedManifest)) {
      const installed = JSON.parse(fs.readFileSync(installedManifest, 'utf8')) as PluginManifest;
      // Respect an operator-installed newer release; do not downgrade or rewrite equal versions.
      if (compareSemver(installed.version, manifest.version) >= 0) return null;
    }
  }
  if (fs.existsSync(staging) || fs.existsSync(backup)) throw new Error('Recover the interrupted OTP update first');

  let moved = false;
  try {
    if (exists) fs.cpSync(live, staging, { recursive: true, dereference: false });
    else fs.mkdirSync(staging);
    for (const [file, bytes] of content) {
      const dest = path.join(staging, file);
      // A previous package may have left a symlink at a code filename. Unlink that entry before
      // writing, so replacing package code cannot follow a link outside the stage.
      if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })) {
        if (fs.lstatSync(dest).isDirectory()) throw new Error(`OTP code filename is a directory: ${file}`);
        fs.unlinkSync(dest);
      }
      fs.writeFileSync(dest, bytes);
    }
    if (exists) {
      fs.renameSync(live, backup);
      moved = true;
    }
    fs.renameSync(staging, live);
  } catch (error) {
    if (moved && !fs.existsSync(live)) fs.renameSync(backup, live);
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  // The new live tree includes the old storage. A cleanup fault must not undo a committed swap;
  // the scanner's normal recovery prunes this backup on the next directory scan.
  try {
    fs.rmSync(backup, { recursive: true, force: true });
  } catch {
    /* recovered next scan */
  }
  return manifest.version;
}
