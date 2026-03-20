/**
 * SilencePrompt.jsx
 *
 * Slides in from the top when a new speaker starts.
 * Combines: Vibration API, Media Session API, Screen Wake Lock,
 * and a silent-audio trick (iOS audio-session claim) so the device
 * suppresses competing notification sounds while the speaker is live.
 *
 * Props:
 *   speaker  — { name, topic } | null   (null = hide / clean up)
 *   onDismiss — callback when user taps ✕
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

const DISMISS_AFTER_MS = 6000;   // auto-hide after 6 s
const SILENCE_DURATION = 0.8;    // seconds of silent audio per loop iteration

// ── Silent-audio factory (iOS audio-session claim) ───────────────────────────
function createSilentAudio() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const buf  = ctx.createBuffer(1, ctx.sampleRate * SILENCE_DURATION, ctx.sampleRate);
    // buffer is already zeroed → absolute silence
    const src  = ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;
    src.connect(ctx.destination);
    src.start(0);
    return { ctx, src };
  } catch {
    return null;
  }
}

// ── Media Session helper ──────────────────────────────────────────────────────
function registerMediaSession(speaker) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  speaker.name || 'Speaker',
      artist: speaker.topic || 'Now speaking',
      album:  'AudienceQ',
    });
    navigator.mediaSession.playbackState = 'playing';
  } catch { /* older Safari */ }
}

function clearMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata      = null;
    navigator.mediaSession.playbackState = 'none';
  } catch { }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SilencePrompt({ speaker, onDismiss }) {
  const [visible,       setVisible]       = useState(false);
  const [progress,      setProgress]      = useState(100); // 100 → 0 over DISMISS_AFTER_MS
  const [wakeLockOk,    setWakeLockOk]    = useState(false);
  const [vibrated,      setVibrated]      = useState(false);
  const [audioOk,       setAudioOk]       = useState(false);

  const wakeLockRef  = useRef(null);
  const audioRef     = useRef(null);
  const timerRef     = useRef(null);
  const rafRef       = useRef(null);
  const startTimeRef = useRef(null);
  const prevNameRef  = useRef(null);

  // ── Cleanup helper ──────────────────────────────────────────────────────────
  const cleanUp = useCallback(() => {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);

    // Release Wake Lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    // Stop silent audio
    if (audioRef.current) {
      try { audioRef.current.src.stop(); audioRef.current.ctx.close(); } catch { }
      audioRef.current = null;
    }
    clearMediaSession();
    setWakeLockOk(false);
    setAudioOk(false);
  }, []);

  // ── Trigger when speaker changes ─────────────────────────────────────────────
  useEffect(() => {
    if (!speaker) {
      setVisible(false);
      cleanUp();
      prevNameRef.current = null;
      return;
    }

    // Skip if the same speaker is still active (e.g. re-render with same props)
    if (prevNameRef.current === speaker.name) return;
    prevNameRef.current = speaker.name;

    setVisible(true);
    setProgress(100);
    setVibrated(false);
    setWakeLockOk(false);
    setAudioOk(false);

    cleanUp(); // stop previous session's resources first

    // 1️⃣  Vibration — 2 short pulses to signal "silence now"
    if ('vibrate' in navigator) {
      navigator.vibrate([250, 80, 250]);
      setVibrated(true);
    }

    // 2️⃣  Media Session
    registerMediaSession(speaker);

    // 3️⃣  Silent audio (iOS audio-session claim)
    const audio = createSilentAudio();
    if (audio) { audioRef.current = audio; setAudioOk(true); }

    // 4️⃣  Screen Wake Lock
    if ('wakeLock' in navigator) {
      navigator.wakeLock.request('screen')
        .then(lock => { wakeLockRef.current = lock; setWakeLockOk(true); })
        .catch(() => {});
    }

    // 5️⃣  Progress bar animation → auto-dismiss
    startTimeRef.current = performance.now();
    const tick = (now) => {
      const elapsed = now - startTimeRef.current;
      const pct = Math.max(0, 100 - (elapsed / DISMISS_AFTER_MS) * 100);
      setProgress(pct);
      if (pct > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setVisible(false);
        cleanUp();
        onDismiss?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return cleanUp;
  }, [speaker, cleanUp, onDismiss]);

  // ── Re-acquire Wake Lock if page becomes visible again ───────────────────────
  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && visible && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock?.request('screen');
          setWakeLockOk(true);
        } catch { }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [visible]);

  if (!visible || !speaker) return null;

  const name  = speaker.name  || 'Speaker';
  const topic = speaker.topic || null;

  return (
    <>
      <style>{`
        @keyframes silenceSlideIn {
          from { transform: translateY(-110%); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes silencePulse {
          0%, 100% { transform: scale(1);    opacity: 1;    }
          50%       { transform: scale(1.18); opacity: 0.75; }
        }
        @keyframes ripple {
          0%   { transform: scale(0.8); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0;   }
        }
      `}</style>

      {/* ── Banner ────────────────────────────────────────────────────────── */}
      <div style={{
        position:   'fixed',
        top:        0,
        left:       0,
        right:      0,
        zIndex:     9999,
        animation:  'silenceSlideIn 0.38s cubic-bezier(0.34,1.56,0.64,1) both',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}>
        {/* Progress bar */}
        <div style={{
          height: 3,
          background: `linear-gradient(90deg,
            rgba(255,255,255,0.9) ${progress}%,
            rgba(255,255,255,0.15) ${progress}%)`,
          transition: 'none',
        }} />

        {/* Main card */}
        <div style={{
          margin:     '0 12px 0',
          borderRadius: '0 0 18px 18px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
          border:     '1px solid rgba(139,92,246,0.4)',
          borderTop:  'none',
          boxShadow:  '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(139,92,246,0.15) inset',
          overflow:   'hidden',
        }}>
          <div style={{ padding: '14px 16px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>

            {/* Mute icon with ripple */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              {/* Ripple rings */}
              {[0, 1].map(i => (
                <div key={i} style={{
                  position:        'absolute',
                  inset:           0,
                  borderRadius:    '50%',
                  border:          '2px solid rgba(139,92,246,0.5)',
                  animation:       `ripple 1.6s ease-out ${i * 0.8}s infinite`,
                }} />
              ))}
              <div style={{
                width:          46,
                height:         46,
                borderRadius:   '50%',
                background:     'linear-gradient(135deg,#7c3aed,#a855f7)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       22,
                boxShadow:      '0 0 20px rgba(139,92,246,0.5)',
                animation:      'silencePulse 2s ease-in-out infinite',
                position:       'relative',
                zIndex:         1,
              }}>
                🔇
              </div>
            </div>

            {/* Text */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize:    11,
                fontWeight:  700,
                color:       'rgba(167,139,250,0.9)',
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                marginBottom: 3,
              }}>
                🎙️ Now Speaking
              </div>
              <div style={{
                fontSize:     15,
                fontWeight:   700,
                color:        '#fff',
                letterSpacing: '-0.01em',
                whiteSpace:   'nowrap',
                overflow:     'hidden',
                textOverflow: 'ellipsis',
              }}>
                {name}
              </div>
              {topic && (
                <div style={{
                  fontSize:    12,
                  color:       'rgba(255,255,255,0.55)',
                  marginTop:   2,
                  whiteSpace:  'nowrap',
                  overflow:    'hidden',
                  textOverflow:'ellipsis',
                }}>
                  {topic}
                </div>
              )}
            </div>

            {/* Status badges + dismiss */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
              {/* Dismiss button */}
              <button
                onClick={() => { setVisible(false); cleanUp(); onDismiss?.(); }}
                style={{
                  width:          22,
                  height:         22,
                  borderRadius:   '50%',
                  background:     'rgba(255,255,255,0.1)',
                  border:         '1px solid rgba(255,255,255,0.2)',
                  color:          'rgba(255,255,255,0.7)',
                  fontSize:       11,
                  cursor:         'pointer',
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  lineHeight:     1,
                }}
              >
                ✕
              </button>

              {/* Tech badges */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {vibrated && <Badge label="Vibrated" color="#22c55e" />}
                {wakeLockOk && <Badge label="Screen on" color="#38bdf8" />}
                {audioOk && <Badge label="Audio held" color="#a78bfa" />}
              </div>
            </div>
          </div>

          {/* Instruction strip */}
          <div style={{
            background:  'rgba(139,92,246,0.12)',
            borderTop:   '1px solid rgba(139,92,246,0.2)',
            padding:     '8px 16px',
            display:     'flex',
            alignItems:  'center',
            gap:         8,
          }}>
            <span style={{ fontSize: 13 }}>📵</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)' }}>
              Please silence your phone — someone is speaking
            </span>
            <span style={{
              marginLeft: 'auto',
              fontSize:   11,
              color:      'rgba(255,255,255,0.35)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              auto-dismiss in {Math.ceil(progress * DISMISS_AFTER_MS / 100000)}s
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      fontSize:    9,
      fontWeight:  700,
      color,
      background:  `${color}22`,
      border:      `1px solid ${color}55`,
      borderRadius: 4,
      padding:     '2px 5px',
      letterSpacing: '.04em',
      textTransform: 'uppercase',
    }}>
      ✓ {label}
    </span>
  );
}
