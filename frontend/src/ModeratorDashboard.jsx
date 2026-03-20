import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG as QRCode } from 'qrcode.react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import ModeratorAuditorium3D from './ModeratorAuditorium3D';

const getSocketUrl = () =>
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

const AGORA_APP_ID  = process.env.REACT_APP_AGORA_APP_ID || '80da85e2e0064199953b79c9ebded052';
const CHANNEL_NAME  = 'main-room';
const AGORA_UID     = 1;

const ROOMS = ['main', 'room-b', 'room-c'];
const ROOM_LABELS = { main: 'Main', 'room-b': 'Room B', 'room-c': 'Room C' };

const ALL_SECTIONS = [
  'Front Left','Front Center','Front Right',
  'Middle Left','Middle Center','Middle Right',
  'Back Left','Back Center','Back Right',
  'Balcony Left','Balcony Right','Online/Virtual',
];

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:'#f1f5f9', surface:'#ffffff', border:'#e2e8f0', borderMid:'#cbd5e1',
  text:'#1e293b', muted:'#64748b',
  primary:'#2563eb', primaryLight:'#eff6ff', primaryBorder:'#bfdbfe',
  gold:'#d97706', goldLight:'#fffbeb', goldBorder:'#fde68a',
  success:'#059669', successLight:'#ecfdf5',
  danger:'#dc2626', dangerLight:'#fef2f2',
  purple:'#7c3aed', purpleLight:'#f5f3ff',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtWait(joinedAt) {
  try {
    const d = Math.floor((Date.now() - new Date(joinedAt).getTime()) / 1000);
    if (d < 60) return `${d}s`;
    return `${Math.floor(d / 60)}m ${d % 60}s`;
  } catch { return '—'; }
}

function fmtDur(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function initials(name) {
  return (name || '?').trim().charAt(0).toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ModeratorDashboard({ auth }) {
  // ── Core queue ────────────────────────────────────────────────────────────
  const [queue,           setQueue]           = useState([]);
  const [currentSpeaker,  setCurrentSpeaker]  = useState(null);
  const [connected,       setConnected]       = useState(false);
  const [queuePaused,     setQueuePaused]     = useState(false);
  const [reactions,       setReactions]       = useState({ agree: 0, followup: 0, same: 0 });

  // ── Filters ───────────────────────────────────────────────────────────────
  const [sectionFilter,   setSectionFilter]   = useState('All sections');
  const [sortBy,          setSortBy]          = useState('time');
  const [searchQuery,     setSearchQuery]     = useState('');

  // ── Timer / stats ─────────────────────────────────────────────────────────
  const [speakingStartedAt, setSpeakingStartedAt] = useState(null);
  const [totalSpeakers,    setTotalSpeakers]    = useState(0);
  const [tick,             setTick]             = useState(0);

  // ── UI toggles ────────────────────────────────────────────────────────────
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showEndConfirm,   setShowEndConfirm]   = useState(false);
  const [showQRModal,      setShowQRModal]      = useState(false);
  const [heatmapEnabled,   setHeatmapEnabled]   = useState(true);
  const [lastSessionId,    setLastSessionId]    = useState(null);

  // ── Audio ─────────────────────────────────────────────────────────────────
  const [audioReady,       setAudioReady]       = useState(false);  // user clicked "Start Listening"
  const [audioConnected,   setAudioConnected]   = useState(false);
  const [isReceivingAudio, setIsReceivingAudio] = useState(false);
  const [volume,           setVolume]           = useState(100);
  const [audioBlocked,     setAudioBlocked]     = useState(false);

  // ── Time limit ────────────────────────────────────────────────────────────
  const [speakerTimeLimit, setSpeakerTimeLimit] = useState(0);
  const [timeLimitInput,   setTimeLimitInput]   = useState('');

  // ── Polls ─────────────────────────────────────────────────────────────────
  const [currentPoll,      setCurrentPoll]      = useState(null);
  const [pollQuestion,     setPollQuestion]     = useState('');
  const [pollOptions,      setPollOptions]      = useState(['', '']);
  const [showPollForm,     setShowPollForm]     = useState(false);

  // ── Pre-session questions ─────────────────────────────────────────────────
  const [preQuestions,     setPreQuestions]     = useState([]);
  const [preSessionOpen,   setPreSessionOpen]   = useState(true);
  const [showPreQuestions, setShowPreQuestions] = useState(true);

  // ── Live GPS tracking (lightweight locationUpdate events) ─────────────────
  const [speakerLiveGps,   setSpeakerLiveGps]   = useState(null); // {coords,section,name,ts}

  // ── New feature state ──────────────────────────────────────────────────────
  const [autoAdvance,       setAutoAdvance]       = useState(false);
  const [whisperText,       setWhisperText]       = useState('');
  const [whisperSent,       setWhisperSent]       = useState(false);
  const [pendingQuestions,  setPendingQuestions]  = useState([]);
  const [screeningEnabled,  setScreeningEnabled]  = useState(false);
  const [transcript,        setTranscript]        = useState([]);
  const [showTranscript,    setShowTranscript]    = useState(false);
  const [showWordCloud,     setShowWordCloud]     = useState(false);
  const [engagement,        setEngagement]        = useState({ joins:0, reactions:0, questions:0, polls:0 });
  const [roomPasscode,      setRoomPasscode]      = useState('');
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [webhookUrl,        setWebhookUrl]        = useState('');
  const [showWebhookModal,  setShowWebhookModal]  = useState(false);
  const [showProjLink,      setShowProjLink]      = useState(false);

  // ── AI features ──────────────────────────────────────────────────────────
  const [questionGroups,    setQuestionGroups]    = useState([]);
  const [groupLoading,      setGroupLoading]      = useState(false);
  const [factCheckFlags,    setFactCheckFlags]    = useState([]);
  const [factCheckLoading,  setFactCheckLoading]  = useState(false);
  const [showAIPanel,       setShowAIPanel]       = useState(false);

  // ── Settings panel ────────────────────────────────────────────────────────
  const [showSettings,      setShowSettings]      = useState(false);
  const [passcodeInput,     setPasscodeInput]     = useState('');
  const [webhookInput,      setWebhookInput]      = useState('');
  const [bgVideoInput,      setBgVideoInput]      = useState('');
  const [adInput,           setAdInput]           = useState('');

  // ── Room / URL ────────────────────────────────────────────────────────────
  const [activeRoom,       setActiveRoom]       = useState('main');
  const [joinCode,         setJoinCode]         = useState('');
  const [joinCodeCopied,   setJoinCodeCopied]   = useState(false);
  const [audienceUrlForQR, setAudienceUrlForQR] = useState(
    () => typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  );

  const socketRef       = useRef(null);
  const agoraClientRef  = useRef(null);
  const remoteTracksRef = useRef([]);
  const volumeRef       = useRef(100);

  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // Fetch network IP for QR codes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      fetch('/api/config').then(r => r.json()).then(({ audienceUrl }) => setAudienceUrlForQR(audienceUrl)).catch(() => {});
    }
  }, []);

  // ── Agora ─────────────────────────────────────────────────────────────────
  // Audio MUST be initialised from a user-click — browsers block autoplay otherwise.
  // The moderator clicks "Start Listening" which runs this function directly.
  const startListening = useCallback(async () => {
    if (agoraClientRef.current) return; // already started
    setAudioReady(true);

    try {
      // 1. Fetch a fresh signed token
      let liveToken = null;
      try {
        const resp = await fetch(`${getSocketUrl()}/api/agora/token?channel=${encodeURIComponent(CHANNEL_NAME)}&uid=${AGORA_UID}`);
        if (resp.ok) { liveToken = (await resp.json()).token; }
      } catch { /* null = no-cert mode */ }

      // 2. Create client and attach listeners BEFORE join
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      agoraClientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        if (mediaType !== 'audio') return;
        try {
          await client.subscribe(user, 'audio');
          const track = user.audioTrack;
          if (!track) return;
          remoteTracksRef.current = [...remoteTracksRef.current.filter(t => t !== track), track];
          track.setVolume(volumeRef.current);
          track.play();                    // safe — we're inside a user-gesture chain
          setIsReceivingAudio(true);
          setAudioBlocked(false);
        } catch (e) {
          console.error('[Agora] subscribe/play error:', e);
          setAudioBlocked(true);
        }
      });

      client.on('user-unpublished', (user) => {
        if (user.audioTrack) {
          remoteTracksRef.current = remoteTracksRef.current.filter(t => t !== user.audioTrack);
          try { user.audioTrack.stop(); } catch { /* ignore */ }
        }
        if (remoteTracksRef.current.length === 0) setIsReceivingAudio(false);
      });

      // 3. Join channel
      await client.join(AGORA_APP_ID, CHANNEL_NAME, liveToken, AGORA_UID);
      setAudioConnected(true);

      // 4. Subscribe to anyone ALREADY publishing when we joined
      for (const user of client.remoteUsers) {
        if (user.hasAudio) {
          try {
            await client.subscribe(user, 'audio');
            const track = user.audioTrack;
            if (!track) continue;
            remoteTracksRef.current = [...remoteTracksRef.current.filter(t => t !== track), track];
            track.setVolume(volumeRef.current);
            track.play();
            setIsReceivingAudio(true);
          } catch (e) {
            console.error('[Agora] catch-up subscribe error:', e);
          }
        }
      }
    } catch (err) {
      console.error('[Agora] startListening error:', err);
      setAudioReady(false);
    }
  }, []);

  // Replay tracks if browser still blocked after startListening
  const unlockAudio = useCallback(() => {
    setAudioBlocked(false);
    remoteTracksRef.current.forEach(t => { try { t.play(); setIsReceivingAudio(true); } catch { /* ignore */ } });
  }, []);

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(getSocketUrl(), {
      path: '/socket.io', reconnection: true, reconnectionAttempts: 15,
      reconnectionDelay: 2000, timeout: 60000, transports: ['polling', 'websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('joinRoom', { roomId: activeRoom, workspaceId: auth?.workspaceId || 'default' });
    });
    socket.on('disconnect',    () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('queueUpdate', (payload) => {
      setQueue(payload.queue || []);
      setCurrentSpeaker(payload.currentSpeaker || null);
      setQueuePaused(!!payload.queuePaused);
      setSpeakerTimeLimit(payload.speakerTimeLimit || 0);
      setReactions(payload.reactions || { agree: 0, followup: 0, same: 0 });
      setEngagement(payload.engagement || { joins:0, reactions:0, questions:0, polls:0 });
      if (payload.joinCode) setJoinCode(payload.joinCode);
      // Clear live GPS pin if speaker slot is now empty
      if (!payload.currentSpeaker) setSpeakerLiveGps(null);
    });

    // Lightweight real-time GPS pin — arrives on every phone tick
    socket.on('locationUpdate', (data) => {
      if (data.isSpeaker) {
        setSpeakerLiveGps({
          coords:  data.coords,
          section: data.section,
          name:    data.name,
          ts:      Date.now(),
        });
        // Also patch currentSpeaker in-place so banner reflects new section immediately
        setCurrentSpeaker(prev =>
          prev ? { ...prev, coords: data.coords, section: data.section, gpsVerified: true } : prev
        );
      }
    });

    socket.on('pollUpdate', (poll) => setCurrentPoll(poll || null));

    socket.on('preQuestionsUpdate', (data) => {
      setPreQuestions(data?.questions || []);
      setPreSessionOpen(data?.open !== false);
    });

    socket.on('sessionEnded', ({ sessionId }) => {
      setLastSessionId(sessionId);
      setShowEndConfirm(false);
    });

    socket.on('timeLimitUpdate', (data) => setSpeakerTimeLimit(data?.seconds || 0));
    socket.on('transcriptUpdate', ({ transcript }) => setTranscript(transcript || []));
    socket.on('pendingQuestionsUpdate', (data) => setPendingQuestions(data?.questions || []));
    socket.on('roomSettingsUpdate', (data) => {
      setScreeningEnabled(!!data.screeningEnabled);
      setAutoAdvance(!!data.autoAdvance);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      agoraClientRef.current?.leave().catch(() => {});
      agoraClientRef.current = null;
      setAudioConnected(false);
      setAudioReady(false);
      setIsReceivingAudio(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch room
  const switchRoom = useCallback((roomId) => {
    setActiveRoom(roomId);
    setQueue([]);
    setCurrentSpeaker(null);
    setCurrentPoll(null);
    setPreQuestions([]);
    setReactions({ agree: 0, followup: 0, same: 0 });
    socketRef.current?.emit('joinRoom', { roomId });
  }, []);

  // Speaker timer
  useEffect(() => {
    if (currentSpeaker) {
      setSpeakingStartedAt(Date.now());
    } else {
      if (speakingStartedAt !== null) setTotalSpeakers(n => n + 1);
      setSpeakingStartedAt(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpeaker?.id]);

  // 1-second tick
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Computed ──────────────────────────────────────────────────────────────
  const filteredQueue = useMemo(() => {
    let list = [...queue];
    if (sectionFilter !== 'All sections') list = list.filter(p => p.section === sectionFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p => (p.name || 'anonymous').toLowerCase().includes(q));
    }
    if (sortBy === 'time')     list.sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
    if (sortBy === 'section')  list.sort((a, b) => (a.section || '').localeCompare(b.section || ''));
    if (sortBy === 'priority') list.sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0));
    return list;
  }, [queue, sectionFilter, searchQuery, sortBy]);

  const longestWaitId = useMemo(() => {
    const s = [...queue].sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
    return s[0]?.id || null;
  }, [queue]);

  const avgWaitSec = useMemo(() => {
    if (!queue.length) return 0;
    const now = Date.now();
    return Math.round(queue.reduce((acc, p) => acc + (now - new Date(p.joinedAt)) / 1000, 0) / queue.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, tick]);

  const mostActiveSection = useMemo(() => {
    if (!queue.length) return null;
    const c = {};
    queue.forEach(p => { const s = p.section || 'Online/Virtual'; c[s] = (c[s] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }, [queue]);

  const speakerElapsedSec = speakingStartedAt ? Math.floor((Date.now() - speakingStartedAt) / 1000) : 0;
  const speakerIsOverLimit = speakerTimeLimit > 0 && speakerElapsedSec >= speakerTimeLimit;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const emit = (event, data) => socketRef.current?.emit(event, data);

  const handleSelect    = (id) => emit('selectSpeaker',  { userId: id });
  const handleEnd       = (id) => emit('endSpeaker',     { userId: id });
  const handleSkip      = (id) => emit('moveToEnd',      { userId: id });
  const handlePriority  = (id) => emit('prioritizeUser', { userId: id });
  const handlePause     = ()   => emit('setQueuePaused', !queuePaused);
  const handleRefresh   = ()   => emit('getQueueState');
  const handleClearAll  = ()   => { emit('clearQueue'); setShowClearConfirm(false); };
  const handleEndSession = ()  => { emit('endSession'); setShowEndConfirm(false); };
  const handleVolume    = (e)  => {
    const v = parseInt(e.target.value, 10);
    setVolume(v);
    remoteTracksRef.current.forEach(t => t?.setVolume(v));
  };

  // Poll
  const handleCreatePoll = () => {
    const opts = pollOptions.filter(Boolean);
    if (!pollQuestion.trim() || opts.length < 2) return;
    emit('createPoll', { question: pollQuestion.trim(), options: opts });
    setPollQuestion(''); setPollOptions(['', '']); setShowPollForm(false);
  };

  // Time limit
  const handleSetTimeLimit = () => {
    const s = parseInt(timeLimitInput, 10);
    emit('setTimeLimit', { seconds: isNaN(s) ? 0 : s });
    setTimeLimitInput('');
  };

  // CSV Export
  const handleExport = () => {
    window.open(`/api/export/speakers?room=${activeRoom}`, '_blank');
  };

  // Pre-session
  const togglePreSessionOpen = () => emit('setPreSessionOpen', { open: !preSessionOpen });
  const handleDeleteQuestion  = (id) => emit('deleteQuestion', { id });

  // Random picker
  const handleRandomPick = () => emit('randomPick');

  // AI: group questions
  const handleGroupQuestions = async () => {
    if (preQuestions.length < 3) return;
    setGroupLoading(true);
    setShowAIPanel(true);
    try {
      const res = await fetch('/api/ai/group-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth?.token}` },
        body: JSON.stringify({ questions: preQuestions }),
      });
      const data = await res.json();
      setQuestionGroups(data.groups || []);
    } catch { setQuestionGroups([]); }
    setGroupLoading(false);
  };

  // AI: fact-check latest transcript
  const handleFactCheck = async () => {
    const lastLines = transcript.slice(-8).map(t => `${t.speaker}: ${t.text}`).join('\n');
    if (!lastLines) return;
    setFactCheckLoading(true);
    setShowAIPanel(true);
    try {
      const res = await fetch('/api/ai/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth?.token}` },
        body: JSON.stringify({ text: lastLines, speaker: currentSpeaker?.name || 'speaker' }),
      });
      const data = await res.json();
      setFactCheckFlags(data.flags || []);
    } catch { setFactCheckFlags([]); }
    setFactCheckLoading(false);
  };

  // Settings: save passcode
  const handleSavePasscode = () => {
    socketRef.current?.emit('setRoomPasscode', { passcode: passcodeInput.trim() });
    setShowSettings(false);
  };

  // Settings: save webhook
  const handleSaveWebhook = () => {
    socketRef.current?.emit('setWebhookUrl', { url: webhookInput.trim() });
    setShowSettings(false);
  };

  const handleSaveBgVideo = () => {
    socketRef.current?.emit('setBgVideo', { url: bgVideoInput.trim() });
  };

  const handleSaveAd = () => {
    socketRef.current?.emit('setAd', { url: adInput.trim() });
  };

  // Whisper
  const sendWhisper = useCallback(() => {
    if (!whisperText.trim()) return;
    socketRef.current?.emit('whisperSpeaker', { message: whisperText.trim() });
    setWhisperSent(true);
    setWhisperText('');
    setTimeout(() => setWhisperSent(false), 3000);
  }, [whisperText]);

  const qrBase = `${audienceUrlForQR}${activeRoom !== 'main' ? `?room=${activeRoom}` : ''}`;

  // ── Sentiment meter ────────────────────────────────────────────────────────
  const sentimentScore = useMemo(() => {
    const total = reactions.agree + reactions.followup + reactions.same;
    if (total === 0) return null;
    const score = ((reactions.agree * 100) + (reactions.same * 50)) / total;
    return Math.round(score);
  }, [reactions]);

  const sentimentLabel = sentimentScore === null ? null
    : sentimentScore >= 70 ? { label: 'Positive', emoji: '😊', color: '#059669' }
    : sentimentScore >= 40 ? { label: 'Mixed',    emoji: '😐', color: '#d97706' }
    : { label: 'Tense', emoji: '😤', color: '#dc2626' };

  // ── Word cloud ─────────────────────────────────────────────────────────────
  const wordCloudWords = useMemo(() => {
    const stopWords = new Set(['the','a','an','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','what','how','why','when','where','who','which','that','this','these','those','and','or','but','in','on','at','to','for','of','with','by']);
    const counts = {};
    [...preQuestions.map(q => q.text), ...(currentSpeaker?.topic ? [currentSpeaker.topic] : [])].join(' ')
      .split(/\s+/)
      .map(w => w.toLowerCase().replace(/[^a-z]/g, ''))
      .filter(w => w.length > 3 && !stopWords.has(w))
      .forEach(w => { counts[w] = (counts[w] || 0) + 1; });
    return Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 25).map(([word, count]) => ({ word, count }));
  }, [preQuestions, currentSpeaker]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: 'Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: C.text }}>
      <style>{`
        * { box-sizing: border-box; }
        @keyframes fadeIn    { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
        @keyframes speakPulse{ 0%,100%{box-shadow:0 0 0 0 rgba(217,119,6,.3)} 50%{box-shadow:0 0 0 8px rgba(217,119,6,0)} }
        @keyframes liveBlink { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes reactionPop{ 0%{transform:scale(1)} 50%{transform:scale(1.3)} 100%{transform:scale(1)} }
        .btn{transition:opacity .15s,background .15s;cursor:pointer;}
        .btn:hover{opacity:.88;}
        .q-card:hover{background:#f8fafc!important;}
        @media(max-width:900px){.dash-grid{grid-template-columns:1fr!important;}}
      `}</style>

      {/* ══ Header ══════════════════════════════════════════════════════════ */}
      <header style={{
        background: C.surface, borderBottom:`1px solid ${C.border}`,
        padding:'0 24px', height:60, display:'flex', alignItems:'center',
        justifyContent:'space-between', gap:12, position:'sticky', top:audioBlocked ? 0 : 0, zIndex:50,
        boxShadow:'0 1px 4px rgba(0,0,0,.06)',
      }}>
        {/* Left */}
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <span style={{ fontWeight:800, fontSize:15, color:C.text }}>Auditorium</span>

          {/* Room selector */}
          <div style={{ display:'flex', gap:4 }}>
            {ROOMS.map(r => (
              <button key={r} type="button" className="btn" onClick={() => switchRoom(r)} style={{
                padding:'4px 12px', fontSize:12, fontWeight:700, borderRadius:20,
                background: activeRoom === r ? C.primary : C.bg,
                color: activeRoom === r ? '#fff' : C.muted,
                border:`1px solid ${activeRoom === r ? C.primary : C.border}`,
              }}>{ROOM_LABELS[r]}</button>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display:'flex', gap:18, alignItems:'center' }}>
            <Stat label="Queue"    value={queue.length}   color={queue.length > 0 ? C.primary : undefined} />
            <Stat label="Spoke"    value={totalSpeakers} />
            <Stat label="Avg wait" value={avgWaitSec > 0 ? fmtDur(avgWaitSec) : '—'} />
            {mostActiveSection && <Stat label="Hotspot" value={mostActiveSection} />}
          </div>
          {/* Engagement metrics */}
          <div style={{ fontSize:11, color:C.muted, display:'flex', gap:12 }}>
            <span>👥 {engagement.joins} joined</span>
            <span>👍 {engagement.reactions} reactions</span>
            <span>❓ {engagement.questions} questions</span>
            <span>📊 {engagement.polls} polls</span>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* ── Audio control ─────────────────────────────────── */}
          {!audioReady ? (
            // Big visible button — must click BEFORE audio will work in browser
            <button
              type="button"
              onClick={startListening}
              style={{
                padding:'7px 16px', fontSize:13, fontWeight:700, borderRadius:8,
                background: C.primary, color:'#fff', border:'none', cursor:'pointer',
                display:'flex', alignItems:'center', gap:7,
                boxShadow:'0 2px 8px rgba(37,99,235,0.35)',
                animation:'liveBlink 2s ease-in-out infinite',
              }}
            >
              🎧 Start Listening
            </button>
          ) : audioBlocked ? (
            <button type="button" onClick={unlockAudio} style={{
              padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:8, cursor:'pointer',
              background:'#fff7ed', color:'#c2410c', border:'1.5px solid #fed7aa',
            }}>
              🔇 Tap to unmute
            </button>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{
                fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:20,
                background: isReceivingAudio ? C.successLight : C.bg,
                color:      isReceivingAudio ? C.success      : C.muted,
                border:     `1px solid ${isReceivingAudio ? '#a7f3d0' : C.border}`,
              }}>
                {isReceivingAudio ? '🔊 Live audio' : '🎧 Waiting for speaker…'}
              </span>
              <input type="range" min="0" max="200" value={volume} onChange={handleVolume}
                style={{ width:72, accentColor:C.primary }} title={`Volume: ${volume}%`} />
            </div>
          )}

          <button type="button" className="btn" onClick={handleExport} style={{
            padding:'6px 12px', fontSize:12, fontWeight:600, borderRadius:8,
            background:C.bg, color:C.muted, border:`1px solid ${C.border}`,
          }}>📥 Export</button>

          <button type="button" className="btn" onClick={() => setShowSettings(s => !s)} style={{
            padding:'6px 12px', fontSize:12, fontWeight:600, borderRadius:8,
            background: showSettings ? C.primaryLight : C.bg,
            color: showSettings ? C.primary : C.muted,
            border:`1px solid ${showSettings ? C.primaryBorder : C.border}`,
          }}>⚙️ Settings</button>

          {/* ── End Session button ─────────────────────────────────────────── */}
          {!showEndConfirm ? (
            <button type="button" className="btn" onClick={() => setShowEndConfirm(true)} style={{
              padding:'6px 12px', fontSize:12, fontWeight:700, borderRadius:8,
              background:'#7c3aed18', color:'#7c3aed', border:'1px solid #c4b5fd',
            }}>🏁 End Session</button>
          ) : (
            <>
              <span style={{ fontSize:11, color:C.danger, fontWeight:600 }}>Save &amp; end?</span>
              <button type="button" className="btn" onClick={handleEndSession} style={{
                padding:'5px 10px', fontSize:11, fontWeight:700, borderRadius:7,
                background:'#7c3aed', color:'#fff', border:'none',
              }}>✓ Confirm</button>
              <button type="button" className="btn" onClick={() => setShowEndConfirm(false)} style={{
                padding:'5px 10px', fontSize:11, borderRadius:7,
                background:C.bg, color:C.muted, border:`1px solid ${C.border}`,
              }}>✕</button>
            </>
          )}

          {/* Session saved toast */}
          {lastSessionId && (
            <span style={{
              fontSize:11, fontWeight:700, color:'#7c3aed',
              background:'#ede9fe', padding:'4px 8px', borderRadius:99,
              border:'1px solid #c4b5fd', cursor:'pointer',
            }}
            onClick={() => window.open(`/?session=${lastSessionId}`, '_blank')}
            title="View session summary (opens in new tab)">
              ✅ Session saved · View →
            </span>
          )}

          {/* Sentiment meter */}
          {sentimentLabel && (
            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20,
              background:'#f8fafc', border:'1px solid #e2e8f0', fontSize:12 }}>
              <span>{sentimentLabel.emoji}</span>
              <span style={{ fontWeight:600, color:sentimentLabel.color }}>{sentimentLabel.label}</span>
              <span style={{ color:'#94a3b8', fontSize:10 }}>{sentimentScore}%</span>
            </div>
          )}

          {/* Join Code pill */}
          {joinCode && (
            <button
              title="Click to copy join link"
              onClick={() => {
                const link = `${audienceUrlForQR}/?mode=join`;
                navigator.clipboard.writeText(link).then(() => {
                  setJoinCodeCopied(true);
                  setTimeout(() => setJoinCodeCopied(false), 2000);
                });
              }}
              style={{
                display:'flex', alignItems:'center', gap:6, padding:'5px 12px',
                borderRadius:9, border:'2px solid #2563eb', background:'#eff6ff',
                cursor:'pointer', fontFamily:'inherit',
              }}
            >
              <span style={{ fontSize:10, fontWeight:700, color:'#64748b', letterSpacing:'.06em' }}>JOIN</span>
              <span style={{ fontSize:15, fontWeight:900, color:'#2563eb', letterSpacing:'.12em', fontVariantNumeric:'tabular-nums' }}>
                {joinCode}
              </span>
              <span style={{ fontSize:10, color: joinCodeCopied ? '#059669' : '#94a3b8' }}>
                {joinCodeCopied ? '✅' : '📋'}
              </span>
            </button>
          )}

          <button type="button" className="btn" onClick={() => setShowQRModal(true)} style={{
            padding:'6px 12px', fontSize:12, fontWeight:600, borderRadius:8,
            background:C.primaryLight, color:C.primary, border:`1px solid ${C.primaryBorder}`,
          }}>QR Codes</button>

          {/* Projector Mode button */}
          <button onClick={() => {
            const url = `${audienceUrlForQR}?mode=projector&room=${activeRoom}`;
            window.open(url, '_blank');
          }} title="Open projector display on second screen" style={{
            padding:'6px 14px', fontSize:12, fontWeight:600, borderRadius:8,
            background:'#7c3aed', color:'#fff', border:'none', cursor:'pointer',
          }}>
            📺 Projector
          </button>

          <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, fontWeight:600, color: connected ? C.success : C.danger }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'currentColor',
              animation: connected ? 'liveBlink 2s ease-in-out infinite' : 'none' }} />
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
      </header>

      {/* ══ Active speaker banner ════════════════════════════════════════════ */}
      {currentSpeaker && (
        <div style={{
          background: speakerIsOverLimit ? '#fef2f2' : C.goldLight,
          borderBottom:`1px solid ${speakerIsOverLimit ? '#fca5a5' : C.goldBorder}`,
          padding:'10px 24px', display:'flex', alignItems:'center', gap:12,
          animation:'fadeIn .3s ease', flexWrap:'wrap',
        }}>
          <div style={{
            width:36, height:36, borderRadius:'50%', background: speakerIsOverLimit ? C.danger : C.gold,
            color:'#fff', display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:700, fontSize:16, animation:'speakPulse 2s ease-in-out infinite', flexShrink:0,
          }}>{initials(currentSpeaker.name)}</div>

          <div style={{ flex:1, minWidth:180 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontWeight:700, color: speakerIsOverLimit ? C.danger : C.gold, fontSize:14 }}>
                🎤 {currentSpeaker.name || 'Anonymous'}
              </span>
              <span style={{ fontSize:12, color:C.muted }}>{currentSpeaker.section || '—'}</span>
              {currentSpeaker.gpsVerified && (
                <span style={{ fontSize:10, fontWeight:700, color:C.success, background:C.successLight,
                  border:'1px solid #a7f3d0', borderRadius:10, padding:'1px 6px',
                  display:'inline-flex', alignItems:'center', gap:3 }}>
                  <span style={{ width:4, height:4, borderRadius:'50%', background:C.success }} />
                  GPS {currentSpeaker.coords?.accuracy && `±${currentSpeaker.coords.accuracy}m`}
                </span>
              )}
              {/* Silence-notified badge */}
              <span style={{
                fontSize:10, fontWeight:700, color:'#7c3aed', background:'#f5f3ff',
                border:'1px solid #c4b5fd', borderRadius:10, padding:'1px 6px',
                display:'inline-flex', alignItems:'center', gap:3,
                animation:'fadeIn .4s ease .3s both',
              }}>
                📵 Phones notified
              </span>
            </div>
            {currentSpeaker.topic && (
              <div style={{ fontSize:11, color:'#92400e', marginTop:2, fontStyle:'italic' }}>
                "{currentSpeaker.topic}"
              </div>
            )}
          </div>

          {/* Live timer */}
          <div style={{
            padding:'3px 12px', borderRadius:20, fontWeight:800, fontSize:14,
            fontVariantNumeric:'tabular-nums', letterSpacing:'-0.01em',
            background: speakerIsOverLimit ? C.dangerLight : '#fffbeb',
            border:`1px solid ${speakerIsOverLimit ? '#fca5a5' : C.goldBorder}`,
            color: speakerIsOverLimit ? C.danger : C.gold,
          }}>
            ⏱ {fmtDur(speakerElapsedSec)}
            {speakerTimeLimit > 0 && (
              <span style={{ fontWeight:400, fontSize:11, marginLeft:6, opacity:.7 }}>
                / {fmtDur(speakerTimeLimit)}
              </span>
            )}
          </div>

          {/* Reactions */}
          <div style={{ display:'flex', gap:8 }}>
            {[
              { key:'agree',   emoji:'👍', label:'Agree' },
              { key:'followup',emoji:'❓', label:'Follow-up' },
              { key:'same',    emoji:'✋', label:'Same Q' },
            ].map(({ key, emoji, label }) => (
              <div key={key} style={{
                display:'flex', alignItems:'center', gap:4, fontSize:12,
                padding:'3px 10px', borderRadius:20, background:'rgba(255,255,255,0.7)',
                border:`1px solid ${C.goldBorder}`, fontWeight:700, color:'#92400e',
              }}>
                {emoji} {reactions[key] || 0}
                <span style={{ fontSize:9, fontWeight:400, color:C.muted }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Whisper panel */}
          {currentSpeaker && (
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              <input
                value={whisperText}
                onChange={e => { setWhisperText(e.target.value); setWhisperSent(false); }}
                onKeyDown={e => e.key === 'Enter' && sendWhisper()}
                placeholder="💬 Whisper to speaker…"
                style={{ flex:1, padding:'5px 10px', fontSize:12, borderRadius:8, border:'1px solid #fde68a', background:'#fffbeb', outline:'none' }}
              />
              <button onClick={sendWhisper} disabled={!whisperText.trim()} style={{
                padding:'5px 12px', fontSize:11, fontWeight:700, borderRadius:8, border:'none',
                background: whisperSent ? '#059669' : '#d97706', color:'#fff', cursor:'pointer',
              }}>
                {whisperSent ? '✓ Sent' : 'Send'}
              </button>
            </div>
          )}

          {/* Time limit setter */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <input
              type="number" placeholder="Limit (s)" value={timeLimitInput}
              onChange={e => setTimeLimitInput(e.target.value)}
              style={{ width:78, padding:'4px 8px', fontSize:12, borderRadius:7,
                border:`1px solid ${C.border}`, outline:'none', color:C.text, background:'#fff' }}
            />
            <button type="button" className="btn" onClick={handleSetTimeLimit} style={{
              padding:'4px 10px', fontSize:11, fontWeight:700, borderRadius:7,
              background:C.primary, color:'#fff', border:'none',
            }}>Set</button>
            {speakerTimeLimit > 0 && (
              <button type="button" className="btn" onClick={() => emit('setTimeLimit', { seconds: 0 })} style={{
                padding:'4px 8px', fontSize:11, borderRadius:7,
                background:C.bg, color:C.muted, border:`1px solid ${C.border}`,
              }}>Clear</button>
            )}
            {/* Auto-advance toggle */}
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer', color:C.muted }}>
              <input type="checkbox" checked={autoAdvance} onChange={e => {
                setAutoAdvance(e.target.checked);
                socketRef.current?.emit('setAutoAdvance', { enabled: e.target.checked });
              }} style={{ accentColor:C.primary }} />
              Auto-advance
            </label>
          </div>

          <button type="button" className="btn" onClick={() => handleEnd(currentSpeaker.id)} style={{
            marginLeft:'auto', padding:'6px 14px', fontSize:12, fontWeight:600, borderRadius:8,
            background:C.dangerLight, color:C.danger, border:'1px solid #fca5a5',
          }}>End Turn</button>
        </div>
      )}

      {/* ══ Main grid ════════════════════════════════════════════════════════ */}
      <div className="dash-grid" style={{
        display:'grid', gridTemplateColumns:'1fr 320px',
        maxWidth:1440, margin:'0 auto', padding:20, gap:20, alignItems:'start',
      }}>

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Seating map */}
          <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`,
            overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`,
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontWeight:700, fontSize:14 }}>Seating Map</span>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                <button type="button" className="btn" onClick={() => setHeatmapEnabled(h => !h)} style={{
                  padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:7,
                  background: heatmapEnabled ? C.purpleLight : C.bg,
                  color: heatmapEnabled ? C.purple : C.muted,
                  border:`1px solid ${heatmapEnabled ? '#c4b5fd' : C.border}`,
                }}>🌡 Heatmap</button>
                <button type="button" className="btn" onClick={handlePause} style={{
                  padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:7,
                  background: queuePaused ? C.successLight : C.primaryLight,
                  color: queuePaused ? C.success : C.primary,
                  border:`1px solid ${queuePaused ? '#6ee7b7' : C.primaryBorder}`,
                }}>{queuePaused ? '▶ Resume' : '⏸ Pause'}</button>
                <button type="button" className="btn" onClick={handleRefresh} style={{
                  padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:7,
                  background:C.bg, color:C.muted, border:`1px solid ${C.border}`,
                }}>↺ Refresh</button>
                {!showClearConfirm ? (
                  <button type="button" className="btn" onClick={() => setShowClearConfirm(true)} style={{
                    padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:7,
                    background:C.dangerLight, color:C.danger, border:'1px solid #fca5a5',
                  }}>Clear All</button>
                ) : (
                  <>
                    <button type="button" className="btn" onClick={handleClearAll} style={{
                      padding:'4px 10px', fontSize:11, fontWeight:700, borderRadius:7,
                      background:C.danger, color:'#fff', border:'none',
                    }}>Confirm</button>
                    <button type="button" className="btn" onClick={() => setShowClearConfirm(false)} style={{
                      padding:'4px 10px', fontSize:11, borderRadius:7,
                      background:C.bg, color:C.muted, border:`1px solid ${C.border}`,
                    }}>Cancel</button>
                  </>
                )}
              </div>
            </div>
            <div style={{ height:460 }}>
              <ModeratorAuditorium3D queue={queue} currentSpeaker={currentSpeaker} heatmapEnabled={heatmapEnabled} speakerLiveGps={speakerLiveGps} />
            </div>
          </div>

          {/* Live Transcript panel */}
          {transcript.length > 0 && (
            <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`, marginTop:0 }}>
              <div onClick={() => setShowTranscript(p => !p)} style={{ padding:'10px 16px', display:'flex', justifyContent:'space-between', cursor:'pointer', userSelect:'none' }}>
                <span style={{ fontWeight:700, fontSize:13 }}>📝 Live Transcript</span>
                <span style={{ fontSize:12, color:C.muted }}>{showTranscript ? '▲' : '▼'} {transcript.length} lines</span>
              </div>
              {showTranscript && (
                <div style={{ padding:'0 16px 12px', maxHeight:180, overflowY:'auto', display:'flex', flexDirection:'column', gap:4 }}>
                  {transcript.map((t, i) => (
                    <div key={i} style={{ fontSize:12, color:C.text }}>
                      <span style={{ fontWeight:600, color:C.primary }}>{t.speaker}: </span>{t.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pre-session Questions panel */}
          <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`,
            boxShadow:'0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ padding:'12px 16px', borderBottom: showPreQuestions ? `1px solid ${C.border}` : 'none',
              display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <button type="button" className="btn" onClick={() => setShowPreQuestions(v => !v)} style={{
                fontWeight:700, fontSize:13, color:C.text, background:'none', border:'none', padding:0,
                display:'flex', alignItems:'center', gap:8,
              }}>
                💬 Pre-session Questions
                {preQuestions.length > 0 && (
                  <span style={{ background:C.primary, color:'#fff', borderRadius:10, padding:'0 6px', fontSize:11, fontWeight:800 }}>{preQuestions.length}</span>
                )}
                <span style={{ fontSize:10, color:C.muted }}>{showPreQuestions ? '▲' : '▼'}</span>
              </button>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                {/* Screening toggle */}
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
                  <input type="checkbox" checked={screeningEnabled} onChange={e => {
                    setScreeningEnabled(e.target.checked);
                    socketRef.current?.emit('toggleScreening', { enabled: e.target.checked });
                  }} style={{ accentColor:C.primary }} />
                  Screen Qs
                </label>
                {/* Word cloud toggle */}
                <button onClick={() => setShowWordCloud(p => !p)} style={{ fontSize:11, padding:'3px 9px', borderRadius:6, border:`1px solid ${C.border}`, background:C.surface, cursor:'pointer', color:C.muted }}>
                  ☁️ Word Cloud
                </button>
                <button type="button" className="btn" onClick={togglePreSessionOpen} style={{
                  padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:7,
                  background: preSessionOpen ? C.successLight : C.dangerLight,
                  color: preSessionOpen ? C.success : C.danger,
                  border:`1px solid ${preSessionOpen ? '#a7f3d0' : '#fca5a5'}`,
                }}>{preSessionOpen ? '🟢 Open' : '🔴 Closed'}</button>
                {preQuestions.length > 0 && (
                  <button type="button" className="btn" onClick={() => emit('clearPreQuestions')} style={{
                    padding:'4px 10px', fontSize:11, borderRadius:7,
                    background:C.bg, color:C.muted, border:`1px solid ${C.border}`,
                  }}>Clear</button>
                )}
              </div>
            </div>

            {showPreQuestions && (
              <div>
                {/* Pending questions (screening) */}
                {screeningEnabled && pendingQuestions.length > 0 && (
                  <div style={{ margin:'8px 8px 0', border:`1px solid ${C.goldBorder}`, borderRadius:8, overflow:'hidden' }}>
                    <div style={{ background:C.goldLight, padding:'6px 12px', fontSize:11, fontWeight:700, color:C.gold }}>
                      ⏳ AWAITING APPROVAL ({pendingQuestions.length})
                    </div>
                    {pendingQuestions.map(q => (
                      <div key={q.id} style={{ padding:'8px 12px', borderTop:`1px solid ${C.border}`, display:'flex', gap:8, alignItems:'center' }}>
                        <span style={{ flex:1, fontSize:13 }}>{q.text}</span>
                        <button onClick={() => socketRef.current?.emit('approveQuestion', { id: q.id })}
                          style={{ padding:'3px 10px', borderRadius:6, border:'none', background:C.success, color:'#fff', cursor:'pointer', fontSize:11 }}>
                          ✓
                        </button>
                        <button onClick={() => socketRef.current?.emit('rejectQuestion', { id: q.id })}
                          style={{ padding:'3px 10px', borderRadius:6, border:'none', background:C.danger, color:'#fff', cursor:'pointer', fontSize:11 }}>
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Word cloud */}
                {showWordCloud && wordCloudWords.length > 0 && (
                  <div style={{ margin:'8px 8px 0', padding:'12px 16px', background:'#f8fafc', borderRadius:10, border:`1px solid ${C.border}`, display:'flex', flexWrap:'wrap', gap:8, alignItems:'center', justifyContent:'center' }}>
                    {wordCloudWords.map(({ word, count }) => {
                      const maxCount = wordCloudWords[0].count;
                      const size = 11 + Math.round((count / maxCount) * 18);
                      const opacity = 0.5 + (count / maxCount) * 0.5;
                      return (
                        <span key={word} style={{ fontSize:size, fontWeight:count>2?700:500, color:C.primary, opacity, lineHeight:1.3, cursor:'default' }} title={`${count} mentions`}>
                          {word}
                        </span>
                      );
                    })}
                  </div>
                )}
                <div style={{ maxHeight:300, overflowY:'auto', padding:'8px 0' }}>
                  {preQuestions.length === 0 ? (
                    <div style={{ padding:'24px 16px', textAlign:'center', fontSize:13, color:C.muted }}>
                      No questions submitted yet.
                    </div>
                  ) : preQuestions.map((q, idx) => (
                    <div key={q.id} style={{
                      padding:'10px 16px', borderBottom:`1px solid ${C.border}`,
                      display:'flex', alignItems:'flex-start', gap:10,
                    }}>
                      <span style={{ fontWeight:800, fontSize:12, color:C.muted, minWidth:18, textAlign:'right' }}>{idx + 1}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, color:C.text, lineHeight:1.4 }}>{q.text}</div>
                        <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>
                          {q.name} · {q.section || 'Unknown section'}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                        <span style={{
                          fontWeight:700, fontSize:12, color:C.primary,
                          background:C.primaryLight, borderRadius:20, padding:'2px 8px',
                          border:`1px solid ${C.primaryBorder}`,
                        }}>▲ {q.votes}</span>
                        <button type="button" className="btn" onClick={() => handleDeleteQuestion(q.id)} style={{
                          fontSize:14, lineHeight:1, border:'none', background:'none', color:C.muted, padding:'2px 4px',
                        }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right column ─────────────────────────────────────────────────── */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* QR code */}
          <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`,
            padding:16, boxShadow:'0 1px 4px rgba(0,0,0,.05)', textAlign:'center' }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.muted, marginBottom:10, letterSpacing:'.05em' }}>
              SCAN TO JOIN · {ROOM_LABELS[activeRoom].toUpperCase()}
            </div>
            <div style={{ display:'inline-block', padding:8, background:'#fff',
              borderRadius:10, border:`1px solid ${C.border}`, marginBottom:8 }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrBase)}`}
                alt="Join QR" style={{ width:160, height:160, display:'block', borderRadius:4 }} />
            </div>
            <div style={{ fontSize:10, color:C.muted, wordBreak:'break-all' }}>{qrBase}</div>
          </div>

          {/* Live Poll panel */}
          <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`,
            boxShadow:'0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ padding:'12px 16px', borderBottom:`1px solid ${C.border}`,
              display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:700, fontSize:13 }}>📊 Live Poll</span>
              {!currentPoll && !showPollForm && (
                <button type="button" className="btn" onClick={() => setShowPollForm(true)} style={{
                  padding:'4px 10px', fontSize:11, fontWeight:700, borderRadius:7,
                  background:C.primaryLight, color:C.primary, border:`1px solid ${C.primaryBorder}`,
                }}>+ Create</button>
              )}
              {currentPoll && (
                <div style={{ display:'flex', gap:6 }}>
                  {!currentPoll.closed && (
                    <button type="button" className="btn" onClick={() => emit('closePoll')} style={{
                      padding:'4px 10px', fontSize:11, fontWeight:600, borderRadius:7,
                      background:C.goldLight, color:C.gold, border:`1px solid ${C.goldBorder}`,
                    }}>Close</button>
                  )}
                  <button type="button" className="btn" onClick={() => emit('clearPoll')} style={{
                    padding:'4px 10px', fontSize:11, borderRadius:7,
                    background:C.bg, color:C.muted, border:`1px solid ${C.border}`,
                  }}>Clear</button>
                </div>
              )}
            </div>

            <div style={{ padding:'12px 16px' }}>
              {showPollForm && !currentPoll && (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <input type="text" placeholder="Poll question…" value={pollQuestion}
                    onChange={e => setPollQuestion(e.target.value)} style={{
                      padding:'8px 10px', fontSize:13, borderRadius:8, border:`1px solid ${C.border}`,
                      color:C.text, outline:'none', width:'100%',
                    }} />
                  {pollOptions.map((opt, i) => (
                    <div key={i} style={{ display:'flex', gap:6 }}>
                      <input type="text" placeholder={`Option ${i + 1}`} value={opt}
                        onChange={e => setPollOptions(o => o.map((v, j) => j === i ? e.target.value : v))}
                        style={{ flex:1, padding:'7px 10px', fontSize:12, borderRadius:7,
                          border:`1px solid ${C.border}`, color:C.text, outline:'none' }} />
                      {pollOptions.length > 2 && (
                        <button type="button" className="btn" onClick={() => setPollOptions(o => o.filter((_, j) => j !== i))} style={{
                          fontSize:16, border:'none', background:'none', color:C.muted, padding:'0 4px',
                        }}>×</button>
                      )}
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:6 }}>
                    <button type="button" className="btn" onClick={() => setPollOptions(o => [...o, ''])} style={{
                      flex:1, padding:'6px', fontSize:11, borderRadius:7,
                      background:C.bg, color:C.muted, border:`1px solid ${C.border}`,
                    }}>+ Option</button>
                    <button type="button" className="btn" onClick={handleCreatePoll} style={{
                      flex:2, padding:'6px', fontSize:12, fontWeight:700, borderRadius:7,
                      background:C.primary, color:'#fff', border:'none',
                    }}>Launch Poll</button>
                    <button type="button" className="btn" onClick={() => setShowPollForm(false)} style={{
                      padding:'6px 10px', fontSize:11, borderRadius:7,
                      background:C.bg, color:C.muted, border:`1px solid ${C.border}`,
                    }}>Cancel</button>
                  </div>
                </div>
              )}

              {currentPoll ? (
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:C.text, marginBottom:10 }}>
                    {currentPoll.question}
                    {currentPoll.closed && (
                      <span style={{ marginLeft:8, fontSize:10, color:C.muted, fontWeight:400 }}>closed</span>
                    )}
                  </div>
                  {(() => {
                    const total = currentPoll.options.reduce((s, o) => s + o.votes, 0);
                    return currentPoll.options.map((opt, i) => {
                      const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
                      return (
                        <div key={i} style={{ marginBottom:8 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                            <span style={{ color:C.text, fontWeight:600 }}>{opt.text}</span>
                            <span style={{ color:C.muted }}>{opt.votes} ({pct}%)</span>
                          </div>
                          <div style={{ height:8, background:C.border, borderRadius:4, overflow:'hidden' }}>
                            <div style={{ height:'100%', width:`${pct}%`, background:C.primary,
                              borderRadius:4, transition:'width .4s ease' }} />
                          </div>
                        </div>
                      );
                    });
                  })()}
                  <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>
                    Total votes: {currentPoll.options.reduce((s, o) => s + o.votes, 0)}
                  </div>
                </div>
              ) : !showPollForm && (
                <div style={{ textAlign:'center', fontSize:12, color:C.muted, padding:'16px 0' }}>
                  No active poll. Click + Create to launch one.
                </div>
              )}
            </div>
          </div>

          {/* ── Settings Panel ──────────────────────────────────── */}
          {showSettings && (
            <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.primaryBorder}`, padding:16, boxShadow:'0 1px 8px rgba(37,99,235,.08)' }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:12 }}>⚙️ Room Settings</div>

              {/* Passcode */}
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:'block', marginBottom:5 }}>🔒 Room Passcode (leave blank to disable)</label>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={passcodeInput} onChange={e => setPasscodeInput(e.target.value)}
                    placeholder="e.g. 123456" maxLength={20}
                    style={{ flex:1, padding:'7px 10px', fontSize:13, borderRadius:7, border:`1px solid ${C.border}`, outline:'none' }} />
                  <button onClick={handleSavePasscode} style={{ padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:7, background:C.primary, color:'#fff', border:'none', cursor:'pointer' }}>Save</button>
                </div>
              </div>

              {/* Webhook */}
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:'block', marginBottom:5 }}>🔗 Webhook URL (POST on speaker/poll/session events)</label>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={webhookInput} onChange={e => setWebhookInput(e.target.value)}
                    placeholder="https://hooks.slack.com/…" type="url"
                    style={{ flex:1, padding:'7px 10px', fontSize:12, borderRadius:7, border:`1px solid ${C.border}`, outline:'none' }} />
                  <button onClick={handleSaveWebhook} style={{ padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:7, background:C.primary, color:'#fff', border:'none', cursor:'pointer' }}>Save</button>
                </div>
                <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>Events: speaker.start · speaker.end · poll.create · session.end</div>
              </div>

              {/* Background video */}
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:'block', marginBottom:5 }}>🎬 Audience Background Video URL (plays silently behind audience screen)</label>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={bgVideoInput} onChange={e => setBgVideoInput(e.target.value)}
                    placeholder="https://example.com/ambient.mp4" type="url"
                    style={{ flex:1, padding:'7px 10px', fontSize:12, borderRadius:7, border:`1px solid ${C.border}`, outline:'none' }} />
                  <button onClick={handleSaveBgVideo} style={{ padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:7, background:C.primary, color:'#fff', border:'none', cursor:'pointer' }}>Set</button>
                </div>
                <div style={{ display:'flex', gap:6, marginTop:4 }}>
                  <button onClick={() => { setBgVideoInput(''); socketRef.current?.emit('setBgVideo', { url: '' }); }}
                    style={{ fontSize:10, color:C.red, border:'none', background:'none', cursor:'pointer', padding:0 }}>Clear video</button>
                  <span style={{ fontSize:10, color:C.muted }}>· All touches/clicks on video are blocked on audience devices</span>
                </div>
              </div>

              {/* Ad banner */}
              <div style={{ marginBottom:12, padding:'10px 12px', borderRadius:10, background:'#fffbeb', border:'1px solid #fde68a' }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#92400e', display:'block', marginBottom:5 }}>📢 Ad Banner Image URL (shown at bottom of audience screen)</label>
                <div style={{ display:'flex', gap:6 }}>
                  <input value={adInput} onChange={e => setAdInput(e.target.value)}
                    placeholder="https://example.com/ad-banner.png" type="url"
                    style={{ flex:1, padding:'7px 10px', fontSize:12, borderRadius:7, border:'1px solid #fcd34d', outline:'none', background:'#fff' }} />
                  <button onClick={handleSaveAd} style={{ padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:7, background:'#d97706', color:'#fff', border:'none', cursor:'pointer' }}>Push</button>
                </div>
                <div style={{ display:'flex', gap:8, marginTop:5, alignItems:'center' }}>
                  <button onClick={() => { setAdInput(''); socketRef.current?.emit('setAd', { url: '' }); }}
                    style={{ fontSize:10, color:C.red, border:'none', background:'none', cursor:'pointer', padding:0 }}>Remove ad</button>
                  <span style={{ fontSize:10, color:'#92400e' }}>· Ad is fully touch-protected — accidental taps cannot open URLs or switch tabs</span>
                </div>
              </div>

              {/* Projector link */}
              <div>
                <label style={{ fontSize:11, fontWeight:600, color:C.muted, display:'block', marginBottom:5 }}>📺 Projector / Second Screen</label>
                <button onClick={() => window.open(`${audienceUrlForQR}?mode=projector&room=${activeRoom}`, '_blank')}
                  style={{ width:'100%', padding:'8px', fontSize:12, fontWeight:700, borderRadius:7, background:'#7c3aed', color:'#fff', border:'none', cursor:'pointer' }}>
                  Open Projector View →
                </button>
              </div>
            </div>
          )}

          {/* ── AI Panel ─────────────────────────────────────────── */}
          {showAIPanel && (
            <div style={{ background:C.surface, borderRadius:12, border:`1px solid #c4b5fd`, padding:16, boxShadow:'0 1px 8px rgba(124,58,237,.08)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <span style={{ fontWeight:700, fontSize:13 }}>🤖 AI Insights</span>
                <button onClick={() => setShowAIPanel(false)} style={{ border:'none', background:'none', fontSize:16, cursor:'pointer', color:C.muted }}>×</button>
              </div>

              {/* Fact-check section */}
              <div style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:C.muted }}>✅ Fact-Check Transcript</span>
                  <button onClick={handleFactCheck} disabled={factCheckLoading || transcript.length === 0}
                    style={{ padding:'4px 10px', fontSize:11, fontWeight:700, borderRadius:6, border:'none',
                      background: transcript.length > 0 ? '#7c3aed' : C.border,
                      color: transcript.length > 0 ? '#fff' : C.muted, cursor: transcript.length > 0 ? 'pointer' : 'default' }}>
                    {factCheckLoading ? '…' : 'Check Now'}
                  </button>
                </div>
                {factCheckFlags.length === 0 && !factCheckLoading && (
                  <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>
                    {transcript.length === 0 ? 'No transcript yet — start speaking.' : 'No flags found — all clear ✓'}
                  </div>
                )}
                {factCheckFlags.map((f, i) => (
                  <div key={i} style={{ marginBottom:8, padding:'8px 10px', borderRadius:8, border:`1px solid ${f.severity==='high'?'#fca5a5':f.severity==='medium'?'#fed7aa':'#e2e8f0'}`,
                    background: f.severity==='high'?'#fef2f2':f.severity==='medium'?'#fffbeb':'#f8fafc' }}>
                    <div style={{ fontSize:12, fontWeight:700, color: f.severity==='high'?C.danger:f.severity==='medium'?C.gold:'#475569' }}>
                      {f.severity==='high'?'🔴':f.severity==='medium'?'🟡':'🔵'} {f.claim}
                    </div>
                    <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>{f.concern}</div>
                  </div>
                ))}
              </div>

              {/* Question grouping */}
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:C.muted }}>🧠 Group Questions by Theme</span>
                  <button onClick={handleGroupQuestions} disabled={groupLoading || preQuestions.length < 3}
                    style={{ padding:'4px 10px', fontSize:11, fontWeight:700, borderRadius:6, border:'none',
                      background: preQuestions.length >= 3 ? '#7c3aed' : C.border,
                      color: preQuestions.length >= 3 ? '#fff' : C.muted, cursor: preQuestions.length >= 3 ? 'pointer' : 'default' }}>
                    {groupLoading ? '…' : 'Group'}
                  </button>
                </div>
                {preQuestions.length < 3 && (
                  <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>Need 3+ questions to group.</div>
                )}
                {questionGroups.map((g, i) => (
                  <div key={i} style={{ marginBottom:8, padding:'8px 10px', borderRadius:8, background:'#f5f3ff', border:'1px solid #c4b5fd' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#7c3aed', marginBottom:5 }}>{g.emoji} {g.theme}</div>
                    {g.questions.map((q, j) => (
                      <div key={j} style={{ fontSize:11, color:C.muted, paddingLeft:8, marginBottom:2 }}>· {q}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI trigger buttons (always visible when there's data) */}
          {(preQuestions.length >= 3 || transcript.length > 0) && !showAIPanel && (
            <button onClick={() => setShowAIPanel(true)} style={{
              width:'100%', padding:'9px', fontSize:12, fontWeight:700, borderRadius:10,
              background:'linear-gradient(135deg,#7c3aed,#2563eb)', color:'#fff', border:'none', cursor:'pointer',
            }}>
              🤖 Open AI Insights — Fact-check &amp; Group Questions
            </button>
          )}

          {/* Queue */}
          <div style={{ background:C.surface, borderRadius:12, border:`1px solid ${C.border}`,
            boxShadow:'0 1px 4px rgba(0,0,0,.05)', display:'flex', flexDirection:'column', maxHeight:560 }}>

            {/* Queue header */}
            <div style={{ padding:'12px 14px 10px', borderBottom:`1px solid ${C.border}`,
              display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexShrink:0 }}>
              <span style={{ fontWeight:700, fontSize:14 }}>
                Queue
                {queue.length > 0 && (
                  <span style={{ marginLeft:7, background:C.primary, color:'#fff',
                    borderRadius:20, padding:'1px 7px', fontSize:11, fontWeight:800 }}>{queue.length}</span>
                )}
              </span>
              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                {!currentSpeaker && queue.length > 0 && (
                  <button type="button" className="btn" onClick={() => handleSelect(queue[0].id)} style={{
                    padding:'5px 10px', fontSize:11, fontWeight:700,
                    background:C.primary, color:'#fff', border:'none', borderRadius:7, whiteSpace:'nowrap',
                  }}>Call Next</button>
                )}
                {queue.length > 1 && (
                  <button type="button" className="btn" onClick={handleRandomPick} title="Random speaker pick" style={{
                    padding:'5px 9px', fontSize:12, border:`1px solid ${C.border}`, background:C.bg, borderRadius:7,
                  }}>🎲</button>
                )}
                <input type="text" placeholder="Search…" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)} style={{
                    padding:'5px 9px', fontSize:12, borderRadius:7, width:82,
                    border:`1px solid ${C.border}`, outline:'none', color:C.text, background:C.bg,
                  }} />
              </div>
            </div>

            {/* Filters */}
            <div style={{ padding:'8px 14px', borderBottom:`1px solid ${C.border}`,
              display:'flex', gap:5, flexWrap:'wrap', flexShrink:0 }}>
              <select value={sectionFilter} onChange={e => setSectionFilter(e.target.value)} style={{
                padding:'4px 7px', fontSize:11, borderRadius:6, flex:1,
                border:`1px solid ${C.border}`, color:C.text, background:C.bg, outline:'none',
              }}>
                <option>All sections</option>
                {ALL_SECTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                padding:'4px 7px', fontSize:11, borderRadius:6, width:100,
                border:`1px solid ${C.border}`, color:C.text, background:C.bg, outline:'none',
              }}>
                <option value="time">By time</option>
                <option value="section">By section</option>
                <option value="priority">Priority first</option>
              </select>
            </div>

            {/* Queue list */}
            <div style={{ overflowY:'auto', flex:1, padding:'6px 0' }}>
              {filteredQueue.length === 0 ? (
                <div style={{ padding:'32px 16px', textAlign:'center', fontSize:13, color:C.muted }}>
                  {queue.length === 0 ? 'No hands raised yet.' : 'No results match your filter.'}
                  {queue.length === 0 && <div style={{ fontSize:11, opacity:.7, marginTop:4 }}>Share the QR code to get started.</div>}
                </div>
              ) : filteredQueue.map((person, idx) => {
                const isLongest = person.id === longestWaitId;
                return (
                  <div key={person.id} className="q-card" style={{
                    display:'flex', alignItems:'center', gap:9, padding:'9px 14px',
                    borderLeft:`3px solid ${person.priority ? C.gold : isLongest ? '#fbbf24' : 'transparent'}`,
                    background: person.priority ? '#fffbeb' : isLongest ? '#fffff8' : 'transparent',
                    transition:'background .15s',
                  }}>
                    <span style={{ fontSize:11, fontWeight:700, color:C.muted, minWidth:16, textAlign:'right' }}>{idx + 1}</span>

                    {/* Avatar */}
                    <div style={{
                      width:32, height:32, borderRadius:'50%', flexShrink:0,
                      background: person.anonymous ? '#f1f5f9' : C.primaryLight,
                      color: person.anonymous ? C.muted : C.primary,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontWeight:700, fontSize:13, border:`1px solid ${person.anonymous ? C.border : C.primaryBorder}`,
                    }}>{person.anonymous ? '?' : initials(person.name)}</div>

                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:5 }}>
                        {person.name || 'Anonymous'}
                        {person.priority && <span style={{ fontSize:10 }}>⭐</span>}
                        {person.anonymous && (
                          <span style={{ fontSize:9, color:C.muted, fontWeight:400, background:C.bg,
                            border:`1px solid ${C.border}`, borderRadius:8, padding:'0 5px' }}>anon</span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:C.muted, display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                        {person.section || '—'} · {fmtWait(person.joinedAt)}
                        {person.gpsVerified && (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:3,
                            fontSize:9.5, fontWeight:700, color:C.success, background:C.successLight,
                            border:'1px solid #a7f3d0', borderRadius:10, padding:'0 5px' }}>
                            <span style={{ width:4, height:4, borderRadius:'50%', background:C.success }} />
                            GPS{person.coords?.accuracy && ` ±${person.coords.accuracy}m`}
                          </span>
                        )}
                      </div>
                      {person.topic && (
                        <div style={{ fontSize:11, color:'#475569', marginTop:2, overflow:'hidden',
                          textOverflow:'ellipsis', whiteSpace:'nowrap', fontStyle:'italic' }}>
                          "{person.topic}"
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                      <button type="button" className="btn" onClick={() => handlePriority(person.id)} title="Prioritize" style={{
                        padding:'4px 7px', fontSize:12, border:`1px solid ${person.priority ? C.goldBorder : C.border}`,
                        background: person.priority ? C.goldLight : C.bg,
                        borderRadius:7,
                      }}>⭐</button>
                      <button type="button" className="btn" onClick={() => handleSelect(person.id)} style={{
                        padding:'5px 9px', fontSize:11, fontWeight:700,
                        background:C.primary, color:'#fff', border:'none', borderRadius:7,
                      }}>Select</button>
                      <button type="button" className="btn" onClick={() => handleSkip(person.id)} style={{
                        padding:'5px 9px', fontSize:11, fontWeight:600,
                        background:C.bg, color:C.muted, border:`1px solid ${C.border}`, borderRadius:7,
                      }}>Skip</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ══ QR Modal ═════════════════════════════════════════════════════════ */}
      {showQRModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,.6)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}
          onClick={() => setShowQRModal(false)}>
          <div style={{ background:C.surface, borderRadius:16, padding:28, maxWidth:840, width:'100%',
            maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 48px rgba(0,0,0,.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
              <h2 style={{ margin:0, fontSize:18, fontWeight:700 }}>Section QR Codes — {ROOM_LABELS[activeRoom]}</h2>
              <button type="button" className="btn" onClick={() => setShowQRModal(false)}
                style={{ fontSize:22, border:'none', background:'none', color:C.muted }}>×</button>
            </div>
            <p style={{ margin:'0 0 20px', fontSize:13, color:C.muted }}>
              Print and place one QR code per section. Audience scans to auto-select their seat.
            </p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:14, marginBottom:20 }}>
              {[
                {name:'Front Left',slug:'front-left'},{name:'Front Center',slug:'front-center'},
                {name:'Front Right',slug:'front-right'},{name:'Middle Left',slug:'middle-left'},
                {name:'Middle Center',slug:'middle-center'},{name:'Middle Right',slug:'middle-right'},
                {name:'Back Left',slug:'back-left'},{name:'Back Center',slug:'back-center'},
                {name:'Back Right',slug:'back-right'},{name:'Balcony Left',slug:'balcony-left'},
                {name:'Balcony Right',slug:'balcony-right'},{name:'Virtual',slug:'virtual'},
              ].map(s => {
                const url = `${audienceUrlForQR}/?section=${s.slug}${activeRoom !== 'main' ? `&room=${activeRoom}` : ''}`;
                return (
                  <div key={s.slug} style={{ textAlign:'center', padding:14, border:`1px solid ${C.border}`, borderRadius:10 }}>
                    <QRCode value={url} size={130} level="H" includeMargin />
                    <div style={{ marginTop:6, fontWeight:600, fontSize:12, color:C.text }}>{s.name}</div>
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn" onClick={() => window.print()} style={{
              width:'100%', padding:12, fontSize:14, fontWeight:700,
              background:C.primary, color:'#fff', border:'none', borderRadius:10,
            }}>Print All QR Codes</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
      <span style={{ fontSize:10, fontWeight:600, color:'#94a3b8', letterSpacing:'.04em' }}>{label.toUpperCase()}</span>
      <span style={{ fontSize:14, fontWeight:700, color: color || '#1e293b' }}>{value}</span>
    </div>
  );
}
