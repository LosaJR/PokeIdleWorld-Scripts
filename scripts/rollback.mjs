import fs from 'node:fs/promises';
import path from 'node:path';
import { parseUserscript, setMetadataValue } from './lib/userscript.mjs';

const root = process.cwd();
const backupDir = path.join(root, 'backup', 'previous');
const srcDir = path.join(root, 'src');
const requestedVersion = process.env.ROLLBACK_VERSION || process.argv[2];

if (!requestedVersion) {
  throw new Error('Indica una versión nueva superior: ROLLBACK_VERSION=1.2.4 npm run rollback:local');
}

const files = (await fs.readdir(backupDir)).filter(name => name.endsWith('.user.js')).sort();
if (!files.length) throw new Error('No existe una versión anterior utilizable en backup/previous.');

await fs.mkdir(srcDir, { recursive: true });
for (const existing of await fs.readdir(srcDir)) {
  if (existing.endsWith('.user.js')) await fs.rm(path.join(srcDir, existing), { force: true });
}
for (const file of files) {
  const backupSource = await fs.readFile(path.join(backupDir, file), 'utf8');
  parseUserscript(backupSource, file);
  const restored = setMetadataValue(backupSource, 'version', requestedVersion);
  await fs.writeFile(path.join(srcDir, file), `${restored.trimEnd()}\n`, 'utf8');
}

console.log(`Código anterior restaurado en src con versión ${requestedVersion}. Ejecuta validate, build y publish.`);
