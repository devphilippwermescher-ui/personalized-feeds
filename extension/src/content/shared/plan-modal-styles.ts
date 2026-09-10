export function injectPlanModalStyles(modalId: string, styleId: string): void {
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    #${modalId} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(35, 28, 15, 0.58);
      backdrop-filter: blur(5px);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #${modalId} .mfp-plan-modal {
      position: relative;
      width: min(430px, calc(100vw - 32px));
      max-height: min(760px, calc(100vh - 32px));
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255, 214, 90, 0.28);
      border-radius: 24px;
      color: #fffaf0;
      background:
        radial-gradient(circle at 50% -7%, rgba(255, 207, 63, 0.34), transparent 37%),
        linear-gradient(180deg, #282013 0%, #17140e 100%);
      box-shadow: 0 32px 90px rgba(35, 25, 7, 0.54), 0 0 0 1px rgba(255, 221, 112, 0.04) inset;
    }
    #${modalId} .mfp-plan-header {
      position: relative;
      z-index: 2;
      flex: 0 0 54px;
      height: 54px;
    }
    #${modalId} .mfp-plan-scroll {
      min-height: 0;
      overflow: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    #${modalId} .mfp-plan-scroll::-webkit-scrollbar {
      display: none;
      width: 0;
      height: 0;
    }
    #${modalId} .mfp-plan-close {
      position: absolute;
      top: 8px;
      left: 14px;
      box-sizing: border-box;
      width: 38px;
      height: 38px;
      padding: 0;
      border: 1px solid rgba(255, 220, 112, .2);
      border-radius: 50%;
      color: #fff8e7;
      background: rgba(39, 31, 17, .72);
      display: grid;
      place-items: center;
      cursor: pointer;
    }
    #${modalId} .mfp-plan-close svg {
      width: 18px;
      height: 18px;
      display: block;
    }
    #${modalId} .mfp-plan-hero {
      padding: 24px 28px;
      text-align: center;
    }
    #${modalId} .mfp-plan-star-wrap {
      width: 96px;
      height: 96px;
      margin: 0 auto 18px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255, 217, 90, .28);
      border-radius: 32px;
      color: #fff;
      background: linear-gradient(145deg, #ffe16d, #eeb224);
      box-shadow: 0 18px 46px rgba(222, 158, 17, .24), 0 0 34px rgba(255, 217, 90, .08) inset;
      transform: rotate(-7deg);
    }
    #${modalId} .mfp-plan-star {
      display: block;
      font-size: 58px;
      line-height: 1;
      text-shadow: 0 7px 13px rgba(125, 80, 0, .24);
    }
    #${modalId} h2 {
      margin: 0 0 10px;
      color: #fffaf0;
      font-size: 25px;
      line-height: 1.2;
    }
    #${modalId} .mfp-plan-description {
      margin: 0;
      color: #d4c8af;
      font-size: 14px;
      line-height: 1.5;
    }
    #${modalId} .mfp-plan-benefits {
      margin: 0 22px 18px;
      padding: 4px 16px;
      border: 1px solid rgba(255, 219, 104, .13);
      border-radius: 18px;
      background: rgba(255, 248, 226, .055);
    }
    #${modalId} .mfp-plan-benefit {
      display: grid;
      grid-template-columns: 36px 1fr;
      gap: 11px;
      padding: 14px 0;
      border-bottom: 1px solid rgba(255, 220, 112, .1);
    }
    #${modalId} .mfp-plan-benefit:last-child { border-bottom: 0; }
    #${modalId} .mfp-plan-benefit-icon {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      border-radius: 11px;
      color: #473000;
      background: linear-gradient(145deg, #ffe47e, #ffca32);
      box-shadow: 0 7px 16px rgba(206, 145, 8, .18);
      font-size: 17px;
    }
    #${modalId} .mfp-plan-benefit strong {
      display: block;
      margin-bottom: 3px;
      color: #fffaf0;
      font-size: 14px;
    }
    #${modalId} .mfp-plan-benefit span {
      color: #c7bda7;
      font-size: 12.5px;
      line-height: 1.4;
    }
    #${modalId} .mfp-plan-about-label {
      margin: 0 26px 8px;
      color: #a99978;
      font-size: 10.5px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    #${modalId} .mfp-plan-about {
      margin: 0 22px 6px;
      padding: 16px;
      border: 1px solid rgba(255, 219, 104, .13);
      border-radius: 18px;
      color: #d4c8af;
      background: rgba(255, 248, 226, .055);
      font-size: 12.5px;
      line-height: 1.5;
    }
    #${modalId} .mfp-plan-about p {
      margin: 0;
      color: #d4c8af !important;
    }
    #${modalId} .mfp-plan-about p + p {
      margin-top: 11px;
    }
    #${modalId} .mfp-plan-about strong {
      color: #fffaf0 !important;
    }
    #${modalId} .mfp-plan-billing {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 0 22px 18px;
    }
    #${modalId} .mfp-plan-currency-note {
      margin: -9px 22px 18px;
      color: #9f9278;
      text-align: center;
      font-size: 11px;
      line-height: 1.45;
    }
    #${modalId} .mfp-plan-currency-link {
      padding: 0;
      border: 0;
      color: #c7bda7;
      background: transparent;
      font: inherit;
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 2px;
      cursor: pointer;
    }
    #${modalId} .mfp-plan-currency-link:hover,
    #${modalId} .mfp-plan-currency-link:focus-visible {
      color: #fff8e5;
      outline: none;
    }
    #${modalId} .mfp-plan-billing-option {
      position: relative;
      min-width: 0;
      padding: 14px 13px 13px;
      border: 1px solid rgba(255, 219, 104, .16);
      border-radius: 16px;
      color: #e4d8bd;
      background: rgba(255, 248, 226, .045);
      text-align: left;
      cursor: pointer;
      transition: border-color .16s ease, background .16s ease, box-shadow .16s ease, transform .16s ease;
    }
    #${modalId} .mfp-plan-billing-option:hover,
    #${modalId} .mfp-plan-billing-option:focus-visible {
      border-color: rgba(255, 217, 90, .48);
      background: rgba(255, 217, 90, .08);
      outline: none;
    }
    #${modalId} .mfp-plan-billing-option.is-selected {
      border-color: #ffd95a;
      color: #fff8e5;
      background: linear-gradient(145deg, rgba(255, 217, 90, .17), rgba(255, 191, 31, .07));
      box-shadow: 0 10px 28px rgba(190, 128, 0, .16), 0 0 0 1px rgba(255, 217, 90, .08) inset;
    }
    #${modalId} .mfp-plan-billing-name {
      display: block;
      margin-bottom: 7px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    #${modalId} .mfp-plan-billing-price {
      display: flex;
      align-items: baseline;
      gap: 4px;
      color: #fffaf0;
    }
    #${modalId} .mfp-plan-billing-price strong {
      font-size: 25px;
      line-height: 1;
    }
    #${modalId} .mfp-plan-billing-price span,
    #${modalId} .mfp-plan-billing-detail {
      color: #bcae91;
      font-size: 11px;
    }
    #${modalId} .mfp-plan-billing-detail {
      display: block;
      margin-top: 6px;
    }
    #${modalId} .mfp-plan-billing-save {
      position: absolute;
      top: -8px;
      right: 9px;
      padding: 3px 7px;
      border-radius: 999px;
      color: #4a3100;
      background: #ffd95a;
      box-shadow: 0 5px 12px rgba(183, 122, 0, .22);
      font-size: 9px;
      font-weight: 900;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    #${modalId} .mfp-plan-current {
      margin: 0 22px 18px;
      padding: 15px 16px;
      border: 1px solid rgba(255, 219, 104, .18);
      border-radius: 18px;
      color: #d4c8af;
      background: rgba(255, 217, 90, .07);
      font-size: 12.5px;
      line-height: 1.55;
    }
    #${modalId} .mfp-plan-current strong {
      display: block;
      margin-bottom: 4px;
      color: #fffaf0;
      font-size: 14px;
    }
    #${modalId} .mfp-plan-actions {
      position: sticky;
      bottom: 0;
      padding: 15px 22px 22px;
      background: linear-gradient(180deg, rgba(23,20,14,0), #17140e 28%);
    }
    #${modalId} .mfp-plan-cta {
      width: 100%;
      min-height: 48px;
      border: 0;
      border-radius: 14px;
      color: #3f2b00;
      background: linear-gradient(100deg, #ffe77f 0%, #ffd95a 48%, #f4b91f 100%);
      box-shadow: 0 13px 30px rgba(199, 137, 8, .28);
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
      transition: filter .16s ease, transform .16s ease, box-shadow .16s ease;
    }
    #${modalId} .mfp-plan-cta:hover,
    #${modalId} .mfp-plan-cta:focus-visible {
      filter: brightness(1.04);
      transform: translateY(-1px);
      box-shadow: 0 16px 34px rgba(199, 137, 8, .34);
      outline: none;
    }
    #${modalId} .mfp-plan-cta:disabled {
      cursor: wait;
      filter: saturate(.55);
      opacity: .72;
      transform: none;
    }
    #${modalId} .mfp-plan-note {
      min-height: 16px;
      margin: 8px 4px 0;
      color: #b8aa8e;
      text-align: center;
      font-size: 11.5px;
    }
  `;
  document.head.appendChild(style);
}

