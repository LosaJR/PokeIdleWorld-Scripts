import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const root = process.cwd();
const stagingDir = path.join(root, 'staging-upload');
const manifestPath = path.join(stagingDir, 'manifest.json');
const replacementMarkerPath = path.join(root, '.publish-replacements.json');
const allowedSourceRoot = path.resolve(root, 'src');
const allowedBackupRoot = path.resolve(root, 'backup', 'previous');

let manifest;
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('No hay carga preparada que ensamblar.');
    process.exit(0);
  }
  throw error;
}

if (manifest.mode === 'patch') {
  if (!Array.isArray(manifest.patches) || !manifest.patches.length) {
    throw new Error('El manifiesto de parche no contiene cambios.');
  }

  for (const item of manifest.patches) {
    if (!item?.target || !Array.isArray(item.replacements) || !item.replacements.length || !item.sha256) {
      throw new Error('Entrada de parche inválida en staging-upload/manifest.json.');
    }
    const target = path.resolve(root, item.target);
    if (!target.startsWith(`${allowedSourceRoot}${path.sep}`)) {
      throw new Error(`Destino de parche no permitido: ${item.target}`);
    }

    let source = await fs.readFile(target, 'utf8');
    for (const replacement of item.replacements) {
      const from = String(replacement?.from ?? '');
      const to = String(replacement?.to ?? '');
      const expected = Number(replacement?.expected ?? 1);
      if (!from || !Number.isInteger(expected) || expected < 1) {
        throw new Error(`${item.target}: reemplazo de parche inválido.`);
      }
      const occurrences = source.split(from).length - 1;
      if (occurrences !== expected) {
        throw new Error(`${item.target}: se esperaban ${expected} coincidencias y se encontraron ${occurrences}.`);
      }
      source = source.split(from).join(to);
    }

    const buffer = Buffer.from(source, 'utf8');
    await verifyBuffer(item.target, buffer, item.sha256, item.bytes);
    await fs.writeFile(target, buffer);
    console.log(`Parche aplicado y verificado: ${item.target} (${buffer.length} bytes).`);
  }

  await fs.rm(stagingDir, { recursive: true, force: true });
  console.log('Parche aplicado y staging-upload eliminado; publish.mjs conservará automáticamente el dist anterior como respaldo.');
  process.exit(0);
}

if (!Array.isArray(manifest.files) || !manifest.files.length) {
  throw new Error('El manifiesto de carga no contiene archivos.');
}

for (const item of manifest.files) {
  if (!item?.target || !Array.isArray(item.payloads) || !item.payloads.length || item.encoding !== 'gzip-base64' || !item.sha256) {
    throw new Error('Entrada inválida en staging-upload/manifest.json.');
  }

  const target = path.resolve(root, item.target);
  if (!target.startsWith(`${allowedSourceRoot}${path.sep}`)) {
    throw new Error(`Destino de fuente no permitido: ${item.target}`);
  }

  let encoded = '';
  for (const payloadName of item.payloads) {
    const payload = path.resolve(root, payloadName);
    if (!payload.startsWith(`${path.resolve(stagingDir)}${path.sep}`)) {
      throw new Error(`Payload no permitido: ${payloadName}`);
    }
    const part = (await fs.readFile(payload, 'utf8')).replace(/\s+/g, '');
    console.log(`${item.target} <- ${payloadName}: ${part.length} caracteres; inicio ${part.slice(0, 12)}; final ${part.slice(-12)}`);
    encoded += part;
  }

  const compressed = Buffer.from(encoded, 'base64');
  console.log(`${item.target}: base64 ${encoded.length}; gzip ${compressed.length}; SHA gzip ${crypto.createHash('sha256').update(compressed).digest('hex')}`);
  const source = zlib.gunzipSync(compressed);
  await verifyBuffer(item.target, source, item.sha256, item.bytes);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, source);
  console.log(`Ensamblado ${item.target} (${source.length} bytes).`);
}

if (manifest.mode === 'replace') {
  const files = manifest.files.map(item => path.basename(item.target));
  if (files.some(file => !file.endsWith('.user.js'))) {
    throw new Error('Un reemplazo solo puede apuntar a archivos .user.js.');
  }
  await fs.writeFile(replacementMarkerPath, `${JSON.stringify({ files }, null, 2)}\n`, 'utf8');
  await fs.rm(stagingDir, { recursive: true, force: true });
  console.log(`Carga de reemplazo ensamblada para ${files.join(', ')}; el respaldo heredado se eliminará tras publicar.`);
  process.exit(0);
}

if (manifest.backups == null) {
  await fs.rm(stagingDir, { recursive: true, force: true });
  console.log('Carga ensamblada y staging-upload eliminado; publish.mjs conservará automáticamente el dist anterior como respaldo.');
  process.exit(0);
}

if (!Array.isArray(manifest.backups) || manifest.backups.length !== manifest.files.length) {
  throw new Error('Si se declaran respaldos, debe existir uno por cada userscript.');
}

await fs.rm(allowedBackupRoot, { recursive: true, force: true });
await fs.mkdir(allowedBackupRoot, { recursive: true });
for (const item of manifest.backups) {
  const sourcePath = path.resolve(root, item.source);
  const targetPath = path.resolve(root, item.target);
  if (!sourcePath.startsWith(`${allowedSourceRoot}${path.sep}`)) throw new Error(`Fuente de respaldo no permitida: ${item.source}`);
  if (!targetPath.startsWith(`${allowedBackupRoot}${path.sep}`)) throw new Error(`Destino de respaldo no permitido: ${item.target}`);
  if (!Array.isArray(item.replacements) || !item.replacements.length) throw new Error(`${item.target}: faltan reemplazos de versión.`);

  let restored = await fs.readFile(sourcePath, 'utf8');
  for (const replacement of item.replacements) {
    if (!Array.isArray(replacement) || replacement.length !== 2) throw new Error(`${item.target}: reemplazo inválido.`);
    const [currentValue, previousValue] = replacement;
    if (!restored.includes(currentValue)) throw new Error(`${item.target}: no se encontró ${currentValue}.`);
    restored = restored.split(currentValue).join(previousValue);
  }
  const buffer = Buffer.from(restored, 'utf8');
  await verifyBuffer(item.target, buffer, item.sha256, item.bytes);
  await fs.writeFile(targetPath, buffer);
  console.log(`Respaldo inicial creado: ${item.target}.`);
}

await fs.rm(stagingDir, { recursive: true, force: true });
console.log('Carga ensamblada, respaldos verificados y staging-upload eliminado.');

async function verifyBuffer(label, buffer, expectedHash, expectedBytes) {
  const digest = crypto.createHash('sha256').update(buffer).digest('hex');
  if (digest !== expectedHash) {
    throw new Error(`${label}: SHA-256 incorrecto; esperado ${expectedHash}, obtenido ${digest}.`);
  }
  if (Number.isFinite(Number(expectedBytes)) && buffer.length !== Number(expectedBytes)) {
    throw new Error(`${label}: tamaño incorrecto; esperado ${expectedBytes}, obtenido ${buffer.length}.`);
  }
}
