import React from 'react';
import { createRoot } from 'react-dom/client';

function showRootError(message: string, detail?: string) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding:40px;font-family:sans-serif;max-width:500px;margin:0 auto;">
        <h1 style="color:#b91c1c;">Error</h1>
        <p style="color:#1a1a2e;">${message}</p>
        ${detail ? `<pre style="background:#fef2f2;padding:12px;border-radius:8px;overflow:auto;font-size:12px;">${detail}</pre>` : ''}
      </div>
    `;
  }
}

async function bootstrap() {
  const rootEl = document.getElementById('root');
  if (!rootEl) {
    document.body.innerHTML = '<div style="padding:20px;">No root element.</div>';
    return;
  }

  try {
    const [{ ErrorBoundary }, { default: App }, _] = await Promise.all([
      import('./components/ErrorBoundary'),
      import('./App'),
      import('./styles/global.css'),
    ]);

    rootEl.innerHTML = '';
    createRoot(rootEl).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('Dashboard bootstrap error:', err);
    showRootError(message, stack);
  }
}

bootstrap();
