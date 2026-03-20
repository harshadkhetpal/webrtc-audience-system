/**
 * ModeratorAuditorium3D — Interactive 3D auditorium seating map.
 * Mouse-hover tilts the entire scene. Rows are tiered with real translateZ.
 * Section cards show as 3D blocks with a depth face.
 * No auto-rotation. Zero WebGL.
 * speakerLiveGps — real-time GPS ping from current speaker's phone.
 */
import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';

const ROWS = [
  { id: 'balcony', label: 'BALCONY', sections: ['Balcony Left', 'Balcony Right'],         tz: 100 },
  { id: 'back',    label: 'BACK',    sections: ['Back Left', 'Back Center', 'Back Right'], tz: 70  },
  { id: 'middle',  label: 'MIDDLE',  sections: ['Middle Left', 'Middle Center', 'Middle Right'], tz: 36 },
  { id: 'front',   label: 'FRONT',   sections: ['Front Left', 'Front Center', 'Front Right'],    tz: 8  },
  { id: 'virtual', label: 'VIRTUAL', sections: ['Online/Virtual'],                         tz: 110 },
];

// Padding presets per row
const ROW_PAD = {
  balcony: '0 10%',
  back:    '0',
  middle:  '0',
  front:   '0 5%',
  virtual: '0 30%',
};

// Depth face color for each state
function depthColor(isCurrent, density, activity) {
  if (isCurrent)      return 'rgba(217,119,6,0.55)';
  if (density > 0.6)  return 'rgba(29,78,216,0.35)';
  if (density > 0.3)  return 'rgba(37,99,235,0.22)';
  if (activity > 0)   return 'rgba(147,197,253,0.6)';
  return 'rgba(203,213,225,0.45)';
}

// ─── Section card ─────────────────────────────────────────────────────────────
function SectionCard({ name, activity, isCurrent, gpsCount, density, isLiveGps, liveAccuracy, isFlashing }) {
  const heatBg = density > 0
    ? `rgba(37,99,235,${(0.07 + density * 0.38).toFixed(2)})`
    : null;

  const topBg = isCurrent
    ? 'linear-gradient(135deg,#fffbeb,#fef9c3)'
    : heatBg
    ? heatBg
    : activity > 0
    ? '#eff6ff'
    : '#f4f7fb';

  const borderColor = isCurrent
    ? '#fbbf24'
    : density > 0.55 ? '#5b8dd9'
    : activity > 0   ? '#93c5fd'
    : '#dde3ed';

  const textColor = isCurrent
    ? '#92400e'
    : density > 0.5 ? '#1d4ed8'
    : activity > 0  ? '#1d4ed8'
    : '#9fb0c8';

  const DEPTH = 7; // px of the 3D depth face

  return (
    <div style={{
      flex: 1,
      position: 'relative',
      paddingBottom: DEPTH,
    }}>
      {/* Top / front face */}
      <div style={{
        padding: '9px 6px 8px',
        background: topBg,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 8,
        textAlign: 'center',
        backgroundImage: `
          linear-gradient(rgba(37,99,235,0.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(37,99,235,0.05) 1px, transparent 1px)
        `,
        backgroundSize: '14% 22%',
        transform: isCurrent ? 'scale(1.04)' : 'scale(1)',
        transformOrigin: 'center bottom',
        position: 'relative',
        zIndex: 2,
        transition: 'background .35s, border-color .25s, transform .25s',
        boxShadow: isFlashing
          ? '0 0 0 3px rgba(5,150,105,0.85), 0 0 12px rgba(5,150,105,0.4)'
          : isCurrent
          ? '0 0 0 2px rgba(251,191,36,0.45), 0 2px 8px rgba(217,119,6,0.2)'
          : density > 0.4
          ? '0 0 0 1px rgba(37,99,235,0.25), 0 2px 6px rgba(37,99,235,0.1)'
          : 'none',
        animation: isFlashing ? 'sectionFlash 0.6s ease-out forwards' : isCurrent ? 'cardPulse 2s ease-in-out infinite' : 'none',
      }}>
        {/* Live GPS beacon — speaker's phone is HERE right now */}
        {isLiveGps && (
          <div style={{
            position: 'absolute', top: 3, left: 3,
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1,
          }}>
            {/* Outer ripple rings */}
            <div style={{ position: 'relative', width: 14, height: 14 }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '2px solid rgba(5,150,105,0.5)',
                animation: 'liveRipple 1.5s ease-out infinite',
              }} />
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: '2px solid rgba(5,150,105,0.35)',
                animation: 'liveRipple 1.5s ease-out infinite 0.5s',
              }} />
              {/* Core dot */}
              <div style={{
                position: 'absolute', inset: 4,
                borderRadius: '50%', background: '#059669',
                boxShadow: '0 0 6px rgba(5,150,105,0.9)',
              }} />
            </div>
            {liveAccuracy && (
              <div style={{ fontSize: 7, fontWeight: 800, color: '#059669', lineHeight: 1 }}>
                ±{liveAccuracy}m
              </div>
            )}
          </div>
        )}

        {/* GPS queue pings (top-right corner) */}
        {gpsCount > 0 && (
          <div style={{
            position: 'absolute', top: 4, right: 5,
            display: 'flex', gap: 2, flexWrap: 'wrap',
            maxWidth: 28, justifyContent: 'flex-end',
          }}>
            {Array.from({ length: Math.min(gpsCount, 4) }).map((_, i) => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: isCurrent ? '#d97706' : '#059669',
                boxShadow: `0 0 4px ${isCurrent ? 'rgba(217,119,6,0.7)' : 'rgba(5,150,105,0.7)'}`,
                animation: 'gpsPing 2s ease-in-out infinite',
                animationDelay: `${i * 0.3}s`,
              }} />
            ))}
          </div>
        )}

        <div style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em',
          color: textColor, whiteSpace: 'nowrap', overflow: 'hidden',
          textOverflow: 'ellipsis', lineHeight: 1.2,
        }}>
          {name}
        </div>

        {activity > 0 && (
          <div style={{
            marginTop: 4,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 17, height: 17, borderRadius: '50%',
            background: isCurrent ? '#d97706' : '#2563eb',
            color: '#fff', fontSize: 9, fontWeight: 800,
          }}>
            {activity}
          </div>
        )}

        {isCurrent && (
          <div style={{ marginTop: 2, fontSize: 10 }}>🎤</div>
        )}
      </div>

      {/* Depth face — the 3D "side" visible because of the camera angle */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 3,
        right: 3,
        height: DEPTH + 2,
        background: depthColor(isCurrent, density, activity),
        borderRadius: '0 0 7px 7px',
        zIndex: 1,
      }} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ModeratorAuditorium3D({ queue, currentSpeaker, heatmapEnabled = true, speakerLiveGps = null }) {
  const [tilt,    setTilt]    = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  // Flash state: briefly pulses the section card when a new GPS ping arrives
  const [flashSection, setFlashSection] = useState(null);
  const flashTimerRef = useRef(null);
  const boxRef = useRef(null);

  // Trigger a flash whenever speakerLiveGps section updates
  useEffect(() => {
    if (!speakerLiveGps?.section) return;
    setFlashSection(speakerLiveGps.section);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashSection(null), 600);
    return () => clearTimeout(flashTimerRef.current);
  }, [speakerLiveGps?.ts]); // ts changes every GPS tick

  // Mouse move → subtle tilt
  const handleMouseMove = useCallback((e) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const nx = (e.clientX - r.left)  / r.width  - 0.5; // -0.5 to 0.5
    const ny = (e.clientY - r.top)   / r.height - 0.5;
    setTilt({ x: nx * 14, y: -ny * 10 }); // rotateY ±7deg, rotateX ±5deg
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setHovered(false);
  }, []);

  // ── Computed ──────────────────────────────────────────────────────────────
  const activityBySection = useMemo(() => {
    const c = {};
    ROWS.forEach(r => r.sections.forEach(s => { c[s] = 0; }));
    (queue || []).forEach(p => {
      const s = p.section || 'Online/Virtual';
      if (c[s] != null) c[s]++;
    });
    return c;
  }, [queue]);

  const maxActivity = useMemo(
    () => Math.max(1, ...Object.values(activityBySection)),
    [activityBySection]
  );

  const densityBySection = useMemo(() => {
    const d = {};
    Object.entries(activityBySection).forEach(([s, cnt]) => { d[s] = cnt / maxActivity; });
    return d;
  }, [activityBySection, maxActivity]);

  const gpsBySection = useMemo(() => {
    const c = {};
    ROWS.forEach(r => r.sections.forEach(s => { c[s] = 0; }));
    const all = [...(queue || [])];
    if (currentSpeaker?.gpsVerified) all.push(currentSpeaker);
    all.forEach(p => {
      if (p.gpsVerified) {
        const s = p.section || 'Online/Virtual';
        if (c[s] != null) c[s]++;
      }
    });
    return c;
  }, [queue, currentSpeaker]);

  // Base tilt of the scene (camera angle)
  const baseX = 32;
  const sceneTransform = `rotateX(${baseX + tilt.y}deg) rotateY(${tilt.x}deg)`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={boxRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(170deg, #e8eef8 0%, #dde6f5 50%, #d4dfef 100%)',
        overflow: 'hidden',
        cursor: 'crosshair',
        userSelect: 'none',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <style>{`
        @keyframes cardPulse {
          0%,100% { box-shadow: 0 0 0 2px rgba(251,191,36,.45); }
          50%      { box-shadow: 0 0 0 5px rgba(251,191,36,.15); }
        }
        @keyframes stageSweep {
          0%   { transform: translateX(-110%); }
          100% { transform: translateX(110%); }
        }
        @keyframes gpsPing {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:.45; transform:scale(1.5); }
        }
        @keyframes stageGlow {
          0%,100% { opacity:.6; }
          50%     { opacity:1; }
        }
        @keyframes liveRipple {
          0%   { transform:scale(0.4); opacity:1; }
          100% { transform:scale(2.2); opacity:0; }
        }
        @keyframes sectionFlash {
          0%   { box-shadow: 0 0 0 3px rgba(5,150,105,0.9); }
          100% { box-shadow: 0 0 0 0px rgba(5,150,105,0); }
        }
      `}</style>

      {/* Legend bar */}
      <div style={{
        padding: '7px 14px 5px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(180,195,220,0.5)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#8fa3c0' }}>
          AUDITORIUM · {hovered ? '3D' : 'hover to tilt'}
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          {[
            { color: '#bfdbfe', label: 'In queue', square: true },
            { color: '#fbbf24', label: 'Speaking', square: true },
            { color: '#059669', label: 'GPS live',  square: false },
          ].map(({ color, label, square }) => (
            <span key={label} style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: square ? 8 : 6, height: square ? 8 : 6,
                borderRadius: square ? 2 : '50%',
                background: color, display: 'inline-block',
                boxShadow: !square ? `0 0 4px ${color}` : 'none',
              }} />
              {label}
            </span>
          ))}
          {heatmapEnabled && (
            <span style={{ fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
              Low
              <div style={{ width: 40, height: 6, borderRadius: 3,
                background: 'linear-gradient(90deg,rgba(37,99,235,.06),rgba(37,99,235,.45))' }} />
              High
            </span>
          )}
        </div>
      </div>

      {/* 3D scene */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '10px 18px 8px',
        perspective: '560px',
        perspectiveOrigin: '50% 20%',
        overflow: 'visible',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          transform: sceneTransform,
          transformStyle: 'preserve-3d',
          transition: hovered ? 'transform 0.08s ease-out' : 'transform 0.5s ease-out',
        }}>

          {/* Rows rendered top→bottom: balcony/virtual at top (back), front at bottom */}
          {ROWS.map((row) => (
            <div key={row.id} style={{ transform: `translateZ(${row.tz * 0.6}px)` }}>
              {/* Row label */}
              <div style={{
                fontSize: 7.5, fontWeight: 800, letterSpacing: '0.14em',
                color: '#b0bfcf', marginBottom: 3, paddingLeft: 2,
              }}>
                {row.label}
              </div>
              <div style={{
                display: 'flex', gap: 5,
                padding: ROW_PAD[row.id] || '0',
              }}>
                {row.sections.map(name => (
                  <SectionCard
                    key={name}
                    name={name}
                    activity={activityBySection[name] || 0}
                    isCurrent={currentSpeaker?.section === name}
                    gpsCount={gpsBySection[name] || 0}
                    density={heatmapEnabled ? (densityBySection[name] || 0) : 0}
                    isLiveGps={speakerLiveGps?.section === name}
                    liveAccuracy={speakerLiveGps?.section === name ? speakerLiveGps?.coords?.accuracy : null}
                    isFlashing={flashSection === name}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Aisle line */}
          <div style={{
            height: 2, margin: '2px 0',
            background: 'linear-gradient(90deg, transparent, rgba(148,163,184,0.5), transparent)',
            transform: 'translateZ(4px)',
          }} />

          {/* Stage */}
          <div style={{
            position: 'relative', overflow: 'hidden',
            borderRadius: 10, transform: 'translateZ(0px)',
            background: currentSpeaker
              ? 'linear-gradient(135deg,#fffbeb,#fef3c7,#fffbeb)'
              : 'linear-gradient(135deg,#e0f2fe,#f0f9ff,#e0f2fe)',
            border: `2px solid ${currentSpeaker ? '#fbbf24' : '#bae6fd'}`,
            padding: '11px 16px 10px',
            textAlign: 'center',
            boxShadow: currentSpeaker
              ? '0 0 0 3px rgba(251,191,36,0.2), 0 4px 16px rgba(217,119,6,0.15)'
              : '0 0 0 2px rgba(186,230,253,0.4)',
          }}>
            {/* Stage sweep */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0, width: '40%',
              background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.55),transparent)',
              animation: 'stageSweep 3.5s linear infinite',
              pointerEvents: 'none',
            }} />

            {/* Lights */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginBottom: 7 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: currentSpeaker ? '#f59e0b' : '#38bdf8',
                  boxShadow: currentSpeaker
                    ? '0 0 8px rgba(245,158,11,0.8)'
                    : '0 0 6px rgba(56,189,248,0.7)',
                  animation: `stageGlow ${1.2 + i * 0.2}s ease-in-out infinite`,
                }} />
              ))}
            </div>

            {currentSpeaker ? (
              <div>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: '#92400e', marginBottom: 2 }}>
                  NOW SPEAKING
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#b45309' }}>
                  🎤 {currentSpeaker.name || 'Anonymous'}
                </div>
                {currentSpeaker.section && (
                  <div style={{ fontSize: 10, color: '#d97706', marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    📍 {currentSpeaker.section}
                    {speakerLiveGps ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 9, fontWeight: 800, color: '#059669',
                        background: 'rgba(5,150,105,0.12)', borderRadius: 8, padding: '1px 5px',
                        border: '1px solid rgba(5,150,105,0.3)',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#059669',
                          boxShadow: '0 0 4px rgba(5,150,105,0.8)', display: 'inline-block',
                          animation: 'stageGlow 1s ease-in-out infinite' }} />
                        LIVE{speakerLiveGps.coords?.accuracy ? ` ±${speakerLiveGps.coords.accuracy}m` : ''}
                      </span>
                    ) : currentSpeaker.gpsVerified ? (
                      <span style={{ fontSize: 9, color: '#059669' }}>● GPS</span>
                    ) : null}
                  </div>
                )}
                {currentSpeaker.topic && (
                  <div style={{ fontSize: 9, color: '#b45309', fontStyle: 'italic',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%', margin: '2px auto 0' }}>
                    "{currentSpeaker.topic}"
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#94a3b8' }}>
                STAGE
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Footer stats */}
      <div style={{
        padding: '6px 14px 7px',
        borderTop: '1px solid rgba(180,195,220,0.5)',
        display: 'flex', gap: 14, flexShrink: 0,
        alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 10.5, color: '#8fa3c0', fontWeight: 600 }}>
          Queue{' '}
          <strong style={{ color: (queue||[]).length > 0 ? '#2563eb' : '#8fa3c0' }}>
            {(queue||[]).length}
          </strong>
        </span>
        <span style={{ fontSize: 10.5, color: '#8fa3c0', fontWeight: 600 }}>
          Active{' '}
          <strong style={{ color: '#2563eb' }}>
            {Object.values(activityBySection).filter(v => v > 0).length}
          </strong>{' '}sections
        </span>
        <span style={{ fontSize: 10.5, color: '#8fa3c0', fontWeight: 600 }}>
          GPS{' '}
          <strong style={{ color: '#059669' }}>
            {[...(queue||[]), ...(currentSpeaker?.gpsVerified ? [currentSpeaker] : [])].filter(p => p.gpsVerified).length}
          </strong>{' '}live
        </span>
      </div>
    </div>
  );
}
