import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const stagingDir = path.join(root, '.staging', 'dist');
const distDir = path.join(root, 'dist');
const backupDir = path.join(root, 'backup', 'previous');

await assertDirectory(stagingDir, 'Ejecuta primero npm run build.');
if (await directoriesEqual(stagingDir, distDir)) {
  console.log('La distribución generada es idéntica a la publicada; no se rota el respaldo.');
  process.exit(0);
}

const temporaryBackup = path.join(root, '.staging', 'previous');
await fs.rm(temporaryBackup, { recursive: true, force: true });

if (await hasPublishedFiles(distDir)) {
  await fs.cp(distDir, temporaryBackup, { recursive: true });
}

await fs.rm(distDir, { recursive: true, force: true });
await fs.cp(stagingDir, distDir, { recursive: true });
await fs.rm(backupDir, { recursive: true, force: true });

try {
  await fs.access(temporaryBackup);
  await fs.cp(temporaryBackup, backupDir, { recursive: true });
} catch {
  await fs.mkdir(backupDir, { recursive: true });
  await fs.writeFile(path.join(backupDir, '.gitkeep'), '', 'utf8');
}

console.log('Publicación preparada: dist actualizado y backup/previous sustituido por la versión anterior.');

async function assertDirectory(directory, message) {
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) throw new Error(message);
  } catch {
    throw new Error(message);
  }
}

async function hasPublishedFiles(directory) {
  try {
    const entries = await fs.readdir(directory);
    return entries.some(name => name !== '.gitkeep');
  } catch {
    return false;
  }
}

async function directoriesEqual(left, right) {
  try {
    const [leftFiles, rightFiles] = await Promise.all([snapshot(left), snapshot(right)]);
    return JSON.stringify(leftFiles) === JSON.stringify(rightFiles);
  } catch {
    return false;
  }
}

async function snapshot(directory, prefix = '') {
  const rows = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '.gitkeep') continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) rows.push(...await snapshot(absolute, relative));
    else rows.push([relative, await fs.readFile(absolute, 'base64')]);
  }
  return rows;
}
