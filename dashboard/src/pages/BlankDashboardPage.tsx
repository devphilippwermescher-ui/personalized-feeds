import { HiOutlineWrenchScrewdriver } from 'react-icons/hi2';

interface BlankDashboardPageProps {
  title: string;
}

export default function BlankDashboardPage({ title }: BlankDashboardPageProps) {
  return (
    <section className="blank-dashboard-page" aria-labelledby="coming-soon-title">
      <div className="blank-dashboard-page-icon" aria-hidden="true">
        <HiOutlineWrenchScrewdriver />
      </div>
      <span className="blank-dashboard-page-badge">Coming soon</span>
      <h1 id="coming-soon-title">{title} is in development</h1>
      <p>We’re working on this section. It will be available in a future update.</p>
    </section>
  );
}
