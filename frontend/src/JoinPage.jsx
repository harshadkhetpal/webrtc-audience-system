import React, { useState, useRef, useEffect } from 'react';

const API_BASE = process.env.REACT_APP_BACKEND_URL || '';

export default function JoinPage() {
  const [code,    setCode]    = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleChange = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(val);
    setError('');
  };

  const handleJoin = async () => {
    if (code.length < 4) { setError('Enter your 6-character join code'); return; }
    setLoading(true);
    setError('');
    try {
      const res  = await fetch(`${API_BASE}/api/join/${code}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Invalid code — ask your moderator'); setLoading(false); return; }
      // Redirect to audience view with the room ID
      window.location.href = `/?room=${encodeURIComponent(data.roomId)}`;
    } catch {
      setError('Could not reach the server. Check your connection.');
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') handleJoin(); };

  return (
    <div style={{
      minHeight: '100dvh', background: '#f8fafc',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px 16px',
      fontFamily: 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    }}>
      <style>{`
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .jc-input { font-size:32px; font-weight:900; letter-spacing:.22em; text-align:center;
          text-transform:uppercase; border:2.5px solid #e2e8f0; border-radius:14px;
          padding:14px 10px; width:100%; outline:none; color:#1e293b; background:#fff;
          caret-color:#2563eb; font-family:inherit; transition:border-color .15s; }
        .jc-input:focus { border-color:#2563eb; box-shadow:0 0 0 4px rgba(37,99,235,.1); }
        .jc-input::placeholder { color:#cbd5e1; letter-spacing:.1em; }
        .jc-btn { width:100%; padding:15px; font-size:16px; font-weight:700; border:none;
          border-radius:12px; cursor:pointer; transition:opacity .15s, transform .1s; }
        .jc-btn:active { transform:scale(.98); }
      `}</style>

      <div style={{ width:'100%', maxWidth:360, animation:'slideUp .35s ease' }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{
            width:56, height:56, borderRadius:16, margin:'0 auto 12px',
            background:'linear-gradient(135deg,#2563eb,#38bdf8)',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:28,
            boxShadow:'0 4px 16px rgba(37,99,235,.3)',
          }}>🎤</div>
          <div style={{ fontWeight:800, fontSize:22, color:'#1e293b', letterSpacing:'-.02em' }}>Join Session</div>
          <div style={{ fontSize:13, color:'#64748b', marginTop:4 }}>Enter the code shown by your moderator</div>
        </div>

        {/* Card */}
        <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px',
          boxShadow:'0 4px 24px rgba(0,0,0,.08)', border:'1px solid #e2e8f0' }}>

          <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', letterSpacing:'.08em', marginBottom:8 }}>
            JOIN CODE
          </div>

          <input
            ref={inputRef}
            className="jc-input"
            value={code}
            onChange={handleChange}
            onKeyDown={handleKey}
            placeholder="CONF42"
            maxLength={6}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />

          {/* Character dots */}
          <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:8 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                width:8, height:8, borderRadius:'50%', transition:'background .15s',
                background: i < code.length ? '#2563eb' : '#e2e8f0',
              }} />
            ))}
          </div>

          {error && (
            <div style={{ marginTop:12, padding:'10px 12px', background:'#fef2f2',
              borderRadius:9, border:'1px solid #fca5a5', fontSize:13, color:'#dc2626',
              fontWeight:600, textAlign:'center' }}>
              {error}
            </div>
          )}

          <button
            className="jc-btn"
            onClick={handleJoin}
            disabled={loading || code.length < 4}
            style={{
              marginTop:18,
              background: code.length >= 4 && !loading
                ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#e2e8f0',
              color: code.length >= 4 && !loading ? '#fff' : '#94a3b8',
              boxShadow: code.length >= 4 ? '0 4px 14px rgba(37,99,235,.3)' : 'none',
              opacity: loading ? .7 : 1,
            }}
          >
            {loading ? 'Joining…' : 'Join Session →'}
          </button>
        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:12, color:'#94a3b8' }}>
          No code? Ask your event moderator to display it on screen.
        </div>
      </div>
    </div>
  );
}
