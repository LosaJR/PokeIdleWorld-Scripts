import fs from 'node:fs/promises';
import path from 'node:path';
import { parseUserscript, compareVersions, injectDistributionUrls } from './lib/userscript.mjs';

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
const seenNames = new Set();

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

  for (const key of ['name', 'version', 'match']) {
    if (!parsed.metadata.get(key)?.length) errors.push(`${file}: falta @${key}.`);
  }
  if (seenNames.has(parsed.name)) errors.push(`${file}: @name duplicado (${parsed.name}).`);
  seenNames.add(parsed.name);

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
console.log(`Validación correcta: ${files.length} userscript(s).`);
