import path from 'node:path';

const HEADER_START = '// ==UserScript==';
const HEADER_END = '// ==/UserScript==';

export function parseUserscript(source, filePath = '<memory>') {
  const start = source.indexOf(HEADER_START);
  const end = source.indexOf(HEADER_END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error(`${filePath}: no contiene una cabecera UserScript válida.`);
  }

  const headerEnd = end + HEADER_END.length;
  const header = source.slice(start, headerEnd);
  const metadata = new Map();

  for (const line of header.split(/\r?\n/)) {
    const match = line.match(/^\/\/\s+@(\S+)\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    const values = metadata.get(key) ?? [];
    values.push(value);
    metadata.set(key, values);
  }

  const first = key => metadata.get(key)?.[0] ?? '';
  return {
    source,
    header,
    metadata,
    name: first('name'),
    version: first('version'),
    updateURL: first('updateURL'),
    downloadURL: first('downloadURL'),
    fileName: path.basename(filePath)
  };
}

export function compareVersions(a, b) {
  const normalize = value => String(value)
    .trim()
    .split(/[.+-]/)
    .map(part => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));

  const left = normalize(a);
  const right = normalize(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) > 0 ? 1 : -1;
  }
  return 0;
}

export function setMetadataValue(source, key, value) {
  const lines = source.split(/\r?\n/);
  const endIndex = lines.findIndex(line => line.trim() === HEADER_END);
  if (endIndex < 0) throw new Error('No se encontró el cierre de la cabecera UserScript.');

  const expression = new RegExp(`^(\\/\\/\\s+@${escapeRegExp(key)}\\s+).*$`);
  const index = lines.findIndex((line, lineIndex) => lineIndex < endIndex && expression.test(line));
  if (index >= 0) {
    lines[index] = lines[index].replace(expression, `$1${value}`);
  } else {
    lines.splice(endIndex, 0, `// @${key.padEnd(13)} ${value}`);
  }
  return lines.join('\n');
}

export function injectDistributionUrls(source, baseUrl, fileName) {
  const metaName = fileName.replace(/\.user\.js$/i, '.meta.js');
  let next = setMetadataValue(source, 'updateURL', `${baseUrl}/${metaName}`);
  next = setMetadataValue(next, 'downloadURL', `${baseUrl}/${fileName}`);
  return next;
}

export function metadataOnly(source) {
  return `${parseUserscript(source).header}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
