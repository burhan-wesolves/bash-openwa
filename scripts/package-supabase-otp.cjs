'use strict';
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const root = path.join(__dirname, '..');
const source = path.join(root, 'integrations', 'supabase-otp-hook');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const zip = new AdmZip();
for (const file of ['manifest.json', 'index.js', 'message-config.js', 'README.md']) {
  zip.addFile(file, fs.readFileSync(path.join(source, file)));
}
const model = fs.readFileSync(path.join(source, 'message-config.js'), 'utf8');
const html = fs
  .readFileSync(path.join(source, 'config-ui.html'), 'utf8')
  .replace('/*__OTP_MESSAGE_CONFIG__*/', () => model);
zip.addFile('config-ui.html', Buffer.from(html));
const output = path.join(root, 'dist', 'plugins');
fs.mkdirSync(output, { recursive: true });
const target = path.join(output, `supabase-otp-hook-${manifest.version}.zip`);
zip.writeZip(target);
fs.writeFileSync(path.join(output, 'supabase-otp-preview.html'), html);
console.log(`Plugin package: ${target}`);
