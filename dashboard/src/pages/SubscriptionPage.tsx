import { HiOutlineCheckBadge, HiOutlineCreditCard, HiOutlineSparkles, HiOutlineShieldCheck } from 'react-icons/hi2';

const INCLUDED_FEATURES = [
  'Unlimited custom feeds for LinkedIn prospecting and account tracking',
  'Higher sorting limits for feed analysis and export workflows',
  'Shared feed collaboration with editor permissions',
  'Priority access to new myFeedPilot features and improvements',
];

const NEXT_STEPS = [
  'Manage your plan from one place in the dashboard',
  'Use premium features across the extension and shared feeds',
  'Keep billing and activation connected to your myFeedPilot account',
];

export default function SubscriptionPage() {
  return (
    <div className="subscription-page">
      <div className="page-header">
        <div>
          <h1>Subscription</h1>
          <p className="page-subtitle">Choose the plan that unlocks the full myFeedPilot experience.</p>
        </div>
      </div>

      <section className="subscription-hero">
        <div className="subscription-hero-copy">
          <div className="subscription-badge">
            <HiOutlineSparkles />
            <span>Pro plan</span>
          </div>
          <h2>Unlock the full myFeedPilot workflow</h2>
          <p>
            Upgrade to Pro for more powerful feed organization, larger sorting limits, and better collaboration tools
            across your LinkedIn workflows.
          </p>
          <div className="subscription-price-row">
            <div className="subscription-price">$4.99</div>
            <div className="subscription-price-note">per month</div>
          </div>
          <div className="subscription-cta-row">
            <button type="button" className="btn btn-primary" disabled>
              <HiOutlineCreditCard />
              Buy Subscription
            </button>
            <button type="button" className="btn btn-secondary" disabled>
              <HiOutlineShieldCheck />
              Activate License
            </button>
          </div>
        </div>

        <div className="subscription-summary-card">
          <div className="subscription-summary-label">Included in Pro</div>
          <div className="subscription-summary-title">Built for serious LinkedIn workflows</div>
          <div className="subscription-summary-text">
            myFeedPilot Pro is designed for users who need deeper feed control, better shared access, and room to grow without plan limits getting in the way.
          </div>
        </div>
      </section>

      <div className="subscription-grid">
        <section className="subscription-card">
          <div className="subscription-card-header">
            <div className="subscription-card-icon">
              <HiOutlineCheckBadge />
            </div>
            <div>
              <h3>What Pro includes</h3>
              <p>Everything you need to work faster with saved feeds, sorting, and collaboration.</p>
            </div>
          </div>
          <div className="subscription-list">
            {INCLUDED_FEATURES.map((item) => (
              <div className="subscription-list-item" key={item}>
                <span className="subscription-list-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="subscription-card subscription-card--muted">
          <div className="subscription-card-header">
            <div className="subscription-card-icon">
              <HiOutlineSparkles />
            </div>
            <div>
              <h3>Why upgrade</h3>
              <p>Pro is built to centralize the premium parts of the product in one place.</p>
            </div>
          </div>
          <div className="subscription-list">
            {NEXT_STEPS.map((item) => (
              <div className="subscription-list-item" key={item}>
                <span className="subscription-list-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
