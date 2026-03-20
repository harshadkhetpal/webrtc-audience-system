/**
 * ProjectorMode.jsx — Full-screen second-screen / projector display.
 * Open via: /?mode=projector&room=main
 * Shows: current speaker (BIG), queue preview, live reactions, word cloud,
 *        live poll results, countdown timer, transcript ticker.
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';

const getSocketUrl = () =>
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

function fmtTimer(s) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

const STOP_WORDS = new Set(['the','a','an','is','are','was','were','be','been','have','has','had','do','does','will','would','could','should','what','how','why','when','where','who','and','or','but','in','on','at','to','for','of','with','by','this','that','these','those']);

export default function ProjectorMode({ roomId = 'main' }) {
  const [queue,          setQueue]          = useState([]);
  const [currentSpeaker, setCurrentSpeaker] = useState(null);
  const [reactions,      setReactions]      = useState({ agree: 0, followup: 0, same: 0 });
  const [currentPoll,    setCurrentPoll]    = useState(null);
  const [preQuestions,   setPreQuestions]   = useState([]);
  const [transcript,     setTranscript]     = useState([]);
  const [speakerLimit,   setSpeakerLimit]   = useState(0);
  const [elapsed,        setElapsed]        = useState(0);
  const [tick,           setTick]           = useState(0);
  const [connected,      setConnected]      = useState(false);
  const [speakerStart,   setSpeakerStart]   = useState(null);

  const socketRef = useRef(null);

  // 1-second tick for timers
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (speakerStart) setElapsed(Math.floor((Date.now() - speakerStart) / 1000));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, speakerStart]);

  useEffect(() => {
    const socket = io(getSocketUrl(), {
      path: '/socket.io', reconnection: true, transports: ['polling', 'websocket'],
    });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('joinRoom', { roomId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('queueUpdate', (data) => {
      setQueue(data.queue || []);
      const spk = data.currentSpeaker || null;
      setCurrentSpeaker(prev => {
        if (spk?.id !== prev?.id) setSpeakerStart(spk ? Date.now() : null);
        return spk;
      });
      setReactions(data.reactions || { agree: 0, followup: 0, same: 0 });
      if (data.speakerTimeLimit) setSpeakerLimit(data.speakerTimeLimit);
      if (data.transcript)       setTranscript(data.transcript);
    });
    socket.on('pollUpdate',          (p)    => setCurrentPoll(p || null));
    socket.on('preQuestionsUpdate',  (d)    => setPreQuestions(d?.questions || []));
    socket.on('transcriptUpdate',    (d)    => setTranscript(d?.transcript || []));
    socket.on('timeLimitUpdate',     (d)    => setSpeakerLimit(d?.seconds || 0));
    return () => socket.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Word cloud from questions + transcript
  const wordCloud = useMemo(() => {
    const counts = {};
    [...preQuestions.map(q => q.text), ...transcript.map(t => t.text || '')].join(' ')
      .split(/\s+/)
      .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
      .forEach(w => { counts[w] = (counts[w] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([word, count]) => ({ word, count }));
  }, [preQuestions, transcript]);

  const remaining = speakerLimit > 0 ? Math.max(0, speakerLimit - elapsed) : null;
  const isOver    = remaining !== null && remaining === 0;
  const isWarning = remaining !== null && remaining <= 30 && !isOver;

  return (
    <div style={{
      minHeight: '100vh', background: '#0f172a', color: '#f1f5f9',
      fontFamily: 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes speakPulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.3)} 50%{box-shadow:0 0 0 20px rgba(16,185,129,0)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes tickerScroll { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>

      {/* ── Status bar ─────────────────────────────────────────────────────── */}
      <div style={{ background: '#1e293b', padding: '8px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #334155' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#2563eb,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🎤</div>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9' }}>AudienceQ</span>
          <span style={{ fontSize: 11, color: '#64748b' }}>— Projector View</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{queue.length} in queue</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: connected ? '#10b981' : '#ef4444' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', animation: 'pulse 2s infinite' }} />
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 0, minHeight: 0 }}>

        {/* Left: speaker + transcript ──────────────────────────────────────── */}
        <div style={{ padding: '40px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>

          {currentSpeaker ? (
            <div style={{ animation: 'fadeIn .4s ease' }}>
              {/* Speaker card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 28 }}>
                <div style={{
                  width: 100, height: 100, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 40, fontWeight: 800, color: '#fff',
                  animation: 'speakPulse 2.5s ease-in-out infinite',
                  border: '3px solid #10b981',
                }}>
                  {(currentSpeaker.name || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981', letterSpacing: '.05em', marginBottom: 4 }}>NOW SPEAKING</div>
                  <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, color: '#f8fafc' }}>
                    {currentSpeaker.name || 'Anonymous'}
                  </div>
                  <div style={{ fontSize: 18, color: '#94a3b8', marginTop: 6 }}>
                    📍 {currentSpeaker.section || 'Unknown Section'}
                    {currentSpeaker.gpsVerified && <span style={{ marginLeft: 10, fontSize: 13, color: '#10b981' }}>● GPS</span>}
                  </div>
                </div>
              </div>

              {/* Topic */}
              {currentSpeaker.topic && (
                <div style={{ padding: '14px 20px', background: '#1e293b', borderRadius: 12, border: '1px solid #334155', marginBottom: 20 }}>
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>TOPIC</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.3 }}>"{currentSpeaker.topic}"</div>
                </div>
              )}

              {/* Timer */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{
                  padding: '10px 24px', borderRadius: 40, fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                  background: isOver ? '#7f1d1d' : isWarning ? '#78350f' : '#1e293b',
                  border: `2px solid ${isOver ? '#ef4444' : isWarning ? '#f59e0b' : '#334155'}`,
                  color: isOver ? '#fca5a5' : isWarning ? '#fde68a' : '#f1f5f9',
                }}>
                  ⏱ {fmtTimer(elapsed)}
                  {remaining !== null && <span style={{ fontSize: 16, fontWeight: 400, marginLeft: 12, color: isOver ? '#fca5a5' : isWarning ? '#fde68a' : '#64748b' }}>
                    {isOver ? 'Time up!' : `${remaining}s left`}
                  </span>}
                </div>

                {/* Reactions */}
                {[
                  { key: 'agree', emoji: '👍', label: 'Agree' },
                  { key: 'followup', emoji: '❓', label: 'Follow-up' },
                  { key: 'same', emoji: '✋', label: 'Same Q' },
                ].map(r => (
                  <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 30, background: '#1e293b', border: '1px solid #334155' }}>
                    <span style={{ fontSize: 20 }}>{r.emoji}</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9' }}>{reactions[r.key] || 0}</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{r.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', opacity: .4 }}>
              <div style={{ fontSize: 72, marginBottom: 16 }}>🎤</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: '#475569' }}>Waiting for next speaker…</div>
              {queue.length > 0 && (
                <div style={{ fontSize: 18, color: '#334155', marginTop: 12 }}>{queue.length} person{queue.length > 1 ? 's' : ''} in queue</div>
              )}
            </div>
          )}

          {/* Live poll */}
          {currentPoll && (
            <div style={{ background: '#1e293b', borderRadius: 16, padding: '20px 24px', border: '1px solid #334155', animation: 'fadeIn .3s ease' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa', letterSpacing: '.06em', marginBottom: 8 }}>📊 LIVE POLL</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>{currentPoll.question}</div>
              {(() => {
                const total = currentPoll.options.reduce((s, o) => s + (o.votes || 0), 0);
                return currentPoll.options.map((opt, i) => {
                  const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                  return (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 5, color: '#cbd5e1' }}>
                        <span>{opt.text}</span><span style={{ fontWeight: 700 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 10, background: '#334155', borderRadius: 5, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#2563eb,#38bdf8)', borderRadius: 5, transition: 'width .5s ease' }} />
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>

        {/* Right: queue preview + word cloud ──────────────────────────────── */}
        <div style={{ background: '#1e293b', borderLeft: '1px solid #334155', padding: '28px 20px', display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>

          {/* Next up */}
          {queue.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.08em', marginBottom: 12 }}>NEXT UP</div>
              {queue.slice(0, 3).map((p, i) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: i === 0 ? '#0f172a' : 'transparent', marginBottom: 6, border: i === 0 ? '1px solid #334155' : 'none' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: i === 0 ? '#2563eb' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#fff', flexShrink: 0 }}>
                    {i === 0 ? '→' : i + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#f1f5f9' }}>{p.name || 'Anonymous'}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{p.section || 'Unknown'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Word cloud */}
          {wordCloud.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.08em', marginBottom: 12 }}>WORD CLOUD</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {wordCloud.map(({ word, count }) => {
                  const maxC = wordCloud[0].count;
                  const size = 11 + Math.round((count / maxC) * 20);
                  return (
                    <span key={word} style={{ fontSize: size, fontWeight: count > 2 ? 700 : 400, color: `hsl(${(word.charCodeAt(0) * 47) % 360},70%,70%)`, opacity: 0.5 + (count / maxC) * 0.5 }}>
                      {word}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live transcript ticker */}
          {transcript.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '.08em', marginBottom: 8 }}>📝 TRANSCRIPT</div>
              <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {transcript.slice(-6).map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 700, color: '#60a5fa' }}>{t.speaker}: </span>{t.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom ticker ──────────────────────────────────────────────────── */}
      {preQuestions.length > 0 && (
        <div style={{ background: '#1e293b', borderTop: '1px solid #334155', padding: '8px 0', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 48, animation: 'tickerScroll 30s linear infinite', whiteSpace: 'nowrap', width: 'max-content' }}>
            {[...preQuestions, ...preQuestions].map((q, i) => (
              <span key={i} style={{ fontSize: 13, color: '#94a3b8', padding: '0 4px' }}>
                <span style={{ color: '#60a5fa', fontWeight: 700 }}>Q: </span>{q.text}
                <span style={{ color: '#475569', marginLeft: 8 }}>▲{q.votes}</span>
                <span style={{ color: '#334155', margin: '0 12px' }}>·</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
