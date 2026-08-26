import { readFile, writeFile } from 'node:fs/promises';

const version = process.argv[2];

if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Usage: npm run version:set -- <X.Y.Z>');
  process.exit(1);
}

const currentVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
const currentParts = currentVersion.split('.').map(Number);
const nextParts = version.split('.').map(Number);
const isIncrease = nextParts.some(
  (part, index) =>
    part > currentParts[index] && nextParts.slice(0, index).every((value, i) => value === currentParts[i])
);

if (!isIncrease) {
  console.error(`Version must increase: ${currentVersion} -> ${version}`);
  process.exit(1);
}

const jsonFiles = [
  ['package.json', true],
  ['package-lock.json', true],
  ['extension/package.json', true],
  ['extension/package-lock.json', true],
  ['extension/src/manifest.json', false],
];

for (const [file, hasLockfileRoot] of jsonFiles) {
  const contents = JSON.parse(await readFile(file, 'utf8'));
  contents.version = version;

  if (hasLockfileRoot && contents.packages?.['']) {
    contents.packages[''].version = version;
  }

  await writeFile(file, `${JSON.stringify(contents, null, 2)}\n`);
}

console.log(`Product version updated to ${version}.`);
