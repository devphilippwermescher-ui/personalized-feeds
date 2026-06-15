export const MEMBERS_CSS = `.lfa-member-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 8px;
    border-radius: 10px;
    background: transparent;
    transition: background 0.15s ease;
  }
  .lfa-member-row:hover {
    background: #f8fafc;
  }
  .lfa-member-main {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
    padding-right: 10px;
  }
  .lfa-member-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    background: #e2e8f0;
  }
  .lfa-member-avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #f59e0b, #2563eb);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
  }
  .lfa-profile-viewer-count-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .lfa-profile-viewer-count {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 3px;
    border-radius: 5px;
    cursor: help;
    white-space: nowrap;
    transition: color 0.16s ease, background-color 0.16s ease;
  }
  .lfa-profile-viewer-count:hover,
  .lfa-profile-viewer-count:focus-visible {
    color: #615DEC;
    background: rgba(97, 93, 236, 0.10);
  }
  .lfa-profile-viewer-count:focus-visible {
    outline: 2px solid rgba(97, 93, 236, 0.24);
    outline-offset: 1px;
  }
  .lfa-profile-viewer-count-tooltip {
    position: absolute;
    top: calc(100% + 9px);
    right: -22px;
    width: 240px;
    padding: 8px 10px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 7px;
    background: #172033;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: 0;
    white-space: normal;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.20);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity 0.14s ease, transform 0.14s ease;
    z-index: 12;
  }
  .lfa-profile-viewer-count-tooltip::before {
    content: '';
    position: absolute;
    right: 29px;
    bottom: 100%;
    width: 8px;
    height: 8px;
    background: #172033;
    border-left: 1px solid rgba(148, 163, 184, 0.22);
    border-top: 1px solid rgba(148, 163, 184, 0.22);
    transform: translateY(50%) rotate(45deg);
  }
  .lfa-profile-viewer-count:hover + .lfa-profile-viewer-count-tooltip,
  .lfa-profile-viewer-count:focus-visible + .lfa-profile-viewer-count-tooltip {
    opacity: 1;
    transform: translateY(0);
  }
  .lfa-member-avatar--search,
  .lfa-feed-preview-avatar--search {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e7e5e4;
    color: #7890a5;
  }
  .lfa-member-avatar--search svg {
    width: 29px;
    height: 29px;
  }
  .lfa-feed-preview-avatar--search svg {
    width: 18px;
    height: 18px;
  }
  .lfa-member-info {
    min-width: 0;
    display: flex;
    align-items: center;
  }
  .lfa-member-row--with-meta .lfa-member-info {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .lfa-member-name {
    border: none;
    background: transparent;
    padding: 0;
    font-size: 12px;
    font-weight: 600;
    color: #2563eb;
    cursor: pointer;
    text-align: left;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    max-width: 100%;
  }
  .lfa-member-name-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1 1 auto;
  }
  .lfa-member-name:hover {
    color: #1d4ed8;
  }
  .lfa-member-meta {
    max-width: 230px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    line-height: 1.25;
    color: #64748b;
  }
  .lfa-member-premium-icon {
    font-size: 9px;
    color: #c8960c;
    vertical-align: middle;
    margin-left: 2px;
    pointer-events: none;
    flex-shrink: 0;
  }
  .lfa-member-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    justify-content: flex-end;
    min-width: 278px;
  }
  .lfa-member-actions--empty {
    display: none;
  }
  .lfa-member-actions--search {
    min-width: auto;
  }
  .lfa-member-search-btn {
    width: 112px;
    height: 25px;
    min-height: 25px;
    padding: 0 8px;
    border: 1px solid #dbe3f0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.72);
    color: #475569;
    font-size: 10px;
    font-weight: 700;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .lfa-member-search-btn:hover {
    border-color: #2563eb;
    background: #eff6ff;
    color: #1d4ed8;
  }
  .lfa-member-icon-btn {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #64748b;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  `;
