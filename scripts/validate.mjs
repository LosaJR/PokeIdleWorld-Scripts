import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseUserscript, compareVersions, injectDistributionUrls } from './lib/userscript.mjs';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const srcDir = path.join(root, 'src');
const distDir = path.join(root, 'dist');
const config = JSON.parse(await fs.readFile(path.join(root, 'config', 'repository.json'), 'utf8'));
const baseUrl = config.pagesBaseUrl.replace(/\/$/, '');
const files = (await fs.readdir(srcDir)).filter(name => name.endsWith('.user.js')).sort();

if (!files.length) {
  console.log('No hay userscripts todavía. La estructura base es válida.');
  process.exit(0);
}

const errors = [];
const seenIdentities = new Set();

for (const file of files) {
  const sourcePath = path.join(srcDir, file);
  const source = await fs.readFile(sourcePath, 'utf8');
  let parsed;
  try {
    parsed = parseUserscript(source, sourcePath);
  } catch (error) {
    errors.push(error.message);
    continue;
  }

  for (const key of ['name', 'namespace', 'version', 'match', 'grant', 'run-at', 'updateURL', 'downloadURL']) {
    if (!parsed.metadata.get(key)?.length) errors.push(`${file}: falta @${key}.`);
  }

  for (const key of ['name', 'namespace', 'version', 'updateURL', 'downloadURL']) {
    if ((parsed.metadata.get(key)?.length || 0) > 1) errors.push(`${file}: @${key} debe aparecer una sola vez.`);
  }

  if (!/^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(parsed.version)) {
    errors.push(`${file}: @version no tiene un formato válido (${parsed.version}).`);
  }

  const namespace = parsed.metadata.get('namespace')?.[0] || '';
  const identity = `${namespace}\n${parsed.name}`;
  if (seenIdentities.has(identity)) errors.push(`${file}: identidad Tampermonkey duplicada (@namespace + @name).`);
  seenIdentities.add(identity);

  const expectedMeta = `${baseUrl}/${file.replace(/\.user\.js$/i, '.meta.js')}`;
  const expectedDownload = `${baseUrl}/${file}`;
  if (parsed.updateURL !== expectedMeta) {
    errors.push(`${file}: @updateURL debe ser ${expectedMeta}.`);
  }
  if (parsed.downloadURL !== expectedDownload) {
    errors.push(`${file}: @downloadURL debe ser ${expectedDownload}.`);
  }

  try {
    await execFileAsync(process.execPath, ['--check', sourcePath]);
  } catch (error) {
    const detail = String(error.stderr || error.message || '').trim();
    errors.push(`${file}: error de sintaxis JavaScript${detail ? `: ${detail}` : '.'}`);
  }

  const currentDistPath = path.join(distDir, file);
  try {
    const current = parseUserscript(await fs.readFile(currentDistPath, 'utf8'), currentDistPath);
    const order = compareVersions(parsed.version, current.version);
    if (order < 0) {
      errors.push(`${file}: la versión ${parsed.version} es inferior a la publicada (${current.version}).`);
    } else if (order === 0) {
      const expectedDistribution = `${injectDistributionUrls(source, baseUrl, file).trimEnd()}\n`;
      const currentDistribution = `${current.source.trimEnd()}\n`;
      if (expectedDistribution !== currentDistribution) {
        errors.push(`${file}: el contenido cambió pero @version sigue siendo ${parsed.version}.`);
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') errors.push(error.message);
  }
}

if (errors.length) {
  console.error(errors.map(error => `- ${error}`).join('\n'));
  process.exit(1);
}
console.log(`Validación correcta: ${files.length} userscript(s), cabeceras de actualización y sintaxis verificadas.`);
