import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Check,
  Copy,
  Flame,
  Inbox,
  ListTodo,
  LogOut,
  PartyPopper,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  addCircleTask,
  deleteCircle,
  deleteCircleTask,
  fetchCircle,
  fetchCircleActivity,
  fetchCircleTasks,
  leaveCircle,
  listJoinRequests,
  respondToJoinRequest,
  setCircleTaskCompleted,
} from '../lib/circles';
import type { Circle, CircleTask, JoinRequest, MemberActivity } from '../lib/circles';
import { formatTime, streakFromDates, toLocalDateString } from '../store';
import type { Task } from '../store';

/** How often the page re-reads the circle, so members see each other's ticks. */
const REFRESH_INTERVAL_MS = 30_000;

function lastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return {
      date: toLocalDateString(date),
      label: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
    };
  });
}

function memberLabel(member: MemberActivity) {
  return member.displayName?.trim() || (member.username ? `@${member.username}` : 'Member');
}

const CELEBRATIONS = [
  'Nice one!',
  'That\'s one for the board.',
  'Look at you go.',
  'Circle sees it — well done.',
  'Small win, real win.',
];

function randomCelebration() {
  return CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)];
}

export default function CircleDetail() {
  const { circleId = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [tasks, setTasks] = useState<CircleTask[]>([]);
  const [activity, setActivity] = useState<MemberActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [text, setText] = useState('');
  const [priority, setPriority] = useState<NonNullable<Task['priority']>>('medium');
  const [adding, setAdding] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);

  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);

  const days = useMemo(lastSevenDays, []);
  const isOwner = circle?.ownerId === user?.id;
  const isAskToJoin = circle?.requireApproval ?? false;

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!circleId) return;
      if (mode === 'refresh') setRefreshing(true);

      const [circleResult, taskResult, activityResult] = await Promise.all([
        fetchCircle(circleId),
        fetchCircleTasks(circleId),
        fetchCircleActivity(
          circleId,
          toLocalDateString(new Date()),
          new Date().getTimezoneOffset(),
        ),
      ]);

      if (circleResult.data) setCircle(circleResult.data);
      if (taskResult.data) setTasks(taskResult.data);
      if (activityResult.data) setActivity(activityResult.data);
      setError(circleResult.error ?? taskResult.error ?? activityResult.error);
      setLoading(false);
      setRefreshing(false);
    },
    [circleId],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => void load('refresh'), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const refreshRequests = useCallback(async () => {
    if (!isOwner || !isAskToJoin) {
      setJoinRequests([]);
      return;
    }
    const { data } = await listJoinRequests(circleId);
    if (data) setJoinRequests(data);
  }, [circleId, isOwner, isAskToJoin]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  // The celebration is a brief, local flourish — it doesn't need a server
  // round trip, so it clears itself on a plain timer rather than more state.
  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 3200);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !user || adding) return;

    setAdding(true);
    const { data, error: addError } = await addCircleTask(
      circleId,
      user.id,
      trimmed,
      priority,
      toLocalDateString(new Date()),
    );
    setAdding(false);

    if (addError || !data) {
      setError(addError ?? 'Could not add that task.');
      return;
    }
    setTasks((current) => [data, ...current]);
    setText('');
    setError(null);
  }

  async function handleToggle(task: CircleTask) {
    const completing = !task.completed;
    // Show the tick immediately, then reconcile with whatever the server saved.
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, completed: !item.completed } : item)),
    );
    const { data, error: toggleError } = await setCircleTaskCompleted(task.id, !task.completed);

    if (toggleError || !data) {
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? task : item)),
      );
      setError(toggleError ?? 'Could not save that change.');
      return;
    }
    setTasks((current) => current.map((item) => (item.id === data.id ? data : item)));
    // A little "yes, that counted" moment — only for finishing something,
    // never for un-checking it back open.
    if (completing) setCelebration(randomCelebration());
    void load('refresh');
  }

  async function handleRespond(request: JoinRequest, accept: boolean) {
    if (!circle) return;
    setRespondingTo(request.userId);
    const { error: respondError } = await respondToJoinRequest(circle.id, request.userId, accept);
    setRespondingTo(null);

    if (respondError) {
      setError(respondError);
      return;
    }
    setJoinRequests((current) => current.filter((item) => item.userId !== request.userId));
    if (accept) void load('refresh');
  }

  async function handleDeleteTask(task: CircleTask) {
    const previous = tasks;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    const { error: deleteError } = await deleteCircleTask(task.id);
    if (deleteError) {
      setTasks(previous);
      setError(deleteError);
    }
  }

  async function handleCopyCode() {
    if (!circle) return;
    try {
      await navigator.clipboard.writeText(circle.inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copying is blocked in this browser — the code is shown above.');
    }
  }

  async function handleExit() {
    if (!circle || !user) return;
    const { error: exitError } = isOwner
      ? await deleteCircle(circle.id)
      : await leaveCircle(circle.id, user.id);

    if (exitError) {
      setError(exitError);
      return;
    }
    navigate('/app/circles', { replace: true });
  }

  if (loading) {
    return (
      <div className="animate-in">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-panel" />
      </div>
    );
  }

  if (!circle) {
    return (
      <div className="animate-in">
        <div className="empty-state">
          <Users className="empty-state-icon" size={34} aria-hidden="true" />
          <div className="empty-state-title">Circle not found</div>
          <div className="empty-state-desc">{error ?? 'You may have left this circle.'}</div>
          <Link to="/app/circles" className="btn btn-primary">
            Back to circles
          </Link>
        </div>
      </div>
    );
  }

  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);

  return (
    <div className="animate-in">
      {celebration && (
        <div className="celebration-toast" role="status">
          <PartyPopper size={16} aria-hidden="true" />
          {celebration}
        </div>
      )}

      <Link to="/app/circles" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" />
        All circles
      </Link>

      <div className="page-header">
        <div className="circle-heading">
          <span className="circle-heading-emoji" aria-hidden="true">
            {circle.emoji}
          </span>
          <div>
            <h1 className="page-title">
              {circle.name}
              {isAskToJoin && <span className="circle-privacy-badge">Ask-to-join</span>}
            </h1>
            <p className="page-subtitle">
              {activity.length} {activity.length === 1 ? 'member' : 'members'} · {open.length} open ·{' '}
              {done.length} done
            </p>
          </div>
        </div>
        <div className="circle-header-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void load('refresh')}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : undefined} />
            Refresh
          </button>
          <button type="button" className="invite-code" onClick={() => void handleCopyCode()}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copied' : circle.inviteCode}</span>
          </button>
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          {error}
        </p>
      )}

      {isOwner && joinRequests.length > 0 && (
        <section className="card join-requests" aria-labelledby="join-requests-title">
          <h2 className="settings-title" id="join-requests-title">
            <Inbox size={16} aria-hidden="true" /> Waiting to join ({joinRequests.length})
          </h2>
          <p className="settings-description">
            Nobody sees this circle until you say yes.
          </p>
          <div className="join-request-list">
            {joinRequests.map((request) => (
              <div key={request.userId} className="join-request-row">
                <span className={`streak-avatar avatar-${request.avatarColor}`} aria-hidden="true">
                  {request.avatarUrl ? <img src={request.avatarUrl} alt="" /> : request.avatarEmoji}
                </span>
                <span className="join-request-identity">
                  <strong>{request.displayName?.trim() || `@${request.username ?? 'someone'}`}</strong>
                  {request.username && <small>@{request.username}</small>}
                </span>
                <span className="join-request-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void handleRespond(request, true)}
                    disabled={respondingTo === request.userId}
                  >
                    <Check size={14} /> Let them in
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void handleRespond(request, false)}
                    disabled={respondingTo === request.userId}
                  >
                    <X size={14} /> Decline
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card" aria-labelledby="streak-board-title">
        <h2 className="settings-title" id="streak-board-title">
          Streaks together
        </h2>
        <p className="settings-description">
          Everyone's rhythm over the last 7 days. Only the dates are shared — never the tasks
          themselves. Tap a name to open their profile.
        </p>
        <div className="streak-board">
          {activity.map((member) => {
            const active = new Set(member.activeDates);
            return (
              <div key={member.userId} className="streak-row">
                <span className={`streak-avatar avatar-${member.avatarColor}`} aria-hidden="true">
                  {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.avatarEmoji}
                </span>
                <span className="streak-identity">
                  {member.username ? (
                    <Link to={`/u/${member.username}`} className="streak-name">
                      {memberLabel(member)}
                      {member.userId === user?.id ? ' (you)' : ''}
                    </Link>
                  ) : (
                    <strong>{memberLabel(member)}</strong>
                  )}
                  <small>
                    {/* The handle is how people find each other, so it stays on
                        screen even when a display name is set. */}
                    {member.username ? `@${member.username} · ` : ''}
                    {member.completedToday} done today · {member.sessionsToday} sessions ·{' '}
                    {formatTime(member.focusSecondsToday)} focused
                  </small>
                </span>
                <span className="streak-days" aria-hidden="true">
                  {days.map((day) => (
                    <span
                      key={day.date}
                      className={`streak-dot${active.has(day.date) ? ' on' : ''}`}
                      title={day.date}
                    >
                      {day.label}
                    </span>
                  ))}
                </span>
                <span className="streak-count" title="Days in a row">
                  <Flame size={15} aria-hidden="true" />
                  {streakFromDates(active)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <form className="task-input-row" onSubmit={handleAdd}>
        <input
          className="input"
          placeholder="Add something the whole circle can see"
          value={text}
          maxLength={200}
          onChange={(event) => setText(event.target.value)}
        />
        <select
          className="btn btn-ghost btn-sm"
          value={priority}
          onChange={(event) => setPriority(event.target.value as NonNullable<Task['priority']>)}
          aria-label="Priority"
          style={{ minWidth: '100px' }}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button className="btn btn-primary" type="submit" disabled={adding || !text.trim()}>
          <Plus size={16} />
          Add
        </button>
      </form>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <ListTodo className="empty-state-icon" size={34} aria-hidden="true" />
          <div className="empty-state-title">Nothing shared yet</div>
          <div className="empty-state-desc">
            Add the first task — everyone in this circle sees it and can tick it off.
          </div>
        </div>
      ) : (
        <div className="task-list">
          {[...open, ...done].map((task) => {
            const author = activity.find((member) => member.userId === task.authorId);
            const finisher = activity.find((member) => member.userId === task.completedBy);
            const canDelete = task.authorId === user?.id || isOwner;

            return (
              <div key={task.id} className={`task-item${task.completed ? ' completed' : ''}`}>
                <button
                  type="button"
                  className={`task-check${task.completed ? ' done' : ''}`}
                  onClick={() => void handleToggle(task)}
                  aria-pressed={task.completed}
                  aria-label={task.completed ? `Reopen ${task.text}` : `Complete ${task.text}`}
                >
                  {task.completed && <Check size={12} strokeWidth={3} />}
                </button>
                <span className="task-text">
                  <span className="task-title">{task.text}</span>
                  <small className="task-byline">
                    {task.completed && finisher
                      ? `done by ${memberLabel(finisher)}`
                      : `added by ${author ? memberLabel(author) : 'a member'}`}
                  </small>
                </span>
                <div className="task-meta">
                  {task.priority && (
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
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      className="task-delete"
                      onClick={() => void handleDeleteTask(task)}
                      aria-label={`Delete ${task.text}`}
                      title="Delete task"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="card circle-danger" aria-labelledby="circle-exit-title">
        <h2 className="settings-title" id="circle-exit-title">
          {isOwner ? 'Delete this circle' : 'Leave this circle'}
        </h2>
        <p className="settings-description">
          {isOwner
            ? 'Deleting removes the shared list for every member. Their private tasks are untouched.'
            : 'You keep your own tasks and streak — you just stop seeing this shared list.'}
        </p>
        {!confirmingExit ? (
          <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmingExit(true)}>
            {isOwner ? <Trash2 size={15} /> : <LogOut size={15} />}
            {isOwner ? 'Delete circle' : 'Leave circle'}
          </button>
        ) : (
          <div className="danger-actions">
            <button type="button" className="btn btn-danger btn-sm" onClick={() => void handleExit()}>
              Yes, {isOwner ? 'delete it' : 'leave'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmingExit(false)}>
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
