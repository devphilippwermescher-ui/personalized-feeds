const fallbackMetadata = {
  version: '0.1.5',
  commit: 'b04c3fb',
  publishedAt: null,
  environments: {
    development: { label: 'main development', downloadUrl: './downloads/myfeedpilot-development-latest.zip' },
    staging: { label: 'main staging', downloadUrl: './downloads/myfeedpilot-staging-latest.zip' },
    production: {
      label: 'v0.1.5',
      downloadUrl:
        'https://github.com/devphilippwermescher-ui/personalized-feeds/releases/download/v0.1.5/personalized-feeds-v0.1.5.zip',
    },
  },
};

const applyMetadata = (metadata) => {
  const commit = document.querySelector('[data-commit]');
  if (commit) commit.textContent = metadata.commit || 'Unknown';

  Object.entries(metadata.environments || {}).forEach(([environment, release]) => {
    const version = document.querySelector(`[data-env-version="${environment}"]`);
    const download = document.querySelector(`[data-env-download="${environment}"]`);
    if (version) version.textContent = release.label;
    if (download && release.downloadUrl) download.href = release.downloadUrl;
  });

  const published = document.querySelector('[data-published-at]');
  if (published) {
    published.textContent = metadata.publishedAt
      ? `Published ${new Date(metadata.publishedAt).toLocaleString()}`
      : 'Published by GitHub Actions';
  }
};

fetch('./release.json', { cache: 'no-store' })
  .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Release metadata unavailable'))))
  .then(applyMetadata)
  .catch(() => applyMetadata(fallbackMetadata));

const toast = document.querySelector('.toast');
document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      toast?.classList.add('is-visible');
      window.setTimeout(() => toast?.classList.remove('is-visible'), 1600);
    } catch {
      button.textContent = button.dataset.copy;
    }
  });
});
