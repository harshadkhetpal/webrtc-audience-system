import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import AgoraRTC from 'agora-rtc-sdk-ng';
import SilencePrompt from './SilencePrompt';

// ─── Config ───────────────────────────────────────────────────────────────────
const getSocketUrl = () =>
  process.env.REACT_APP_BACKEND_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

const AGORA_APP_ID  = 'eef22b36609e44969d0173ef8c8ed95e';
const CHANNEL_NAME  = 'main-room';
// Random UID per session — prevents multiple audience members colliding on UID 0
const AGORA_UID     = Math.floor(Math.random() * 2_000_000) + 100;

const SECTIONS = [
  'Front Left','Front Center','Front Right',
  'Middle Left','Middle Center','Middle Right',
  'Back Left','Back Center','Back Right',
  'Balcony Left','Balcony Right','Online/Virtual',
];

// ─── GPS helpers ──────────────────────────────────────────────────────────────
function calcBearing(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1*Math.PI)/180, φ2 = (lat2*Math.PI)/180;
  const Δλ = ((lon2-lon1)*Math.PI)/180;
  const y = Math.sin(Δλ)*Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  return ((Math.atan2(y,x)*180/Math.PI)+360)%360;
}
function bearingToSection(b) {
  if (b>=345||b<15)  return 'Front Center';
  if (b<45)          return 'Front Right';
  if (b<105)         return 'Middle Right';
  if (b<135)         return 'Back Right';
  if (b<195)         return 'Back Center';
  if (b<225)         return 'Back Left';
  if (b<285)         return 'Middle Left';
  if (b<315)         return 'Front Left';
  return 'Front Center';
}

// ─── Socket singleton ─────────────────────────────────────────────────────────
let _socket = null;
function getSocket() {
  if (!_socket || !_socket.connected) {
    _socket = io(getSocketUrl(), {
      path:'/socket.io', reconnection:true, reconnectionAttempts:15,
      reconnectionDelay:2000, timeout:60000, transports:['polling','websocket'],
    });
  }
  return _socket;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtTimer = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
const fmtWait  = (s) => s < 60 ? `${s}s` : `${Math.floor(s/60)}m ${s%60}s`;

// ─── Translation languages (audience listening language) ──────────────────────
const TRANS_LANGUAGES = [
  { code: 'off', label: 'Off (Original)',  flag: '🔇', tts: null    },
  { code: 'en',  label: 'English',         flag: '🇬🇧', tts: 'en-US' },
  { code: 'es',  label: 'Spanish',         flag: '🇪🇸', tts: 'es-ES' },
  { code: 'fr',  label: 'French',          flag: '🇫🇷', tts: 'fr-FR' },
  { code: 'de',  label: 'German',          flag: '🇩🇪', tts: 'de-DE' },
  { code: 'pt',  label: 'Portuguese',      flag: '🇵🇹', tts: 'pt-PT' },
  { code: 'hi',  label: 'Hindi',           flag: '🇮🇳', tts: 'hi-IN' },
  { code: 'ar',  label: 'Arabic',          flag: '🇸🇦', tts: 'ar-SA' },
  { code: 'zh',  label: 'Chinese',         flag: '🇨🇳', tts: 'zh-CN' },
  { code: 'ja',  label: 'Japanese',        flag: '🇯🇵', tts: 'ja-JP' },
  { code: 'ko',  label: 'Korean',          flag: '🇰🇷', tts: 'ko-KR' },
  { code: 'it',  label: 'Italian',         flag: '🇮🇹', tts: 'it-IT' },
];

// ─── Speaker source languages (what the speaker talks in) ─────────────────────
const SPEAKER_SRC_LANGS = [
  { stt: 'en-US', mm: 'en', label: 'English',    flag: '🇬🇧' },
  { stt: 'es-ES', mm: 'es', label: 'Spanish',    flag: '🇪🇸' },
  { stt: 'fr-FR', mm: 'fr', label: 'French',     flag: '🇫🇷' },
  { stt: 'de-DE', mm: 'de', label: 'German',     flag: '🇩🇪' },
  { stt: 'pt-PT', mm: 'pt', label: 'Portuguese', flag: '🇵🇹' },
  { stt: 'hi-IN', mm: 'hi', label: 'Hindi',      flag: '🇮🇳' },
  { stt: 'ar-SA', mm: 'ar', label: 'Arabic',     flag: '🇸🇦' },
  { stt: 'zh-CN', mm: 'zh', label: 'Chinese',    flag: '🇨🇳' },
  { stt: 'ja-JP', mm: 'ja', label: 'Japanese',   flag: '🇯🇵' },
  { stt: 'ko-KR', mm: 'ko', label: 'Korean',     flag: '🇰🇷' },
  { stt: 'it-IT', mm: 'it', label: 'Italian',    flag: '🇮🇹' },
];

// srcCode = MyMemory language code of the speaker (e.g. 'hi')
// langCode = audience's target language code (e.g. 'en')
async function translateAndSpeak(text, langCode, srcCode, onResult) {
  if (!text || !langCode || langCode === 'off') return;
  const lang = TRANS_LANGUAGES.find(l => l.code === langCode);
  if (!lang?.tts) return;
  const src = srcCode || 'en';
  // If speaker and audience language are the same — just speak the original
  if (src === langCode) {
    if (onResult) onResult(text);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang.tts;
      utter.rate = 1.05;
      window.speechSynthesis.speak(utter);
    }
    return;
  }
  try {
    const res = await fetch(
      `https://mymemory.translated.net/api/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${src}|${langCode}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return;
    const data = await res.json();
    const translated = data.responseData?.translatedText || text;
    if (onResult) onResult(translated);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(translated);
      utter.lang = lang.tts;
      utter.rate = 1.05;
      window.speechSynthesis.speak(utter);
    }
  } catch { /* network error — silently ignore */ }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AudienceView({ workspaceId = 'default' }) {
  // ── View ──────────────────────────────────────────────────────────────────
  const [viewState,       setViewState]       = useState('initial');

  // ── Form ──────────────────────────────────────────────────────────────────
  const [name,            setName]            = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [topic,           setTopic]           = useState('');
  const [isAnonymous,     setIsAnonymous]     = useState(false);
  const [nameError,       setNameError]       = useState('');
  const [sectionError,    setSectionError]    = useState('');

  // ── GPS ───────────────────────────────────────────────────────────────────
  const [detectedSection, setDetectedSection] = useState('');
  const [locationError,   setLocationError]   = useState('');
  const [isDetecting,     setIsDetecting]     = useState(false);
  const [gpsCoords,       setGpsCoords]       = useState(null);
  const [gpsWatchId,      setGpsWatchId]      = useState(null);
  const gpsWatchIdRef     = useRef(null);

  // ── Queue ─────────────────────────────────────────────────────────────────
  const [queuePosition,   setQueuePosition]   = useState(1);
  const [queueTotal,      setQueueTotal]      = useState(0);
  const [joinedAt,        setJoinedAt]        = useState(null);
  const [waitTick,        setWaitTick]        = useState(0);
  const [activeSpeaker,   setActiveSpeaker]   = useState(null);
  const [notifSent,       setNotifSent]       = useState(false);

  // ── Speaking ──────────────────────────────────────────────────────────────
  const [speakingDuration, setSpeakingDuration] = useState(0);
  const [speakerTimeLimit, setSpeakerTimeLimit] = useState(0);
  const [isAudioReady,     setIsAudioReady]     = useState(false);
  const [audioError,       setAudioError]       = useState(null);

  // ── Poll ──────────────────────────────────────────────────────────────────
  const [activePoll,      setActivePoll]      = useState(null);
  const [myVote,          setMyVote]          = useState(null); // optionIndex or 'done'
  const [lastPollId,      setLastPollId]      = useState(null);

  // ── Pre-session questions ─────────────────────────────────────────────────
  const [preQuestions,    setPreQuestions]    = useState([]);
  const [preSessionOpen,  setPreSessionOpen]  = useState(true);
  const [questionInput,   setQuestionInput]   = useState('');
  const [upvotedIds,      setUpvotedIds]      = useState(new Set());
  const [showPreQ,        setShowPreQ]        = useState(false);

  // ── Connection ────────────────────────────────────────────────────────────
  const [socketConnected, setSocketConnected] = useState(false);

  // ── Room ──────────────────────────────────────────────────────────────────
  const [activeRoom,      setActiveRoom]      = useState('main');

  // ── Silence prompt ────────────────────────────────────────────────────────
  const [silenceVisible,  setSilenceVisible]  = useState(false);

  // ── Whisper from moderator ────────────────────────────────────────────────
  const [whisperMsg,      setWhisperMsg]      = useState(null); // { message, from, ts }

  // ── Passcode ─────────────────────────────────────────────────────────────
  const [roomPasscodeRequired, setRoomPasscodeRequired] = useState(false);
  const [passcodeInput,  setPasscodeInput]   = useState('');
  const [passcodeError,  setPasscodeError]   = useState('');

  // ── Transcription ─────────────────────────────────────────────────────────
  const [transcriptLines, setTranscriptLines] = useState([]);
  const speechRef = useRef(null);
  const isTranscribingRef = useRef(false);

  // ── Text-only mode ────────────────────────────────────────────────────────
  const [textOnlyMode,    setTextOnlyMode]   = useState(false);

  // ── Top contributor badge ─────────────────────────────────────────────────
  const [isTopContributor, setIsTopContributor] = useState(false);
  const [speakerStartedAt, setSpeakerStartedAt] = useState(null);
  const [bgVideoUrl,       setBgVideoUrl]       = useState('');
  const [adUrl,            setAdUrl]            = useState('');
  const [tickNow,          setTickNow]          = useState(Date.now());

  // ── Post-session feedback ─────────────────────────────────────────────────
  const [showFeedback,     setShowFeedback]     = useState(false);
  const [feedbackStars,    setFeedbackStars]    = useState(0);
  const [feedbackHover,    setFeedbackHover]    = useState(0);
  const [feedbackComment,  setFeedbackComment]  = useState('');
  const [feedbackSent,     setFeedbackSent]     = useState(false);

  // ── Live translation ───────────────────────────────────────────────────────
  const [transLang,         setTransLang]         = useState('off');
  const [showLangPicker,    setShowLangPicker]    = useState(false);
  const [latestTranslation, setLatestTranslation] = useState('');
  const transLangRef          = useRef('off');
  const translatedHashRef     = useRef('');
  // speaker source language (what they speak in)
  const [speakerSrcLang,    setSpeakerSrcLang]    = useState('en-US'); // stt code
  const speakerSrcLangRef     = useRef('en-US');
  const activeSpeakerSrcMMRef = useRef('en'); // MyMemory code of current speaker

  const socketRef      = useRef(null);
  const agoraClientRef = useRef(null);
  const audioTrackRef  = useRef(null);
  const lastSectionRef = useRef('');
  const prevSpeakerRef = useRef(null);  // tracks previous speaker to detect new-speaker events
  // Tracks speaking state inside GPS callback (avoids stale closure)
  const isSpeakingRef  = useRef(false);

  // ─── GPS watcher ──────────────────────────────────────────────────────────
  const VENUE_LAT = 28.9845, VENUE_LNG = 77.7064;

  const applyPosition = (pos) => {
    const { latitude:lat, longitude:lng, accuracy } = pos.coords;
    const coords = { lat, lng, accuracy: Math.round(accuracy) };
    setGpsCoords(coords);
    const sec = bearingToSection(calcBearing(VENUE_LAT, VENUE_LNG, lat, lng));
    setDetectedSection(sec);
    setSelectedSection(prev => prev || sec);
    setIsDetecting(false);
    const sock = socketRef.current;
    if (sock) {
      const sectionChanged = lastSectionRef.current !== sec;
      // While speaking: always broadcast GPS so the moderator sees live accuracy
      // When in queue / idle: only broadcast on section change to reduce traffic
      if (sectionChanged || isSpeakingRef.current) {
        if (sectionChanged) lastSectionRef.current = sec;
        sock.emit('updateLocation', { coords, section: sec });
      }
    }
  };

  const startGPS = () => {
    if (!navigator.geolocation) { setLocationError('Geolocation not supported.'); return; }
    setIsDetecting(true); setLocationError('');
    const id = navigator.geolocation.watchPosition(applyPosition, (err) => {
      setIsDetecting(false);
      setLocationError(err.code === 1
        ? 'Location permission denied. Select section manually.'
        : 'Could not detect location. Select section manually.');
    }, { enableHighAccuracy:true, timeout:15000, maximumAge:5000 });
    gpsWatchIdRef.current = id;
    setGpsWatchId(id);
  };

  const stopGPS = () => {
    if (gpsWatchIdRef.current != null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
      setGpsWatchId(null);
    }
  };

  // ─── Browser notification ─────────────────────────────────────────────────
  const sendBrowserNotif = () => {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        new Notification("You're next! 🎙️", {
          body: 'The moderator will call on you shortly. Get your microphone ready.',
          icon: '/favicon.ico',
        });
      }
    });
  };

  // ─── Agora ────────────────────────────────────────────────────────────────
  const startAudio = async () => {
    setAudioError(null);
    try {
      // ── Fetch a fresh Agora token from the backend (never use a stale hardcoded one)
      let liveToken = null;
      try {
        const resp = await fetch(`/api/agora/token?channel=${encodeURIComponent(CHANNEL_NAME)}&uid=${AGORA_UID}`);
        if (resp.ok) { const data = await resp.json(); liveToken = data.token; }
      } catch { /* network hiccup — fall through with null token */ }

      agoraClientRef.current = AgoraRTC.createClient({ mode:'rtc', codec:'vp8' });
      await agoraClientRef.current.join(AGORA_APP_ID, CHANNEL_NAME, liveToken, AGORA_UID);
      audioTrackRef.current = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig:{ sampleRate:48000, stereo:false, bitrate:32 },
        AEC:true, ANS:true, AGC:true,
      });
      await agoraClientRef.current.publish([audioTrackRef.current]);
      setIsAudioReady(true);
    } catch (err) {
      let msg = 'Could not access microphone. Please allow access and try again.';
      if (err?.name === 'NotAllowedError') msg = 'Microphone permission denied. Allow it in browser settings.';
      if (err?.name === 'NotFoundError')   msg = 'No microphone found. Please connect one.';
      if (err?.message?.toLowerCase().includes('token'))         msg = 'Agora token error — please set AGORA_APP_CERTIFICATE on the server.';
      if (err?.message?.toLowerCase().includes('invalid app id')) msg = 'Invalid Agora App ID — check your AGORA_APP_ID env on the server.';
      setAudioError(msg);
    }
  };

  // ── Live transcription via Web Speech API ─────────────────────────────────
  const startTranscription = (sock, lang = 'en-US') => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return; // not supported (Firefox, some mobile)
    if (isTranscribingRef.current) return;
    isTranscribingRef.current = true;
    const rec = new SR();
    rec.continuous    = true;
    rec.interimResults = false;
    rec.lang          = lang; // speaker's chosen language
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          if (text) {
            setTranscriptLines(prev => [...prev, text]);
            (sock || socketRef.current)?.emit('transcriptChunk', { text });
          }
        }
      }
    };
    rec.onerror = () => { isTranscribingRef.current = false; };
    rec.onend   = () => {
      // auto-restart while still speaking
      if (isTranscribingRef.current) { try { rec.start(); } catch { /* ignore */ } }
    };
    try { rec.start(); } catch { isTranscribingRef.current = false; return; }
    speechRef.current = rec;
  };

  const stopTranscription = () => {
    isTranscribingRef.current = false;
    try { speechRef.current?.stop(); } catch { /* ignore */ }
    speechRef.current = null;
  };

  const stopAudio = async () => {
    try {
      audioTrackRef.current?.close();
      audioTrackRef.current = null;
      await agoraClientRef.current?.leave();
      agoraClientRef.current = null;
      setIsAudioReady(false);
    } catch (e) { console.error('Stop audio:', e); }
  };

  // ─── Init: URL params + GPS + Socket ─────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Room
    const roomParam = params.get('room');
    const room = roomParam || 'main';
    setActiveRoom(room);

    // Section from QR
    const sec = params.get('section');
    if (sec) {
      const readable = sec.split('-').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
      const norm = readable === 'Online Virtual' ? 'Online/Virtual' : readable;
      if (SECTIONS.includes(norm)) { setDetectedSection(norm); setSelectedSection(norm); }
    }

    startGPS();

    const sock = getSocket();
    socketRef.current = sock;
    setSocketConnected(sock.connected);

    // Join the correct room
    if (sock.connected) sock.emit('joinRoom', { roomId: room, workspaceId });
    sock.on('connect', () => {
      setSocketConnected(true);
      sock.emit('joinRoom', { roomId: room, workspaceId });
    });
    sock.on('disconnect',    () => setSocketConnected(false));
    sock.on('connect_error', () => setSocketConnected(false));

    sock.on('queueUpdate', (data) => {
      const q = data.queue || [];
      setQueueTotal(q.length);
      setSpeakerTimeLimit(data.speakerTimeLimit || 0);
      const spkr = data.currentSpeaker || null;
      setActiveSpeaker(spkr);
      setSpeakerStartedAt(data.speakerStartedAt || null);
      // Track speaker's source language so audience translates from the right language
      activeSpeakerSrcMMRef.current = spkr?.srcLangMM || 'en';
      if (data.bgVideoUrl !== undefined) setBgVideoUrl(data.bgVideoUrl || '');
      if (data.adUrl !== undefined) setAdUrl(data.adUrl || '');
      const me = q.find(p => p.id === sock.id);
      if (me) {
        const pos = q.indexOf(me) + 1;
        setQueuePosition(pos);
        if (me.joinedAt) setJoinedAt(me.joinedAt);
      }
    });

    sock.on('youAreNext', (data) => {
      isSpeakingRef.current = true;  // enable high-frequency GPS during speaking
      setViewState('speaking');
      setSpeakingDuration(0);
      if (data?.timeLimit) setSpeakerTimeLimit(data.timeLimit);
      startAudio();
      startTranscription(sock, speakerSrcLangRef.current);
    });

    sock.on('turnEnded', async () => {
      isSpeakingRef.current = false; // back to section-change-only GPS
      stopTranscription();
      await stopAudio();
      setViewState('initial');
      resetForm();
    });

    sock.on('pollUpdate', (poll) => {
      setActivePoll(poll || null);
      if (poll?.id && poll.id !== lastPollId) {
        setMyVote(null);
        setLastPollId(poll.id);
      }
    });

    sock.on('voteConfirmed', (data) => {
      if (data?.alreadyVoted) return;
      setMyVote(data?.optionIndex ?? 'done');
    });

    sock.on('preQuestionsUpdate', (data) => {
      setPreQuestions(data?.questions || []);
      setPreSessionOpen(data?.open !== false);
    });

    sock.on('timeLimitUpdate', (data) => setSpeakerTimeLimit(data?.seconds || 0));

    // Whisper from moderator
    sock.on('whisperMessage', (data) => {
      setWhisperMsg(data);
      setTimeout(() => setWhisperMsg(null), 12000);
    });

    // Room passcode required
    sock.on('joinError', (data) => {
      if (data?.error?.toLowerCase().includes('passcode')) {
        setRoomPasscodeRequired(true);
        setPasscodeError(data.error);
      }
    });

    // Top contributor badge at session end
    sock.on('topContributor', () => {
      setIsTopContributor(true);
      setTimeout(() => setIsTopContributor(false), 15000);
    });

    // Session ended → prompt feedback
    sock.on('sessionEnded', () => {
      setShowFeedback(true);
      setFeedbackStars(0);
      setFeedbackComment('');
      setFeedbackSent(false);
    });

    // Live transcript → translate + speak in chosen language
    sock.on('transcriptUpdate', (data) => {
      const lang = transLangRef.current;
      if (lang === 'off') return;
      const lines = data.transcript || [];
      if (!lines.length) return;
      const latest = lines[lines.length - 1];
      if (!latest?.text || latest.text === translatedHashRef.current) return;
      translatedHashRef.current = latest.text;
      // Pass speaker's source language so MyMemory translates FROM the right language
      translateAndSpeak(latest.text, lang, activeSpeakerSrcMMRef.current, setLatestTranslation);
    });

    return () => {
      stopGPS();
      sock.off('connect'); sock.off('disconnect'); sock.off('connect_error');
      sock.off('queueUpdate'); sock.off('youAreNext'); sock.off('turnEnded');
      sock.off('pollUpdate'); sock.off('voteConfirmed');
      sock.off('preQuestionsUpdate'); sock.off('timeLimitUpdate');
      sock.off('transcriptUpdate');
      sock.disconnect();
      socketRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wait tick
  useEffect(() => {
    if (viewState !== 'inQueue' || !joinedAt) return;
    const id = setInterval(() => setWaitTick(t => t+1), 1000);
    return () => clearInterval(id);
  }, [viewState, joinedAt]);

  // Speaking timer
  useEffect(() => {
    if (viewState !== 'speaking') { setSpeakingDuration(0); return; }
    const id = setInterval(() => setSpeakingDuration(t => t+1), 1000);
    return () => clearInterval(id);
  }, [viewState]);

  // Browser notification at position #1
  useEffect(() => {
    if (viewState === 'inQueue' && queuePosition === 1 && !notifSent) {
      setNotifSent(true);
      sendBrowserNotif();
    }
  }, [viewState, queuePosition, notifSent]);

  // ── Silence prompt: fire when a NEW speaker starts ─────────────────────────
  useEffect(() => {
    if (!activeSpeaker) {
      // Speaker finished — reset tracker but don't hide (SilencePrompt self-dismisses)
      prevSpeakerRef.current = null;
      return;
    }
    const speakerId = activeSpeaker.id || activeSpeaker.name;
    const isDifferent = prevSpeakerRef.current !== speakerId;
    if (isDifferent) {
      prevSpeakerRef.current = speakerId;
      // Don't show the prompt to the person who IS speaking
      if (viewState !== 'speaking') {
        setSilenceVisible(true);
      }
    }
  }, [activeSpeaker, viewState]);

  // ─── 1-second tick for live countdowns ────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const resetForm = () => {
    setName(''); setTopic(''); setSelectedSection(''); setDetectedSection('');
    setIsAnonymous(false); setJoinedAt(null); setNotifSent(false);
    setAudioError(null);
  };

  const handleRaiseHand = () => {
    setNameError(''); setSectionError('');
    if (!isAnonymous && !name.trim()) { setNameError('Please enter your name'); return; }
    if (!selectedSection)             { setSectionError('Please select your section'); return; }
    if (!socketRef.current)           return;

    lastSectionRef.current = selectedSection;
    setJoinedAt(new Date().toISOString());
    const srcLang = SPEAKER_SRC_LANGS.find(l => l.stt === speakerSrcLang) || SPEAKER_SRC_LANGS[0];
    socketRef.current.emit('joinQueue', {
      name:       isAnonymous ? null : name.trim(),
      anonymous:  isAnonymous,
      section:    selectedSection,
      topic:      topic.trim() || undefined,
      coords:     gpsCoords   || undefined,
      srcLangMM:  srcLang.mm,  // MyMemory code, e.g. 'hi'
      srcLangSTT: srcLang.stt, // STT code, e.g. 'hi-IN'
    });
    setViewState('inQueue');
    setQueuePosition(1);
  };

  const handleLeaveQueue = () => {
    socketRef.current?.emit('leaveQueue');
    setViewState('initial');
    setJoinedAt(null);
    setNotifSent(false);
  };

  const handleEndTurn = async () => {
    isSpeakingRef.current = false; // stop high-frequency GPS
    await stopAudio();
    socketRef.current?.emit('finishedSpeaking');
    setViewState('initial');
    resetForm();
  };

  const handleSendReaction = (type) => {
    socketRef.current?.emit('sendReaction', { type });
  };

  const handleVote = (idx) => {
    if (myVote !== null) return;
    socketRef.current?.emit('submitVote', { optionIndex: idx });
  };

  const handleSubmitQuestion = () => {
    if (!questionInput.trim()) return;
    socketRef.current?.emit('submitQuestion', {
      text:    questionInput.trim(),
      name:    isAnonymous ? 'Anonymous' : (name.trim() || 'Audience'),
      section: selectedSection || detectedSection,
    });
    setQuestionInput('');
  };

  const handleUpvote = (id) => {
    if (upvotedIds.has(id)) return;
    socketRef.current?.emit('upvoteQuestion', { id });
    setUpvotedIds(prev => new Set([...prev, id]));
  };

  // ─── Computed ─────────────────────────────────────────────────────────────
  const waitSeconds = joinedAt ? Math.floor((tickNow - new Date(joinedAt).getTime()) / 1000) : 0;
  const ahead = Math.max(0, queuePosition - 1);
  const timeLimitRemaining = speakerTimeLimit > 0 ? speakerTimeLimit - speakingDuration : null;
  const timeLimitWarning = timeLimitRemaining !== null && timeLimitRemaining <= 20;
  const timeLimitOver    = timeLimitRemaining !== null && timeLimitRemaining <= 0;

  // Live countdown for audience: how long current speaker has left
  const speakerElapsed = speakerStartedAt ? Math.floor((tickNow - speakerStartedAt) / 1000) : 0;
  const speakerSecsLeft = speakerTimeLimit > 0 && speakerStartedAt
    ? Math.max(0, speakerTimeLimit - speakerElapsed) : null;
  const fmtCountdown = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  // Estimated wait for queue members = speaker remaining + (position-1) * avg time
  const estWaitSecs = speakerSecsLeft !== null
    ? speakerSecsLeft + Math.max(0, queuePosition - 1) * speakerTimeLimit
    : speakerTimeLimit > 0 ? queuePosition * speakerTimeLimit : null;

  // ─── Poll widget (shown in all view states when poll is active) ────────────
  const PollWidget = () => {
    if (!activePoll) return null;
    const total = activePoll.options.reduce((s, o) => s + o.votes, 0);
    const voted = myVote !== null;
    return (
      <div style={{ background:'#fff', borderRadius:14, padding:'16px 18px', marginBottom:14,
        border:'2px solid #c4b5fd', boxShadow:'0 2px 12px rgba(124,58,237,.12)',
        animation:'slideIn .3s ease' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
          <span style={{ fontSize:16 }}>📊</span>
          <span style={{ fontWeight:700, fontSize:14, color:'#4c1d95' }}>Live Poll</span>
          {activePoll.closed && <span style={{ fontSize:10, color:'#94a3b8', fontWeight:400 }}>closed</span>}
        </div>
        <div style={{ fontSize:14, fontWeight:600, color:'#1e293b', marginBottom:12, lineHeight:1.4 }}>
          {activePoll.question}
        </div>
        {activePoll.options.map((opt, i) => {
          const pct = total > 0 ? Math.round((opt.votes / total) * 100) : 0;
          const isMyVote = voted && myVote === i;
          return (
            <button key={i} type="button" onClick={() => !voted && !activePoll.closed && handleVote(i)} style={{
              display:'block', width:'100%', textAlign:'left', padding:'9px 12px',
              marginBottom:7, borderRadius:9, cursor: voted || activePoll.closed ? 'default' : 'pointer',
              background: isMyVote ? '#f5f3ff' : '#fafafa',
              border:`1.5px solid ${isMyVote ? '#7c3aed' : '#e2e8f0'}`,
              transition:'border-color .15s',
              position:'relative', overflow:'hidden',
            }}>
              {/* Progress bar background */}
              <div style={{ position:'absolute', inset:0, left:0,
                width: voted ? `${pct}%` : '0%',
                background: isMyVote ? 'rgba(124,58,237,.08)' : 'rgba(37,99,235,.05)',
                transition:'width .5s ease', pointerEvents:'none' }} />
              <div style={{ position:'relative', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:13, color:'#1e293b', fontWeight: isMyVote ? 700 : 400 }}>
                  {isMyVote && '✓ '}{opt.text}
                </span>
                {voted && <span style={{ fontSize:12, fontWeight:700, color:'#64748b' }}>{pct}%</span>}
              </div>
            </button>
          );
        })}
        {voted && (
          <div style={{ fontSize:11, color:'#64748b', marginTop:6, textAlign:'center' }}>
            {total} vote{total !== 1 ? 's' : ''} total
          </div>
        )}
        {!voted && !activePoll.closed && (
          <div style={{ fontSize:11, color:'#94a3b8', marginTop:6, textAlign:'center' }}>
            Tap an option to vote
          </div>
        )}
      </div>
    );
  };

  // ─── Reaction buttons ─────────────────────────────────────────────────────
  const ReactionBar = () => {
    if (!activeSpeaker) return null;
    return (
      <div style={{ background:'#fff', borderRadius:12, padding:'12px 16px', marginTop:12,
        border:'1px solid #e2e8f0', boxShadow:'0 1px 6px rgba(0,0,0,.04)' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', marginBottom:8, letterSpacing:'.05em' }}>
          REACT TO {(activeSpeaker.name || 'SPEAKER').toUpperCase()}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {[
            { type:'agree',   emoji:'👍', label:'Agree' },
            { type:'followup',emoji:'❓', label:'Follow-up' },
            { type:'same',    emoji:'✋', label:'Same Q' },
          ].map(({ type, emoji, label }) => (
            <button key={type} type="button" onClick={() => handleSendReaction(type)} style={{
              flex:1, padding:'8px 4px', borderRadius:10, border:'1px solid #e2e8f0',
              background:'#f8fafc', cursor:'pointer', fontSize:20, display:'flex',
              flexDirection:'column', alignItems:'center', gap:3, transition:'background .1s',
            }}>
              {emoji}
              <span style={{ fontSize:10, fontWeight:600, color:'#64748b' }}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ─── Pre-session questions panel ──────────────────────────────────────────
  const PreQuestionsPanel = () => (
    <div style={{ background:'#fff', borderRadius:14, padding:'14px 16px',
      border:'1px solid #e2e8f0', boxShadow:'0 1px 6px rgba(0,0,0,.04)' }}>
      <button type="button" onClick={() => setShowPreQ(v => !v)} style={{
        width:'100%', textAlign:'left', background:'none', border:'none', padding:0,
        cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <span style={{ fontWeight:700, fontSize:14, color:'#1e293b', display:'flex', alignItems:'center', gap:8 }}>
          💬 Questions Board
          {preQuestions.length > 0 && (
            <span style={{ background:'#2563eb', color:'#fff', borderRadius:10, padding:'0 6px', fontSize:11, fontWeight:800 }}>
              {preQuestions.length}
            </span>
          )}
        </span>
        <span style={{ fontSize:11, color:'#94a3b8' }}>{showPreQ ? '▲' : '▼'}</span>
      </button>

      {showPreQ && (
        <div style={{ marginTop:12 }}>
          {/* Submit box */}
          {preSessionOpen && (
            <div style={{ marginBottom:12 }}>
              <textarea
                placeholder="Ask a question for the session…"
                value={questionInput}
                onChange={e => setQuestionInput(e.target.value)}
                rows={2}
                style={{ width:'100%', padding:'9px 12px', fontSize:13, borderRadius:9,
                  border:'1.5px solid #e2e8f0', color:'#1e293b', resize:'vertical',
                  lineHeight:1.4, outline:'none', marginBottom:6 }}
              />
              <button type="button" onClick={handleSubmitQuestion}
                disabled={!questionInput.trim() || !socketConnected}
                style={{
                  width:'100%', padding:'9px', fontSize:13, fontWeight:700, borderRadius:9, border:'none',
                  background: questionInput.trim() && socketConnected ? '#2563eb' : '#e2e8f0',
                  color: questionInput.trim() && socketConnected ? '#fff' : '#94a3b8',
                  cursor: questionInput.trim() && socketConnected ? 'pointer' : 'not-allowed',
                }}>
                Submit Question
              </button>
            </div>
          )}
          {!preSessionOpen && (
            <div style={{ fontSize:12, color:'#94a3b8', marginBottom:10, textAlign:'center' }}>
              Question submission is closed.
            </div>
          )}

          {/* Question list */}
          {preQuestions.length === 0 ? (
            <div style={{ textAlign:'center', fontSize:12, color:'#94a3b8', padding:'12px 0' }}>
              No questions yet. Be the first!
            </div>
          ) : preQuestions.map((q) => (
            <div key={q.id} style={{ padding:'10px 0', borderTop:'1px solid #f1f5f9',
              display:'flex', alignItems:'flex-start', gap:10 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, color:'#1e293b', lineHeight:1.4 }}>{q.text}</div>
                <div style={{ fontSize:11, color:'#94a3b8', marginTop:3 }}>
                  {q.name} · {q.section || 'Unknown'}
                </div>
              </div>
              <button type="button" onClick={() => handleUpvote(q.id)} style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                padding:'5px 10px', borderRadius:8, border:'1.5px solid',
                borderColor: upvotedIds.has(q.id) ? '#2563eb' : '#e2e8f0',
                background: upvotedIds.has(q.id) ? '#eff6ff' : '#f8fafc',
                color: upvotedIds.has(q.id) ? '#2563eb' : '#64748b',
                cursor: upvotedIds.has(q.id) ? 'default' : 'pointer',
                flexShrink:0,
              }}>
                <span style={{ fontSize:14 }}>▲</span>
                <span style={{ fontSize:11, fontWeight:700 }}>{q.votes}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'calc(100dvh - 54px)', background: bgVideoUrl ? 'transparent' : '#f8fafc',
      display:'flex', justifyContent:'center', alignItems:'flex-start',
      padding:'20px 16px 40px', position:'relative' }}>

      {/* ── Ambient background video — production-grade touch/click protection ── */}
      {bgVideoUrl && viewState !== 'speaking' && (
        <div
          style={{
            position:'fixed', inset:0, zIndex:0, overflow:'hidden',
            // touch-action:none kills scroll, zoom, double-tap-zoom on the container
            touchAction:'none',
            // pointer-events:none means no mouse/touch event ever reaches the <video>
            pointerEvents:'none',
          }}
          // Belt-and-suspenders: capture-phase swallow for both mouse and touch
          onClickCapture={e => e.stopPropagation()}
          onMouseDownCapture={e => e.stopPropagation()}
          onTouchStartCapture={e => { e.preventDefault(); e.stopPropagation(); }}
          onTouchEndCapture={e => { e.preventDefault(); e.stopPropagation(); }}
          onTouchMoveCapture={e => { e.preventDefault(); e.stopPropagation(); }}
          onContextMenu={e => e.preventDefault()}
        >
          <video
            key={bgVideoUrl}
            src={bgVideoUrl}
            autoPlay muted loop playsInline
            draggable={false}
            disablePictureInPicture
            style={{
              width:'100%', height:'100%', objectFit:'cover',
              pointerEvents:'none', userSelect:'none',
            }}
            onContextMenu={e => e.preventDefault()}
          />
          {/* Dark scrim keeps text readable */}
          <div style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.55)', pointerEvents:'none' }} />
          {/* Full-coverage invisible interceptor — catches any stray pointer event
              that somehow bypasses the parent's pointer-events:none (e.g. from browser
              native video controls injected into shadow DOM on some Android browsers) */}
          <div
            aria-hidden="true"
            style={{
              position:'absolute', inset:0, zIndex:10,
              pointerEvents:'all', background:'transparent',
              touchAction:'none', userSelect:'none',
            }}
            onClickCapture={e => e.stopPropagation()}
            onMouseDownCapture={e => e.stopPropagation()}
            onTouchStartCapture={e => { e.preventDefault(); e.stopPropagation(); }}
            onTouchEndCapture={e => { e.preventDefault(); e.stopPropagation(); }}
            onTouchMoveCapture={e => { e.preventDefault(); e.stopPropagation(); }}
            onContextMenu={e => e.preventDefault()}
          />
        </div>
      )}

      {/* ── Ad banner overlay — fully touch-protected ────────────────────────── */}
      {adUrl && viewState !== 'speaking' && (
        <div
          style={{
            position:'fixed', bottom:0, left:0, right:0, zIndex:5,
            display:'flex', justifyContent:'center', alignItems:'flex-end',
            padding:'0 0 env(safe-area-inset-bottom, 0)',
            touchAction:'none', pointerEvents:'none',
          }}
          onClickCapture={e => e.stopPropagation()}
          onMouseDownCapture={e => e.stopPropagation()}
          onTouchStartCapture={e => { e.preventDefault(); e.stopPropagation(); }}
          onTouchEndCapture={e => { e.preventDefault(); e.stopPropagation(); }}
          onTouchMoveCapture={e => { e.preventDefault(); e.stopPropagation(); }}
          onContextMenu={e => e.preventDefault()}
        >
          {/* Ad image */}
          <img
            src={adUrl}
            alt=""
            draggable={false}
            style={{
              maxWidth:'100%', maxHeight:120, objectFit:'contain',
              pointerEvents:'none', userSelect:'none', display:'block',
            }}
            onContextMenu={e => e.preventDefault()}
            onDragStart={e => e.preventDefault()}
          />
          {/* Ad interceptor overlay — sits above the image, swallows all touches */}
          <div
            aria-hidden="true"
            style={{
              position:'absolute', inset:0, zIndex:10,
              pointerEvents:'all', background:'transparent',
              touchAction:'none', userSelect:'none',
            }}
            onClickCapture={e => e.stopPropagation()}
            onMouseDownCapture={e => e.stopPropagation()}
            onTouchStartCapture={e => { e.preventDefault(); e.stopPropagation(); }}
            onTouchEndCapture={e => { e.preventDefault(); e.stopPropagation(); }}
            onTouchMoveCapture={e => { e.preventDefault(); e.stopPropagation(); }}
            onContextMenu={e => e.preventDefault()}
          />
        </div>
      )}

      <style>{`
        @keyframes micPulse  { 0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,.35)} 50%{box-shadow:0 0 0 16px rgba(37,99,235,0)} }
        @keyframes speakRing { 0%,100%{box-shadow:0 0 0 0 rgba(5,150,105,.4)} 50%{box-shadow:0 0 0 18px rgba(5,150,105,0)} }
        @keyframes slideIn   { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes tickFade  { 0%{opacity:.6} 50%{opacity:1} 100%{opacity:.6} }
        .aq-input:focus{border-color:#2563eb!important;outline:none;box-shadow:0 0 0 3px rgba(37,99,235,.12);}
        .aq-btn{transition:opacity .15s,transform .1s;}
        .aq-btn:hover:not(:disabled){opacity:.92;}
        .aq-btn:active:not(:disabled){transform:scale(.98);}
        /* Prevent iOS long-press callout (save image, open in new tab) on protected media */
        video, .ad-zone img { -webkit-touch-callout:none; }
      `}</style>

      {/* ── Silence prompt — fires when a new speaker goes live ────────────── */}
      <SilencePrompt
        speaker={silenceVisible ? activeSpeaker : null}
        onDismiss={() => setSilenceVisible(false)}
      />

      <div style={{ width:'100%', maxWidth:420, animation:'slideIn .3s ease', position:'relative', zIndex:1 }}>

        {/* Connection badge */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end',
          gap:5, marginBottom:12, fontSize:11, fontWeight:600,
          color: socketConnected ? '#059669' : '#94a3b8' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'currentColor' }} />
          {socketConnected ? 'Connected' : 'Connecting…'}
        </div>

        {/* Poll (always on top regardless of view state) */}
        <PollWidget />

        {/* ══ INITIAL ═══════════════════════════════════════════════════════ */}
        {viewState === 'initial' && (
          <>
            <div style={{ background:'#fff', borderRadius:18, padding:'26px 22px',
              boxShadow:'0 2px 16px rgba(0,0,0,.07)', border:'1px solid #e2e8f0', marginBottom:14 }}>

              {/* Title */}
              <div style={{ marginBottom:22 }}>
                <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                  width:48, height:48, borderRadius:14, background:'#eff6ff', fontSize:24, marginBottom:12 }}>✋</div>
                <h2 style={{ fontSize:20, fontWeight:800, color:'#1e293b', letterSpacing:'-.02em', marginBottom:4 }}>
                  Raise Your Hand
                </h2>
                <p style={{ fontSize:13, color:'#64748b', lineHeight:1.5 }}>
                  Enter your details and join the speaker queue.
                </p>
              </div>

              {/* Anonymous toggle */}
              <label style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16,
                cursor:'pointer', padding:'10px 12px', borderRadius:10,
                background: isAnonymous ? '#f5f3ff' : '#f8fafc',
                border:`1.5px solid ${isAnonymous ? '#c4b5fd' : '#e2e8f0'}` }}>
                <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)}
                  style={{ width:16, height:16, accentColor:'#7c3aed' }} />
                <div>
                  <div style={{ fontWeight:600, fontSize:13, color: isAnonymous ? '#4c1d95' : '#1e293b' }}>
                    Join anonymously
                  </div>
                  <div style={{ fontSize:11, color:'#94a3b8' }}>Your name won't be shown to others</div>
                </div>
              </label>

              {/* Name */}
              {!isAnonymous && (
                <label style={{ display:'block', marginBottom:14 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>Your name</span>
                  <input type="text" className="aq-input" placeholder="e.g. Sarah Johnson" value={name}
                    onChange={e => { setName(e.target.value); setNameError(''); }} autoComplete="name"
                    style={{ width:'100%', padding:'11px 14px', fontSize:15,
                      border:`1.5px solid ${nameError ? '#f87171' : '#e2e8f0'}`,
                      borderRadius:10, color:'#1e293b', background:'#fff', transition:'border-color .15s' }} />
                  {nameError && <span style={{ fontSize:11, color:'#dc2626', marginTop:4, display:'block' }}>{nameError}</span>}
                </label>
              )}

              {/* Section */}
              <label style={{ display:'block', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:600, color:'#475569' }}>Your section</span>
                  <button type="button" onClick={startGPS} disabled={isDetecting} style={{
                    fontSize:11, fontWeight:600, color:'#2563eb', background:'none', border:'none',
                    cursor:'pointer', padding:0, opacity: isDetecting ? .6 : 1,
                  }}>{isDetecting ? '📍 Detecting…' : '📍 Auto-detect'}</button>
                </div>
                {detectedSection && !locationError && (
                  <div style={{ fontSize:11, color:'#059669', marginBottom:6,
                    display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4,
                      background:'#ecfdf5', border:'1px solid #a7f3d0', borderRadius:20, padding:'2px 8px' }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:'#059669', flexShrink:0 }} />
                      📍 {detectedSection}
                      {gpsCoords && <span style={{ color:'#6ee7b7', fontSize:10 }}>±{gpsCoords.accuracy}m</span>}
                    </span>
                    {gpsWatchId != null && <span style={{ fontSize:10, color:'#059669', fontWeight:600 }}>● live</span>}
                  </div>
                )}
                {locationError && <div style={{ fontSize:11, color:'#64748b', marginBottom:6 }}>{locationError}</div>}
                <select className="aq-input" value={selectedSection}
                  onChange={e => { setSelectedSection(e.target.value); setSectionError(''); }} style={{
                    width:'100%', padding:'11px 14px', fontSize:14, appearance:'none',
                    border:`1.5px solid ${sectionError ? '#f87171' : '#e2e8f0'}`,
                    borderRadius:10, color: selectedSection ? '#1e293b' : '#94a3b8',
                    background:'#fff', cursor:'pointer', transition:'border-color .15s',
                  }}>
                  <option value="">Select your section…</option>
                  {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {sectionError && <span style={{ fontSize:11, color:'#dc2626', marginTop:4, display:'block' }}>{sectionError}</span>}
              </label>

              {/* Topic */}
              <label style={{ display:'block', marginBottom:20 }}>
                <span style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>
                  Question or topic <span style={{ fontWeight:400, color:'#94a3b8' }}>(optional)</span>
                </span>
                <textarea className="aq-input" placeholder="What would you like to say or ask?" value={topic}
                  onChange={e => setTopic(e.target.value)} rows={2} style={{
                    width:'100%', padding:'11px 14px', fontSize:14, border:'1.5px solid #e2e8f0',
                    borderRadius:10, color:'#1e293b', background:'#fff', resize:'vertical',
                    lineHeight:1.5, transition:'border-color .15s',
                  }} />
              </label>

              {/* Speaking language */}
              <label style={{ display:'block', marginBottom:20 }}>
                <span style={{ fontSize:12, fontWeight:600, color:'#475569', display:'block', marginBottom:6 }}>
                  🌐 I will speak in
                </span>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {SPEAKER_SRC_LANGS.map(l => (
                    <button
                      key={l.stt}
                      type="button"
                      onClick={() => { speakerSrcLangRef.current = l.stt; setSpeakerSrcLang(l.stt); }}
                      style={{
                        padding:'5px 10px', borderRadius:8, border:'1.5px solid',
                        borderColor: speakerSrcLang === l.stt ? '#2563eb' : '#e2e8f0',
                        background:  speakerSrcLang === l.stt ? '#eff6ff' : '#f8fafc',
                        color:       speakerSrcLang === l.stt ? '#2563eb' : '#64748b',
                        fontSize:12, fontWeight: speakerSrcLang === l.stt ? 700 : 400,
                        cursor:'pointer', display:'flex', alignItems:'center', gap:4,
                      }}
                    >
                      <span>{l.flag}</span><span>{l.label}</span>
                    </button>
                  ))}
                </div>
              </label>

              {/* Submit */}
              <button type="button" className="aq-btn" onClick={handleRaiseHand}
                disabled={(!isAnonymous && !name.trim()) || !selectedSection || !socketConnected}
                style={{
                  width:'100%', padding:14, fontSize:15, fontWeight:700, border:'none', borderRadius:12,
                  background: (isAnonymous || name.trim()) && selectedSection && socketConnected
                    ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#e2e8f0',
                  color: (isAnonymous || name.trim()) && selectedSection && socketConnected ? '#fff' : '#94a3b8',
                  cursor: (isAnonymous || name.trim()) && selectedSection ? 'pointer' : 'not-allowed',
                  boxShadow: (isAnonymous || name.trim()) && selectedSection ? '0 4px 14px rgba(37,99,235,.3)' : 'none',
                }}>
                ✋ Raise Hand to Speak
              </button>

              {!socketConnected && (
                <p style={{ textAlign:'center', fontSize:12, color:'#94a3b8', marginTop:8 }}>
                  Connecting to session…
                </p>
              )}
            </div>

            {/* Pre-session questions */}
            <PreQuestionsPanel />
          </>
        )}

        {/* ══ IN QUEUE ══════════════════════════════════════════════════════ */}
        {viewState === 'inQueue' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

            {/* ── Main queue card ───────────────────────────────────────────── */}
            <div style={{ background:'#fff', borderRadius:18, padding:'22px 20px',
              boxShadow:'0 2px 16px rgba(0,0,0,.07)', border:'1px solid #e2e8f0' }}>

              {/* Top row: position badge + name */}
              <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
                <div style={{
                  flexShrink:0, width:56, height:56, borderRadius:'50%',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  background: queuePosition === 1 ? '#eff6ff' : '#f8fafc',
                  border:`2.5px solid ${queuePosition === 1 ? '#2563eb' : '#e2e8f0'}`,
                  animation: queuePosition === 1 ? 'micPulse 2s ease-in-out infinite' : 'none',
                  fontSize: queuePosition === 1 ? 24 : 20, fontWeight:900,
                  color: queuePosition === 1 ? '#2563eb' : '#1e293b',
                }}>
                  {queuePosition === 1 ? '🎙️' : `#${queuePosition}`}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:16, color:'#1e293b', marginBottom:2 }}>
                    {queuePosition === 1 ? "You're next!" : 'In the queue'}
                  </div>
                  <div style={{ fontSize:12, color:'#64748b', display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                    <span>{isAnonymous ? 'Anonymous' : name}</span>
                    <span style={{ color:'#cbd5e1' }}>·</span>
                    <span>📍 {selectedSection}</span>
                    {gpsCoords && (
                      <span style={{ fontSize:10, fontWeight:700, color:'#059669',
                        background:'#ecfdf5', border:'1px solid #a7f3d0', borderRadius:10, padding:'1px 6px' }}>
                        GPS ±{gpsCoords.accuracy}m
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Live time clocks ─────────────────────────────────────────── */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>

                {/* Elapsed wait */}
                <div style={{ background:'#f8fafc', borderRadius:14, padding:'14px 10px', textAlign:'center',
                  border:'1.5px solid #e2e8f0' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', letterSpacing:'.07em', marginBottom:6 }}>
                    TIME WAITING
                  </div>
                  <div style={{
                    fontSize:28, fontWeight:900, fontVariantNumeric:'tabular-nums', letterSpacing:'-.02em',
                    color: waitSeconds > 600 ? '#d97706' : '#1e293b', lineHeight:1,
                    animation:'tickFade 1s ease-in-out infinite',
                  }}>
                    {fmtTimer(waitSeconds)}
                  </div>
                  <div style={{ fontSize:10, color:'#94a3b8', marginTop:5 }}>
                    since {joinedAt ? new Date(joinedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : '--:--'}
                  </div>
                </div>

                {/* Est. time to speak */}
                <div style={{
                  background: estWaitSecs !== null ? '#f0fdf4' : '#f8fafc',
                  borderRadius:14, padding:'14px 10px', textAlign:'center',
                  border:`1.5px solid ${estWaitSecs !== null ? '#bbf7d0' : '#e2e8f0'}`,
                }}>
                  <div style={{ fontSize:10, fontWeight:700, color: estWaitSecs !== null ? '#15803d' : '#94a3b8',
                    letterSpacing:'.07em', marginBottom:6 }}>
                    EST. TO SPEAK
                  </div>
                  {estWaitSecs !== null ? (
                    <>
                      <div style={{ fontSize:28, fontWeight:900, fontVariantNumeric:'tabular-nums',
                        letterSpacing:'-.02em', color:'#16a34a', lineHeight:1 }}>
                        {estWaitSecs < 60
                          ? `${estWaitSecs}s`
                          : `${Math.floor(estWaitSecs/60)}:${String(estWaitSecs%60).padStart(2,'0')}`}
                      </div>
                      <div style={{ fontSize:10, color:'#16a34a', marginTop:5, fontWeight:600 }}>
                        {queuePosition === 1 ? 'speaker finishing' : `${ahead} ahead of you`}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:22, fontWeight:900, color:'#94a3b8', lineHeight:1 }}>—</div>
                      <div style={{ fontSize:10, color:'#94a3b8', marginTop:5 }}>
                        {queuePosition === 1 ? 'up next' : `${ahead} ahead`}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Current speaker countdown (position #1 only) */}
              {queuePosition === 1 && speakerSecsLeft !== null && (
                <div style={{ padding:'10px 14px', background:'#eff6ff', borderRadius:10, marginBottom:10,
                  display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:12, color:'#2563eb', fontWeight:600 }}>Current speaker</span>
                  <span style={{ fontSize:16, fontWeight:900, color:'#2563eb', fontVariantNumeric:'tabular-nums' }}>
                    {fmtCountdown(speakerSecsLeft)} left
                  </span>
                </div>
              )}

              {/* Queue depth bar */}
              {queueTotal > 1 && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10,
                    color:'#94a3b8', marginBottom:4, fontWeight:600 }}>
                    <span>QUEUE POSITION</span>
                    <span>{queuePosition} of {queueTotal}</span>
                  </div>
                  <div style={{ height:6, borderRadius:99, background:'#e2e8f0', overflow:'hidden' }}>
                    <div style={{
                      height:'100%', borderRadius:99,
                      background: queuePosition === 1 ? '#2563eb' : '#10b981',
                      width: `${Math.max(8, ((queueTotal - queuePosition + 1) / queueTotal) * 100)}%`,
                      transition:'width .6s ease',
                    }} />
                  </div>
                </div>
              )}

              {/* Topic */}
              {topic.trim() && (
                <div style={{ padding:'9px 11px', background:'#f8fafc', borderRadius:9,
                  border:'1px solid #e2e8f0', marginTop:4 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', letterSpacing:'.06em', marginBottom:3 }}>YOUR TOPIC</div>
                  <div style={{ fontSize:13, color:'#1e293b', lineHeight:1.4 }}>{topic}</div>
                </div>
              )}

              {queuePosition > 1 && (
                <p style={{ fontSize:12, color:'#94a3b8', textAlign:'center', marginTop:10, marginBottom:0 }}>
                  {ahead} {ahead === 1 ? 'person' : 'people'} ahead · {queueTotal} total in queue
                </p>
              )}
              {queuePosition === 1 && (
                <p style={{ fontSize:13, color:'#2563eb', fontWeight:600, textAlign:'center', marginTop:10, marginBottom:0 }}>
                  Get your microphone ready!
                </p>
              )}
            </div>

            {/* Reactions to current speaker */}
            <ReactionBar />

            {/* Leave button */}
            <button type="button" className="aq-btn" onClick={handleLeaveQueue} style={{
              width:'100%', padding:12, fontSize:14, fontWeight:600,
              background:'#fff', color:'#64748b', border:'1.5px solid #e2e8f0', borderRadius:12, cursor:'pointer',
            }}>Leave Queue</button>
          </div>
        )}

        {/* ══ SPEAKING ══════════════════════════════════════════════════════ */}
        {viewState === 'speaking' && (
          <div style={{ background:'#fff', borderRadius:18, padding:'34px 22px 26px',
            boxShadow:'0 2px 16px rgba(0,0,0,.07)',
            border:`1.5px solid ${timeLimitOver ? '#fca5a5' : '#6ee7b7'}`, textAlign:'center' }}>

            {/* Mic icon */}
            <div style={{
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              width:90, height:90, borderRadius:'50%', fontSize:36, marginBottom:18,
              background: timeLimitOver ? '#fef2f2' : isAudioReady ? '#ecfdf5' : '#eff6ff',
              border:`3px solid ${timeLimitOver ? '#fca5a5' : isAudioReady ? '#059669' : '#93c5fd'}`,
              animation: isAudioReady && !timeLimitOver ? 'speakRing 2s ease-in-out infinite' : 'none',
            }}>🎤</div>

            <h2 style={{ fontSize:22, fontWeight:800, letterSpacing:'-.02em', marginBottom:6,
              color: timeLimitOver ? '#dc2626' : '#059669' }}>
              {timeLimitOver ? "Time's up!" : "You're on!"}
            </h2>
            <p style={{ fontSize:14, color:'#64748b', marginBottom:18 }}>Speak clearly into your microphone.</p>

            {/* Timer row */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:18, flexWrap:'wrap' }}>
              <div style={{
                display:'inline-flex', alignItems:'center', gap:8, padding:'8px 18px',
                borderRadius:30, background:'#f8fafc', border:'1px solid #e2e8f0',
                fontSize:20, fontWeight:800, fontVariantNumeric:'tabular-nums', letterSpacing:'-.01em',
                color: speakingDuration > 120 ? '#d97706' : '#1e293b',
              }}>
                ⏱ {fmtTimer(speakingDuration)}
              </div>

              {/* Countdown when limit set */}
              {timeLimitRemaining !== null && (
                <div style={{
                  display:'inline-flex', alignItems:'center', gap:6, padding:'8px 14px',
                  borderRadius:30, fontSize:14, fontWeight:800, fontVariantNumeric:'tabular-nums',
                  background: timeLimitOver ? '#fef2f2' : timeLimitWarning ? '#fffbeb' : '#ecfdf5',
                  border:`1px solid ${timeLimitOver ? '#fca5a5' : timeLimitWarning ? '#fde68a' : '#a7f3d0'}`,
                  color: timeLimitOver ? '#dc2626' : timeLimitWarning ? '#d97706' : '#059669',
                }}>
                  ⏳ {timeLimitOver ? 'OVER' : `${Math.max(0, timeLimitRemaining)}s left`}
                </div>
              )}
            </div>

            {/* Audio status */}
            <div style={{ marginBottom:20 }}>
              {audioError ? (
                <div>
                  <p style={{ fontSize:12, color:'#dc2626', padding:'10px 14px', background:'#fef2f2',
                    borderRadius:9, border:'1px solid #fca5a5', marginBottom:10, lineHeight:1.4 }}>{audioError}</p>
                  <button type="button" onClick={() => { setAudioError(null); startAudio(); }} style={{
                    padding:'8px 18px', fontSize:13, fontWeight:600, background:'#eff6ff',
                    color:'#2563eb', border:'1px solid #bfdbfe', borderRadius:9, cursor:'pointer',
                  }}>Retry Microphone</button>
                </div>
              ) : isAudioReady ? (
                <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:13,
                  fontWeight:600, color:'#059669', padding:'6px 12px', background:'#ecfdf5',
                  borderRadius:20, border:'1px solid #a7f3d0' }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:'#059669' }} />
                  Microphone active
                </span>
              ) : (
                <span style={{ fontSize:13, color:'#94a3b8' }}>Connecting microphone…</span>
              )}
            </div>

            {/* 2-min warning */}
            {speakingDuration > 120 && !speakerTimeLimit && (
              <div style={{ padding:'8px 14px', background:'#fffbeb', borderRadius:9,
                border:'1px solid #fde68a', fontSize:12, color:'#92400e', marginBottom:16 }}>
                ⏰ You've been speaking for {fmtTimer(speakingDuration)} — please wrap up if others are waiting.
              </div>
            )}

            {/* Whisper from moderator */}
            {whisperMsg && (
              <div style={{
                margin:'0 0 16px', padding:'10px 14px', borderRadius:10,
                background:'#fffbeb', border:'1.5px solid #fde68a',
                animation:'fadeIn .3s ease', textAlign:'left',
              }}>
                <div style={{ fontSize:10, fontWeight:800, color:'#d97706', letterSpacing:'.06em', marginBottom:4 }}>💬 MODERATOR SAYS</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#92400e' }}>{whisperMsg.message}</div>
              </div>
            )}

            {/* Live transcript lines (last 3) */}
            {transcriptLines.length > 0 && (
              <div style={{ margin:'0 0 16px', padding:'8px 12px', borderRadius:9, background:'#f0f9ff', border:'1px solid #bae6fd', textAlign:'left' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#0284c7', marginBottom:4 }}>📝 TRANSCRIBING</div>
                {transcriptLines.slice(-3).map((line, i) => (
                  <div key={i} style={{ fontSize:12, color:'#0c4a6e', lineHeight:1.4 }}>{line}</div>
                ))}
              </div>
            )}

            <button type="button" className="aq-btn" onClick={handleEndTurn} style={{
              width:'100%', padding:14, fontSize:15, fontWeight:700, border:'none', borderRadius:12,
              background:'linear-gradient(135deg,#059669,#10b981)', color:'#fff', cursor:'pointer',
              boxShadow:'0 4px 14px rgba(5,150,105,.3)',
            }}>✅ Done Speaking</button>
          </div>
        )}

        {/* ══ TOP CONTRIBUTOR BADGE ════════════════════════════════════════ */}
        {isTopContributor && (
          <div style={{
            position:'fixed', top:80, left:'50%', transform:'translateX(-50%)',
            zIndex:999, padding:'14px 24px', borderRadius:16,
            background:'linear-gradient(135deg,#d97706,#f59e0b)',
            boxShadow:'0 8px 32px rgba(217,119,6,.4)',
            animation:'fadeIn .4s ease', textAlign:'center',
          }}>
            <div style={{ fontSize:28, marginBottom:4 }}>⭐</div>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff' }}>Top Contributor!</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.85)', marginTop:2 }}>Your question got the most votes this session</div>
          </div>
        )}

        {/* ══ POST-SESSION FEEDBACK MODAL ═══════════════════════════════════ */}
        {showFeedback && (
          <div style={{
            position:'fixed', inset:0, background:'rgba(15,23,42,.75)',
            display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:24,
          }}>
            <div style={{ background:'#fff', borderRadius:20, padding:'28px 24px',
              width:'100%', maxWidth:360, textAlign:'center', boxShadow:'0 16px 48px rgba(0,0,0,.2)' }}>

              {feedbackSent ? (
                <>
                  <div style={{ fontSize:52, marginBottom:12 }}>🙏</div>
                  <div style={{ fontWeight:800, fontSize:20, color:'#1e293b', marginBottom:6 }}>Thanks!</div>
                  <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>
                    Your feedback helps us improve future sessions.
                  </div>
                  <button onClick={() => setShowFeedback(false)} style={{
                    width:'100%', padding:12, fontSize:14, fontWeight:700, borderRadius:10,
                    background:'#f1f5f9', color:'#64748b', border:'none', cursor:'pointer',
                  }}>Close</button>
                </>
              ) : (
                <>
                  <div style={{ fontSize:36, marginBottom:10 }}>⭐</div>
                  <div style={{ fontWeight:800, fontSize:18, color:'#1e293b', marginBottom:4 }}>
                    How was the session?
                  </div>
                  <div style={{ fontSize:13, color:'#64748b', marginBottom:20 }}>
                    Rate your experience — takes 5 seconds.
                  </div>

                  {/* Star picker */}
                  <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:18 }}>
                    {[1,2,3,4,5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setFeedbackStars(n)}
                        onMouseEnter={() => setFeedbackHover(n)}
                        onMouseLeave={() => setFeedbackHover(0)}
                        style={{
                          fontSize:34, background:'none', border:'none', cursor:'pointer', padding:2,
                          transform: n <= (feedbackHover || feedbackStars) ? 'scale(1.2)' : 'scale(1)',
                          filter: n <= (feedbackHover || feedbackStars)
                            ? 'drop-shadow(0 0 4px rgba(245,158,11,.6))' : 'grayscale(1) opacity(.4)',
                          transition:'transform .12s, filter .12s',
                        }}
                      >⭐</button>
                    ))}
                  </div>

                  {/* Star label */}
                  {feedbackStars > 0 && (
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:12,
                      color: ['','#dc2626','#f97316','#ca8a04','#16a34a','#2563eb'][feedbackStars] }}>
                      {['','Poor','Fair','Good','Great','Excellent!'][feedbackStars]}
                    </div>
                  )}

                  {/* Comment */}
                  <textarea
                    placeholder="Any comments? (optional)"
                    value={feedbackComment}
                    onChange={e => setFeedbackComment(e.target.value)}
                    rows={2}
                    style={{ width:'100%', padding:'9px 12px', fontSize:13, borderRadius:9,
                      border:'1.5px solid #e2e8f0', resize:'none', outline:'none',
                      color:'#1e293b', marginBottom:14, lineHeight:1.4 }}
                  />

                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setShowFeedback(false)} style={{
                      flex:1, padding:11, fontSize:13, fontWeight:600, borderRadius:10,
                      background:'#f1f5f9', color:'#64748b', border:'none', cursor:'pointer',
                    }}>Skip</button>
                    <button
                      disabled={feedbackStars === 0}
                      onClick={() => {
                        socketRef.current?.emit('submitFeedback', {
                          stars: feedbackStars,
                          comment: feedbackComment.trim(),
                        });
                        setFeedbackSent(true);
                      }}
                      style={{
                        flex:2, padding:11, fontSize:13, fontWeight:700, borderRadius:10, border:'none',
                        cursor: feedbackStars ? 'pointer' : 'not-allowed',
                        background: feedbackStars
                          ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#e2e8f0',
                        color: feedbackStars ? '#fff' : '#94a3b8',
                        boxShadow: feedbackStars ? '0 4px 12px rgba(37,99,235,.3)' : 'none',
                      }}
                    >Send Feedback</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══ LIVE TRANSLATION STRIP + PICKER ══════════════════════════════ */}
        {/* Translation result strip (dark pill at bottom) */}
        {transLang !== 'off' && latestTranslation && (
          <div style={{
            position:'fixed', bottom:82, left:16, right:80, zIndex:48,
            background:'rgba(15,23,42,.9)', borderRadius:14, padding:'10px 14px',
            backdropFilter:'blur(10px)', boxShadow:'0 4px 20px rgba(0,0,0,.3)',
          }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#93c5fd', marginBottom:4, letterSpacing:'.07em' }}>
              🌐 {TRANS_LANGUAGES.find(l => l.code === transLang)?.label?.toUpperCase()}
            </div>
            <div style={{ fontSize:13, color:'#f8fafc', lineHeight:1.5 }}>{latestTranslation}</div>
          </div>
        )}

        {/* Floating 🌐 button (bottom-right) */}
        <div style={{ position:'fixed', bottom:20, right:16, zIndex:50 }}>
          {/* Badge showing active lang */}
          {transLang !== 'off' && (
            <div style={{
              position:'absolute', top:-6, right:-4, pointerEvents:'none',
              background:'#10b981', color:'#fff', borderRadius:99,
              fontSize:9, fontWeight:800, padding:'2px 5px', letterSpacing:'.03em',
            }}>
              {transLang.toUpperCase()}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowLangPicker(v => !v)}
            style={{
              width:48, height:48, borderRadius:'50%',
              background: transLang !== 'off' ? '#2563eb' : 'rgba(15,23,42,.85)',
              color:'#fff', border:'none', cursor:'pointer', fontSize:22,
              boxShadow:'0 4px 18px rgba(0,0,0,.35)',
              display:'flex', alignItems:'center', justifyContent:'center',
            }}
            title="Translate speech"
          >🌐</button>

          {/* Language picker popover */}
          {showLangPicker && (
            <div style={{
              position:'absolute', bottom:56, right:0, zIndex:51,
              background:'#fff', borderRadius:16, padding:'8px 0',
              boxShadow:'0 8px 40px rgba(0,0,0,.2)', minWidth:198,
              border:'1px solid #e2e8f0', maxHeight:360, overflowY:'auto',
            }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', letterSpacing:'.07em',
                padding:'6px 14px 8px' }}>TRANSLATE SPEECH TO</div>
              {TRANS_LANGUAGES.map(l => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    transLangRef.current = l.code;
                    setTransLang(l.code);
                    setShowLangPicker(false);
                    if (l.code === 'off') {
                      window.speechSynthesis?.cancel();
                      setLatestTranslation('');
                      translatedHashRef.current = '';
                    }
                  }}
                  style={{
                    display:'flex', alignItems:'center', gap:10,
                    width:'100%', padding:'9px 14px', border:'none',
                    cursor:'pointer', fontSize:13,
                    fontWeight: transLang === l.code ? 700 : 400,
                    color: transLang === l.code ? '#2563eb' : '#1e293b',
                    background: transLang === l.code ? '#eff6ff' : 'transparent',
                  }}
                >
                  <span style={{ fontSize:18 }}>{l.flag}</span>
                  <span style={{ flex:1, textAlign:'left' }}>{l.label}</span>
                  {transLang === l.code && <span style={{ fontSize:11 }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ══ ROOM PASSCODE PROMPT ══════════════════════════════════════════ */}
        {roomPasscodeRequired && (
          <div style={{
            position:'fixed', inset:0, background:'rgba(15,23,42,.7)',
            display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:24,
          }}>
            <div style={{ background:'#fff', borderRadius:16, padding:28, width:'100%', maxWidth:340, textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
              <div style={{ fontWeight:800, fontSize:18, color:'#1e293b', marginBottom:6 }}>Room Passcode Required</div>
              <div style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>Ask your moderator for the passcode.</div>
              <input
                type="text" value={passcodeInput} onChange={e => setPasscodeInput(e.target.value)}
                placeholder="Enter passcode…" maxLength={20}
                style={{ width:'100%', padding:'10px 12px', fontSize:14, borderRadius:9, border:'1.5px solid #e2e8f0', outline:'none', marginBottom:8, textAlign:'center', letterSpacing:'.1em' }}
              />
              {passcodeError && <div style={{ fontSize:12, color:'#dc2626', marginBottom:8 }}>{passcodeError}</div>}
              <button
                onClick={() => {
                  setRoomPasscodeRequired(false);
                  setPasscodeError('');
                  socketRef.current?.emit('joinRoom', { roomId: activeRoom, passcode: passcodeInput });
                }}
                style={{ width:'100%', padding:12, fontSize:14, fontWeight:700, borderRadius:9, background:'#2563eb', color:'#fff', border:'none', cursor:'pointer' }}
              >
                Enter Room →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
