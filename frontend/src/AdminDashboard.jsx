/**
 * AdminDashboard.jsx — Separate admin space for analytics, publishing, and settings.
 * Accessed via ?mode=admin — completely separate from the main audience-facing app.
 * Sidebar nav: Overview · Sessions · Publish · Settings
 */
import React, { useState, useEffect, useCallback } from 'react';
import Login from './Login';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

const C = {
  blue: '#2563eb', sky: '#38bdf8', green: '#10b981',
  amber: '#f59e0b', red: '#ef4444', purple: '#8b5cf6',
  indigo: '#6366f1', bg: '#f8fafc', card: '#ffffff',
  border: '#e2e8f0', text: '#1e293b', muted: '#64748b',
  light: '#f1f5f9',
  sidebar: '#0f172a', sidebarBorder: '#1e293b',
  sidebarText: '#94a3b8', sidebarActive: '#2563eb',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function fmtDur(s) {
  if (!s) return '0s';
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = C.blue }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{
        width: 46, height: 46, borderRadius: 12, flexShrink: 0,
        background: color + '18', display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontSize: 22,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.muted, marginTop: 3 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Bar Row ───────────────────────────────────────────────────────────────────
function BarRow({ label, value, max, color = C.blue }) {
  // Cap at 85%, never allow full-width even when value === max
  const pct = max > 1 ? Math.min(Math.round((value / max) * 85), 85) : value > 0 ? 55 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, width: '100%', overflow: 'hidden' }}>
      <div style={{ width: 100, fontSize: 12, color: C.text, fontWeight: 500, flexShrink: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, height: 8, background: C.light, borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, maxWidth: '100%', background: color,
          borderRadius: 99, transition: 'width .4s ease' }} />
      </div>
      <div style={{ width: 28, fontSize: 12, fontWeight: 700, color: C.muted, textAlign: 'right', flexShrink: 0 }}>{value}</div>
    </div>
  );
}

// ── Trend SVG ─────────────────────────────────────────────────────────────────
function TrendLine({ data, color = C.blue, height = 70 }) {
  if (!data?.length) return <div style={{ color: C.muted, fontSize: 12, textAlign: 'center', paddingTop: 20 }}>No data yet</div>;
  const W = 400, H = height;
  const maxVal = Math.max(...data.map(d => d.count), 1);
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * (W - 20) + 10;
    const y = H - 10 - ((d.count / maxVal) * (H - 20));
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`tg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => {
        const x = (i / (data.length - 1 || 1)) * (W - 20) + 10;
        const y = H - 10 - ((d.count / maxVal) * (H - 20));
        return <circle key={i} cx={x} cy={y} r="4" fill={color} />;
      })}
    </svg>
  );
}

// ── Section Heatmap ───────────────────────────────────────────────────────────
function SectionGrid({ heatmap }) {
  const max = Math.max(...Object.values(heatmap || {}), 1);
  const rows = [
    ['Balcony Left', 'Balcony Centre', 'Balcony Right'],
    ['Back Left', 'Back Centre', 'Back Right'],
    ['Middle Left', 'Middle Centre', 'Middle Right'],
    ['Front Left', 'Front Centre', 'Front Right'],
  ];
  return (
    <div>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          {row.map(sec => {
            const count = heatmap?.[sec] || 0;
            const intensity = max > 0 ? count / max : 0;
            return (
              <div key={sec} style={{
                flex: 1, padding: '8px 4px', borderRadius: 8, textAlign: 'center',
                background: `rgba(37,99,235,${0.08 + intensity * 0.82})`,
                border: `1px solid rgba(37,99,235,${0.15 + intensity * 0.4})`,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: intensity > 0.5 ? '#fff' : C.text, lineHeight: 1.2 }}>
                  {sec.split(' ')[0]}<br />{sec.split(' ').slice(1).join(' ')}
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: intensity > 0.5 ? '#fff' : C.blue, marginTop: 3 }}>{count}</div>
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ padding: 7, borderRadius: 8, textAlign: 'center',
        background: `rgba(139,92,246,${0.08 + ((heatmap?.Virtual || 0) / max) * 0.6})`,
        border: '1px solid rgba(139,92,246,0.2)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>Virtual — {heatmap?.Virtual || 0} speakers</span>
      </div>
    </div>
  );
}

// ── Overview Page ─────────────────────────────────────────────────────────────
function OverviewPage({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [since, setSince] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const q = since ? `?since=${since}` : '';
    fetch(`${API_BASE}/api/analytics${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, since]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: C.muted }}>⏳ Loading analytics…</div>;
  if (!data) return <div style={{ padding: 60, textAlign: 'center', color: C.muted }}>Could not load analytics. Check server.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filter row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Show from:</span>
        <input type="date" value={since} onChange={e => setSince(e.target.value)}
          style={{ fontSize: 12, padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border}`, color: C.text, background: C.card }} />
        {since && (
          <button onClick={() => setSince('')} style={{
            fontSize: 12, padding: '5px 10px', borderRadius: 7,
            border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', color: C.muted,
          }}>✕ Clear</button>
        )}
        <button onClick={load} style={{
          fontSize: 12, padding: '5px 12px', borderRadius: 7,
          border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', color: C.muted, fontWeight: 600,
        }}>↻ Refresh</button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12 }}>
        <StatCard icon="🗂️" label="Total Sessions" value={data.totalSessions} color={C.blue} />
        <StatCard icon="🎤" label="Total Speakers" value={data.totalSpeakers} color={C.green} />
        <StatCard icon="❓" label="Questions Submitted" value={data.totalQuestions} color={C.amber} />
        <StatCard icon="📊" label="Polls Run" value={data.totalPolls} color={C.purple} />
        <StatCard icon="⏱" label="Avg Speaker Time" value={fmtDur(data.avgDurationSec)} sub="per speaker" color={C.indigo} />
      </div>

      {/* Heatmap + Topics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>🗺️ Section Participation Heatmap</div>
          <SectionGrid heatmap={data.sectionHeatmap} />
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>🏷️ Top Topics &amp; Keywords</div>
          {data.topTopics?.length > 0
            ? data.topTopics.slice(0, 12).map((t, i) => (
              <BarRow key={i} label={t.word} value={t.count} max={data.topTopics[0].count} color={C.blue} />
            ))
            : <div style={{ color: C.muted, fontSize: 13 }}>No sessions yet</div>}
        </div>
      </div>

      {/* Most active sections + Questions over time — side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>📍 Most Active Sections</div>
          {data.topSections?.length > 0
            ? data.topSections.map((s, i) => (
              <BarRow key={i} label={s.section} value={s.count} max={data.topSections[0].count}
                color={i === 0 ? C.blue : i === 1 ? C.sky : C.indigo} />
            ))
            : <div style={{ color: C.muted, fontSize: 13 }}>No data yet</div>}
        </div>

        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 4 }}>📈 Questions Over Time</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Pre-session questions submitted per day</div>
          <TrendLine data={data.questionsOverTime} color={C.amber} height={80} />
          {data.questionsOverTime?.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginTop: 4 }}>
              <span>{data.questionsOverTime[0]?.date}</span>
              <span>{data.questionsOverTime.at(-1)?.date}</span>
            </div>
          )}
        </div>
      </div>

      {/* Speaker Performance Table */}
      {data.topSpeakers?.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>🎤 Speaker Performance</div>
            <button onClick={() => {
              const rows = [['Name','Appearances','Total Time','Avg Time','Sections','Latest Topic']];
              data.topSpeakers.forEach(s => rows.push([s.name,s.appearances,fmtDur(s.totalDurationSec),fmtDur(s.avgDurationSec),s.sections,s.latestTopic]));
              const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
              const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
              a.download = 'speaker-performance.csv'; a.click();
            }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: C.card, color: C.muted, cursor: 'pointer', fontWeight: 600 }}>⬇ Export CSV</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                  {['Speaker','Times','Total','Avg/turn','Section','Latest Topic'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11,
                      fontWeight: 700, color: C.muted, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.topSpeakers.slice(0, 10).map((sp, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}`,
                    background: i % 2 === 0 ? 'transparent' : C.light }}>
                    <td style={{ padding: '7px 10px', fontWeight: 700, color: C.text }}>{sp.name}</td>
                    <td style={{ padding: '7px 10px', color: C.blue, fontWeight: 700, textAlign: 'center' }}>{sp.appearances}</td>
                    <td style={{ padding: '7px 10px', color: C.muted }}>{fmtDur(sp.totalDurationSec)}</td>
                    <td style={{ padding: '7px 10px', color: C.green, fontWeight: 600 }}>{fmtDur(sp.avgDurationSec)}</td>
                    <td style={{ padding: '7px 10px', color: C.muted, fontSize: 11 }}>{sp.sections}</td>
                    <td style={{ padding: '7px 10px', color: C.muted, fontSize: 11, maxWidth: 200,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.latestTopic || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Contributors Leaderboard */}
      {data.topContributors?.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>⭐ Audience Contributors Leaderboard</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.topContributors.slice(0, 10).map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12,
                padding: '8px 12px', borderRadius: 9,
                background: i === 0 ? '#fef9c3' : i === 1 ? '#f1f5f9' : 'transparent',
                border: i < 2 ? `1px solid ${i === 0 ? '#fde68a' : C.border}` : 'none' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7c50' : C.light,
                  color: i < 3 ? '#fff' : C.muted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 12 }}>{i + 1}</div>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: C.text }}>{c.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{c.questionCount} Q{c.questionCount !== 1 ? 's' : ''}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.amber }}>▲ {c.totalVotes}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Audience Feedback ── */}
      {data.feedback?.total > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>⭐ Audience Feedback</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                {data.feedback.total} rating{data.feedback.total !== 1 ? 's' : ''} collected across all sessions
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b' }}>{data.feedback.avgRating}</div>
              <div style={{ fontSize: 10, color: C.muted }}>avg / 5</div>
            </div>
          </div>
          {/* Star distribution bars */}
          <div style={{ marginBottom: 14 }}>
            {[5,4,3,2,1].map(star => {
              const count = data.feedback.byRating?.[star] || 0;
              const pct   = data.feedback.total > 0 ? Math.round((count / data.feedback.total) * 100) : 0;
              return (
                <div key={star} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                  <div style={{ width:14, fontSize:11, color:C.muted, fontWeight:600, textAlign:'right' }}>{star}</div>
                  <div style={{ fontSize:11 }}>{'⭐'.repeat(star)}</div>
                  <div style={{ flex:1, height:8, background:C.light, borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, borderRadius:99,
                      background: star >= 4 ? '#10b981' : star === 3 ? '#f59e0b' : '#ef4444',
                      transition:'width .4s ease' }} />
                  </div>
                  <div style={{ width:36, fontSize:11, color:C.muted, textAlign:'right' }}>{count} ({pct}%)</div>
                </div>
              );
            })}
          </div>
          {/* Recent comments */}
          {data.feedback.recentComments?.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:8, letterSpacing:'.05em' }}>RECENT COMMENTS</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {data.feedback.recentComments.slice(0,5).map((fb, i) => (
                  <div key={i} style={{ background:C.light, borderRadius:9, padding:'8px 12px',
                    display:'flex', gap:10, alignItems:'flex-start' }}>
                    <span style={{ fontSize:12, flexShrink:0 }}>{'⭐'.repeat(fb.stars)}</span>
                    <span style={{ fontSize:12, color:C.text }}>{fb.comment}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Session Sentiment Timeline */}
      {data.sessionSentiments?.length > 1 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 4 }}>💬 Session Sentiment History</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>AI-analysed sentiment per session over time</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {data.sessionSentiments.map((s, i) => {
              const col = s.sentiment === 'positive' ? '#10b981' : s.sentiment === 'tense' ? '#ef4444' : s.sentiment === 'mixed' ? '#f59e0b' : '#94a3b8';
              const bg  = s.sentiment === 'positive' ? '#dcfce7' : s.sentiment === 'tense' ? '#fee2e2' : s.sentiment === 'mixed' ? '#fef9c3' : C.light;
              return (
                <div key={i} style={{ flexShrink: 0, textAlign: 'center', minWidth: 64 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, margin: '0 auto 4px',
                    background: bg, border: `2px solid ${col}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18 }}>
                    {s.sentiment === 'positive' ? '😊' : s.sentiment === 'tense' ? '😤' : s.sentiment === 'mixed' ? '😐' : '❓'}
                  </div>
                  <div style={{ fontSize: 9, color: C.muted }}>{s.date?.slice(5)}</div>
                  <div style={{ fontSize: 9, color: col, fontWeight: 700 }}>{s.sentiment || '—'}</div>
                  <div style={{ fontSize: 9, color: C.muted }}>{s.speakerCount}🎤 {s.questionCount}❓</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Session Detail (used in Sessions page) ────────────────────────────────────
function SessionDetail({ session, token, onPublish }) {
  const [aiLoading, setAiLoading] = useState(false);
  const [localSession, setLocalSession] = useState(session);
  const ai = localSession.aiSummary;

  useEffect(() => { setLocalSession(session); }, [session]);

  const regenerate = async () => {
    setAiLoading(true);
    try {
      await fetch(`${API_BASE}/api/sessions/${session.sessionId}/summarize`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        if (tries > 30) { clearInterval(poll); setAiLoading(false); return; }
        try {
          const r = await fetch(`${API_BASE}/api/sessions/${session.sessionId}`);
          const s = await r.json();
          if (s.aiSummary) { clearInterval(poll); setAiLoading(false); setLocalSession(s); }
        } catch { /* ignore */ }
      }, 2000);
    } catch { setAiLoading(false); }
  };

  const topQ = [...(localSession.preQuestions || [])].sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 8);
  const unanswered = (localSession.preQuestions || []).filter(q => !q.answered).slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#2563eb,#38bdf8)', borderRadius: 14, padding: '16px 20px', color: '#fff' }}>
        <div style={{ fontSize: 11, opacity: .8, marginBottom: 3, fontWeight: 600, letterSpacing: '.05em' }}>SESSION DETAIL</div>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>
          {fmtDate(localSession.startedAt)} · Room: {localSession.roomId || 'main'}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, opacity: .9 }}>
          <span>🕐 {fmtTime(localSession.startedAt)} – {fmtTime(localSession.endedAt)}</span>
          <span>🎤 {localSession.speakers?.length || 0} speakers</span>
          <span>❓ {localSession.preQuestions?.length || 0} questions</span>
          <span>📊 {localSession.polls?.length || 0} polls</span>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <button onClick={() => onPublish(localSession)} style={{
            padding: '7px 14px', borderRadius: 8, border: 'none',
            background: 'rgba(255,255,255,0.2)', color: '#fff',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}>📤 Publish Summary</button>
          <a href={`${window.location.origin}${window.location.pathname}?session=${session.sessionId}`}
            target="_blank" rel="noreferrer" style={{
            padding: '7px 14px', borderRadius: 8, border: 'none',
            background: 'rgba(255,255,255,0.15)', color: '#fff',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none',
          }}>🔗 Public Link ↗</a>
        </div>
      </div>

      {/* AI Summary */}
      {ai ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>🤖 AI Summary</div>
            <button onClick={regenerate} disabled={aiLoading} style={{
              fontSize: 11, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
              background: C.card, color: C.muted, cursor: 'pointer', fontWeight: 600,
            }}>{aiLoading ? '…' : '↻ Refresh'}</button>
          </div>
          {ai.overview && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '11px 13px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 4, letterSpacing: '.05em' }}>OVERVIEW</div>
              <div style={{ fontSize: 13, color: '#0c4a6e', lineHeight: 1.6 }}>{ai.overview}</div>
            </div>
          )}
          {ai.dominantThemes?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, letterSpacing: '.05em' }}>THEMES</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ai.dominantThemes.map((t, i) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 99,
                    background: C.indigo + '18', color: C.indigo, border: `1px solid ${C.indigo}33` }}>{t}</span>
                ))}
              </div>
            </div>
          )}
          {ai.keyQuestions?.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '11px 13px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d', marginBottom: 6, letterSpacing: '.05em' }}>KEY QUESTIONS</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {ai.keyQuestions.map((q, i) => <li key={i} style={{ fontSize: 13, color: '#14532d', marginBottom: 4, lineHeight: 1.5 }}>{q}</li>)}
              </ul>
            </div>
          )}
          {ai.factCheckFlags?.length > 0 && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '11px 13px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', marginBottom: 6, letterSpacing: '.05em' }}>⚠️ FACT-CHECK FLAGS</div>
              {ai.factCheckFlags.map((f, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#7c2d12' }}>"{f.claim}"</div>
                  <div style={{ fontSize: 12, color: '#9a3412' }}>{f.reason}</div>
                </div>
              ))}
            </div>
          )}
          {ai.recommendations?.length > 0 && (
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '11px 13px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 6, letterSpacing: '.05em' }}>RECOMMENDATIONS</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {ai.recommendations.map((r, i) => <li key={i} style={{ fontSize: 13, color: '#4c1d95', marginBottom: 4, lineHeight: 1.5 }}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: C.light, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>🤖</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>No AI Summary Yet</div>
          <button onClick={regenerate} disabled={aiLoading} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: aiLoading ? C.muted : C.purple, color: '#fff',
            fontSize: 12, fontWeight: 600, cursor: aiLoading ? 'not-allowed' : 'pointer',
          }}>{aiLoading ? '⏳ Generating…' : '✨ Generate AI Summary'}</button>
        </div>
      )}

      {/* Speakers */}
      {localSession.speakers?.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>🎤 Speakers</div>
          {localSession.speakers.map((sp, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderBottom: i < localSession.speakers.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: C.blue + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: C.blue, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{sp.name || 'Anonymous'}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{sp.section || '—'}{sp.topic ? ` · "${sp.topic}"` : ''}</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.green, background: '#dcfce7', padding: '3px 8px', borderRadius: 99 }}>
                {fmtDur(sp.durationSec)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top questions */}
      {topQ.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>❓ Top Questions by Votes</div>
          {topQ.map((q, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0',
              borderBottom: i < topQ.length - 1 ? `1px solid ${C.border}` : 'none' }}>
              <div style={{ minWidth: 32, height: 32, borderRadius: 8, background: C.amber + '22',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: C.amber, flexShrink: 0 }}>▲{q.votes || 0}</div>
              <div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{q.text}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{q.name || 'Anonymous'} · {q.section || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Unanswered questions */}
      {unanswered.length > 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#c2410c', marginBottom: 12 }}>📌 Unanswered Questions (Follow-up)</div>
          {unanswered.map((q, i) => (
            <div key={i} style={{ fontSize: 13, color: '#7c2d12', padding: '6px 0',
              borderBottom: i < unanswered.length - 1 ? '1px solid #fed7aa' : 'none' }}>
              {q.text}
              <span style={{ fontSize: 11, color: '#9a3412', marginLeft: 8 }}>— {q.name || 'Anonymous'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Polls */}
      {localSession.polls?.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 12 }}>📊 Polls</div>
          {localSession.polls.map((poll, pi) => {
            const total = poll.options.reduce((s, o) => s + (o.votes || 0), 0);
            return (
              <div key={pi} style={{ marginBottom: pi < localSession.polls.length - 1 ? 14 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>{poll.question}</div>
                {poll.options.map((opt, oi) => {
                  const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                  return (
                    <div key={oi} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                        <span style={{ color: C.text }}>{opt.text}</span>
                        <span style={{ color: C.muted }}>{opt.votes || 0} · {pct}%</span>
                      </div>
                      <div style={{ height: 7, background: C.light, borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: C.blue, borderRadius: 99 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Session Compare Panel ──────────────────────────────────────────────────────
function SessionCompare({ sessions, token }) {
  const [idA, setIdA] = useState(sessions[0]?.sessionId || '');
  const [idB, setIdB] = useState(sessions[1]?.sessionId || '');
  const [sA, setSA] = useState(null);
  const [sB, setSB] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!idA || !idB || idA === idB) return;
    setLoading(true);
    const [a, b] = await Promise.all([
      fetch(`${API_BASE}/api/sessions/${idA}`).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/sessions/${idB}`).then(r => r.json()).catch(() => null),
    ]);
    setSA(a); setSB(b); setLoading(false);
  };

  const metric = (label, valA, valB, higherIsBetter = true) => {
    const numA = typeof valA === 'number' ? valA : 0;
    const numB = typeof valB === 'number' ? valB : 0;
    const winA = higherIsBetter ? numA >= numB : numA <= numB;
    const winB = higherIsBetter ? numB > numA  : numB < numA;
    return (
      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
        <td style={{ padding: '8px 10px', fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</td>
        <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, textAlign: 'center',
          color: winA ? C.green : C.text,
          background: winA ? '#dcfce7' : 'transparent' }}>{typeof valA === 'number' ? valA : (valA || '—')}</td>
        <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, textAlign: 'center',
          color: winB ? C.green : C.text,
          background: winB ? '#dcfce7' : 'transparent' }}>{typeof valB === 'number' ? valB : (valB || '—')}</td>
      </tr>
    );
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 14 }}>⚡ Compare Two Sessions</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>Session A</div>
          <select value={idA} onChange={e => setIdA(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.card }}>
            {sessions.map(s => <option key={s.sessionId} value={s.sessionId}>{fmtDate(s.startedAt)} · {s.speakerCount} speakers</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>Session B</div>
          <select value={idB} onChange={e => setIdB(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, color: C.text, background: C.card }}>
            {sessions.map(s => <option key={s.sessionId} value={s.sessionId}>{fmtDate(s.startedAt)} · {s.speakerCount} speakers</option>)}
          </select>
        </div>
        <button onClick={load} disabled={loading || !idA || !idB || idA === idB}
          style={{ padding: '7px 16px', borderRadius: 7, border: 'none',
            background: idA && idB && idA !== idB ? C.blue : C.border,
            color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          {loading ? '⏳' : 'Compare →'}
        </button>
      </div>
      {sA && sB && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: C.muted }}>Metric</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.blue }}>{fmtDate(sA.startedAt)}</th>
                <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.indigo }}>{fmtDate(sB.startedAt)}</th>
              </tr>
            </thead>
            <tbody>
              {metric('Speakers', sA.speakers?.length || 0, sB.speakers?.length || 0)}
              {metric('Questions', sA.preQuestions?.length || 0, sB.preQuestions?.length || 0)}
              {metric('Polls', sA.polls?.length || 0, sB.polls?.length || 0)}
              {metric('Avg speak time (s)',
                sA.speakers?.length ? Math.round(sA.speakers.reduce((t,s)=>t+(s.durationSec||0),0)/sA.speakers.length) : 0,
                sB.speakers?.length ? Math.round(sB.speakers.reduce((t,s)=>t+(s.durationSec||0),0)/sB.speakers.length) : 0,
                false)}
              {metric('Top Q votes',
                Math.max(0, ...(sA.preQuestions||[]).map(q=>q.votes||0)),
                Math.max(0, ...(sB.preQuestions||[]).map(q=>q.votes||0)))}
              {metric('AI Sentiment', sA.aiSummary?.sentiment || '—', sB.aiSummary?.sentiment || '—', false)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sessions Page ─────────────────────────────────────────────────────────────
function SessionsPage({ token, onPublish }) {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/sessions`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(s => {
        const arr = Array.isArray(s) ? s : [];
        setSessions(arr);
        setLoading(false);
        if (arr.length > 0) loadDetail(arr[0].sessionId);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const loadDetail = (id) => {
    setDetailLoading(true);
    fetch(`${API_BASE}/api/sessions/${id}`)
      .then(r => r.json())
      .then(s => { setSelected(s); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 16, alignItems: 'start' }}>
      {/* Session list */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`,
          fontWeight: 700, fontSize: 13, color: C.text, display: 'flex', justifyContent: 'space-between' }}>
          <span>Past Sessions</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{sessions.length}</span>
        </div>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.muted, fontSize: 13 }}>⏳ Loading…</div>
        ) : sessions.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
            <div style={{ fontSize: 13, color: C.muted }}>No sessions saved yet.</div>
          </div>
        ) : (
          <div style={{ maxHeight: 620, overflowY: 'auto' }}>
            {sessions.map(s => (
              <button key={s.sessionId} onClick={() => loadDetail(s.sessionId)} style={{
                width: '100%', padding: '11px 14px', textAlign: 'left',
                border: 'none', borderBottom: `1px solid ${C.border}`,
                background: selected?.sessionId === s.sessionId ? C.blue + '0d' : C.card,
                borderLeft: selected?.sessionId === s.sessionId ? `3px solid ${C.blue}` : '3px solid transparent',
                cursor: 'pointer', transition: 'background .15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{fmtDate(s.startedAt)}</div>
                  {s.hasSummary && <span style={{ fontSize: 10 }}>🤖</span>}
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{fmtTime(s.startedAt)} · Room {s.roomId}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: C.blue + '18', color: C.blue }}>
                    👤 {s.speakerCount}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: C.amber + '18', color: C.amber }}>
                    ❓ {s.questionCount}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail / Compare panel */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Toggle bar */}
        {sessions.length >= 2 && (
          <div style={{ display: 'flex', gap: 2, background: C.light, borderRadius: 9, padding: 3, width: 'fit-content' }}>
            {[['detail','📋 Detail'], ['compare','⚡ Compare']].map(([id, label]) => (
              <button key={id} onClick={() => setShowCompare(id === 'compare')} style={{
                padding: '5px 14px', fontSize: 12, fontWeight: 600, borderRadius: 7, border: 'none', cursor: 'pointer',
                background: (id === 'compare') === showCompare ? '#fff' : 'transparent',
                color: (id === 'compare') === showCompare ? C.blue : C.muted,
                boxShadow: (id === 'compare') === showCompare ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
              }}>{label}</button>
            ))}
          </div>
        )}

        {showCompare ? (
          <SessionCompare sessions={sessions} token={token} />
        ) : detailLoading ? (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, textAlign: 'center', color: C.muted }}>
            ⏳ Loading session…
          </div>
        ) : selected ? (
          <SessionDetail session={selected} token={token} onPublish={onPublish} />
        ) : (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>👈</div>
            Select a session from the list
          </div>
        )}
      </div>
    </div>
  );
}

// ── Publish Page ──────────────────────────────────────────────────────────────
function PublishPage({ token, sessions, preloadSession }) {
  const [selectedId, setSelectedId] = useState(preloadSession?.sessionId || (sessions[0]?.sessionId ?? ''));
  const [session, setSession] = useState(preloadSession || null);
  const [loadingSession, setLoadingSession] = useState(false);
  const [slackUrl, setSlackUrl] = useState('');
  const [teamsUrl, setTeamsUrl] = useState('');
  const [statuses, setStatuses] = useState({});

  useEffect(() => {
    if (preloadSession) { setSelectedId(preloadSession.sessionId); setSession(preloadSession); }
  }, [preloadSession?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSession = (id) => {
    if (!id) return;
    setLoadingSession(true);
    fetch(`${API_BASE}/api/sessions/${id}`)
      .then(r => r.json())
      .then(s => { setSession(s); setLoadingSession(false); })
      .catch(() => setLoadingSession(false));
  };

  useEffect(() => {
    if (selectedId && !preloadSession) loadSession(selectedId);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const buildMessage = (fmt = 'text') => {
    if (!session) return '';
    const ai = session.aiSummary;
    const date = fmtDate(session.startedAt);
    const url = `${window.location.origin}${window.location.pathname}?session=${session.sessionId}`;
    const topQ = [...(session.preQuestions || [])].sort((a, b) => (b.votes || 0) - (a.votes || 0)).slice(0, 3);

    if (fmt === 'slack') {
      const parts = [
        `*📋 Session Summary — ${date}*`,
        ai?.overview ? `\n${ai.overview}` : '',
        ai?.dominantThemes?.length ? `\n🎯 *Themes:* ${ai.dominantThemes.join(' · ')}` : '',
        topQ.length ? `\n❓ *Top Questions:*\n${topQ.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}` : '',
        `\n🎤 ${session.speakers?.length || 0} speakers · ${session.preQuestions?.length || 0} questions`,
        `\n🔗 <${url}|View full summary>`,
      ];
      return parts.filter(Boolean).join('');
    }

    if (fmt === 'teams') {
      return {
        type: 'message',
        attachments: [{
          contentType: 'application/vnd.microsoft.card.adaptive',
          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
            type: 'AdaptiveCard', version: '1.4',
            body: [
              { type: 'TextBlock', size: 'Large', weight: 'Bolder', text: `📋 Session Summary — ${date}` },
              ai?.overview ? { type: 'TextBlock', text: ai.overview, wrap: true } : null,
              ai?.dominantThemes?.length ? { type: 'TextBlock', text: `🎯 Themes: ${ai.dominantThemes.join(' · ')}`, wrap: true } : null,
              topQ.length ? {
                type: 'TextBlock', wrap: true,
                text: `❓ Top Questions:\n${topQ.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}`,
              } : null,
              { type: 'TextBlock', text: `🎤 ${session.speakers?.length || 0} speakers · ${session.preQuestions?.length || 0} questions`, isSubtle: true },
            ].filter(Boolean),
            actions: [{ type: 'Action.OpenUrl', title: 'View Full Summary', url }],
          },
        }],
      };
    }

    if (fmt === 'linkedin') {
      const parts = [
        `📋 Session Highlights — ${date}`,
        '',
        ai?.overview || 'A productive session with great audience engagement.',
        '',
        ai?.dominantThemes?.length ? `Key themes explored: ${ai.dominantThemes.join(', ')}` : '',
        '',
        topQ.length ? `Top questions raised:\n${topQ.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}` : '',
        '',
        `🎤 ${session.speakers?.length || 0} speakers | ❓ ${session.preQuestions?.length || 0} audience questions`,
        '',
        `Full summary: ${url}`,
        '',
        '#AudienceEngagement #PublicSpeaking #EventSummary',
      ];
      return parts.filter(s => s !== undefined).join('\n');
    }

    // plain text
    return [
      `Session Summary — ${date}`,
      ai?.overview || '',
      ai?.dominantThemes?.length ? `Themes: ${ai.dominantThemes.join(', ')}` : '',
      topQ.length ? `Top Questions:\n${topQ.map((q, i) => `${i + 1}. ${q.text}`).join('\n')}` : '',
      `Speakers: ${session.speakers?.length || 0} | Questions: ${session.preQuestions?.length || 0}`,
      `Full summary: ${url}`,
    ].filter(Boolean).join('\n\n');
  };

  const setStatus = (channel, msg, ok = true) => {
    setStatuses(s => ({ ...s, [channel]: { msg, ok } }));
    setTimeout(() => setStatuses(s => { const n = { ...s }; delete n[channel]; return n; }), 5000);
  };

  const sendSlack = async () => {
    if (!slackUrl) return setStatus('slack', 'Enter a Slack webhook URL first', false);
    try {
      const r = await fetch(`${API_BASE}/api/sessions/${session.sessionId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel: 'slack', webhookUrl: slackUrl, message: buildMessage('slack') }),
      });
      const d = await r.json();
      setStatus('slack', d.ok ? '✅ Posted to Slack!' : `❌ ${d.error || 'Failed'}`, d.ok);
    } catch { setStatus('slack', '❌ Network error', false); }
  };

  const sendTeams = async () => {
    if (!teamsUrl) return setStatus('teams', 'Enter a Teams webhook URL first', false);
    try {
      const payload = buildMessage('teams');
      const r = await fetch(`${API_BASE}/api/sessions/${session.sessionId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel: 'teams', webhookUrl: teamsUrl, payload }),
      });
      const d = await r.json();
      setStatus('teams', d.ok ? '✅ Posted to Teams!' : `❌ ${d.error || 'Failed'}`, d.ok);
    } catch { setStatus('teams', '❌ Network error', false); }
  };

  const copyToClipboard = (text, channel) => {
    navigator.clipboard.writeText(text).then(() => setStatus(channel, '✅ Copied to clipboard!'));
  };

  const openEmail = () => {
    const text = buildMessage('text');
    const subject = encodeURIComponent(`Session Summary — ${fmtDate(session?.startedAt)}`);
    const body = encodeURIComponent(text);
    window.open(`mailto:?subject=${subject}&body=${body}`);
    setStatus('email', '✅ Email composer opened');
  };

  const openPrint = () => {
    const url = `${window.location.origin}${window.location.pathname}?session=${session?.sessionId}&print=1`;
    window.open(url, '_blank');
    setStatus('pdf', '✅ Opened print view');
  };

  const publicUrl = session ? `${window.location.origin}${window.location.pathname}?session=${session.sessionId}` : '';

  const ChannelCard = ({ id, icon, title, desc, action, children }) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 26, lineHeight: 1 }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{title}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{desc}</div>
        </div>
      </div>
      {children}
      {statuses[id] && (
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600,
          color: statuses[id].ok ? C.green : C.red }}>
          {statuses[id].msg}
        </div>
      )}
      {action && (
        <button onClick={action.fn} style={{
          marginTop: 12, padding: '8px 16px', borderRadius: 8, border: 'none',
          background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700,
          cursor: 'pointer', width: '100%',
        }}>{action.label}</button>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Session picker */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 10 }}>📋 Select Session to Publish</div>
        <select value={selectedId} onChange={e => { setSelectedId(e.target.value); loadSession(e.target.value); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
            fontSize: 13, color: C.text, background: C.card, width: '100%', maxWidth: 400 }}>
          {sessions.map(s => (
            <option key={s.sessionId} value={s.sessionId}>
              {fmtDate(s.startedAt)} · {fmtTime(s.startedAt)} — {s.speakerCount} speakers
            </option>
          ))}
        </select>
        {loadingSession && <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Loading session…</div>}
        {session && !loadingSession && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: C.light, borderRadius: 10,
            fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            {session.aiSummary?.overview
              ? <>📝 {session.aiSummary.overview.slice(0, 200)}{session.aiSummary.overview.length > 200 ? '…' : ''}</>
              : '⚠️ No AI summary yet. Go to Sessions tab to generate one first for richer publish content.'}
          </div>
        )}
      </div>

      {/* Channel cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>

        {/* Email */}
        <ChannelCard id="email" icon="📧" title="Email" desc="Open your mail client with the summary pre-filled"
          action={{ label: '📧 Open Email Composer', fn: openEmail }} />

        {/* Slack */}
        <ChannelCard id="slack" icon="💬" title="Slack" desc="Post to any Slack channel via incoming webhook">
          <input value={slackUrl} onChange={e => setSlackUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
              fontSize: 12, color: C.text, background: C.bg, boxSizing: 'border-box' }} />
          <button onClick={sendSlack} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#4A154B', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
            Send to Slack
          </button>
        </ChannelCard>

        {/* Teams */}
        <ChannelCard id="teams" icon="💼" title="Microsoft Teams" desc="Post an Adaptive Card to a Teams channel">
          <input value={teamsUrl} onChange={e => setTeamsUrl(e.target.value)} placeholder="https://outlook.office.com/webhook/…"
            style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
              fontSize: 12, color: C.text, background: C.bg, boxSizing: 'border-box' }} />
          <button onClick={sendTeams} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#6264A7', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%' }}>
            Send to Teams
          </button>
        </ChannelCard>

        {/* LinkedIn */}
        <ChannelCard id="linkedin" icon="🔵" title="LinkedIn Post" desc="Copy a formatted post ready to paste on LinkedIn"
          action={{ label: '📋 Copy LinkedIn Post', fn: () => copyToClipboard(buildMessage('linkedin'), 'linkedin') }} />

        {/* Notion */}
        <ChannelCard id="notion" icon="📓" title="Notion" desc="Copy formatted Markdown — paste directly into any Notion page"
          action={{ label: '📋 Copy for Notion', fn: () => {
            if (!session) return setStatus('notion', 'Select a session first', false);
            const ai = session.aiSummary;
            const topQ = [...(session.preQuestions||[])].sort((a,b)=>(b.votes||0)-(a.votes||0)).slice(0,5);
            const parts = [
              `# Session Summary — ${fmtDate(session.startedAt)}`,
              '',
              ai?.overview ? `## Overview\n${ai.overview}` : '',
              ai?.dominantThemes?.length ? `## Themes\n${ai.dominantThemes.map(t=>`- ${t}`).join('\n')}` : '',
              topQ.length ? `## Top Questions\n${topQ.map((q,i)=>`${i+1}. **${q.text}** *(${q.votes||0} votes)*\n   — ${q.name||'Anonymous'}, ${q.section||'—'}`).join('\n')}` : '',
              session.speakers?.length ? `## Speakers\n${session.speakers.map((s,i)=>`${i+1}. ${s.name||'Anonymous'} — ${fmtDur(s.durationSec)}${s.topic ? ` · "${s.topic}"` : ''}`).join('\n')}` : '',
              ai?.factCheckFlags?.length ? `## Fact-Check Flags\n${ai.factCheckFlags.map(f=>`- ⚠️ "${f.claim}" — ${f.reason}`).join('\n')}` : '',
              `---\n🔗 [View full summary](${window.location.origin}${window.location.pathname}?session=${session.sessionId})`,
            ].filter(Boolean).join('\n\n');
            navigator.clipboard.writeText(parts).then(()=>setStatus('notion','✅ Copied! Paste into Notion',true)).catch(()=>setStatus('notion','❌ Copy failed',false));
          }}} />

        {/* Public link */}
        <ChannelCard id="link" icon="🌐" title="Shareable Public Link" desc="A read-only summary page — share with anyone, no login needed">
          <div style={{ padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.border}`,
            fontSize: 11, color: C.muted, background: C.bg, wordBreak: 'break-all', marginBottom: 10 }}>
            {publicUrl || 'Select a session above'}
          </div>
          <button onClick={() => copyToClipboard(publicUrl, 'link')} disabled={!publicUrl}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none',
              background: publicUrl ? C.blue : C.muted, color: '#fff',
              fontSize: 12, fontWeight: 700, cursor: publicUrl ? 'pointer' : 'not-allowed', width: '100%' }}>
            🔗 Copy Link
          </button>
          {statuses['link'] && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: C.green }}>{statuses['link'].msg}</div>}
        </ChannelCard>

        {/* PDF */}
        <ChannelCard id="pdf" icon="📄" title="PDF Report" desc="Open the public summary page — use browser Print → Save as PDF"
          action={{ label: '🖨️ Open Print View', fn: openPrint }} />
      </div>
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────
function SettingsPage({ auth, onLogout }) {

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 14 }}>🏢 Workspace</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted, width: 120, flexShrink: 0 }}>Workspace ID</span>
            <code style={{ fontSize: 12, background: C.light, padding: '4px 8px', borderRadius: 6, color: C.text }}>
              {auth.workspaceId}
            </code>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted, width: 120, flexShrink: 0 }}>Workspace Name</span>
            <code style={{ fontSize: 12, background: C.light, padding: '4px 8px', borderRadius: 6, color: C.text }}>
              {auth.workspaceName}
            </code>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted, width: 120, flexShrink: 0 }}>Projector Mode</span>
            <a href={`${window.location.pathname}?mode=projector&room=main`} target="_blank" rel="noreferrer"
              style={{ fontSize: 12, color: C.blue, fontWeight: 600 }}>
              Open Projector ↗
            </a>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.muted, width: 120, flexShrink: 0 }}>Main App</span>
            <a href={window.location.pathname} style={{ fontSize: 12, color: C.blue, fontWeight: 600 }}>
              Back to Main ↩
            </a>
          </div>
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 6 }}>⚙️ Live Session Settings</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
          These settings apply during a live session and can also be changed in the Moderator tab.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: C.text, lineHeight: 1.7 }}>
          <div>• Room passcode — set in the Moderator panel ⚙️ Settings</div>
          <div>• Auto-advance speaker time — set in the Moderator panel</div>
          <div>• Content pre-screening — toggle in the Moderator panel</div>
          <div>• Webhook events — configure in the Moderator panel</div>
        </div>
      </div>

      <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.red, marginBottom: 8 }}>🚪 Sign Out</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          You will be returned to the main audience view.
        </div>
        <button onClick={onLogout} style={{
          padding: '8px 18px', borderRadius: 8, border: 'none',
          background: C.red, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>Sign out of {auth.workspaceName}</button>
      </div>

    </div>
  );
}

// ── Sidebar Nav ───────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',  icon: '📊', label: 'Overview' },
  { id: 'sessions',  icon: '🗂️', label: 'Sessions' },
  { id: 'publish',   icon: '📤', label: 'Publish' },
  { id: 'settings',  icon: '⚙️', label: 'Settings' },
];

// ── Root AdminDashboard ───────────────────────────────────────────────────────
export default function AdminDashboard({ auth, onLogin, onLogout }) {
  const [page, setPage] = useState('overview');
  const [sessions, setSessions] = useState([]);
  const [publishSession, setPublishSession] = useState(null);

  // Load sessions for Publish dropdown (only when authenticated)
  useEffect(() => {
    if (!auth?.token) return;
    fetch(`${API_BASE}/api/sessions`, { headers: { Authorization: `Bearer ${auth.token}` } })
      .then(r => r.json())
      .then(s => setSessions(Array.isArray(s) ? s : []))
      .catch(() => {});
  }, [auth?.token]);

  // If not authenticated, show Login inline
  if (!auth) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column',
        fontFamily: 'Inter,-apple-system,sans-serif' }}>
        <div style={{ background: C.sidebar, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg,#2563eb,#38bdf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎤</div>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#f8fafc' }}>AudienceQ</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>Admin Dashboard</span>
          <span style={{ marginLeft: 'auto' }}>
            <a href={window.location.pathname} style={{ fontSize: 11, color: '#64748b', textDecoration: 'none' }}>← Back to main</a>
          </span>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Login onLogin={onLogin} />
        </div>
      </div>
    );
  }

  const handlePublish = (session) => {
    setPublishSession(session);
    setPage('publish');
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      background: C.bg,
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 99px; }
      `}</style>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside style={{
          width: 220, flexShrink: 0, background: C.sidebar,
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${C.sidebarBorder}`,
          position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
        }}>
          {/* Logo */}
          <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9,
                background: 'linear-gradient(135deg,#2563eb,#38bdf8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🎤</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#f8fafc' }}>AudienceQ</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>Admin Dashboard</div>
              </div>
            </div>
            {/* Workspace badge */}
            <div style={{ marginTop: 12, padding: '6px 10px', background: '#1e293b', borderRadius: 8,
              fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
              🏢 {auth.workspaceName}
            </div>
          </div>

          {/* Nav items */}
          <nav style={{ padding: '10px 8px' }}>
            {NAV.map(({ id, icon, label }) => {
              const active = page === id;
              return (
                <button key={id} onClick={() => setPage(id)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: active ? '#1d4ed8' : 'transparent',
                  color: active ? '#fff' : '#94a3b8',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  marginBottom: 2, transition: 'all .15s',
                  textAlign: 'left',
                }}>
                  <span style={{ fontSize: 15 }}>{icon}</span>
                  {label}
                </button>
              );
            })}
          </nav>

          {/* ── Divider ── */}
          <div style={{ margin: '4px 16px', borderTop: '1px solid #1e293b' }} />

          {/* ── Quick Access ── */}
          <div style={{ padding: '12px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#475569', letterSpacing: '.07em',
              padding: '0 8px', marginBottom: 8 }}>QUICK ACCESS</div>
            {[
              { label: 'Audience View',   icon: '🪑', href: '/?mode=app' },
              { label: 'Moderator',       icon: '🎙️', href: '/?mode=app' },
              { label: 'Projector Mode',  icon: '📽️', href: '/?mode=projector' },
              { label: 'Join by Code',    icon: '🔑', href: '/?mode=join' },
            ].map(({ label, icon, href }) => (
              <a key={label} href={href} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
                borderRadius: 8, textDecoration: 'none', color: '#64748b',
                fontSize: 12, fontWeight: 500, marginBottom: 2,
                transition: 'background .15s, color .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1e293b'; e.currentTarget.style.color = '#e2e8f0'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}>
                <span style={{ fontSize: 13 }}>{icon}</span>{label}
              </a>
            ))}
          </div>

          {/* ── Divider ── */}
          <div style={{ margin: '4px 16px', borderTop: '1px solid #1e293b' }} />

          {/* ── Live status card ── */}
          <div style={{ padding: '12px 12px', flex: 1 }}>
            <div style={{ background: '#0f172a', borderRadius: 10, padding: '12px 14px',
              border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981',
                  display: 'inline-block', boxShadow: '0 0 6px #10b981' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>SERVER ONLINE</span>
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginBottom: 6, fontWeight: 600, letterSpacing: '.05em' }}>
                WORKSPACE
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 10,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {auth.workspaceName}
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginBottom: 4, fontWeight: 600, letterSpacing: '.05em' }}>
                MODERATOR
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {auth.workspaceId}
              </div>
              <a href="/?mode=app" style={{
                display: 'block', textAlign: 'center', padding: '6px 0',
                background: '#1d4ed8', borderRadius: 7, fontSize: 11, fontWeight: 700,
                color: '#fff', textDecoration: 'none',
              }}>
                Open Live App ↗
              </a>
            </div>
          </div>

          {/* Bottom links */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b' }}>
            <a href={window.location.pathname}
              style={{ display: 'block', fontSize: 12, color: '#64748b', textDecoration: 'none',
                padding: '6px 0', fontWeight: 500 }}>
              ← Back to main app
            </a>
            <button onClick={onLogout} style={{
              marginTop: 6, width: '100%', padding: '7px 10px', borderRadius: 8,
              border: '1px solid #334155', background: 'transparent',
              color: '#ef4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
            }}>Sign out ↩</button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, overflow: 'auto', padding: '28px 28px 60px', minWidth: 0 }}>
          {/* Page header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>
              {NAV.find(n => n.id === page)?.icon} {NAV.find(n => n.id === page)?.label}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
              {{
                overview: 'Aggregate metrics and trends across all sessions',
                sessions: 'Browse session history, AI summaries, speaker timelines, and polls',
                publish: 'Share the meeting crux to email, Slack, Teams, LinkedIn, or as a public link',
                settings: 'Workspace configuration and links',
              }[page]}
            </div>
          </div>

          {/* Page content */}
          {page === 'overview'  && <OverviewPage token={auth.token} />}
          {page === 'sessions'  && <SessionsPage token={auth.token} onPublish={handlePublish} />}
          {page === 'publish'   && <PublishPage token={auth.token} sessions={sessions} preloadSession={publishSession} />}
          {page === 'settings'  && <SettingsPage auth={auth} onLogout={onLogout} />}
        </main>
      </div>
    </div>
  );
}
