export const PROFILE_CONTENT_SHARED_CSS = `
  .pf-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    padding: 12px 20px;
    background: #1a1a1a;
    color: white;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10001;
    animation: pf-toast-slide 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  }

  .pf-toast.success {
    background: #059669;
  }

  .pf-toast.error {
    background: #DC2626;
  }

  @keyframes pf-toast-slide {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;
