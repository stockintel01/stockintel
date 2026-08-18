import type { Metadata } from 'next';
import { StockReportDashboard } from '@/components/agriculture/stock-report-dashboard';
import { DEMO_REPORTS } from '@/lib/reports/agriculture-report';

export const metadata: Metadata = {
  title: 'Interactive Agriculture Report Demo | StockIntel Agri',
  description: 'Explore an anonymized agricultural inventory and usage report.',
  robots: { index: true, follow: true },
};

export default function DemoPage() {
  return <StockReportDashboard reports={DEMO_REPORTS} />;
}
