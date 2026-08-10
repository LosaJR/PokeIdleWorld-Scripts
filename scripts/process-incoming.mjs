import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const incomingDir = path.join(root, 'incoming');
const srcDir = path.join(root, 'src');
const changelogDir = path.join(root, 'changelog');
const generalChangelogPath = path.join(root, 'CHANGELOG.md');

const SCRIPT_SUFFIXES = ['.user.js', '.user.txt'];
const CHANGELOG_SUFFIX = '.changelog.txt';
const UPDATE_NOTES_PREFIX = 'actualizaciones-';
const UPDATE_NOTES_SUFFIX = '.txt';

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

function scriptStem(name) {
  for (const suffix of SCRIPT_SUFFIXES) {
    if (name.endsWith(suffix)) return name.slice(0, -suffix.length);
  }

  // Los scripts entregados al usuario también pueden venir como .txt normal.
  // Solo los tratamos como userscript si el nombre no corresponde a un
  // changelog; parseMeta() comprobará después que realmente contienen una
  // cabecera ==UserScript== válida.
  if (
    name.endsWith('.txt')
    && !name.startsWith(UPDATE_NOTES_PREFIX)
    && !name.endsWith(CHANGELOG_SUFFIX)
  ) {
    return name.slice(0, -'.txt'.length);
  }

  return null;
}

function changelogStem(name) {
  if (name.endsWith(CHANGELOG_SUFFIX)) {
    return name.slice(0, -CHANGELOG_SUFFIX.length);
  }
  if (name.startsWith(UPDATE_NOTES_PREFIX) && name.endsWith(UPDATE_NOTES_SUFFIX)) {
    return name.slice(UPDATE_NOTES_PREFIX.length, -UPDATE_NOTES_SUFFIX.length);
  }
  return null;
}

function pairingStem(stem) {
  return String(stem || '')
    .replace(/^actualizaciones-/, '')
    .replace(/^pokegrid-/, '')
    .replace(/-v(?=\d+(?:\.\d+)*$)/, '-');
}

function canonicalSlug(targetName) {
  return targetName.replace(/\.user\.js$/, '');
}

function madridDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function normalizeNotes(content, label) {
  const text = content.replace(/\r\n/g, '\n').trim();
  if (!text) throw new Error(`${label}: el changelog está vacío.`);
  return text;
}

async function prependEntry(filePath, header, entry, duplicateMarker) {
  let current = '';
  try {
    current = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  if (current.includes(duplicateMarker)) {
    throw new Error(`${path.relative(root, filePath)} ya contiene una entrada para ${duplicateMarker}.`);
  }

  const base = current.trim()
    ? current.trimEnd()
    : header.trimEnd();

  const firstBreak = base.indexOf('\n');
  const title = firstBreak === -1 ? base : base.slice(0, firstBreak);
  const rest = firstBreak === -1 ? '' : base.slice(firstBreak + 1).trimStart();
  const next = `${title}\n\n${entry.trim()}\n\n${rest}`.trimEnd() + '\n';
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, next, 'utf8');
}

async function main() {
  await fs.mkdir(incomingDir, { recursive: true });
  const incomingEntries = await fs.readdir(incomingDir, { withFileTypes: true });

  const unsupported = incomingEntries
    .filter(entry => entry.isFile() && !entry.name.startsWith('.') && entry.name !== 'README.md')
    .map(entry => entry.name)
    .filter(name => scriptStem(name) === null && changelogStem(name) === null);

  if (unsupported.length) {
    throw new Error(`incoming/ contiene archivos no soportados: ${unsupported.join(', ')}`);
  }

  const scriptFiles = incomingEntries
    .filter(entry => entry.isFile() && scriptStem(entry.name) !== null)
    .map(entry => entry.name)
    .sort();

  const changelogFiles = incomingEntries
    .filter(entry => entry.isFile() && changelogStem(entry.name) !== null)
    .map(entry => entry.name)
    .sort();

  if (!scriptFiles.length && !changelogFiles.length) {
    console.log('incoming/: no hay actualizaciones pendientes.');
    return;
  }

  const scriptByStem = new Map();
  for (const name of scriptFiles) {
    const stem = pairingStem(scriptStem(name));
    if (scriptByStem.has(stem)) {
      throw new Error(`incoming/: hay más de un userscript para la actualización "${stem}".`);
    }
    scriptByStem.set(stem, name);
  }

  const changelogByStem = new Map();
  for (const name of changelogFiles) {
    const stem = pairingStem(changelogStem(name));
    if (changelogByStem.has(stem)) {
      throw new Error(`incoming/: hay más de un changelog para la actualización "${stem}".`);
    }
    changelogByStem.set(stem, name);
  }

  const pairedStems = [...new Set([...scriptByStem.keys(), ...changelogByStem.keys()])].sort();
  const readyStems = [];
  for (const stem of pairedStems) {
    const scriptName = scriptByStem.get(stem);
    const changelogName = changelogByStem.get(stem);
    if (!scriptName || !changelogName) {
      const missing = !scriptName ? 'userscript' : 'changelog';
      console.log(`incoming/${stem}: esperando ${missing} compañero; no se publica todavía.`);
      continue;
    }
    readyStems.push(stem);
  }

  if (!readyStems.length) {
    console.log('incoming/: no hay parejas completas listas para publicar.');
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
  const date = madridDate();

  for (const stem of readyStems) {
    const incomingName = scriptByStem.get(stem);
    const changelogName = changelogByStem.get(stem);
    const incomingPath = path.join(incomingDir, incomingName);
    const changelogPath = path.join(incomingDir, changelogName);

    const content = await fs.readFile(incomingPath, 'utf8');
    const notes = normalizeNotes(
      await fs.readFile(changelogPath, 'utf8'),
      `incoming/${changelogName}`
    );
    const meta = parseMeta(content, `incoming/${incomingName}`);

    let targetName = srcFiles.includes(incomingName) ? incomingName : sourceByIdentity.get(identity(meta));
    if (!targetName) {
      throw new Error(`incoming/${incomingName}: no existe un script en src/ con @name "${meta.name}" y el mismo @namespace.`);
    }
    if (claimedTargets.has(targetName)) {
      throw new Error(`Hay más de una pareja en incoming/ intentando actualizar ${targetName}.`);
    }
    claimedTargets.add(targetName);

    const current = sourceMeta.get(targetName);
    if (identity(meta) !== identity(current)) {
      throw new Error(`incoming/${incomingName}: la identidad no coincide con src/${targetName}.`);
    }
    if (compareVersions(meta.version, current.version) <= 0) {
      throw new Error(`incoming/${incomingName}: @version ${meta.version} debe ser superior a ${current.version}.`);
    }

    const slug = canonicalSlug(targetName);
    const scriptLogPath = path.join(changelogDir, `${slug}.md`);
    const scriptMarker = `## ${meta.version} —`;
    const generalMarker = `## ${meta.name} ${meta.version} —`;

    await prependEntry(
      scriptLogPath,
      `# ${meta.name}\n`,
      `## ${meta.version} — ${date}\n\n${notes}`,
      scriptMarker
    );

    await prependEntry(
      generalChangelogPath,
      '# Poke Idle World Scripts — Changelog\n',
      `## ${meta.name} ${meta.version} — ${date}\n\n${notes}`,
      generalMarker
    );

    await fs.writeFile(path.join(srcDir, targetName), content, 'utf8');
    await fs.unlink(incomingPath);
    await fs.unlink(changelogPath);

    console.log(
      `incoming/${incomingName} + ${changelogName} -> src/${targetName}: ` +
      `${current.version} -> ${meta.version}; changelog actualizado.`
    );
  }
}

await main();
