import { injectSharedStyles } from '../../shared/ui';
import { AUTH_PROMPT_CSS } from './components/AuthPrompt/AuthPrompt.styles';
import { FEED_CARD_CSS } from './components/FeedCard/FeedCard.styles';
import { PROFILE_CONTENT_SHARED_CSS } from './shared.styles';
import { PROFILE_FEED_MODALS_CSS } from '../shared/profile-feed-modals';

const PROFILE_CONTENT_CSS = [
  FEED_CARD_CSS,
  PROFILE_FEED_MODALS_CSS,
  AUTH_PROMPT_CSS,
  PROFILE_CONTENT_SHARED_CSS,
].join('\n');

export function injectProfileContentStyles(): void {
  if (document.getElementById('pf-feed-card-styles')) {
    return;
  }

  injectSharedStyles();

  const style = document.createElement('style');
  style.id = 'pf-feed-card-styles';
  style.textContent = PROFILE_CONTENT_CSS;
  document.head.appendChild(style);
}
