import { useState } from 'react';
import { Key, Trash2, Download, AlertTriangle } from 'lucide-react';
import { useStore } from '../store';

export default function Settings() {
  const { openRouterKey, setOpenRouterKey, tasks, sessions, timerMinutes, breakMinutes, setTimerMinutes, setBreakMinutes } = useStore();
  const [showReset, setShowReset] = useState(false);

  function handleExport() {
    const data = {
      tasks,
      sessions,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focusflow-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleReset() {
    localStorage.removeItem('focusflow-storage');
    window.location.reload();
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure your FocusFlow experience</p>
        </div>
      </div>

      <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* API Key */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Key size={18} color="var(--color-primary-light)" />
            <h3>OpenRouter API Key</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Required for AI task decomposition. Get a free key at{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style={{ color: 'var(--color-primary-light)' }}>
              openrouter.ai/keys
            </a>
          </p>
          <input
            className="input"
            type="password"
            placeholder="sk-or-v1-..."
            value={openRouterKey}
            onChange={(e) => setOpenRouterKey(e.target.value)}
          />
        </div>

        {/* Default Timer */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Default Timer Durations</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                Focus (minutes)
              </label>
              <input
                className="input"
                type="number"
                min={5}
                max={120}
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(Math.max(5, Math.min(120, parseInt(e.target.value) || 25)))}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                Break (minutes)
              </label>
              <input
                className="input"
                type="number"
                min={1}
                max={30}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Math.max(1, Math.min(30, parseInt(e.target.value) || 5)))}
              />
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Data Management</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button className="btn btn-ghost" onClick={handleExport} style={{ justifyContent: 'flex-start' }}>
              <Download size={16} />
              Export Data (JSON Backup)
            </button>

            {!showReset ? (
              <button
                className="btn btn-danger"
                onClick={() => setShowReset(true)}
                style={{ justifyContent: 'flex-start' }}
              >
                <Trash2 size={16} />
                Reset All Data
              </button>
            ) : (
              <div
                style={{
                  padding: '1rem',
                  background: 'rgba(239,68,68,0.08)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <AlertTriangle size={16} color="var(--color-danger-light)" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-danger-light)' }}>
                    This will delete all tasks and session history. This cannot be undone.
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-danger btn-sm" onClick={handleReset}>
                    Yes, Reset Everything
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowReset(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* About */}
        <div className="card">
          <h3 style={{ marginBottom: '0.5rem' }}>About FocusFlow</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            FocusFlow is an AI-powered productivity platform that bridges the gap between simple to-do lists
            and complex project management. Built with React, TypeScript, and the OpenRouter API for intelligent
            task decomposition.
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '0.75rem' }}>
            Version 1.0.0 · Made with ❤️
          </p>
        </div>
      </div>
    </div>
  );
}
