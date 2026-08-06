import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const srcDir = path.join(root, 'src');
const backupDir = path.join(root, 'backup', 'previous');

const specifications = [
  {
    file: 'piw-qol-es.user.js',
    bytes: 251190,
    sha256: 'df70d88286929bf29792de82e727bb4e45cf2e79226ecd667dc0a73a1383a8f8',
    replacements: [['9.10.18', '9.10.17']]
  },
  {
    file: 'pokegrid-decision-detector.user.js',
    bytes: 30658,
    sha256: '1762939c0b96f14dbb79056b4a9e908cc63f8bdd76d40bfcadb2cca114fc4a64',
    replacements: [['V124', 'V123'], ['1.2.4', '1.2.3']]
  },
  {
    file: 'pokegrid-game-structure-monitor.user.js',
    bytes: 19484,
    sha256: 'ce6ea27478ea9b57cf135a8109eb865859ee3d19b75c3e4f6c335fea77208800',
    replacements: [['V121', 'V120'], ['1.2.1', '1.2.0']]
  },
  {
    file: 'pokegrid-hunt-intelligence.user.js',
    bytes: 207347,
    sha256: '5501944d50c419b9c3c2613aaeb1c5246855e234e961f9c919006f292c6a38b4',
    replacements: [['V113', 'V112'], ['1.1.3', '1.1.2']]
  },
  {
    file: 'pokegrid-script-bridge-health-agent.user.js',
    bytes: 22190,
    sha256: '16dfccb0fd852a6a89e488436716495a41d002e834219c1ec577f8bdc12fd1da',
    replacements: [['V111', 'V11'], ['1.1.1', '1.1.0']]
  }
];

const existing = await fs.readdir(backupDir).catch(() => []);
if (existing.filter(name => name.endsWith('.user.js')).length === specifications.length) {
  console.log('El respaldo inicial ya contiene los cinco userscripts.');
  process.exit(0);
}

const generated = [];
for (const specification of specifications) {
  let source = await fs.readFile(path.join(srcDir, specification.file), 'utf8');
  for (const [currentValue, previousValue] of specification.replacements) {
    if (!source.includes(currentValue)) {
      throw new Error(`${specification.file}: no se encontró ${currentValue} para crear el respaldo.`);
    }
    source = source.split(currentValue).join(previousValue);
  }

  const buffer = Buffer.from(source, 'utf8');
  const digest = crypto.createHash('sha256').update(buffer).digest('hex');
  if (buffer.length !== specification.bytes || digest !== specification.sha256) {
    throw new Error(`${specification.file}: el respaldo generado no coincide con la versión auditada.`);
  }
  generated.push([specification.file, buffer]);
}

await fs.rm(backupDir, { recursive: true, force: true });
await fs.mkdir(backupDir, { recursive: true });
for (const [file, buffer] of generated) {
  await fs.writeFile(path.join(backupDir, file), buffer);
}
console.log('Respaldo inicial reparado y verificado: cinco userscripts originales.');
