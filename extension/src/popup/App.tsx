import React, { useEffect, useState } from 'react';

const LINKEDIN_ORIGIN = 'https://www.linkedin.com';

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 220,
    padding: '16px 16px 14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: 13,
    color: '#111827',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  logo: {
    width: 20,
    height: 20,
  },
  title: {
    fontWeight: 700,
    fontSize: 13,
    color: '#111827',
  },
  button: {
    width: '100%',
    padding: '8px 0',
    background: '#0a66c2',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    letterSpacing: 0,
  },
  onLinkedIn: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center' as const,
    padding: '2px 0 4px',
  },
};

export default function App() {
  const [isOnLinkedIn, setIsOnLinkedIn] = useState<boolean | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? '';
      setIsOnLinkedIn(url.startsWith(LINKEDIN_ORIGIN));
    });
  }, []);

  const openLinkedIn = () => {
    void chrome.tabs.create({ url: `${LINKEDIN_ORIGIN}/feed/` });
  };

  const logoUrl = chrome.runtime.getURL('icons/icon48.png');

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <img src={logoUrl} alt="" style={styles.logo} />
        <span style={styles.title}>Personalized Feeds</span>
      </div>

      {isOnLinkedIn === false && (
        <button style={styles.button} type="button" onClick={openLinkedIn}>
          Open LinkedIn
        </button>
      )}

      {isOnLinkedIn === true && (
        <div style={styles.onLinkedIn}>Open the sidebar on this page.</div>
      )}
    </div>
  );
}
