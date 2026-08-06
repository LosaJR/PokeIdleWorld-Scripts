import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const markerPath = path.join(root, '.publish-replacements.json');
const backupRoot = path.join(root, 'backup', 'previous');

let marker;
try {
  marker = JSON.parse(await fs.readFile(markerPath, 'utf8'));
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('No hay reemplazos cuyo respaldo heredado deba eliminarse.');
    process.exit(0);
  }
  throw error;
}

if (!Array.isArray(marker.files) || !marker.files.length) {
  throw new Error('El marcador de reemplazo no contiene archivos.');
}

const removed = new Set();
for (const file of marker.files) {
  const clean = path.basename(String(file));
  if (clean !== file || !clean.endsWith('.user.js')) {
    throw new Error(`Nombre de reemplazo no permitido: ${file}`);
  }
  const meta = clean.replace(/\.user\.js$/, '.meta.js');
  await fs.rm(path.join(backupRoot, clean), { force: true });
  await fs.rm(path.join(backupRoot, meta), { force: true });
  removed.add(clean);
  removed.add(meta);
}

const manifestPath = path.join(backupRoot, 'manifest.json');
let manifest = { scripts: [] };
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
manifest.scripts = Array.isArray(manifest.scripts)
  ? manifest.scripts.filter(script => !removed.has(script?.file) && !removed.has(script?.metaFile))
  : [];
await fs.mkdir(backupRoot, { recursive: true });
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(backupRoot, 'index.html'), renderIndex(manifest.scripts), 'utf8');
await fs.rm(markerPath, { force: true });
console.log(`Respaldo heredado eliminado para: ${[...removed].join(', ')}.`);

function renderIndex(scripts) {
  const items = scripts.length
    ? scripts.map(script => `<li><strong>${escapeHtml(script.name)}</strong> <code>v${escapeHtml(script.version)}</code> — <a href="${escapeHtml(script.file)}">Instalar</a></li>`).join('\n')
    : '<li>No hay scripts respaldados.</li>';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Respaldo anterior · Poke Idle World Scripts</title>
</head>
<body>
  <h1>Respaldo anterior</h1>
  <ul>${items}</ul>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}
