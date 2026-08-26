import { HiOutlineArrowTopRightOnSquare, HiOutlineLink } from 'react-icons/hi2';

export function ContentAnalyticsConnectionPrompt() {
  return (
    <section className="profile-analytics-linkedin-prompt" aria-labelledby="content-linkedin-connection-title">
      <div className="profile-analytics-linkedin-prompt-icon" aria-hidden="true">
        <HiOutlineLink />
      </div>
      <div className="profile-analytics-linkedin-prompt-copy">
        <h2 id="content-linkedin-connection-title">Connect your LinkedIn account</h2>
        <p>
          Open LinkedIn in this browser and make sure the myFeedPilot extension is installed and enabled. Then return
          here to load your Content Analytics.
        </p>
      </div>
      <a
        className="profile-analytics-linkedin-prompt-action"
        href="https://www.linkedin.com/feed/"
        target="_blank"
        rel="noreferrer"
      >
        Open LinkedIn
        <HiOutlineArrowTopRightOnSquare />
      </a>
    </section>
  );
}
