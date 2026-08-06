import fs from 'node:fs/promises';
import path from 'node:path';
import { parseUserscript, setMetadataValue, compareVersions } from './lib/userscript.mjs';

const root = process.cwd();
const backupDir = path.join(root, 'backup', 'previous');
const distDir = path.join(root, 'dist');
const srcDir = path.join(root, 'src');
const requestedScript = String(process.env.ROLLBACK_SCRIPT || process.argv[2] || 'all').trim();
const requestedVersion = String(process.env.ROLLBACK_VERSION || process.argv[3] || '').trim();

const backupFiles = (await fs.readdir(backupDir)).filter(name => name.endsWith('.user.js')).sort();
if (!backupFiles.length) throw new Error('No existe una versión anterior utilizable en backup/previous.');

let files;
if (!requestedScript || requestedScript.toLowerCase() === 'all') {
  if (requestedVersion) throw new Error('Una versión manual solo puede usarse al restaurar un único script.');
  files = backupFiles;
} else {
  const normalized = requestedScript.endsWith('.user.js') ? requestedScript : `${requestedScript}.user.js`;
  const exact = backupFiles.find(file => file === normalized)
    || backupFiles.find(file => file.replace(/\.user\.js$/i, '') === requestedScript);
  if (!exact) {
    throw new Error(`Script no encontrado en el respaldo: ${requestedScript}. Disponibles: ${backupFiles.join(', ')}`);
  }
  files = [exact];
}

await fs.mkdir(srcDir, { recursive: true });
const restored = [];

for (const file of files) {
  const backupSource = await fs.readFile(path.join(backupDir, file), 'utf8');
  const backup = parseUserscript(backupSource, file);

  let currentVersion = backup.version;
  try {
    const current = parseUserscript(await fs.readFile(path.join(distDir, file), 'utf8'), file);
    currentVersion = current.version;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const nextVersion = requestedVersion || bumpPatch(currentVersion);
  if (compareVersions(nextVersion, currentVersion) <= 0) {
    throw new Error(`${file}: la versión de rollback (${nextVersion}) debe ser superior a la publicada (${currentVersion}).`);
  }

  const restoredSource = setMetadataValue(backupSource, 'version', nextVersion);
  await fs.writeFile(path.join(srcDir, file), `${restoredSource.trimEnd()}\n`, 'utf8');
  restored.push({ file, from: backup.version, replaced: currentVersion, publishedAs: nextVersion });
}

console.log('Rollback preparado:');
for (const item of restored) {
  console.log(`- ${item.file}: código ${item.from}, sustituye ${item.replaced}, se publicará como ${item.publishedAs}.`);
}

function bumpPatch(version) {
  const match = String(version).trim().match(/^(\d+(?:\.\d+)*)(?:[-+].*)?$/);
  if (!match) throw new Error(`No se puede incrementar automáticamente la versión: ${version}`);
  const parts = match[1].split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  parts[parts.length - 1] += 1;
  return parts.join('.');
}
