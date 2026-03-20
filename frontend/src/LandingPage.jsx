import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { MeshDistortMaterial, Stars, Float, OrbitControls } from '@react-three/drei';
import { motion } from 'framer-motion';
import { Suspense } from 'react';

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  primary: '#2563eb',
  sky: '#38bdf8',
  purple: '#7c3aed',
  darkBg: '#0f172a',
  bodyBg: '#f8fafc',
  text: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0',
  card: '#ffffff',
  light: '#f1f5f9',
};

const font = 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// ── 3D Scene ──────────────────────────────────────────────────────────────────
function TorusKnotScene() {
  return (
    <>
      <Stars radius={80} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 5, 5]} color="#2563eb" intensity={3} />
      <pointLight position={[-5, -3, 3]} color="#7c3aed" intensity={2.5} />
      <pointLight position={[0, 5, -3]} color="#38bdf8" intensity={2} />
      <Float speed={2} rotationIntensity={1.2} floatIntensity={1.5}>
        <mesh>
          <torusKnotGeometry args={[1.2, 0.38, 160, 20]} />
          <MeshDistortMaterial
            color="#2563eb"
            attach="material"
            distort={0.4}
            speed={2.5}
            roughness={0.1}
            metalness={0.8}
          />
        </mesh>
      </Float>
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.8} />
    </>
  );
}

// ── CountUp hook ──────────────────────────────────────────────────────────────
function useCountUp(target, duration = 1500, inView = false) {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    const numericTarget = parseFloat(target.replace(/[^0-9.]/g, ''));
    const suffix = target.replace(/[0-9.,]/g, '');
    const steps = 60;
    const increment = numericTarget / steps;
    let current = 0;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      current = Math.min(current + increment, numericTarget);
      if (step >= steps) {
        setCount(target);
        clearInterval(timer);
      } else {
        const display = numericTarget >= 1000
          ? Math.round(current).toLocaleString() + suffix
          : current % 1 !== 0
          ? current.toFixed(1) + suffix
          : Math.round(current) + suffix;
        setCount(display);
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return count || '0';
}

// ── Intersection observer hook ────────────────────────────────────────────────
function useInView(threshold = 0.2) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// ── StatItem ──────────────────────────────────────────────────────────────────
function StatItem({ value, label }) {
  const [ref, inView] = useInView(0.3);
  const display = useCountUp(value, 1500, inView);
  return (
    <div ref={ref} style={{ textAlign: 'center', padding: '8px 16px' }}>
      <div style={{ fontSize: 36, fontWeight: 800, color: C.primary, letterSpacing: '-0.02em' }}>
        {display}
      </div>
      <div style={{ fontSize: 14, color: C.muted, marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ── Feature Card with CSS 3D tilt ─────────────────────────────────────────────
function FeatureCard({ emoji, title, description, delay = 0 }) {
  const cardRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -10;
    const rotateY = ((x - centerX) / centerX) * 10;
    card.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.03)`;
    card.style.boxShadow = `0 20px 60px rgba(37,99,235,0.18), 0 4px 16px rgba(0,0,0,0.08)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)';
    card.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)';
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay }}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          background: C.card,
          borderRadius: 16,
          padding: '28px 24px',
          border: `1px solid ${C.border}`,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          cursor: 'default',
          transformStyle: 'preserve-3d',
          willChange: 'transform',
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 14 }}>{emoji}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65 }}>{description}</div>
      </div>
    </motion.div>
  );
}

// ── Pricing Card ──────────────────────────────────────────────────────────────
function PricingCard({ tier, price, annualPrice, description, features, cta, highlight, annual }) {
  const displayPrice = annual ? annualPrice : price;
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5 }}
      style={{ flex: '1 1 280px', maxWidth: 340 }}
    >
      <div style={{
        background: highlight ? 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' : C.card,
        borderRadius: 20,
        padding: '32px 28px',
        border: highlight ? 'none' : `1px solid ${C.border}`,
        boxShadow: highlight ? '0 20px 60px rgba(37,99,235,0.35)' : '0 2px 12px rgba(0,0,0,0.06)',
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}>
        {highlight && (
          <div style={{
            position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
            background: 'linear-gradient(90deg, #f59e0b, #ef4444)',
            color: '#fff', fontSize: 11, fontWeight: 800,
            padding: '4px 14px', borderRadius: 99, letterSpacing: '0.06em',
            whiteSpace: 'nowrap',
          }}>MOST POPULAR</div>
        )}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: highlight ? 'rgba(255,255,255,0.7)' : C.muted, letterSpacing: '0.06em', marginBottom: 8 }}>
            {tier.toUpperCase()}
          </div>
          <div style={{ fontSize: 42, fontWeight: 900, color: highlight ? '#fff' : C.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {displayPrice}
          </div>
          {price !== 'Free' && price !== 'Custom' && (
            <div style={{ fontSize: 12, color: highlight ? 'rgba(255,255,255,0.6)' : C.muted, marginTop: 4 }}>
              per month{annual ? ' (billed annually)' : ''}
            </div>
          )}
          <div style={{ fontSize: 14, color: highlight ? 'rgba(255,255,255,0.75)' : C.muted, marginTop: 12, lineHeight: 1.5 }}>
            {description}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {features.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: highlight ? 'rgba(255,255,255,0.25)' : '#dbeafe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, flexShrink: 0,
              }}>✓</div>
              <span style={{ fontSize: 13, color: highlight ? 'rgba(255,255,255,0.85)' : C.text }}>{f}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => {
            if (cta === 'Contact Us') window.location.href = '#contact';
            else if (cta === 'Get Pro') window.location.href = '/?mode=app';
            else window.location.href = '/?mode=app';
          }}
          style={{
            padding: '14px 0', borderRadius: 12, fontSize: 15, fontWeight: 700,
            border: highlight ? '2px solid rgba(255,255,255,0.4)' : `2px solid ${C.primary}`,
            background: highlight ? 'rgba(255,255,255,0.15)' : 'transparent',
            color: highlight ? '#fff' : C.primary,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = highlight ? 'rgba(255,255,255,0.25)' : C.primary;
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = highlight ? 'rgba(255,255,255,0.15)' : 'transparent';
            e.currentTarget.style.color = highlight ? '#fff' : C.primary;
          }}
        >
          {cta}
        </button>
      </div>
    </motion.div>
  );
}

// ── NavBar ────────────────────────────────────────────────────────────────────
function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const scrollTo = (id) => {
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const navLinks = [
    { label: 'Home', id: 'hero' },
    { label: 'Product', id: 'features' },
    { label: 'About', id: 'about' },
    { label: 'Pricing', id: 'pricing' },
    { label: 'Contact', id: 'contact' },
  ];

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      background: scrolled ? 'rgba(15,23,42,0.85)' : 'transparent',
      backdropFilter: scrolled ? 'blur(16px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : 'none',
      transition: 'all 0.3s ease',
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '0 24px',
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => scrollTo('hero')}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, boxShadow: '0 4px 12px rgba(37,99,235,0.4)',
          }}>🎤</div>
          <span style={{ fontWeight: 800, fontSize: 18, color: '#fff', letterSpacing: '-0.02em' }}>
            AudienceQ
          </span>
        </div>

        {/* Desktop nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32, '@media(maxWidth:768px)': { display: 'none' } }}
          className="desktop-nav">
          {navLinks.map(({ label, id }) => (
            <button key={id} onClick={() => scrollTo(id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.75)',
              transition: 'color 0.2s', padding: '4px 0',
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.75)'}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Desktop CTA buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => { window.location.href = '/?mode=admin'; }}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 8, color: '#fff', cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >Login</button>
          <button
            onClick={() => { window.location.href = '/?mode=app'; }}
            style={{
              padding: '8px 18px', fontSize: 13, fontWeight: 700,
              background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
              border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(37,99,235,0.4)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(37,99,235,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(37,99,235,0.4)'; }}
          >Get Started Free</button>

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'none',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#fff', fontSize: 22, padding: '4px',
            }}
            aria-label="Toggle menu"
            className="hamburger"
          >{menuOpen ? '✕' : '☰'}</button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{
          background: 'rgba(15,23,42,0.97)', borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {navLinks.map(({ label, id }) => (
            <button key={id} onClick={() => scrollTo(id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 16, fontWeight: 500, color: 'rgba(255,255,255,0.85)',
              textAlign: 'left', padding: '12px 0',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>{label}</button>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={() => { window.location.href = '/?mode=admin'; }} style={{
              flex: 1, padding: '10px', fontSize: 14, fontWeight: 600,
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8, color: '#fff', cursor: 'pointer',
            }}>Login</button>
            <button onClick={() => { window.location.href = '/?mode=app'; }} style={{
              flex: 1, padding: '10px', fontSize: 14, fontWeight: 700,
              background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
              border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer',
            }}>Get Started</button>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .hamburger { display: block !important; }
          .hide-mobile { display: none !important; }
        }
      `}</style>
    </nav>
  );
}

// ── Hero Section ──────────────────────────────────────────────────────────────
function HeroSection() {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="hero" style={{
      minHeight: '100vh', background: C.darkBg,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', paddingTop: 64,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto', padding: '60px 24px',
        display: 'flex', alignItems: 'center', gap: 48,
        flexWrap: 'wrap',
      }}>
        {/* Left: copy */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          style={{ flex: '1 1 360px', minWidth: 0 }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(56,189,248,0.3)',
            borderRadius: 99, padding: '6px 14px', marginBottom: 24,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', display: 'inline-block', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600 }}>Live Q&A, Redefined</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(36px, 5vw, 64px)',
            fontWeight: 900, lineHeight: 1.08,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #fff 0%, #38bdf8 50%, #7c3aed 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: 20,
          }}>
            Run Q&A Sessions<br />Like a Pro
          </h1>

          <p style={{
            fontSize: 18, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7,
            marginBottom: 36, maxWidth: 480,
          }}>
            AudienceQ brings order to live events. Manage speakers, run polls, translate in real-time — all from a single dashboard your audience accesses instantly.
          </p>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => { window.location.href = '/?mode=app'; }}
              style={{
                padding: '14px 28px', fontSize: 15, fontWeight: 700,
                background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
                border: 'none', borderRadius: 12, color: '#fff', cursor: 'pointer',
                boxShadow: '0 8px 30px rgba(37,99,235,0.5)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              Get Started Free →
            </button>
            <button
              onClick={() => scrollTo('how-it-works')}
              style={{
                padding: '14px 28px', fontSize: 15, fontWeight: 600,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 12, color: '#fff', cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
            >
              ▶ Watch Demo
            </button>
          </div>
        </motion.div>

        {/* Right: 3D Canvas */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          style={{
            flex: '1 1 300px', minWidth: 0,
            height: 'clamp(280px, 40vw, 420px)',
            borderRadius: 24, overflow: 'hidden',
          }}
        >
          <Canvas
            dpr={[1, 1.5]}
            camera={{ position: [0, 0, 5] }}
            style={{ width: '100%', height: '100%', background: 'transparent' }}
          >
            <Suspense fallback={null}>
              <TorusKnotScene />
            </Suspense>
          </Canvas>
        </motion.div>
      </div>

      {/* Trusted by */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.7 }}
        style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600, letterSpacing: '0.1em', marginBottom: 16 }}>
          TRUSTED BY TEAMS AT
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 'clamp(16px, 4vw, 48px)', flexWrap: 'wrap', alignItems: 'center' }}>
          {['TechConf Global', 'StartupWeek', 'DevSummit', 'PanelPro', 'EventForge'].map(name => (
            <span key={name} style={{
              fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.3)',
              letterSpacing: '-0.01em',
            }}>{name}</span>
          ))}
        </div>
      </motion.div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </section>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar() {
  const stats = [
    { value: '10,000+', label: 'Events run' },
    { value: '500K+', label: 'Speakers managed' },
    { value: '50+', label: 'Languages supported' },
    { value: '99.9%', label: 'Uptime' },
  ];
  return (
    <section style={{ background: '#fff', padding: '48px 24px', borderBottom: `1px solid ${C.border}` }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 24,
      }}>
        {stats.map(s => <StatItem key={s.label} value={s.value} label={s.label} />)}
      </div>
    </section>
  );
}

// ── Features Section ──────────────────────────────────────────────────────────
function FeaturesSection() {
  const features = [
    { emoji: '🎙️', title: 'Smart Queue', description: 'Fair, ordered speaker queue with real-time position tracking. No confusion, no interruptions — just smooth turns.' },
    { emoji: '🌐', title: 'Live Translation', description: 'Hear any speaker in your own language, powered by real-time AI translation covering 50+ languages.' },
    { emoji: '📊', title: 'Analytics', description: 'Full session analytics with speaker time distribution, sentiment scores, and AI-generated summaries.' },
    { emoji: '🗳️', title: 'Live Polls', description: 'Create and broadcast instant polls to all audience members. Results appear live on screen for everyone.' },
    { emoji: '📱', title: 'No App Needed', description: 'Works in any browser. Audience joins by scanning a QR code or entering a 6-digit code — zero friction.' },
    { emoji: '🔒', title: 'Moderated', description: 'Full moderator control: approve, skip, or prioritise any speaker. Keep sessions on track effortlessly.' },
  ];

  return (
    <section id="features" style={{ background: C.bodyBg, padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', marginBottom: 64 }}
        >
          <div style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700, color: C.primary,
            background: '#dbeafe', borderRadius: 99, padding: '5px 14px', marginBottom: 16, letterSpacing: '0.06em',
          }}>FEATURES</div>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, color: C.text,
            letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 16,
          }}>
            Everything you need for<br />perfect Q&A
          </h2>
          <p style={{ fontSize: 17, color: C.muted, maxWidth: 520, margin: '0 auto', lineHeight: 1.6 }}>
            AudienceQ packs every tool a moderator needs into one seamless, real-time platform.
          </p>
        </motion.div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 20,
        }}>
          {features.map((f, i) => (
            <FeatureCard key={f.title} {...f} delay={i * 0.08} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────
function HowItWorksSection() {
  const steps = [
    { num: '01', emoji: '📋', title: 'Create Session', description: 'Moderator creates a room in seconds and receives a shareable join code and QR code for the audience.' },
    { num: '02', emoji: '🙋', title: 'Audience Joins', description: 'Audience members scan the QR code or enter the 6-digit code in any browser. No app download required.' },
    { num: '03', emoji: '🎙️', title: 'Speak & Engage', description: 'Raise hands digitally, join the queue, and speak. Real-time translation and polls keep everyone engaged.' },
  ];

  return (
    <section id="how-it-works" style={{ background: C.darkBg, padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', marginBottom: 64 }}
        >
          <div style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#38bdf8',
            background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)',
            borderRadius: 99, padding: '5px 14px', marginBottom: 16, letterSpacing: '0.06em',
          }}>HOW IT WORKS</div>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, color: '#fff',
            letterSpacing: '-0.02em', lineHeight: 1.15,
          }}>
            Three steps to a perfect session
          </h2>
        </motion.div>

        <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', alignItems: 'stretch', position: 'relative' }}>
          {steps.map((step, i) => (
            <React.Fragment key={step.num}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                style={{ flex: '1 1 240px', padding: '32px 28px', textAlign: 'center' }}
              >
                <div style={{
                  fontSize: 'clamp(48px, 8vw, 80px)', fontWeight: 900, lineHeight: 1,
                  background: 'linear-gradient(135deg, #2563eb, #38bdf8)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text', marginBottom: 16,
                }}>{step.num}</div>
                <div style={{ fontSize: 36, marginBottom: 14 }}>{step.emoji}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 12 }}>{step.title}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>{step.description}</div>
              </motion.div>
              {i < steps.length - 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28, color: 'rgba(56,189,248,0.4)', padding: '0 4px',
                  alignSelf: 'center',
                }}>→</div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Product Showcase ──────────────────────────────────────────────────────────
function ProductShowcaseSection() {
  return (
    <section id="product" style={{ background: '#fff', padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', gap: 64, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Left: text */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          style={{ flex: '1 1 320px', minWidth: 0 }}
        >
          <div style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700, color: C.purple,
            background: '#ede9fe', borderRadius: 99, padding: '5px 14px', marginBottom: 16, letterSpacing: '0.06em',
          }}>DASHBOARD</div>
          <h2 style={{
            fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 900, color: C.text,
            letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 20,
          }}>See it in action</h2>
          <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.7, marginBottom: 28 }}>
            The moderator dashboard gives you complete control. Watch the queue fill in real time, manage speakers, broadcast polls, and review analytics — all in one view.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { icon: '✅', text: 'Real-time queue updates via WebRTC' },
              { icon: '🗂️', text: 'Drag-to-reorder speaker priority' },
              { icon: '📡', text: 'One-click projector mode for large screens' },
            ].map(item => (
              <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span style={{ fontSize: 14, color: C.text, fontWeight: 500 }}>{item.text}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right: fake dashboard mockup */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{ flex: '1 1 360px', minWidth: 0 }}
        >
          <div style={{
            background: '#0f172a', borderRadius: 20, overflow: 'hidden',
            boxShadow: '0 30px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.07)',
          }}>
            {/* Title bar */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)',
              padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginLeft: 8, fontWeight: 600 }}>
                AudienceQ — Moderator Dashboard
              </span>
            </div>
            <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'Queue', value: '3 waiting' },
                  { label: 'Audience', value: '47 live' },
                  { label: 'Duration', value: '22:14' },
                ].map(s => (
                  <div key={s.label} style={{
                    background: 'rgba(255,255,255,0.05)', borderRadius: 10,
                    padding: '12px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8' }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontWeight: 600 }}>{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Current speaker */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(124,58,237,0.2))',
                border: '1px solid rgba(56,189,248,0.25)',
                borderRadius: 12, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 800, color: '#fff',
                }}>S</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, marginBottom: 2 }}>NOW SPEAKING</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Sarah K.</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>Topic: AI in Healthcare</div>
                </div>
                <div style={{
                  background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)',
                  borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#10b981', fontWeight: 700,
                }}>● LIVE</div>
              </div>
              {/* Queue */}
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700, marginBottom: 8, letterSpacing: '0.06em' }}>SPEAKER QUEUE</div>
                {[
                  { name: 'Marcus T.', topic: 'Data privacy' },
                  { name: 'Priya M.', topic: 'Product design' },
                  { name: 'James L.', topic: 'Scaling teams' },
                ].map((person, i) => (
                  <div key={person.name} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                    borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.5)', flexShrink: 0,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{person.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{person.topic}</div>
                    </div>
                    <div style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 6,
                      background: 'rgba(37,99,235,0.2)', color: '#60a5fa', fontWeight: 700,
                    }}>QUEUED</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── About Section ─────────────────────────────────────────────────────────────
function AboutSection() {
  const values = [
    { emoji: '🛡️', title: 'Reliability', description: '99.9% uptime SLA, built on WebRTC infrastructure designed for concurrent live events at global scale.' },
    { emoji: '🔐', title: 'Privacy', description: 'End-to-end encrypted audio, no persistent user tracking, GDPR compliant. Your audience data stays private.' },
    { emoji: '⚡', title: 'Speed', description: 'Sub-100ms latency for queue updates. Real-time is non-negotiable when a room full of people is waiting.' },
  ];

  const team = [
    { initials: 'AK', name: 'Alex Kim', role: 'CEO & Co-founder' },
    { initials: 'RJ', name: 'Riya Joshi', role: 'CTO & Co-founder' },
    { initials: 'TM', name: 'Tom Mace', role: 'Head of Product' },
  ];

  return (
    <section id="about" style={{ background: '#fff', padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', marginBottom: 64 }}
        >
          <div style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700, color: C.primary,
            background: '#dbeafe', borderRadius: 99, padding: '5px 14px', marginBottom: 16, letterSpacing: '0.06em',
          }}>ABOUT US</div>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, color: C.text,
            letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 20,
          }}>
            Built for live events,<br />by live event experts
          </h2>
          <p style={{ fontSize: 17, color: C.muted, maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
            We ran hundreds of conferences ourselves and kept facing the same problems — chaotic Q&A, lost voices, slow moderation. So we built AudienceQ to fix that once and for all.
          </p>
        </motion.div>

        {/* Values */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24, marginBottom: 72 }}>
          {values.map((v, i) => (
            <motion.div
              key={v.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              style={{
                background: C.bodyBg, borderRadius: 16, padding: '28px 24px',
                border: `1px solid ${C.border}`,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 14 }}>{v.emoji}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 8 }}>{v.title}</div>
              <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.65 }}>{v.description}</div>
            </motion.div>
          ))}
        </div>

        {/* Team */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: 'center' }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', marginBottom: 28 }}>MEET THE TEAM</div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 40, flexWrap: 'wrap' }}>
            {team.map(member => (
              <div key={member.name} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%', margin: '0 auto 12px',
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 800, color: '#fff',
                  boxShadow: '0 8px 24px rgba(37,99,235,0.3)',
                }}>{member.initials}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{member.name}</div>
                <div style={{ fontSize: 13, color: C.muted }}>{member.role}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Pricing Section ───────────────────────────────────────────────────────────
function PricingSection() {
  const [annual, setAnnual] = useState(false);

  const plans = [
    {
      tier: 'Starter',
      price: 'Free',
      annualPrice: 'Free',
      description: 'Perfect for small events and trying out AudienceQ.',
      features: ['Up to 50 audience members', '1 moderator', 'Basic analytics', 'Queue & hand-raise', 'Join by code / QR'],
      cta: 'Start Free',
      highlight: false,
    },
    {
      tier: 'Pro',
      price: '$29',
      annualPrice: '$23',
      description: 'For teams running regular professional events.',
      features: ['Up to 500 audience members', '5 moderators', 'Full analytics & AI summaries', 'Real-time translation (50+ langs)', 'Live polls', 'Projector mode', 'Priority support'],
      cta: 'Get Pro',
      highlight: true,
    },
    {
      tier: 'Enterprise',
      price: 'Custom',
      annualPrice: 'Custom',
      description: 'For organisations with large-scale or regulated events.',
      features: ['Unlimited audience', 'Unlimited moderators', 'SSO / SAML', 'Dedicated infrastructure', 'Custom integrations', 'Dedicated account manager', 'SLA guarantee'],
      cta: 'Contact Us',
      highlight: false,
    },
  ];

  return (
    <section id="pricing" style={{ background: C.bodyBg, padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', marginBottom: 48 }}
        >
          <div style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700, color: C.primary,
            background: '#dbeafe', borderRadius: 99, padding: '5px 14px', marginBottom: 16, letterSpacing: '0.06em',
          }}>PRICING</div>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, color: C.text,
            letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: 24,
          }}>Simple, transparent pricing</h2>

          {/* Toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14, background: '#fff', borderRadius: 50, padding: '6px 8px', border: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: !annual ? C.primary : C.muted, padding: '4px 12px' }}>Monthly</span>
            <div
              onClick={() => setAnnual(a => !a)}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: annual ? C.primary : '#cbd5e1',
                position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3, left: annual ? 23 : 3,
                transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: annual ? C.primary : C.muted, padding: '4px 12px' }}>
              Annual
              <span style={{
                marginLeft: 6, fontSize: 10, background: '#dcfce7', color: '#16a34a',
                padding: '2px 6px', borderRadius: 99, fontWeight: 700,
              }}>-20%</span>
            </span>
          </div>
        </motion.div>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch' }}>
          {plans.map((plan, i) => (
            <PricingCard key={plan.tier} {...plan} annual={annual} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Contact Section ───────────────────────────────────────────────────────────
function ContactSection() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); setSubmitted(true); }, 1000);
  };

  return (
    <section id="contact" style={{ background: '#fff', padding: '96px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          style={{ textAlign: 'center', marginBottom: 64 }}
        >
          <div style={{
            display: 'inline-block', fontSize: 12, fontWeight: 700, color: C.primary,
            background: '#dbeafe', borderRadius: 99, padding: '5px 14px', marginBottom: 16, letterSpacing: '0.06em',
          }}>CONTACT</div>
          <h2 style={{
            fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 900, color: C.text,
            letterSpacing: '-0.02em', lineHeight: 1.15,
          }}>Get in touch</h2>
        </motion.div>

        <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5 }}
            style={{ flex: '1 1 340px' }}
          >
            {submitted ? (
              <div style={{
                background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16,
                padding: '40px 32px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', marginBottom: 8 }}>Message sent!</div>
                <div style={{ fontSize: 14, color: '#4ade80' }}>We'll get back to you within one business day.</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {[
                  { key: 'name', label: 'Your Name', type: 'text', placeholder: 'Jane Smith' },
                  { key: 'email', label: 'Email Address', type: 'email', placeholder: 'jane@company.com' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      required
                      value={form[field.key]}
                      onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                      style={{
                        width: '100%', padding: '12px 14px', fontSize: 14,
                        border: `1px solid ${C.border}`, borderRadius: 10,
                        outline: 'none', background: '#fff', color: C.text,
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s',
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = C.primary; }}
                      onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
                    />
                  </div>
                ))}
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>Message</label>
                  <textarea
                    placeholder="Tell us about your event or ask a question…"
                    required
                    rows={5}
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    style={{
                      width: '100%', padding: '12px 14px', fontSize: 14,
                      border: `1px solid ${C.border}`, borderRadius: 10,
                      outline: 'none', background: '#fff', color: C.text,
                      resize: 'vertical', boxSizing: 'border-box',
                      transition: 'border-color 0.2s', fontFamily: font,
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = C.primary; }}
                    onBlur={e => { e.currentTarget.style.borderColor = C.border; }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '14px', fontSize: 15, fontWeight: 700,
                    background: submitting ? C.muted : 'linear-gradient(135deg, #2563eb, #38bdf8)',
                    border: 'none', borderRadius: 10, color: '#fff', cursor: submitting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {submitting ? 'Sending…' : 'Send Message →'}
                </button>
              </form>
            )}
          </motion.div>

          {/* Info cards */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 20 }}
          >
            {[
              { icon: '✉️', title: 'Email Support', detail: 'hello@audienceq.io', sub: 'We reply within 24 hours' },
              { icon: '📍', title: 'Office', detail: '123 Event Lane, San Francisco, CA 94102', sub: 'Not always staffed — email first!' },
              { icon: '🐦', title: 'Social', detail: '@AudienceQ on X & LinkedIn', sub: 'Follow for product updates' },
            ].map(card => (
              <div key={card.title} style={{
                background: C.bodyBg, border: `1px solid ${C.border}`, borderRadius: 14,
                padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 28 }}>{card.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{card.title}</div>
                  <div style={{ fontSize: 13, color: C.primary, fontWeight: 600, marginBottom: 3 }}>{card.detail}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{card.sub}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  const links = {
    Product: ['Features', 'Pricing', 'Changelog', 'Roadmap', 'API Docs'],
    Company: ['About', 'Blog', 'Careers', 'Press Kit', 'Contact'],
    Legal: ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'GDPR'],
    Socials: ['Twitter / X', 'LinkedIn', 'GitHub', 'YouTube'],
  };

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer style={{ background: C.darkBg, padding: '72px 24px 32px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 40, marginBottom: 56 }}>
          {/* Brand */}
          <div style={{ gridColumn: 'span 1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}
              onClick={() => scrollTo('hero')}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: 'linear-gradient(135deg, #2563eb 0%, #38bdf8 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
              }}>🎤</div>
              <span style={{ fontWeight: 800, fontSize: 17, color: '#fff' }}>AudienceQ</span>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, maxWidth: 220 }}>
              Real-time audience queue and speaker management for live events and conferences.
            </p>
          </div>

          {/* Link groups */}
          {Object.entries(links).map(([group, items]) => (
            <div key={group}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 16 }}>
                {group.toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      if (group === 'Product' && item === 'Pricing') scrollTo('pricing');
                      else if (group === 'Company' && item === 'About') scrollTo('about');
                      else if (group === 'Company' && item === 'Contact') scrollTo('contact');
                      else if (group === 'Product' && item === 'Features') scrollTo('features');
                    }}
                    style={{
                      fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'none',
                      transition: 'color 0.2s', fontWeight: 500, background: 'none', border: 'none',
                      cursor: 'pointer', padding: 0, textAlign: 'left',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)'; }}
                  >{item}</button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            © 2026 AudienceQ. All rights reserved.
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            Built with ❤️ for event professionals worldwide
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Main LandingPage ──────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ fontFamily: font, background: C.bodyBg, minHeight: '100vh' }}>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: ${C.bodyBg}; overflow-x: hidden; }
        input, select, textarea, button { font-family: inherit; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(37,99,235,0.3); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(37,99,235,0.5); }
      `}</style>

      <NavBar />
      <HeroSection />
      <StatsBar />
      <FeaturesSection />
      <HowItWorksSection />
      <ProductShowcaseSection />
      <AboutSection />
      <PricingSection />
      <ContactSection />
      <Footer />
    </div>
  );
}
