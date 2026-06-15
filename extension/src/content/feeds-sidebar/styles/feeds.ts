export const FEEDS_CSS = `.lfa-feed-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 12px;
    overflow-anchor: none;
  }
  .lfa-feed-group {
    border: 1px solid #e5e7eb;
    border-radius: 14px;
    margin-bottom: 10px;
    overflow: hidden;
    background: #fff;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
    transition: box-shadow 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
  }
  .lfa-feed-group--system {
    overflow: visible;
  }
  .lfa-feed-group--system .lfa-feed-item {
    border-radius: 13px;
  }
  .lfa-feed-group--system .lfa-feed-item--expanded {
    border-radius: 13px 13px 0 0;
  }
  .lfa-feed-group--system .lfa-feed-expanded {
    border-radius: 0 0 13px 13px;
  }
  .lfa-feed-group--system:has(.lfa-feed-info:hover),
  .lfa-feed-group--system:has(.lfa-feed-info:focus-visible),
  .lfa-feed-group--system:has(.lfa-feed-pin:hover),
  .lfa-feed-group--system:has(.lfa-feed-pin:focus-visible),
  .lfa-feed-group--system:has(.lfa-profile-viewer-count:hover),
  .lfa-feed-group--system:has(.lfa-profile-viewer-count:focus-visible) {
    position: relative;
    z-index: 4;
  }
  .lfa-feed-group.lfa-feed-group--dragging {
    opacity: 0.55;
    box-shadow: 0 12px 26px rgba(97, 93, 236, 0.16);
  }
  .lfa-feed-group.lfa-feed-group--drop-target {
    border-color: rgba(97, 93, 236, 0.45);
    box-shadow: 0 0 0 3px rgba(97, 93, 236, 0.10);
  }
  .lfa-feed-item {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    cursor: pointer;
    background: #fff;
    transition: background-color 0.24s ease;
    gap: 10px;
  }
  .lfa-feed-item--shared {
    background: linear-gradient(180deg, #ffffff 0%, #faf8ff 100%);
  }
  .lfa-feed-item--system {
    background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  }
  .lfa-feed-item:hover,
  .lfa-feed-item--expanded,
  .lfa-feed-item--settling {
    background: #f5f3ff;
  }
  .lfa-feed-item--settling {
    transition: none;
  }
  .lfa-feed-item--shared.lfa-feed-item--expanded {
    background: #f5f3ff;
  }
  .lfa-feed-item--system.lfa-feed-item--expanded {
    background: #eef6ff;
  }
  .lfa-feed-grip {
    width: 16px;
    height: 16px;
    color: rgba(100, 116, 139, 0.55);
    flex-shrink: 0;
    cursor: grab;
  }
  .lfa-feed-pin-wrap {
    position: relative;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .lfa-feed-pin {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    color: #64748b;
    cursor: help;
    transition: color 0.16s ease, background-color 0.16s ease;
  }
  .lfa-feed-pin svg {
    width: 16px;
    height: 16px;
    transform: rotate(45deg);
    transform-origin: center;
  }
  .lfa-feed-pin:hover,
  .lfa-feed-pin:focus-visible {
    color: #615DEC;
    background: rgba(97, 93, 236, 0.10);
  }
  .lfa-feed-pin:focus-visible {
    outline: 2px solid rgba(97, 93, 236, 0.24);
    outline-offset: 2px;
  }
  .lfa-feed-pin-tooltip {
    position: absolute;
    top: calc(100% + 10px);
    left: -8px;
    width: max-content;
    max-width: 190px;
    padding: 8px 10px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 7px;
    background: #172033;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: 0;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.20);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-4px);
    transition: opacity 0.14s ease, transform 0.14s ease;
    z-index: 10;
  }
  .lfa-feed-pin-tooltip::before {
    content: '';
    position: absolute;
    left: 13px;
    bottom: 100%;
    width: 8px;
    height: 8px;
    background: #172033;
    border-left: 1px solid rgba(148, 163, 184, 0.22);
    border-top: 1px solid rgba(148, 163, 184, 0.22);
    transform: translateY(50%) rotate(45deg);
  }
  .lfa-feed-pin:hover + .lfa-feed-pin-tooltip,
  .lfa-feed-pin:focus-visible + .lfa-feed-pin-tooltip {
    opacity: 1;
    transform: translateY(0);
  }
  .lfa-feed-item:active .lfa-feed-grip {
    cursor: grabbing;
  }
  .lfa-feed-grip--hidden {
    opacity: 0;
    pointer-events: none;
  }
  .lfa-feed-name-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .lfa-feed-title-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .lfa-feed-title-row .lfa-feed-name {
    min-width: 0;
    flex: 0 1 auto;
  }
  .lfa-feed-name {
    appearance: none;
    -webkit-appearance: none;
    border: none;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    align-self: flex-start;
    width: auto;
    max-width: 100%;
    margin: 0;
    padding: 4px 8px;
    border-radius: 8px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.2;
    font-weight: 700;
    color: #0f172a;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transform-origin: left center;
    transition: background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
  }
  .lfa-feed-name:hover {
    background: rgba(15, 23, 42, 0.06);
    color: #615DEC;
    transform: scale(1.1);
  }
  .lfa-feed-item--system .lfa-feed-name:hover {
    transform: none;
  }
  .lfa-feed-name:focus-visible {
    outline: 2px solid rgba(97, 93, 236, 0.24);
    outline-offset: 2px;
  }
  .lfa-feed-info-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }
  .lfa-feed-info {
    appearance: none;
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: #64748b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: help;
    transition: color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
  }
  .lfa-feed-info svg {
    width: 15px;
    height: 15px;
  }
  .lfa-feed-info:hover,
  .lfa-feed-info:focus-visible {
    color: #615DEC;
    background: rgba(97, 93, 236, 0.10);
    transform: scale(1.06);
  }
  .lfa-feed-info:focus-visible {
    outline: 2px solid rgba(97, 93, 236, 0.24);
    outline-offset: 2px;
  }
  .lfa-feed-info-tooltip {
    position: absolute;
    top: calc(100% + 9px);
    left: 50%;
    width: max-content;
    max-width: 190px;
    padding: 8px 10px;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 7px;
    background: #172033;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.35;
    letter-spacing: 0;
    box-shadow: 0 10px 24px rgba(15, 23, 42, 0.20);
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, -4px);
    transition: opacity 0.14s ease, transform 0.14s ease;
    z-index: 10;
  }
  .lfa-feed-info-tooltip::before {
    content: '';
    position: absolute;
    left: 50%;
    bottom: 100%;
    width: 8px;
    height: 8px;
    background: #172033;
    border-left: 1px solid rgba(148, 163, 184, 0.22);
    border-top: 1px solid rgba(148, 163, 184, 0.22);
    transform: translate(-50%, 50%) rotate(45deg);
  }
  .lfa-feed-info:hover + .lfa-feed-info-tooltip,
  .lfa-feed-info:focus-visible + .lfa-feed-info-tooltip {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  .lfa-feed-owner-badge {
    font-size: 11px;
    color: #615DEC;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lfa-feed-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
  }
  .lfa-feed-role {
    font-size: 10px;
    padding: 4px 8px;
    border-radius: 999px;
    background: #eef2ff;
    color: #615DEC;
  }
  .lfa-feed-preview {
    display: flex;
    align-items: center;
    margin-right: 2px;
  }
  .lfa-feed-preview-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #fff;
    margin-left: -5px;
    background: #e2e8f0;
  }
  .lfa-feed-preview-avatar:first-child {
    margin-left: 0;
  }
  .lfa-feed-preview-avatar--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 8px;
    font-weight: 700;
    background: linear-gradient(135deg, #f59e0b, #2563eb);
  }
  .lfa-feed-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #64748b;
    transition: transform 0.15s ease;
  }
  .lfa-feed-chevron.expanded {
    transform: rotate(180deg);
  }
  .lfa-feed-expanded {
    border-top: 1px solid #eef2f7;
    background: #fcfcfd;
    padding: 6px 10px 10px;
    overflow: hidden;
    transform-origin: top center;
    animation: lfa-feed-expanded-enter 0.32s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .lfa-feed-expanded--collapsing {
    pointer-events: none;
  }
  .lfa-feed-expanded-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 6px;
  }
  .lfa-feed-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .lfa-feed-members-state,
  .lfa-feed-members-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 18px 14px;
    font-size: 13px;
    color: #94a3b8;
  }
  .lfa-spinner--small {
    width: 18px;
    height: 18px;
    border-width: 2px;
  }
  .lfa-feed-members-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: clamp(240px, calc(100vh - 320px), 416px);
    overflow-y: auto;
    overscroll-behavior: auto;
    padding-right: 2px;
    scrollbar-gutter: stable;
  }
  @keyframes lfa-feed-expanded-enter {
    from {
      opacity: 0;
      transform: translateY(-8px) scaleY(0.985);
      clip-path: inset(0 0 100% 0);
    }
    to {
      opacity: 1;
      transform: translateY(0) scaleY(1);
      clip-path: inset(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .lfa-feed-expanded {
      animation: none;
    }
  }
  `;
