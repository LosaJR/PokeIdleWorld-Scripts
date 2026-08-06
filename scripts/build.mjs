import fs from 'node:fs/promises';
import path from 'node:path';
import { injectDistributionUrls, metadataOnly, parseUserscript } from './lib/userscript.mjs';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const stagingDir = path.join(root, '.staging', 'dist');
const config = JSON.parse(await fs.readFile(path.join(root, 'config', 'repository.json'), 'utf8'));
const baseUrl = config.pagesBaseUrl.replace(/\/$/, '');

await fs.rm(path.join(root, '.staging'), { recursive: true, force: true });
await fs.mkdir(stagingDir, { recursive: true });

const files = (await fs.readdir(srcDir)).filter(name => name.endsWith('.user.js')).sort();
const manifest = [];

for (const file of files) {
  const source = await fs.readFile(path.join(srcDir, file), 'utf8');
  const distributed = injectDistributionUrls(source, baseUrl, file);
  const parsed = parseUserscript(distributed, file);
  const metaFile = file.replace(/\.user\.js$/i, '.meta.js');

  await fs.writeFile(path.join(stagingDir, file), `${distributed.trimEnd()}\n`, 'utf8');
  await fs.writeFile(path.join(stagingDir, metaFile), metadataOnly(distributed), 'utf8');
  manifest.push({
    name: parsed.name,
    version: parsed.version,
    file,
    metaFile,
    downloadURL: `${baseUrl}/${file}`,
    updateURL: `${baseUrl}/${metaFile}`
  });
}

await fs.writeFile(path.join(stagingDir, 'manifest.json'), `${JSON.stringify({ scripts: manifest }, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(stagingDir, 'index.html'), renderIndex(manifest), 'utf8');
console.log(`Build preparado en .staging/dist (${files.length} userscript(s)).`);

function renderIndex(scripts) {
  const cards = scripts.length
    ? scripts.map(script => `<li><strong>${escapeHtml(script.name)}</strong> <code>v${escapeHtml(script.version)}</code> — <a href="${encodeURI(script.file)}">Instalar</a></li>`).join('\n')
    : '<li>Todavía no hay scripts publicados.</li>';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Poke Idle World Scripts</title>
  <style>body{font:16px/1.5 system-ui,sans-serif;max-width:850px;margin:3rem auto;padding:0 1rem;background:#0b1320;color:#e8edf4}a{color:#70b7ff}code{color:#ffd166}li{margin:.75rem 0}</style>
</head>
<body>
  <h1>Poke Idle World Scripts</h1>
  <p>Instalación y actualizaciones automáticas mediante Tampermonkey.</p>
  <ul>${cards}</ul>
</body>
</html>\n`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
