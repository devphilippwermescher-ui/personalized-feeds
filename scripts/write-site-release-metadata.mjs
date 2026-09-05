import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [site, outputPath] = process.argv.slice(2);
if (!['landing', 'team'].includes(site) || !outputPath) {
  throw new Error('Usage: node scripts/write-site-release-metadata.mjs <landing|team> <output-path>');
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const repository = process.env.GITHUB_REPOSITORY || 'devphilippwermescher-ui/personalized-feeds';
const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
const commit = (process.env.GITHUB_SHA || 'local').slice(0, 7);
const releasedAt = process.env.RELEASED_AT || new Date().toISOString();
const releaseUrl = `${serverUrl}/${repository}/releases/tag/v${version}`;
const productionDownloadUrl = `${serverUrl}/${repository}/releases/download/v${version}/personalized-feeds-v${version}.zip`;

const metadata =
  site === 'landing'
    ? {
        version,
        commit,
        releasedAt,
        downloadUrl: productionDownloadUrl,
        releaseUrl,
      }
    : {
        version,
        commit,
        publishedAt: releasedAt,
        environments: {
          development: {
            label: `main development · ${commit}`,
            downloadUrl: './downloads/myfeedpilot-development-latest.zip',
          },
          staging: {
            label: `main staging · ${commit}`,
            downloadUrl: './downloads/myfeedpilot-staging-latest.zip',
          },
          production: {
            label: `v${version}`,
            downloadUrl: productionDownloadUrl,
          },
        },
      };

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log(`Wrote ${site} release metadata for v${version} (${commit}) to ${outputPath}`);
