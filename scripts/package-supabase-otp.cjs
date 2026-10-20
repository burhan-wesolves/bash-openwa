'use strict';
const fs = require('node:fs');
const path = require('node:path');
const AdmZip = require('adm-zip');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const source = path.join(root, 'integrations', 'supabase-otp-hook');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const zip = new AdmZip();
const bundled = path.join(root, '.bundled-plugins', manifest.id);
fs.mkdirSync(bundled, { recursive: true });
for (const file of ['manifest.json', 'index.js', 'README.md']) {
  const content = fs.readFileSync(path.join(source, file));
  zip.addFile(file, content);
  fs.writeFileSync(path.join(bundled, file), content);
}
const model = ts.transpileModule(fs.readFileSync(path.join(root, 'shared/supabase-otp-message.mjs'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, allowJs: true },
  fileName: 'message-config.js',
}).outputText;
zip.addFile('message-config.js', Buffer.from(model));
fs.writeFileSync(path.join(bundled, 'message-config.js'), model);
const output = path.join(root, 'dist', 'plugins');
fs.mkdirSync(output, { recursive: true });
const target = path.join(output, `supabase-otp-hook-${manifest.version}.zip`);
zip.writeZip(target);
console.log(`Plugin package: ${target}`);
