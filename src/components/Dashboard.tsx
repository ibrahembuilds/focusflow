import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Timer,
  CheckCircle2,
  Target,
  Clock,
  TrendingUp,
  Zap,
  ArrowRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  useStore,
  getTodaysTasks,
  getCompletedToday,
  getTotalSessions,
  getTotalFocusTime,
  getWeeklyData,
  formatTime,
} from '../store';

export default function Dashboard() {
  const { tasks, sessions } = useStore();
  const navigate = useNavigate();

  const todaysTasks = getTodaysTasks(tasks);
  const completedToday = getCompletedToday(tasks);
  const totalSessions = getTotalSessions(sessions);
  const totalFocusTime = getTotalFocusTime(sessions);
  const weeklyData = useMemo(() => getWeeklyData(tasks, sessions), [tasks, sessions]);

  const activeTasks = todaysTasks.filter((t) => !t.completed);

  const stats = [
    {
      icon: CheckCircle2,
      iconClass: 'green',
      value: completedToday,
      label: 'Tasks Done Today',
    },
    {
      icon: Timer,
      iconClass: 'purple',
      value: totalSessions,
      label: 'Total Focus Sessions',
    },
    {
      icon: Clock,
      iconClass: 'amber',
      value: formatTime(totalFocusTime),
      label: 'Total Focus Time',
    },
    {
      icon: Target,
      iconClass: 'rose',
      value: activeTasks.length,
      label: 'Active Tasks',
    },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/timer')}>
          <Zap size={16} />
          Start Focus Session
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {stats.map((stat, i) => (
          <div key={i} className="stat-card">
            <div className={`stat-icon ${stat.iconClass}`}>
              <stat.icon size={20} />
            </div>
            <div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="two-col">
        {/* Weekly Chart */}
        <div className="chart-card">
          <div className="chart-title">
            <TrendingUp size={16} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
            This Week
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weeklyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-surface-raised)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                }}
              />
              <Bar
                dataKey="sessions"
                fill="var(--color-primary)"
                radius={[4, 4, 0, 0]}
                name="Sessions"
              />
              <Bar
                dataKey="completed"
                fill="var(--color-success)"
                radius={[4, 4, 0, 0]}
                name="Completed"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Quick Actions + Today's Tasks */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '1rem' }}>Today's Priority</h3>

          {activeTasks.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem 0' }}>
              <div className="empty-state-icon">🚀</div>
              <div className="empty-state-title">Ready to start?</div>
              <div className="empty-state-desc">
                Add your first task or use AI to decompose a big goal.
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={() => navigate('/tasks')}
              >
                Go to Tasks
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="task-list" style={{ maxHeight: '250px', marginBottom: '1rem' }}>
                {activeTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="task-item" style={{ cursor: 'pointer' }}>
                    <span
                      className={`badge ${
                        task.priority === 'high'
                          ? 'badge-danger'
                          : task.priority === 'medium'
                          ? 'badge-warning'
                          : 'badge-primary'
                      }`}
                    >
                      {task.priority}
                    </span>
                    <span className="task-text">{task.text}</span>
                    <span className="task-sessions">{task.sessions} 🍅</span>
                  </div>
                ))}
                {activeTasks.length > 5 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                    +{activeTasks.length - 5} more tasks
                  </p>
                )}
              </div>

              <button
                className="btn btn-primary"
                onClick={() => {
                  if (activeTasks.length > 0) {
                    const store = useStore.getState();
                    store.setActiveTaskId(activeTasks[0].id);
                  }
                  navigate('/timer');
                }}
                style={{ width: '100%' }}
              >
                <Zap size={16} />
                Start First Task
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
