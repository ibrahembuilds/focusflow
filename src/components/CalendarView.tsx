import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../store';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function Calendar() {
  const { tasks } = useStore();
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Get tasks grouped by date
  const tasksByDate = useMemo(() => {
    const map: Record<string, number> = {};
    tasks.forEach((t) => {
      map[t.createdAt] = (map[t.createdAt] || 0) + 1;
    });
    return map;
  }, [tasks]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const days: { day: number; date: string; isToday: boolean; isOtherMonth: boolean; taskCount: number }[] = [];

  // Previous month padding
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const dateStr = `${year}-${String(month === 0 ? 12 : month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, date: dateStr, isToday: false, isOtherMonth: true, taskCount: 0 });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const todayStr = today.toISOString().split('T')[0];
    days.push({
      day: d,
      date: dateStr,
      isToday: dateStr === todayStr,
      isOtherMonth: false,
      taskCount: tasksByDate[dateStr] || 0,
    });
  }

  // Next month padding
  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      days.push({ day: d, date: '', isToday: false, isOtherMonth: true, taskCount: 0 });
    }
  }

  const goToPrevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setViewDate(new Date(year, month + 1, 1));
  const goToToday = () => setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));

  // Tasks for selected date
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const selectedTasks = selectedDate
    ? tasks.filter((t) => t.createdAt === selectedDate)
    : [];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">View your tasks by date</p>
        </div>
      </div>

      <div className="two-col">
        {/* Calendar */}
        <div className="card">
          <div className="calendar-header">
            <button className="btn btn-ghost btn-sm btn-icon" onClick={goToPrevMonth}>
              <ChevronLeft size={16} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="calendar-month">
                {MONTHS[month]} {year}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={goToToday}>
                Today
              </button>
            </div>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={goToNextMonth}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="calendar-grid">
            {WEEKDAYS.map((d) => (
              <div key={d} className="calendar-day-header">
                {d}
              </div>
            ))}
            {days.map((d, i) => (
              <div
                key={i}
                className={`calendar-day${d.isToday ? ' today' : ''}${d.isOtherMonth ? ' other-month' : ''}${d.taskCount > 0 && !d.isOtherMonth ? ' has-tasks' : ''}`}
                onClick={() => {
                  if (!d.isOtherMonth && d.date) {
                    setSelectedDate(d.date);
                  }
                }}
              >
                {d.day}
              </div>
            ))}
          </div>
        </div>

        {/* Selected Date Tasks */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>
            {selectedDate
              ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })
              : 'Select a date'}
          </h3>

          {selectedDate && selectedTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📅</div>
              <div className="empty-state-title">No tasks on this day</div>
              <div className="empty-state-desc">
                Tasks you create will appear here on their creation date.
              </div>
            </div>
          ) : selectedTasks.length > 0 ? (
            <div className="task-list">
              {selectedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`task-item ${task.completed ? 'completed' : ''}`}
                >
                  <span className={`badge ${task.completed ? 'badge-success' : 'badge-primary'}`}>
                    {task.completed ? 'Done' : task.priority}
                  </span>
                  <span className="task-text">{task.text}</span>
                  {task.sessions > 0 && (
                    <span className="task-sessions">{task.sessions} 🍅</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">👆</div>
              <div className="empty-state-title">Pick a date</div>
              <div className="empty-state-desc">
                Click any date to see tasks created on that day.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
