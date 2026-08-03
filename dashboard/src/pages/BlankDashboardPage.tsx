interface BlankDashboardPageProps {
  title: string;
}

export default function BlankDashboardPage({ title }: BlankDashboardPageProps) {
  return <div className="blank-dashboard-page" aria-label={title} />;
}
