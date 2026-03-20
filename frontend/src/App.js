import React, { useState, useEffect } from 'react';
import AudienceView from './components/AudienceView';
import ModeratorDashboard from './ModeratorDashboard';
import Login from './Login';
import ProjectorMode from './ProjectorMode';
import AdminDashboard from './AdminDashboard';
import JoinPage from './JoinPage';
import LandingPage from './LandingPage';
import './App.css';

// ── Parse URL params once ─────────────────────────────────────────────────────
const params        = new URLSearchParams(window.location.search);
const URL_SECTION   = params.get('section');
const URL_SESSION   = params.get('session');    // public summary link
const URL_WORKSPACE = params.get('ws') || 'default';
const URL_MODE      = params.get('mode');       // 'projector' | 'join' | 'admin' | 'app'
const URL_ROOM      = params.get('room');       // null means "not set"

// ── Public session summary (shareable, no auth) ───────────────────────────────
function PublicSummary({ sessionId }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied,  setCopied]  = useState(false);

  const C = {
    blue:'#2563eb', text:'#1e293b', muted:'#64748b', border:'#e2e8f0',
    card:'#fff', light:'#f1f5f9', green:'#10b981', amber:'#f59e0b',
  };

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then(r => r.json())
      .then(s => { setSession(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId]);

  const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : '—';
  const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : '';
  const fmtDur  = s   => { const m = Math.floor((s||0)/60); return m > 0 ? `${m}m ${(s||0)%60}s` : `${s||0}s`; };
  const copyLink = () => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc',
      fontFamily:'Inter,-apple-system,sans-serif' }}>
      <div style={{ textAlign:'center', color: C.muted }}>
        <div style={{ fontSize:40, marginBottom:12 }}>⏳</div>
        Loading session…
      </div>
    </div>
  );

  if (!session || session.error) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc',
      fontFamily:'Inter,-apple-system,sans-serif' }}>
      <div style={{ textAlign:'center', color: C.muted }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🔍</div>
        <div style={{ fontSize:18, fontWeight:700, color: C.text, marginBottom:8 }}>Session not found</div>
        <div style={{ fontSize:13 }}>This link may be invalid or the session was not saved.</div>
      </div>
    </div>
  );

  const ai = session.aiSummary;
  const topQ = [...(session.preQuestions||[])].sort((a,b)=>(b.votes||0)-(a.votes||0)).slice(0,10);

  return (
    <div style={{ background:'#f8fafc', minHeight:'100vh', fontFamily:'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <style>{'*, *::before, *::after { box-sizing: border-box; margin:0; padding:0; }'}</style>

      {/* Nav bar */}
      <div style={{ background:'#fff', borderBottom:`1px solid ${C.border}`, padding:'0 20px', height:54,
        display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100,
        boxShadow:'0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:30, height:30, borderRadius:9, background:'linear-gradient(135deg,#2563eb,#38bdf8)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>🎤</div>
          <span style={{ fontWeight:800, fontSize:16, color: C.text }}>AudienceQ</span>
          <span style={{ fontSize:11, color: C.muted, padding:'2px 8px', background: C.light, borderRadius:99, border:`1px solid ${C.border}` }}>
            Session Summary
          </span>
        </div>
        <button onClick={copyLink} style={{ padding:'6px 12px', fontSize:12, borderRadius:7,
          border:`1px solid ${C.border}`, background: C.card, cursor:'pointer', fontWeight:600, color: C.muted }}>
          {copied ? '✅ Copied!' : '🔗 Share'}
        </button>
      </div>

      <div style={{ maxWidth:780, margin:'0 auto', padding:'28px 16px 60px', display:'flex', flexDirection:'column', gap:16 }}>
        {/* Hero */}
        <div style={{ background:'linear-gradient(135deg,#2563eb,#38bdf8)', borderRadius:16, padding:'24px 28px', color:'#fff' }}>
          <div style={{ fontSize:11, opacity:.8, fontWeight:600, marginBottom:4 }}>📋 SESSION SUMMARY</div>
          <div style={{ fontSize:22, fontWeight:800, marginBottom:8 }}>{fmtDate(session.startedAt)}</div>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:13, opacity:.9 }}>
            <span>🕐 {fmtTime(session.startedAt)} – {fmtTime(session.endedAt)}</span>
            <span>🎤 {session.speakers?.length||0} speakers</span>
            <span>❓ {session.preQuestions?.length||0} questions</span>
            <span>📊 {session.polls?.length||0} polls</span>
          </div>
        </div>

        {/* AI Analysis */}
        {ai && (
          <div style={{ background: C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'20px 22px' }}>
            <div style={{ fontWeight:800, fontSize:15, color: C.text, marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              🤖 AI Analysis
              {ai.sentiment && (
                <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, fontWeight:700,
                  background: ai.sentiment==='positive'?'#dcfce7':ai.sentiment==='tense'?'#fee2e2':'#fef9c3',
                  color: ai.sentiment==='positive'?'#16a34a':ai.sentiment==='tense'?'#dc2626':'#ca8a04' }}>
                  {ai.sentiment}
                </span>
              )}
            </div>
            {ai.overview && <p style={{ fontSize:14, color: C.text, lineHeight:1.7, marginBottom:14 }}>{ai.overview}</p>}
            {ai.dominantThemes?.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color: C.muted, marginBottom:6, letterSpacing:'.05em' }}>THEMES</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {ai.dominantThemes.map((t,i) => (
                    <span key={i} style={{ fontSize:12, fontWeight:600, padding:'4px 10px', borderRadius:99,
                      background:'#ede9fe', color:'#7c3aed', border:'1px solid #c4b5fd' }}>{t}</span>
                  ))}
                </div>
              </div>
            )}
            {ai.keyQuestions?.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color: C.muted, marginBottom:6, letterSpacing:'.05em' }}>KEY QUESTIONS</div>
                <ul style={{ paddingLeft:16, display:'flex', flexDirection:'column', gap:4 }}>
                  {ai.keyQuestions.map((q,i) => <li key={i} style={{ fontSize:13, color: C.text, lineHeight:1.6 }}>{q}</li>)}
                </ul>
              </div>
            )}
            {ai.factCheckFlags?.length > 0 && (
              <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#c2410c', marginBottom:8, letterSpacing:'.05em' }}>⚠️ FACT-CHECK FLAGS</div>
                {ai.factCheckFlags.map((f,i) => (
                  <div key={i} style={{ marginBottom:6 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#7c2d12' }}>"{f.claim}"</div>
                    <div style={{ fontSize:12, color:'#9a3412' }}>{f.reason}</div>
                  </div>
                ))}
              </div>
            )}
            {ai.recommendations?.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color: C.muted, marginBottom:6, letterSpacing:'.05em' }}>RECOMMENDATIONS</div>
                <ul style={{ paddingLeft:16, display:'flex', flexDirection:'column', gap:4 }}>
                  {ai.recommendations.map((r,i) => <li key={i} style={{ fontSize:13, color: C.text, lineHeight:1.6 }}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Top questions */}
        {topQ.length > 0 && (
          <div style={{ background: C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontWeight:700, fontSize:14, color: C.text, marginBottom:12 }}>❓ Top Questions</div>
            {topQ.map((q,i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'9px 0',
                borderBottom: i<topQ.length-1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ minWidth:34, height:34, borderRadius:8, background:'#fef3c7',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, fontWeight:800, color: C.amber, flexShrink:0 }}>▲{q.votes||0}</div>
                <div>
                  <div style={{ fontSize:13, color: C.text, lineHeight:1.5 }}>{q.text}</div>
                  <div style={{ fontSize:11, color: C.muted, marginTop:2 }}>{q.name||'Anonymous'} · {q.section||'—'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Speakers */}
        {session.speakers?.length > 0 && (
          <div style={{ background: C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontWeight:700, fontSize:14, color: C.text, marginBottom:12 }}>🎤 Speakers</div>
            {session.speakers.map((sp,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0',
                borderBottom: i<session.speakers.length-1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ width:28, height:28, borderRadius:7, background:'#dbeafe',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:11, fontWeight:800, color: C.blue, flexShrink:0 }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color: C.text }}>{sp.name||'Anonymous'}</div>
                  <div style={{ fontSize:11, color: C.muted }}>{sp.section||'—'}{sp.topic ? ` · "${sp.topic}"` : ''}</div>
                </div>
                <div style={{ fontSize:11, fontWeight:700, color: C.green,
                  background:'#dcfce7', padding:'3px 8px', borderRadius:99 }}>{fmtDur(sp.durationSec)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,  setTab]  = useState(URL_SECTION ? 'audience' : 'audience');
  const [auth, setAuth] = useState(null); // { token, workspaceId, workspaceName }

  // Restore session from storage and validate with server
  useEffect(() => {
    const token  = sessionStorage.getItem('mod_token');
    const wsId   = sessionStorage.getItem('mod_ws');
    const wsName = sessionStorage.getItem('mod_name');
    if (!token || !wsId) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setAuth({ token, workspaceId: d.workspaceId, workspaceName: d.workspaceName || wsName }))
      .catch(() => {
        sessionStorage.removeItem('mod_token');
        sessionStorage.removeItem('mod_ws');
        sessionStorage.removeItem('mod_name');
      });
  }, []);

  const handleLogin = (d) => setAuth(d);

  const handleLogout = async () => {
    if (auth?.token) {
      fetch('/api/auth/logout', { method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` } }).catch(() => {});
    }
    ['mod_token','mod_ws','mod_name'].forEach(k => sessionStorage.removeItem(k));
    setAuth(null);
    setTab('audience');
  };

  // ── Projector / second-screen route ────────────────────────────────────
  if (URL_MODE === 'projector') return <ProjectorMode roomId={URL_ROOM || 'main'} />;

  // ── Join-by-code route (?mode=join) ────────────────────────────────────
  if (URL_MODE === 'join') return <JoinPage />;

  // ── Admin dashboard route (separate from main app) ──────────────────────
  if (URL_MODE === 'admin') return <AdminDashboard auth={auth} onLogin={handleLogin} onLogout={handleLogout} />;

  // ── Shareable session summary route ────────────────────────────────────
  if (URL_SESSION) return <PublicSummary sessionId={URL_SESSION} />;

  // ── Landing page: shown when no meaningful params are set ───────────────
  if (!URL_MODE && !URL_ROOM && !URL_SECTION && !URL_SESSION) return <LandingPage />;

  // ── App route: ?mode=app or any other param combo falls through here ────

  const tabDefs = [
    { id: 'audience',  label: 'Audience',  emoji: '🪑' },
    { id: 'moderator', label: 'Moderator', emoji: '🎙️' },
  ];
  const protected_ = new Set(['moderator']);

  return (
    <div style={{
      minHeight: '100dvh', background: '#f8fafc',
      fontFamily: 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f8fafc; }
        input, select, textarea, button { font-family: inherit; }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        background: '#ffffff', borderBottom: '1px solid #e2e8f0',
        padding: '0 20px', height: 54,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 200,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 9,
            background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
          }}>🎤</div>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#1e293b', letterSpacing: '-0.02em' }}>
            AudienceQ
          </span>
          {auth && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#64748b',
              padding: '2px 8px', background: '#f1f5f9',
              borderRadius: 99, border: '1px solid #e2e8f0',
            }}>🏢 {auth.workspaceName}</span>
          )}
        </div>

        {/* Tabs */}
        <nav style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 9, padding: 3 }}>
          {tabDefs.map(({ id, label, emoji }) => {
            const active = tab === id;
            const locked = protected_.has(id) && !auth;
            return (
              <button key={id} type="button" onClick={() => setTab(id)} style={{
                padding: '6px 14px', fontSize: 13,
                fontWeight: active ? 600 : 500, border: 'none', borderRadius: 7, cursor: 'pointer',
                background: active ? '#ffffff' : 'transparent',
                color: active ? '#2563eb' : locked ? '#94a3b8' : '#64748b',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontSize: 11 }}>{emoji}</span>
                {label}
                {locked && <span style={{ fontSize: 9 }}>🔒</span>}
              </button>
            );
          })}
        </nav>

        {/* Right side */}
        {auth ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a href="/?mode=admin" style={{
              fontSize: 11, fontWeight: 700, color: '#2563eb',
              padding: '5px 10px', border: '1px solid #bfdbfe',
              borderRadius: 7, background: '#eff6ff', textDecoration: 'none',
            }}>📊 Dashboard ↗</a>
            <button onClick={handleLogout} style={{
              fontSize: 11, fontWeight: 600, color: '#64748b',
              padding: '5px 10px', border: '1px solid #e2e8f0',
              borderRadius: 7, background: '#fff', cursor: 'pointer',
            }}>Sign out ↩</button>
          </div>
        ) : (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', letterSpacing: '0.03em' }}>
            Live Session
          </div>
        )}
      </header>

      {/* ── Content ── */}
      <div style={{ animation: 'fadeSlideUp .25s ease both' }} key={tab}>
        {tab === 'audience' && <AudienceView workspaceId={URL_WORKSPACE} roomId={URL_ROOM || 'main'} />}

        {tab === 'moderator' && (
          auth
            ? <ModeratorDashboard auth={auth} />
            : <Login onLogin={handleLogin} />
        )}

      </div>
    </div>
  );
}
