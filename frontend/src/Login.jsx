/**
 * Login.jsx — Passcode-based moderator authentication gate.
 * Displays when the Moderator or Analytics tab is active but no valid token exists.
 */
import React, { useState } from 'react';

export default function Login({ onLogin }) {
  const [workspaceId, setWorkspaceId] = useState('default');
  const [passcode,    setPasscode]    = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ workspaceId: workspaceId.trim(), passcode: passcode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      sessionStorage.setItem('mod_token', data.token);
      sessionStorage.setItem('mod_ws',    data.workspaceId);
      sessionStorage.setItem('mod_name',  data.workspaceName);
      onLogin({ token: data.token, workspaceId: data.workspaceId, workspaceName: data.workspaceName });
    } catch {
      setError('Could not reach server. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
        padding: '40px 36px', width: '100%', maxWidth: 400,
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      }}>
        {/* Logo mark */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px',
            background: 'linear-gradient(135deg,#2563eb 0%,#38bdf8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
          }}>🎙️</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#1e293b' }}>Moderator Access</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Enter your workspace credentials
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>
              Workspace ID
            </label>
            <input
              type="text"
              value={workspaceId}
              onChange={e => setWorkspaceId(e.target.value)}
              placeholder="e.g. default"
              autoComplete="username"
              required
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 9,
                border: '1.5px solid #e2e8f0', outline: 'none', color: '#1e293b',
                transition: 'border-color .15s',
              }}
              onFocus={e => e.target.style.borderColor = '#2563eb'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>
              Passcode
            </label>
            <input
              type="password"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              placeholder="Enter passcode"
              autoComplete="current-password"
              required
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 9,
                border: '1.5px solid #e2e8f0', outline: 'none', color: '#1e293b',
                transition: 'border-color .15s',
              }}
              onFocus={e => e.target.style.borderColor = '#2563eb'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
              padding: '8px 12px', fontSize: 13, color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '11px', fontSize: 14, fontWeight: 700, borderRadius: 9,
              background: loading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background .15s',
            }}
          >
            {loading ? '⏳ Signing in…' : 'Sign in →'}
          </button>
        </form>

        <div style={{ marginTop: 20, padding: '12px 14px', background: '#f8fafc', borderRadius: 9, border: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 5, letterSpacing: '.06em' }}>
            DEFAULT CREDENTIALS
          </div>
          <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
            Workspace ID: <strong>default</strong><br />
            Passcode: <strong>{process.env.REACT_APP_DEFAULT_PASSCODE || 'admin123'}</strong>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
            Change via <code style={{ background: '#e2e8f0', borderRadius: 3, padding: '0 3px' }}>MODERATOR_PASSCODE</code> env var on the server.
          </div>
        </div>
      </div>
    </div>
  );
}
