import fs from 'node:fs/promises';
import path from 'node:path';
import { compareVersions, parseUserscript, setMetadataValue } from './lib/userscript.mjs';

const root = process.cwd();
const backupDir = path.join(root, 'backup', 'previous');
const distDir = path.join(root, 'dist');
const srcDir = path.join(root, 'src');

const files = (await fs.readdir(backupDir)).filter(name => name.endsWith('.user.js')).sort();
if (!files.length) throw new Error('No existe una versión anterior utilizable en backup/previous.');

await fs.mkdir(srcDir, { recursive: true });
for (const existing of await fs.readdir(srcDir)) {
  if (existing.endsWith('.user.js')) await fs.rm(path.join(srcDir, existing), { force: true });
}

const restoredVersions = [];
for (const file of files) {
  const backupSource = await fs.readFile(path.join(backupDir, file), 'utf8');
  const backup = parseUserscript(backupSource, file);
  const currentSource = await fs.readFile(path.join(distDir, file), 'utf8');
  const current = parseUserscript(currentSource, file);
  const nextVersion = bumpPatch(current.version);
  if (compareVersions(nextVersion, current.version) <= 0) {
    throw new Error(`${file}: no se pudo generar una versión de rollback superior a ${current.version}.`);
  }
  const restored = setMetadataValue(backupSource, 'version', nextVersion);
  await fs.writeFile(path.join(srcDir, file), `${restored.trimEnd()}\n`, 'utf8');
  restoredVersions.push(`${file}: ${backup.version} restaurada como ${nextVersion}`);
}

console.log(`Rollback preparado:\n${restoredVersions.map(value => `- ${value}`).join('\n')}`);

function bumpPatch(version) {
  const match = String(version).trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(.*)$/);
  if (!match) throw new Error(`Versión no compatible con rollback automático: ${version}`);
  const major = Number(match[1]);
  const minor = Number(match[2] || 0);
  const patch = Number(match[3] || 0) + 1;
  return `${major}.${minor}.${patch}`;
}
