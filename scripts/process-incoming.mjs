import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const incomingDir = path.join(root, 'incoming');
const srcDir = path.join(root, 'src');

function parseMeta(content, label) {
  const match = content.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!match) throw new Error(`${label}: falta la cabecera UserScript.`);
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const row = line.match(/^\s*\/\/\s*@([^\s]+)\s+(.+?)\s*$/);
    if (row && meta[row[1]] === undefined) meta[row[1]] = row[2];
  }
  for (const key of ['name', 'namespace', 'version']) {
    if (!meta[key]) throw new Error(`${label}: falta @${key}.`);
  }
  return meta;
}

function identity(meta) {
  return `${meta.namespace.trim()}\u0000${meta.name.trim()}`;
}

function versionParts(version) {
  if (!/^\d+(?:\.\d+)*$/.test(version)) {
    throw new Error(`Versión no soportada: ${version}. Usa números separados por puntos.`);
  }
  return version.split('.').map(Number);
}

function compareVersions(a, b) {
  const aa = versionParts(a);
  const bb = versionParts(b);
  const length = Math.max(aa.length, bb.length);
  for (let i = 0; i < length; i++) {
    const diff = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

async function main() {
  await fs.mkdir(incomingDir, { recursive: true });
  const incomingEntries = await fs.readdir(incomingDir, { withFileTypes: true });
  const unsupported = incomingEntries
    .filter(entry => entry.isFile() && !entry.name.startsWith('.') && entry.name !== 'README.md' && !entry.name.endsWith('.user.js'))
    .map(entry => entry.name);
  if (unsupported.length) throw new Error(`incoming/ contiene archivos no soportados: ${unsupported.join(', ')}`);

  const incomingFiles = incomingEntries
    .filter(entry => entry.isFile() && entry.name.endsWith('.user.js'))
    .map(entry => entry.name)
    .sort();

  if (!incomingFiles.length) {
    console.log('incoming/: no hay userscripts pendientes.');
    return;
  }

  const srcFiles = (await fs.readdir(srcDir))
    .filter(name => name.endsWith('.user.js'))
    .sort();
  const sourceByIdentity = new Map();
  const sourceMeta = new Map();

  for (const name of srcFiles) {
    const content = await fs.readFile(path.join(srcDir, name), 'utf8');
    const meta = parseMeta(content, `src/${name}`);
    const key = identity(meta);
    if (sourceByIdentity.has(key)) throw new Error(`Identidad duplicada en src/: ${meta.name}`);
    sourceByIdentity.set(key, name);
    sourceMeta.set(name, meta);
  }

  const claimedTargets = new Set();
  for (const incomingName of incomingFiles) {
    const incomingPath = path.join(incomingDir, incomingName);
    const content = await fs.readFile(incomingPath, 'utf8');
    const meta = parseMeta(content, `incoming/${incomingName}`);

    let targetName = srcFiles.includes(incomingName) ? incomingName : sourceByIdentity.get(identity(meta));
    if (!targetName) {
      throw new Error(`incoming/${incomingName}: no existe un script en src/ con @name "${meta.name}" y el mismo @namespace.`);
    }
    if (claimedTargets.has(targetName)) {
      throw new Error(`Hay más de un archivo en incoming/ intentando actualizar ${targetName}.`);
    }
    claimedTargets.add(targetName);

    const current = sourceMeta.get(targetName);
    if (identity(meta) !== identity(current)) {
      throw new Error(`incoming/${incomingName}: la identidad no coincide con src/${targetName}.`);
    }
    if (compareVersions(meta.version, current.version) <= 0) {
      throw new Error(`incoming/${incomingName}: @version ${meta.version} debe ser superior a ${current.version}.`);
    }

    await fs.writeFile(path.join(srcDir, targetName), content, 'utf8');
    await fs.unlink(incomingPath);
    console.log(`incoming/${incomingName} -> src/${targetName}: ${current.version} -> ${meta.version}`);
  }
}

await main();
