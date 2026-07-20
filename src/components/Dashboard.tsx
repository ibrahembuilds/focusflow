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
  Flame,
  CircleCheck,
  ListPlus,
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
  getCurrentStreak,
  getLongestStreak,
  getRecentActivity,
} from '../store';
import { useAuth } from '../lib/auth';

export default function Dashboard() {
  const { tasks, sessions } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fullName = typeof user?.user_metadata?.fullName === 'string' ? user.user_metadata.fullName : '';
  const firstName = fullName.trim().split(/\s+/)[0] || '';

  const todaysTasks = getTodaysTasks(tasks);
  const completedToday = getCompletedToday(tasks);
  const totalSessions = getTotalSessions(sessions);
  const totalFocusTime = getTotalFocusTime(sessions);
  const weeklyData = useMemo(() => getWeeklyData(tasks, sessions), [tasks, sessions]);
  const activeTasks = todaysTasks.filter((task) => !task.completed);
  const currentStreak = getCurrentStreak(tasks, sessions);
  const longestStreak = getLongestStreak(tasks, sessions);
  const recentActivity = getRecentActivity(tasks, sessions);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const stats = [
    { icon: CheckCircle2, value: completedToday, label: 'Completed today' },
    { icon: Timer, value: totalSessions, label: 'Focus sessions' },
    { icon: Clock, value: formatTime(totalFocusTime), label: 'Time in focus' },
    { icon: Target, value: activeTasks.length, label: 'Tasks remaining' },
  ];

  function focusFirstTask() {
    if (activeTasks.length > 0) {
      useStore.getState().setActiveTaskId(activeTasks[0].id);
    }
    navigate('/app/timer');
  }

  return (
    <div className="animate-in">
      <header className="page-header dashboard-header">
        <div>
          <p className="page-kicker">{firstName ? `${greeting}, ${firstName}` : greeting}</p>
          <h1 className="page-title">Ready for a focused day?</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/app/timer')}>
          <Zap size={16} />
          Start focus
        </button>
      </header>

      <section className="focus-summary" aria-label="Focus streak">
        <div className="focus-summary-main">
          <div className="streak-heading">
            <div className="streak-icon" aria-hidden="true">
              <Flame size={22} />
            </div>
            <div>
              <p className="section-label">Current streak</p>
              <div className="streak-value">
                {currentStreak} <span>{currentStreak === 1 ? 'day' : 'days'}</span>
              </div>
            </div>
          </div>

          <div className="streak-week" aria-label="Activity over the last seven days">
            {recentActivity.map((day) => (
              <div className="streak-day" key={day.date}>
                <span
                  className={`streak-marker${day.active ? ' active' : ''}${day.isToday ? ' today' : ''}`}
                  title={`${day.date}: ${day.active ? 'Focus goal met' : 'No activity yet'}`}
                >
                  {day.active && <CircleCheck size={18} aria-hidden="true" />}
                </span>
                <span className="streak-day-label">{day.label}</span>
              </div>
            ))}
          </div>

          <p className="streak-message">
            {currentStreak > 0
              ? `Keep going. Your longest streak is ${longestStreak} ${longestStreak === 1 ? 'day' : 'days'}.`
              : 'Complete a task or focus session today to begin your streak.'}
          </p>
        </div>

        <div className="today-summary">
          <p className="section-label">Today</p>
          <div className="today-summary-grid">
            {stats.map((stat) => (
              <div key={stat.label} className="today-stat">
                <stat.icon size={17} aria-hidden="true" />
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="chart-card" aria-labelledby="weekly-heading">
          <div className="panel-heading">
            <div>
              <p className="section-label">Momentum</p>
              <h2 id="weekly-heading">This week</h2>
            </div>
            <TrendingUp size={19} aria-hidden="true" />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weeklyData} margin={{ top: 16, right: 0, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
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
                cursor={{ fill: 'var(--bg-surface-hover)' }}
                contentStyle={{
                  background: 'var(--bg-surface-raised)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  boxShadow: 'var(--shadow-md)',
                }}
              />
              <Bar dataKey="sessions" fill="var(--color-primary)" radius={[5, 5, 0, 0]} name="Sessions" />
              <Bar dataKey="completed" fill="var(--color-primary-soft)" radius={[5, 5, 0, 0]} name="Completed" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card priority-panel" aria-labelledby="priority-heading">
          <div className="panel-heading">
            <div>
              <p className="section-label">Next up</p>
              <h2 id="priority-heading">Today's priorities</h2>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/app/tasks')}>
              <ListPlus size={15} />
              Add task
            </button>
          </div>

          {activeTasks.length === 0 ? (
            <div className="empty-state compact-empty">
              <Target className="empty-state-icon" size={34} aria-hidden="true" />
              <div className="empty-state-title">Choose your first priority</div>
              <div className="empty-state-desc">Add a task, then give it one focused session.</div>
              <button className="btn btn-primary" onClick={() => navigate('/app/tasks')}>
                Add a task
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <>
              <div className="task-list priority-list">
                {activeTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="task-item priority-task">
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
                    <span className="task-sessions">{task.sessions} sessions</span>
                  </div>
                ))}
                {activeTasks.length > 5 && (
                  <button className="more-tasks" onClick={() => navigate('/app/tasks')}>
                    View {activeTasks.length - 5} more
                  </button>
                )}
              </div>

              <button className="btn btn-primary priority-cta" onClick={focusFirstTask}>
                <Zap size={16} />
                Focus on first task
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
