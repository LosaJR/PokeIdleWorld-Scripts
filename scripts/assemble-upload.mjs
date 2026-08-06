import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

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

const archive = manifest.archive;
if (!archive || archive.encoding !== 'tar-xz-base64' || !Array.isArray(archive.payloads) || !archive.payloads.length || !archive.sha256) {
  throw new Error('El manifiesto no contiene un archivo tar.xz válido.');
}
if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error('El manifiesto no contiene archivos esperados.');

let encoded = '';
for (const payloadName of archive.payloads) {
  const payload = path.resolve(root, payloadName);
  if (!payload.startsWith(`${path.resolve(stagingDir)}${path.sep}`)) throw new Error(`Payload no permitido: ${payloadName}`);
  encoded += (await fs.readFile(payload, 'utf8')).replace(/\s+/g, '');
}
const archiveBuffer = Buffer.from(encoded, 'base64');
const archiveDigest = crypto.createHash('sha256').update(archiveBuffer).digest('hex');
if (archiveDigest !== archive.sha256) throw new Error(`SHA-256 del archivo incorrecto: ${archiveDigest}.`);
if (Number(archive.bytes) !== archiveBuffer.length) throw new Error(`Tamaño del archivo incorrecto: ${archiveBuffer.length}.`);

const temporaryArchive = path.join(root, '.userscripts-upload.tar.xz');
await fs.writeFile(temporaryArchive, archiveBuffer);
try {
  const listing = spawnSync('tar', ['-tJf', temporaryArchive], { encoding: 'utf8' });
  if (listing.status !== 0) throw new Error(`No se pudo listar el archivo: ${listing.stderr}`);
  const allowed = /^(src|backup\/previous)\/[A-Za-z0-9._-]+\.user\.js$/;
  const entries = listing.stdout.split(/\r?\n/).filter(Boolean).filter(value => !value.endsWith('/'));
  for (const entry of entries) if (!allowed.test(entry)) throw new Error(`Ruta no permitida en el archivo: ${entry}`);

  const extraction = spawnSync('tar', ['-xJf', temporaryArchive, '-C', root], { encoding: 'utf8' });
  if (extraction.status !== 0) throw new Error(`No se pudo extraer la carga: ${extraction.stderr}`);

  for (const item of manifest.files) {
    if (!allowed.test(item.path)) throw new Error(`Ruta esperada no permitida: ${item.path}`);
    const filePath = path.resolve(root, item.path);
    const source = await fs.readFile(filePath);
    const digest = crypto.createHash('sha256').update(source).digest('hex');
    if (digest !== item.sha256) throw new Error(`${item.path}: SHA-256 incorrecto.`);
    if (source.length !== Number(item.bytes)) throw new Error(`${item.path}: tamaño incorrecto.`);
  }
} finally {
  await fs.rm(temporaryArchive, { force: true });
}

await fs.rm(stagingDir, { recursive: true, force: true });
console.log(`Carga ensamblada y verificada: ${manifest.files.length} archivos.`);
