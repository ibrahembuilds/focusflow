import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Timer, Target, Zap, TrendingUp } from 'lucide-react';
import { useStore, getWeeklyData, getTotalFocusTime, getTotalSessions, formatTime } from '../store';

export default function Analytics() {
  const { tasks, sessions } = useStore();

  const weeklyData = useMemo(() => getWeeklyData(tasks, sessions), [tasks, sessions]);
  const totalFocusTime = getTotalFocusTime(sessions);
  const totalSessions = getTotalSessions(sessions);
  const completedTasks = tasks.filter((t) => t.completed).length;
  const totalTasks = tasks.length;

  // Priority breakdown
  const priorityData = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    tasks.forEach((t) => {
      if (t.priority === 'high') counts.high++;
      else if (t.priority === 'low') counts.low++;
      else counts.medium++;
    });
    return [
      { name: 'High', value: counts.high, color: '#ef4444' },
      { name: 'Medium', value: counts.medium, color: '#f59e0b' },
      { name: 'Low', value: counts.low, color: 'var(--color-primary)' },
    ];
  }, [tasks]);

  // Session completion rate (last 7 days)
  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Average session length
  const avgSessionMin =
    totalSessions > 0 ? Math.round(totalFocusTime / totalSessions / 60) : 0;

  const topStats = [
    {
      icon: Timer,
      label: 'Total Focus Time',
      value: formatTime(totalFocusTime),
      color: 'var(--color-primary-light)',
    },
    {
      icon: Zap,
      label: 'Sessions Completed',
      value: totalSessions,
      color: 'var(--color-success-light)',
    },
    {
      icon: Target,
      label: 'Completion Rate',
      value: `${completionRate}%`,
      color: 'var(--color-accent-light)',
    },
    {
      icon: TrendingUp,
      label: 'Avg Session',
      value: `${avgSessionMin} min`,
      color: 'var(--color-primary-light)',
    },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Your productivity at a glance</p>
        </div>
      </div>

      {/* Top Stats */}
      <div className="stats-grid">
        {topStats.map((s, i) => (
          <div key={i} className="stat-card">
            <div
              style={{
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: 'var(--radius-md)',
                background: `${s.color}20`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: s.color,
              }}
            >
              <s.icon size={18} />
            </div>
            <div>
              <div className="stat-value" style={{ fontSize: '1.5rem' }}>
                {s.value}
              </div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="two-col">
        {/* Weekly Sessions Chart */}
        <div className="chart-card">
          <div className="chart-title">Weekly focus sessions</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weeklyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-surface-raised)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                }}
              />
              <Bar dataKey="sessions" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Sessions" />
              <Bar dataKey="completed" fill="var(--color-success)" radius={[4, 4, 0, 0]} name="Tasks Done" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Priority Breakdown */}
        <div className="chart-card">
          <div className="chart-title">Task priority breakdown</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={priorityData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
              >
                {priorityData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-surface-raised)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem 1.5rem', marginTop: '0.5rem' }}>
            {priorityData.map((p) => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color }} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {p.name} ({p.value})
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Weekly breakdown table */}
      <div className="chart-card" style={{ marginTop: '1.5rem' }}>
        <div className="chart-title">This week's breakdown</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-tertiary)', fontWeight: 600 }}>Day</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 600 }}>Tasks</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 600 }}>Completed</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 600 }}>Sessions</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-tertiary)', fontWeight: 600 }}>Minutes</th>
              </tr>
            </thead>
            <tbody>
              {weeklyData.map((row) => (
                <tr key={row.name} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>{row.name}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>{row.tasks}</td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--color-success-light)' }}>
                    {row.completed}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--color-primary-light)' }}>
                    {row.sessions}
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'center' }}>{row.minutes}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
