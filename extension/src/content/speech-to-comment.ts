let micButton: HTMLButtonElement | null = null;
let statusToast: HTMLDivElement | null = null;

type SpeechWindow = Window &
  typeof globalThis & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

function showSpeechToast(message: string, tone: 'default' | 'error' = 'default'): void {
  statusToast?.remove();
  statusToast = document.createElement('div');
  statusToast.className = `lfa-speech-toast${tone === 'error' ? ' lfa-speech-toast--error' : ''}`;
  statusToast.textContent = message;
  document.body.appendChild(statusToast);
  window.setTimeout(() => statusToast?.remove(), 2400);
}

function ensureSpeechStyles(): void {
  if (document.getElementById('lfa-speech-comment-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'lfa-speech-comment-styles';
  style.textContent = `
    .lfa-speech-mic-btn {
      position: fixed;
      left: 18px;
      bottom: 22px;
      width: 48px;
      height: 48px;
      border: 2px solid #fff;
      border-radius: 50%;
      background: linear-gradient(135deg, #615DEC 0%, #4f46e5 100%);
      color: #fff;
      box-shadow: 0 18px 34px rgba(79, 70, 229, 0.24);
      z-index: 99996;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .lfa-speech-mic-btn:hover {
      transform: translateY(-1px);
    }
    .lfa-speech-mic-btn--active {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      box-shadow: 0 16px 28px rgba(220, 38, 38, 0.26);
    }
    .lfa-speech-toast {
      position: fixed;
      left: 18px;
      bottom: 92px;
      max-width: 260px;
      padding: 12px 14px;
      border-radius: 14px;
      background: #111827;
      color: #fff;
      font-size: 13px;
      line-height: 1.45;
      z-index: 99996;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.28);
    }
    .lfa-speech-toast--error {
      background: #7f1d1d;
    }
  `;
  document.head.appendChild(style);
}

function findCommentTarget(): HTMLTextAreaElement | HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement) {
    return active;
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    return active;
  }

  const selectors = [
    '.comments-comment-box__contenteditable',
    '.ql-editor[contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    'textarea',
  ];

  for (const selector of selectors) {
    const candidate = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    if (candidate) {
      return candidate as HTMLTextAreaElement | HTMLElement;
    }
  }

  return null;
}

function insertTranscript(target: HTMLTextAreaElement | HTMLElement, transcript: string): void {
  if (target instanceof HTMLTextAreaElement) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? target.value.length;
    const prefix = target.value.slice(0, start);
    const suffix = target.value.slice(end);
    const spacer = prefix && !prefix.endsWith(' ') ? ' ' : '';
    target.value = `${prefix}${spacer}${transcript}${suffix}`;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.focus();
    const caret = prefix.length + spacer.length + transcript.length;
    target.setSelectionRange(caret, caret);
    return;
  }

  target.focus();
  const selection = window.getSelection();
  if (!selection) {
    target.textContent = `${target.textContent || ''} ${transcript}`.trim();
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : document.createRange();
  range.deleteContents();
  range.insertNode(document.createTextNode(transcript));
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

export function destroySpeechToCommentButton(): void {
  micButton?.remove();
  micButton = null;
  statusToast?.remove();
  statusToast = null;
}

export function initSpeechToCommentButton(): void {
  if (micButton) {
    return;
  }

  ensureSpeechStyles();

  micButton = document.createElement('button');
  micButton.type = 'button';
  micButton.className = 'lfa-speech-mic-btn';
  micButton.title = 'Speech to comment';
  micButton.innerHTML = `
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 1 0 6 0V4a3 3 0 0 0-3-3Z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <path d="M12 19v4"></path>
      <path d="M8 23h8"></path>
    </svg>
  `;

  micButton.addEventListener('click', () => {
    const SpeechRecognitionCtor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      showSpeechToast('Speech recognition is not supported in this browser.', 'error');
      return;
    }

    const target = findCommentTarget();
    if (!target) {
      showSpeechToast('Focus a comment field first, then tap the mic button.', 'error');
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = document.documentElement.lang || 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    micButton?.classList.add('lfa-speech-mic-btn--active');
    showSpeechToast('Listening...');

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        showSpeechToast('No speech detected. Try again.', 'error');
        return;
      }

      insertTranscript(target, transcript);
      showSpeechToast('Inserted into comment field.');
    };

    recognition.onerror = (event) => {
      showSpeechToast(`Speech error: ${event.error}`, 'error');
    };

    recognition.onend = () => {
      micButton?.classList.remove('lfa-speech-mic-btn--active');
    };

    recognition.start();
  });

  document.body.appendChild(micButton);
}
