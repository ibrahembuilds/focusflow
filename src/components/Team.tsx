import { useEffect, useState } from 'react';
import {
  Users,
  Plus,
  Crown,
  LogOut,
  Trash2,
  Check,
  X,
  UserPlus,
  Mail,
  AlertTriangle,
} from 'lucide-react';
import { useStore } from '../store';
import type { Team as TeamType } from '../store';

export default function Team() {
  const {
    teams,
    activeTeamId,
    setActiveTeamId,
    teamMembers,
    isLoadingTeamMembers,
    pendingInvites,
    refreshTeams,
    createTeam,
    deleteTeam,
    leaveTeam,
    fetchTeamMembers,
    inviteToTeam,
    respondToInvite,
    profile,
  } = useStore();

  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviting, setInviting] = useState(false);

  const [confirmLeaveOrDelete, setConfirmLeaveOrDelete] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  useEffect(() => {
    void refreshTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTeamId) void fetchTeamMembers(activeTeamId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeamId]);

  const activeTeam: TeamType | undefined = teams.find((t) => t.id === activeTeamId);

  async function handleCreate() {
    setCreateError(null);
    setCreating(true);
    const error = await createTeam(teamName);
    setCreating(false);
    if (error) {
      setCreateError(error);
      return;
    }
    setTeamName('');
    setShowCreate(false);
  }

  async function handleInvite() {
    if (!activeTeamId) return;
    setInviteError(null);
    setInviteSuccess(false);
    setInviting(true);
    const error = await inviteToTeam(activeTeamId, inviteUsername);
    setInviting(false);
    if (error) {
      setInviteError(error);
      return;
    }
    setInviteUsername('');
    setInviteSuccess(true);
    setTimeout(() => setInviteSuccess(false), 2500);
  }

  async function handleRespond(invite: (typeof pendingInvites)[number], accept: boolean) {
    setRespondingTo(invite.id);
    await respondToInvite(invite, accept);
    setRespondingTo(null);
  }

  async function handleLeaveOrDelete(team: TeamType) {
    if (team.role === 'owner') await deleteTeam(team.id);
    else await leaveTeam(team.id);
    setConfirmLeaveOrDelete(null);
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Share a task list with classmates or coworkers.</p>
        </div>
        {!showCreate && (
          <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} />
            New team
          </button>
        )}
      </div>

      {showCreate && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="settings-title">Create a team</h2>
          <div className="task-input-row" style={{ marginTop: '0.75rem' }}>
            <input
              className="input"
              placeholder="e.g. Chem 101 study group"
              value={teamName}
              maxLength={60}
              onChange={(e) => setTeamName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
              autoFocus
            />
            <button className="btn btn-primary" onClick={() => void handleCreate()} disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setShowCreate(false);
                setCreateError(null);
                setTeamName('');
              }}
            >
              Cancel
            </button>
          </div>
          {createError && <p className="field-error">{createError}</p>}
        </div>
      )}

      {pendingInvites.length > 0 && (
        <section className="card" style={{ marginBottom: '1.5rem' }} aria-labelledby="invites-title">
          <h2 className="settings-title" id="invites-title">
            <Mail size={16} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
            Invitations
          </h2>
          <div className="invite-list">
            {pendingInvites.map((invite) => (
              <div key={invite.id} className="invite-row">
                <span>
                  <strong>@{invite.invitedByUsername}</strong> invited you to{' '}
                  <strong>{invite.teamName}</strong>
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={respondingTo === invite.id}
                    onClick={() => void handleRespond(invite, true)}
                  >
                    <Check size={14} /> Accept
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={respondingTo === invite.id}
                    onClick={() => void handleRespond(invite, false)}
                  >
                    <X size={14} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {teams.length === 0 ? (
        <div className="empty-state">
          <Users className="empty-state-icon" size={34} aria-hidden="true" />
          <div className="empty-state-title">No teams yet</div>
          <div className="empty-state-desc">
            Create a team to share a task list with classmates or coworkers — everyone sees and
            checks off the same tasks.
          </div>
        </div>
      ) : (
        <div className="team-grid">
          {teams.map((team) => (
            <div key={team.id} className={`card team-card${team.id === activeTeamId ? ' active' : ''}`}>
              <div className="team-card-head">
                <span className="team-card-name">{team.name}</span>
                {team.role === 'owner' && (
                  <span className="badge badge-warning" title="You own this team">
                    <Crown size={11} /> Owner
                  </span>
                )}
              </div>
              <div className="team-card-actions">
                {team.id === activeTeamId ? (
                  <button className="btn btn-ghost btn-sm" onClick={() => setActiveTeamId(null)}>
                    Back to personal
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => setActiveTeamId(team.id)}>
                    Open
                  </button>
                )}
                {confirmLeaveOrDelete === team.id ? (
                  <div className="danger-actions">
                    <button className="btn btn-danger btn-sm" onClick={() => void handleLeaveOrDelete(team)}>
                      {team.role === 'owner' ? 'Delete team' : 'Leave team'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmLeaveOrDelete(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    title={team.role === 'owner' ? 'Delete team' : 'Leave team'}
                    onClick={() => setConfirmLeaveOrDelete(team.id)}
                  >
                    {team.role === 'owner' ? <Trash2 size={14} /> : <LogOut size={14} />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTeam && (
        <section className="card" style={{ marginTop: '1.5rem' }} aria-labelledby="manage-title">
          <h2 className="settings-title" id="manage-title">
            Members of {activeTeam.name}
          </h2>
          <p className="settings-description">
            Tasks added while this team is your active workspace are visible and editable by every
            member below.
          </p>

          {isLoadingTeamMembers ? (
            <p className="settings-description">Loading members…</p>
          ) : (
            <div className="member-list">
              {teamMembers.map((member) => (
                <div key={member.userId} className="member-row">
                  <span className="sidebar-account-avatar" aria-hidden="true">
                    {(member.fullName || member.username).charAt(0).toUpperCase()}
                  </span>
                  <span>
                    {member.fullName ? `${member.fullName} · ` : ''}@{member.username}
                    {member.username === profile?.username && ' (you)'}
                  </span>
                  {member.role === 'owner' && (
                    <span className="badge badge-warning">
                      <Crown size={11} /> Owner
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="task-input-row" style={{ marginTop: '1rem' }}>
            <input
              className="input"
              placeholder="Invite by username, e.g. jordan"
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleInvite()}
            />
            <button className="btn btn-primary" onClick={() => void handleInvite()} disabled={inviting}>
              <UserPlus size={15} />
              {inviting ? 'Inviting…' : 'Invite'}
            </button>
          </div>
          {inviteError && (
            <p className="field-error">
              <AlertTriangle size={13} style={{ verticalAlign: '-2px', marginRight: '0.25rem' }} />
              {inviteError}
            </p>
          )}
          {inviteSuccess && <p className="profile-saved-note">Invitation sent.</p>}
        </section>
      )}
    </div>
  );
}
