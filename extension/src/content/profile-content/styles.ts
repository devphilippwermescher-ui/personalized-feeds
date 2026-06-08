import { injectSharedStyles } from '../../shared/ui';
import { AUTH_PROMPT_CSS } from './components/AuthPrompt/AuthPrompt.styles';
import { CREATE_FEED_FORM_CSS } from './components/CreateFeedForm/CreateFeedForm.styles';
import { FEED_CARD_CSS } from './components/FeedCard/FeedCard.styles';
import { FEED_SELECTION_LIST_CSS } from './components/FeedSelectionList/FeedSelectionList.styles';
import { PROFILE_CONTENT_SHARED_CSS } from './shared.styles';

const PROFILE_CONTENT_CSS = [
  FEED_CARD_CSS,
  FEED_SELECTION_LIST_CSS,
  CREATE_FEED_FORM_CSS,
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
