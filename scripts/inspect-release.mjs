import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

const version = readJson('package.json').version;
const extensionVersion = readJson('extension/package.json').version;
const manifestVersion = readJson('extension/src/manifest.json').version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Product version must use X.Y.Z format, got: ${version}`);
}

if (version !== extensionVersion || version !== manifestVersion) {
  throw new Error(
    `Version mismatch: root=${version} extension=${extensionVersion} manifest=${manifestVersion}. ` +
      'Run: npm run version:set -- <X.Y.Z>'
  );
}

const readVersionAtCommit = (commit) => {
  if (!commit || /^0+$/.test(commit)) {
    return null;
  }

  try {
    const packageJson = execFileSync('git', ['show', `${commit}:package.json`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(packageJson).version;
  } catch {
    return null;
  }
};

const compareVersions = (left, right) => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
};

let versionChanged = false;
const oldVersion = readVersionAtCommit(process.env.BEFORE_SHA);

if (oldVersion && oldVersion !== version) {
  if (!/^\d+\.\d+\.\d+$/.test(oldVersion)) {
    throw new Error(`Previous product version is invalid: ${oldVersion}`);
  }

  if (compareVersions(version, oldVersion) <= 0) {
    throw new Error(`Product version must increase: ${oldVersion} -> ${version}`);
  }

  let taggedCommit = null;
  try {
    taggedCommit = execFileSync('git', ['rev-list', '-n', '1', `v${version}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // The production tag does not exist yet.
  }

  if (taggedCommit && taggedCommit !== process.env.GITHUB_SHA) {
    throw new Error(`Production tag v${version} already points to ${taggedCommit}; release versions are immutable.`);
  }

  versionChanged = process.env.GITHUB_EVENT_NAME === 'push';
}

const outputs = [
  `version=${version}`,
  `version_changed=${versionChanged}`,
  `short_sha=${process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'}`,
];

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`);
}

console.log(
  `Product version: ${version}; previous version: ${oldVersion ?? 'n/a'}; production release: ${versionChanged}`
);
