export type ToastTone = 'success' | 'error';

const TOAST_STYLE_ID = 'lfa-global-toast-styles';

function ensureToastStyles(): void {
  if (document.getElementById(TOAST_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = TOAST_STYLE_ID;
  style.textContent = `
    .lfa-global-toast {
      position: fixed;
      right: 24px;
      bottom: 24px;
      max-width: min(420px, calc(100vw - 32px));
      padding: 12px 18px;
      border-radius: 12px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.45;
      z-index: 100010;
      box-shadow: 0 14px 34px rgba(15, 23, 42, 0.22);
      animation: lfa-global-toast-in 0.22s ease;
    }
    .lfa-global-toast--success {
      background: #059669;
    }
    .lfa-global-toast--error {
      background: #dc2626;
    }
    @keyframes lfa-global-toast-in {
      from {
        transform: translateY(10px);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
  `;

  document.head.appendChild(style);
}

export function showToast(message: string, tone: ToastTone = 'success'): void {
  ensureToastStyles();

  const existing = document.querySelector('.lfa-global-toast');
  existing?.remove();

  const toast = document.createElement('div');
  toast.className = `lfa-global-toast lfa-global-toast--${tone}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => toast.remove(), 3000);
}
