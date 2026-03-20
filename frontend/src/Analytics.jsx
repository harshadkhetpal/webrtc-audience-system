/**
 * Analytics.jsx — Post-session analytics dashboard.
 * Shows session history, speaker stats, topic trends, section heatmap, and AI summaries.
 * Pure inline CSS, no external chart libraries — uses SVG for trend lines and CSS bars.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

// ── Colour palette (matches ModeratorDashboard) ──────────────────────────────
const C = {
  blue:    '#2563eb',
  sky:     '#38bdf8',
  green:   '#10b981',
  amber:   '#f59e0b',
  red:     '#ef4444',
  purple:  '#8b5cf6',
  indigo:  '#6366f1',
  bg:      '#f8fafc',
  card:    '#ffffff',
  border:  '#e2e8f0',
  text:    '#1e293b',
  muted:   '#64748b',
  light:   '#f1f5f9',
};

const SECTIONS = [
  'Front Left','Front Centre','Front Right',
  'Middle Left','Middle Centre','Middle Right',
  'Back Left','Back Centre','Back Right',
  'Balcony Left','Balcony Centre','Balcony Right',
  'Virtual',
];

const SENTIMENT_BADGE = {
  positive:    { bg: '#dcfce7', color: '#16a34a', label: '😊 Positive' },
  constructive:{ bg: '#dbeafe', color: '#1d4ed8', label: '🔧 Constructive' },
  mixed:       { bg: '#fef9c3', color: '#ca8a04', label: '🔀 Mixed' },
  tense:       { bg: '#fee2e2', color: '#dc2626', label: '⚠️ Tense' },
};

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
}
function fmtDur(s) {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
function pluralise(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = C.blue }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Bar row ───────────────────────────────────────────────────────────────────
function BarRow({ label, value, max, color = C.blue }) {
  // Cap at 80% so a lone bar never looks like it overflows; scale others proportionally
  const pct = max > 0 ? Math.round((value / max) * 80) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, minWidth: 0 }}>
      <div style={{ width: 120, fontSize: 12, color: C.text, fontWeight: 500, flexShrink: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0, height: 8, background: C.light, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: color,
          borderRadius: 99, transition: 'width .4s ease',
        }} />
      </div>
      <div style={{ width: 32, fontSize: 12, fontWeight: 700, color: C.muted, textAlign: 'right', flexShrink: 0 }}>
        {value}
      </div>
    </div>
  );
}

// ── Trend line (SVG) ─────────────────────────────────────────────────────────
function TrendLine({ data, color = C.blue, height = 60 }) {
  if (!data?.length) return <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', paddingTop: 20 }}>No data yet</div>;
  const W = 360, H = height;
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * (W - 20) + 10;
    const y = H - 10 - ((d.count / maxVal) * (H - 20));
    return `${x},${y}`;
  }).join(' ');
  const area = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * (W - 20) + 10;
    const y = H - 10 - ((d.count / maxVal) * (H - 20));
    return `${x},${y}`;
  });
  const areaPath = area.length > 1
    ? `M ${area[0]} L ${area.slice(1).join(' L ')} L ${(data.length - 1) / (data.length - 1 || 1) * (W - 20) + 10},${H - 10} L 10,${H - 10} Z`
    : '';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {areaPath && <path d={areaPath} fill={`url(#grad-${color.replace('#','')})`} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => {
        const x = (i / (data.length - 1 || 1)) * (W - 20) + 10;
        const y = H - 10 - ((d.count / maxVal) * (H - 20));
        return <circle key={i} cx={x} cy={y} r="3.5" fill={color} />;
      })}
    </svg>
  );
}

// ── Section heatmap grid ──────────────────────────────────────────────────────
function SectionGrid({ heatmap }) {
  const max = Math.max(...Object.values(heatmap || {}), 1);
  const rows = [
    ['Balcony Left','Balcony Centre','Balcony Right'],
    ['Back Left','Back Centre','Back Right'],
    ['Middle Left','Middle Centre','Middle Right'],
    ['Front Left','Front Centre','Front Right'],
  ];
  return (
    <div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {row.map(sec => {
            const count = heatmap?.[sec] || 0;
            const intensity = max > 0 ? count / max : 0;
            const bg = `rgba(37,99,235,${0.08 + intensity * 0.82})`;
            return (
              <div key={sec} style={{
                flex: 1, padding: '8px 4px', borderRadius: 8, textAlign: 'center',
                background: bg, border: `1px solid rgba(37,99,235,${0.15 + intensity * 0.4})`,
                transition: 'background .3s',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: intensity > 0.5 ? '#fff' : C.text, lineHeight: 1.2 }}>
                  {sec.split(' ')[0]}<br />{sec.split(' ').slice(1).join(' ')}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: intensity > 0.5 ? '#fff' : C.blue, marginTop: 3 }}>
                  {count}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {/* Virtual row */}
      <div style={{
        padding: '7px', borderRadius: 8, textAlign: 'center',
        background: `rgba(139,92,246,${0.08 + ((heatmap?.Virtual || 0) / max) * 0.6})`,
        border: '1px solid rgba(139,92,246,0.2)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>
          Virtual — {heatmap?.Virtual || 0} speakers
        </span>
      </div>
    </div>
  );
}

// ── AI Summary panel ──────────────────────────────────────────────────────────
function AISummaryPanel({ session, token, onSummaryGenerated }) {
  const [loading, setLoading] = useState(false);
  const [copied,  setCopied]  = useState(false);
  const summary = session.aiSummary;

  const regenerate = async () => {
    setLoading(true);
    try {
      await fetch(`/api/sessions/${session.sessionId}/summarize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Poll for update
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        if (tries > 30) { clearInterval(poll); setLoading(false); return; }
        try {
          const r = await fetch(`/api/sessions/${session.sessionId}`);
          const s = await r.json();
          if (s.aiSummary) { clearInterval(poll); setLoading(false); onSummaryGenerated(s.aiSummary); }
        } catch {}
      }, 2000);
    } catch { setLoading(false); }
  };

  const sharableUrl = `${window.location.origin}${window.location.pathname}?session=${session.sessionId}`;
  const copyLink = () => {
    navigator.clipboard.writeText(sharableUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  if (!summary) {
    return (
      <div style={{
        background: C.light, border: `1px dashed ${C.border}`, borderRadius: 12,
        padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>No AI Summary Yet</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
          Requires <code style={{ background: C.border, padding: '1px 4px', borderRadius: 3 }}>ANTHROPIC_API_KEY</code> on the server.
        </div>
        <button onClick={regenerate} disabled={loading} style={{
          padding: '8px 16px', borderRadius: 8, border: 'none',
          background: loading ? C.muted : C.purple, color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? '⏳ Generating…' : '✨ Generate Summary'}
        </button>
      </div>
    );
  }

  const sent = SENTIMENT_BADGE[summary.sentiment] || SENTIMENT_BADGE.mixed;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>AI Session Summary</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: sent.bg, color: sent.color,
          }}>{sent.label}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={copyLink} style={{
            fontSize: 11, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
            background: C.card, color: C.muted, cursor: 'pointer', fontWeight: 600,
          }}>{copied ? '✅ Copied!' : '🔗 Share Link'}</button>
          <button onClick={regenerate} disabled={loading} style={{
            fontSize: 11, padding: '5px 10px', borderRadius: 7, border: 'none',
            background: C.light, color: C.muted, cursor: 'pointer', fontWeight: 600,
          }}>{loading ? '…' : '↻ Refresh'}</button>
        </div>
      </div>

      {/* Overview */}
      <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 5, letterSpacing: '.05em' }}>OVERVIEW</div>
        <div style={{ fontSize: 13, color: '#0c4a6e', lineHeight: 1.6 }}>{summary.overview}</div>
      </div>

      {/* Key questions */}
      {summary.keyQuestions?.length > 0 && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 8, letterSpacing: '.05em' }}>KEY QUESTIONS RAISED</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {summary.keyQuestions.map((q, i) => (
              <li key={i} style={{ fontSize: 13, color: '#14532d', marginBottom: 4, lineHeight: 1.5 }}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Dominant themes */}
      {summary.dominantThemes?.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, letterSpacing: '.05em' }}>DOMINANT THEMES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {summary.dominantThemes.map((t, i) => (
              <span key={i} style={{
                fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
                background: C.indigo + '18', color: C.indigo, border: `1px solid ${C.indigo}33`,
              }}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* Fact-check flags */}
      {summary.factCheckFlags?.length > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', marginBottom: 8, letterSpacing: '.05em' }}>
            ⚠️ FACT-CHECK FLAGS
          </div>
          {summary.factCheckFlags.map((f, i) => (
            <div key={i} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < summary.factCheckFlags.length - 1 ? '1px solid #fed7aa' : 'none' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#7c2d12' }}>"{f.claim}"</div>
              <div style={{ fontSize: 12, color: '#9a3412', marginTop: 2 }}>{f.reason}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {summary.recommendations?.length > 0 && (
        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 8, letterSpacing: '.05em' }}>RECOMMENDATIONS</div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {summary.recommendations.map((r, i) => (
              <li key={i} style={{ fontSize: 13, color: '#4c1d95', marginBottom: 4, lineHeight: 1.5 }}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Session detail ────────────────────────────────────────────────────────────
function SessionDetail({ sessionId, token }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const prevIdRef = useRef(null);

  useEffect(() => {
    if (!sessionId || sessionId === prevIdRef.current) return;
    prevIdRef.current = sessionId;
    setLoading(true);
    fetch(`/api/sessions/${sessionId}`)
      .then(r => r.json())
      .then(s => { setSession(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId]);

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>Loading session…
    </div>
  );
  if (!session) return (
    <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>❌</div>Session not found
    </div>
  );

  const durationMin = session.startedAt && session.endedAt
    ? Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000)
    : null;

  const topQuestions = [...(session.preQuestions || [])].sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Session header */}
      <div style={{
        background: 'linear-gradient(135deg,#2563eb,#38bdf8)', borderRadius: 14,
        padding: '16px 20px', color: '#fff',
      }}>
        <div style={{ fontSize: 11, opacity: .8, marginBottom: 4, fontWeight: 600, letterSpacing: '.05em' }}>
          SESSION DETAIL
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>
          {fmtDate(session.startedAt)} · Room: {session.roomId || 'main'}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, opacity: .9 }}>
          <span>🕐 {fmtTime(session.startedAt)} – {fmtTime(session.endedAt)}</span>
          {durationMin != null && <span>⏱ {durationMin} min</span>}
          <span>👤 {pluralise(session.speakers?.length || 0, 'speaker')}</span>
          <span>❓ {pluralise(session.preQuestions?.length || 0, 'question')}</span>
          <span>📊 {pluralise(session.polls?.length || 0, 'poll')}</span>
        </div>
      </div>

      {/* AI Summary */}
      <AISummaryPanel
        session={session}
        token={token}
        onSummaryGenerated={summary => setSession(s => ({ ...s, aiSummary: summary }))}
      />

      {/* Speaker timeline */}
      {session.speakers?.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>🎤 Speaker Timeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {session.speakers.map((sp, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', background: C.light, borderRadius: 9,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8, background: C.blue + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: C.blue, flexShrink: 0,
                }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sp.name || 'Anonymous'}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {sp.section || '—'} · {sp.topic ? `"${sp.topic}"` : 'No topic'}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: C.green, background: '#dcfce7',
                  padding: '3px 8px', borderRadius: 99, flexShrink: 0,
                }}>{fmtDur(sp.durationSec)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top questions */}
      {topQuestions.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>
            ❓ Top Questions by Upvotes
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {topQuestions.map((q, i) => (
              <div key={i} style={{
                padding: '9px 12px', background: C.light, borderRadius: 9,
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <div style={{
                  minWidth: 30, height: 30, borderRadius: 8, background: C.amber + '22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: C.amber, flexShrink: 0,
                }}>▲{q.votes || 0}</div>
                <div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{q.text}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {q.name || 'Anonymous'} · {q.section || 'unknown section'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Polls */}
      {session.polls?.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>📊 Polls</div>
          {session.polls.map((poll, pi) => {
            const total = poll.options.reduce((s, o) => s + (o.votes || 0), 0);
            return (
              <div key={pi} style={{ marginBottom: pi < session.polls.length - 1 ? 14 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>
                  {poll.question}
                </div>
                {poll.options.map((opt, oi) => {
                  const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                  return (
                    <div key={oi} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: C.text, fontWeight: 500 }}>{opt.text}</span>
                        <span style={{ color: C.muted }}>{opt.votes || 0} votes · {pct}%</span>
                      </div>
                      <div style={{ height: 7, background: C.light, borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: C.blue, borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>Total votes: {total}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Analytics Dashboard ──────────────────────────────────────────────────
export default function Analytics({ token, workspaceId, workspaceName, onLogout }) {
  const [overview,     setOverview]     = useState(null);
  const [sessions,     setSessions]     = useState([]);
  const [selectedId,   setSelectedId]   = useState(null);
  const [activeTab,    setActiveTab]    = useState('overview');   // 'overview' | 'sessions'
  const [loadingOvr,   setLoadingOvr]   = useState(true);
  const [loadingSess,  setLoadingSess]  = useState(true);
  const [sinceFilter,  setSinceFilter]  = useState('');

  const headers = { Authorization: `Bearer ${token}` };

  const refresh = useCallback(() => {
    setLoadingOvr(true);
    const since = sinceFilter ? `?since=${sinceFilter}` : '';
    fetch(`/api/analytics${since}`, { headers })
      .then(r => r.json())
      .then(d => { setOverview(d); setLoadingOvr(false); })
      .catch(() => setLoadingOvr(false));
  }, [sinceFilter, token]);

  const loadSessions = useCallback(() => {
    setLoadingSess(true);
    fetch('/api/sessions', { headers })
      .then(r => r.json())
      .then(s => {
        const arr = Array.isArray(s) ? s : [];
        setSessions(arr);
        setLoadingSess(false);
        if (arr.length > 0 && !selectedId) setSelectedId(arr[0].sessionId);
      })
      .catch(() => setLoadingSess(false));
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'sessions', label: 'Sessions', icon: '🗂️' },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 40px' }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>📈</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Analytics</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99,
              background: C.blue + '18', color: C.blue,
            }}>{workspaceName}</span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            Session history, speaker stats, topic trends and AI-powered summaries
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={refresh} style={{
            padding: '7px 13px', fontSize: 12, borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.card, color: C.muted,
            cursor: 'pointer', fontWeight: 600,
          }}>↻ Refresh</button>
          <button onClick={onLogout} style={{
            padding: '7px 13px', fontSize: 12, borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.card, color: C.red,
            cursor: 'pointer', fontWeight: 600,
          }}>↩ Sign out</button>
        </div>
      </div>

      {/* ── Sub-tabs ── */}
      <div style={{ display: 'flex', gap: 2, background: C.light, borderRadius: 10, padding: 3, width: 'fit-content', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '7px 18px', fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500,
            borderRadius: 8, border: 'none', cursor: 'pointer',
            background: activeTab === t.id ? C.card : 'transparent',
            color: activeTab === t.id ? C.blue : C.muted,
            boxShadow: activeTab === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
            transition: 'all .15s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ──────────────────────── OVERVIEW TAB ──────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Date filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Filter from:</span>
            <input type="date" value={sinceFilter} onChange={e => setSinceFilter(e.target.value)}
              style={{ fontSize: 12, padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border}`, color: C.text }} />
            {sinceFilter && (
              <button onClick={() => setSinceFilter('')} style={{
                fontSize: 12, padding: '5px 10px', borderRadius: 7,
                border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', color: C.muted,
              }}>✕ Clear</button>
            )}
          </div>

          {loadingOvr ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>⏳ Loading…</div>
          ) : !overview ? (
            <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>Could not load analytics. Check server connection.</div>
          ) : (
            <>
              {/* Stat cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
                <StatCard icon="🗂️" label="Total Sessions" value={overview.totalSessions} color={C.blue} />
                <StatCard icon="🎤" label="Total Speakers" value={overview.totalSpeakers} color={C.green} />
                <StatCard icon="❓" label="Questions Submitted" value={overview.totalQuestions} color={C.amber} />
                <StatCard icon="📊" label="Polls Run" value={overview.totalPolls} color={C.purple} />
                <StatCard icon="⏱" label="Avg Speaker Time"
                  value={fmtDur(overview.avgDurationSec)}
                  sub="per speaker"
                  color={C.indigo} />
              </div>

              {/* Row: section heatmap + topic words */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>
                    🗺️ Section Participation Heatmap
                  </div>
                  <SectionGrid heatmap={overview.sectionHeatmap} />
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>
                    🏷️ Top Topics &amp; Keywords
                  </div>
                  {overview.topTopics?.length > 0 ? (
                    overview.topTopics.slice(0, 12).map((t, i) => (
                      <BarRow key={i} label={t.word} value={t.count}
                        max={overview.topTopics[0].count} color={C.blue} />
                    ))
                  ) : (
                    <div style={{ color: C.muted, fontSize: 13 }}>No sessions yet</div>
                  )}
                </div>
              </div>

              {/* Row: Most Active Sections + Questions Over Time */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>
                    📍 Most Active Sections
                  </div>
                  {overview.topSections?.length > 0 ? (
                    overview.topSections.map((s, i) => (
                      <BarRow key={i} label={s.section} value={s.count}
                        max={overview.topSections[0].count}
                        color={i === 0 ? C.blue : i === 1 ? C.sky : C.indigo} />
                    ))
                  ) : (
                    <div style={{ color: C.muted, fontSize: 13 }}>No data yet</div>
                  )}
                </div>

                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 4 }}>
                    📈 Questions Over Time
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
                    Pre-session questions submitted per day
                  </div>
                  <TrendLine data={overview.questionsOverTime} color={C.amber} height={80} />
                  {overview.questionsOverTime?.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginTop: 4 }}>
                      <span>{overview.questionsOverTime[0]?.date}</span>
                      <span>{overview.questionsOverTime.at(-1)?.date}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ──────────────────────── SESSIONS TAB ──────────────────────────────── */}
      {activeTab === 'sessions' && (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Session list */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{
              padding: '12px 14px', borderBottom: `1px solid ${C.border}`,
              fontWeight: 700, fontSize: 13, color: C.text, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>Past Sessions</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{sessions.length}</span>
            </div>
            {loadingSess ? (
              <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>⏳ Loading…</div>
            ) : sessions.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
                <div style={{ fontSize: 13, color: C.muted }}>No sessions saved yet.<br />End a live session to save it.</div>
              </div>
            ) : (
              <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                {sessions.map(s => (
                  <button
                    key={s.sessionId}
                    onClick={() => setSelectedId(s.sessionId)}
                    style={{
                      width: '100%', padding: '12px 14px', textAlign: 'left',
                      border: 'none', borderBottom: `1px solid ${C.border}`,
                      background: selectedId === s.sessionId ? C.blue + '0d' : C.card,
                      borderLeft: selectedId === s.sessionId ? `3px solid ${C.blue}` : '3px solid transparent',
                      cursor: 'pointer', transition: 'background .15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                        {fmtDate(s.startedAt)}
                      </div>
                      {s.hasSummary && (
                        <span title="Has AI summary" style={{ fontSize: 10 }}>🤖</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>
                      {fmtTime(s.startedAt)} · Room: {s.roomId}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                        background: C.blue + '18', color: C.blue,
                      }}>👤 {s.speakerCount}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                        background: C.amber + '18', color: C.amber,
                      }}>❓ {s.questionCount}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Session detail panel */}
          <div>
            {selectedId ? (
              <SessionDetail sessionId={selectedId} token={token} />
            ) : (
              <div style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                padding: 40, textAlign: 'center', color: C.muted,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👈</div>
                Select a session from the list to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
