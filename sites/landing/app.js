const fallbackRelease = {
  version: '0.1.5',
  downloadUrl:
    'https://github.com/devphilippwermescher-ui/personalized-feeds/releases/download/v0.1.5/personalized-feeds-v0.1.5.zip',
  releaseUrl: 'https://github.com/devphilippwermescher-ui/personalized-feeds/releases/tag/v0.1.5',
};

const applyRelease = (release) => {
  const versionText = release.version ? `v${release.version}` : 'Latest release';

  document.querySelectorAll('[data-download-link]').forEach((link) => {
    link.href = release.downloadUrl || fallbackRelease.downloadUrl;
  });
  document.querySelectorAll('[data-release-link]').forEach((link) => {
    link.href = release.releaseUrl || fallbackRelease.releaseUrl;
  });
  document.querySelectorAll('[data-version-label]').forEach((label) => {
    label.textContent = versionText;
  });

  const note = document.querySelector('[data-release-note]');
  if (note) note.textContent = `${versionText} production release ready`;
};

fetch('./release.json', { cache: 'no-store' })
  .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Release metadata unavailable'))))
  .then(applyRelease)
  .catch(() => applyRelease(fallbackRelease));

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.14 }
);

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

const toast = document.querySelector('.toast');
document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      toast?.classList.add('is-visible');
      window.setTimeout(() => toast?.classList.remove('is-visible'), 1800);
    } catch {
      button.textContent = button.dataset.copy;
    }
  });
});
