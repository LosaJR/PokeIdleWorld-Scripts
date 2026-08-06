import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const root = process.cwd();
const stagingDir = path.join(root, 'staging-upload');
const manifestPath = path.join(stagingDir, 'manifest.json');

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

if (!Array.isArray(manifest.files) || !manifest.files.length) {
  throw new Error('El manifiesto de carga no contiene archivos.');
}

for (const item of manifest.files) {
  if (!item?.target || !item?.payload || item.encoding !== 'gzip-base64' || !item.sha256) {
    throw new Error('Entrada inválida en staging-upload/manifest.json.');
  }

  const target = path.resolve(root, item.target);
  const payload = path.resolve(root, item.payload);
  if (!target.startsWith(`${path.resolve(root, 'src')}${path.sep}`)) {
    throw new Error(`Destino no permitido: ${item.target}`);
  }
  if (!payload.startsWith(`${path.resolve(stagingDir)}${path.sep}`)) {
    throw new Error(`Payload no permitido: ${item.payload}`);
  }

  const encoded = (await fs.readFile(payload, 'utf8')).replace(/\s+/g, '');
  const source = zlib.gunzipSync(Buffer.from(encoded, 'base64'));
  const digest = crypto.createHash('sha256').update(source).digest('hex');
  if (digest !== item.sha256) {
    throw new Error(`${item.target}: SHA-256 incorrecto; esperado ${item.sha256}, obtenido ${digest}.`);
  }
  if (Number.isFinite(Number(item.bytes)) && source.length !== Number(item.bytes)) {
    throw new Error(`${item.target}: tamaño incorrecto; esperado ${item.bytes}, obtenido ${source.length}.`);
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, source);
  console.log(`Ensamblado ${item.target} (${source.length} bytes).`);
}

await fs.rm(stagingDir, { recursive: true, force: true });
console.log('Carga ensamblada y staging-upload eliminado.');
