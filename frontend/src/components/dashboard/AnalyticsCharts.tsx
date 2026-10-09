import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, FlaskConical, Microscope, Stethoscope, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { DashboardAnalytics } from '@/types/requisition';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATEGORY_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];
const SERIES = {
  current: '#2563eb',
  previous: '#94a3b8',
  drafted: '#f59e0b',
  verified: '#10b981',
  doctorVerified: '#8b5cf6',
  pending: '#f59e0b',
};

/** Axis, grid and tooltip colours; recharts draws SVG, so Tailwind classes can't reach it. */
const chart = {
  tick: { fill: '#64748b', fontSize: 12 },
  grid: '#e2e8f0',
  cursor: { fill: 'rgba(241, 245, 249, 0.9)' },
  tooltip: {
    contentStyle: {
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: 8,
      fontSize: 12,
      boxShadow: '0 4px 12px rgb(0 0 0 / 0.12)',
    },
    labelStyle: { color: '#0f172a', fontWeight: 600, marginBottom: 4 },
    itemStyle: { color: '#334155', padding: 0 },
  },
  legend: { fontSize: 12, color: '#475569' },
};

const truncate = (value: string, max = 18) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

function ChartCard({
  title,
  description,
  icon,
  aside,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">{icon}</div>
          <div className="space-y-1">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        {aside}
      </CardHeader>
      <CardContent className="flex-1 pt-2">{children}</CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <BarChart3 className="h-8 w-8 text-slate-300" />
      {message}
    </div>
  );
}

/** Horizontal bars grow with the number of staff so names never overlap. */
const barListHeight = (rows: number) => Math.max(240, rows * 40 + 60);

function CategoryDonut({ data }: { data: DashboardAnalytics['categoryDistribution'] }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  if (total === 0) return <EmptyChart message="No tests have been requested yet." />;
  const slices = data.map((d, i) => ({ ...d, fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="category"
              innerRadius="58%"
              outerRadius="88%"
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive
            />
            <Tooltip {...chart.tooltip} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-slate-900">{total}</span>
          <span className="text-xs text-slate-500">test orders</span>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.category} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.fill }} />
            <span className="min-w-0 flex-1 truncate text-slate-700" title={s.category}>{s.category}</span>
            <span className="tabular-nums font-medium text-slate-900">{s.count}</span>
            <span className="w-11 text-right text-xs tabular-nums text-slate-500">
              {Math.round((s.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function YearOverYear({ data }: { data: DashboardAnalytics['yearlyComparison'] }) {
  const rows = data.months.map((m) => ({
    month: MONTHS[m.month - 1],
    [data.previousYear]: m.previousYear,
    [data.currentYear]: m.currentYear,
  }));

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barGap={2} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={chart.grid} />
          <XAxis dataKey="month" tick={chart.tick} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={chart.tick} tickLine={false} axisLine={false} />
          <Tooltip cursor={chart.cursor} {...chart.tooltip} />
          <Legend wrapperStyle={chart.legend} iconType="circle" iconSize={8} />
          <Bar dataKey={String(data.previousYear)} fill={SERIES.previous} radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey={String(data.currentYear)} fill={SERIES.current} radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function YearChange({ data }: { data: DashboardAnalytics['yearlyComparison'] }) {
  const thisYear = data.months.reduce((n, m) => n + m.currentYear, 0);
  const lastYear = data.months.reduce((n, m) => n + m.previousYear, 0);
  const change = lastYear ? Math.round(((thisYear - lastYear) / lastYear) * 100) : null;
  const up = change !== null && change >= 0;

  return (
    <div className="text-right leading-tight">
      <p className="text-lg font-semibold tabular-nums text-slate-900">{thisYear}</p>
      {change === null ? (
        <p className="text-xs text-slate-500">No {data.previousYear} data</p>
      ) : (
        <p className={cn('inline-flex items-center gap-1 text-xs font-medium', up ? 'text-emerald-600' : 'text-red-600')}>
          {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {up ? '+' : ''}
          {change}% vs {data.previousYear}
        </p>
      )}
    </div>
  );
}

function StaffBars({
  data,
  series,
  empty,
}: {
  data: { name: string }[];
  series: { key: string; label: string; color: string }[];
  empty: string;
}) {
  if (data.length === 0) return <EmptyChart message={empty} />;

  return (
    <div style={{ height: barListHeight(data.length) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" barCategoryGap="28%" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={chart.grid} />
          <XAxis type="number" allowDecimals={false} tick={chart.tick} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            tick={chart.tick}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => truncate(v)}
          />
          <Tooltip cursor={chart.cursor} {...chart.tooltip} />
          <Legend wrapperStyle={chart.legend} iconType="circle" iconSize={8} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="staff"
              fill={s.color}
              maxBarSize={22}
              radius={i === series.length - 1 ? [0, 4, 4, 0] : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AnalyticsCharts({ analytics }: { analytics: DashboardAnalytics }) {
  const { yearlyComparison: yoy } = analytics;

  return (
    <section className="space-y-3" aria-label="Department analytics">
      <div>
        <h3 className="text-base font-semibold text-foreground">Department Analytics</h3>
        <p className="text-sm text-muted-foreground">Test mix, sample volume and staff workload across the department.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Test Category Distribution"
          description="Requisitions per test family (all time); one spanning several families counts in each."
          icon={<FlaskConical className="h-4 w-4" />}
        >
          <CategoryDonut data={analytics.categoryDistribution} />
        </ChartCard>

        <ChartCard
          title="Year-over-Year Sample Volume"
          description={`Samples received each month, ${yoy.currentYear} vs ${yoy.previousYear}.`}
          icon={<BarChart3 className="h-4 w-4" />}
          aside={<YearChange data={yoy} />}
        >
          <YearOverYear data={yoy} />
        </ChartCard>

        <ChartCard
          title="Lab Technician Workload"
          description="Reports prepared, split by verification state."
          icon={<Microscope className="h-4 w-4" />}
        >
          <StaffBars
            data={analytics.labTechProductivity}
            series={[
              { key: 'verified', label: 'Verified', color: SERIES.verified },
              { key: 'drafted', label: 'Awaiting verification', color: SERIES.drafted },
            ]}
            empty="No lab technicians on the staff list yet."
          />
        </ChartCard>

        <ChartCard
          title="Doctor Verification"
          description="Reports verified, and reports assigned but still pending."
          icon={<Stethoscope className="h-4 w-4" />}
        >
          <StaffBars
            data={analytics.doctorProductivity}
            series={[
              { key: 'verified', label: 'Verified', color: SERIES.doctorVerified },
              { key: 'pending', label: 'Pending', color: SERIES.pending },
            ]}
            empty="No teaching staff on the staff list yet."
          />
        </ChartCard>
      </div>
    </section>
  );
}
