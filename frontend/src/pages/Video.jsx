import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Video as VideoIcon, RotateCcw, CheckCircle2, ArrowRight, Loader2, AlertCircle, Smile, Frown, Meh } from 'lucide-react';
import useSessionStore from '../stores/sessionStore';
import { videoAPI } from '../services/api';

const CAPTURE_DURATION = 30; // seconds
const DETECTION_INTERVAL = 150; // ms — faster capture

// How many consecutive same-emotion detections needed before switching display
const SMOOTHING_THRESHOLD = 3;

const EMOTION_CONFIG = {
    happy: { label: 'Happy', color: '#10B981', bg: 'rgba(16,185,129,0.15)', icon: Smile, emoji: '😊' },
    sad: { label: 'Sad', color: '#EF4444', bg: 'rgba(239,68,68,0.15)', icon: Frown, emoji: '😢' },
    neutral: { label: 'Neutral', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', icon: Meh, emoji: '😐' },
    angry: { label: 'Angry', color: '#EF4444', bg: 'rgba(239,68,68,0.15)', icon: Frown, emoji: '😠' },
    surprised: { label: 'Surprised', color: '#06B6D4', bg: 'rgba(6,182,212,0.15)', icon: Smile, emoji: '😲' },
    fearful: { label: 'Fearful', color: '#EC4899', bg: 'rgba(236,72,153,0.15)', icon: Frown, emoji: '😨' },
    disgusted: { label: 'Disgusted', color: '#EF4444', bg: 'rgba(239,68,68,0.15)', icon: Frown, emoji: '🤢' },
};

export default function VideoPage() {
    const { currentSession, refreshCurrentSession } = useSessionStore();
    const navigate = useNavigate();
    const [state, setState] = useState('idle'); // idle | loading | capturing | processing | done
    const [countdown, setCountdown] = useState(CAPTURE_DURATION);
    const [currentEmotion, setCurrentEmotion] = useState(null);
    const [emotionHistory, setEmotionHistory] = useState([]);
    const [distribution, setDistribution] = useState(null);
    const [dominantEmotion, setDominantEmotion] = useState(null);
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [useMockMode, setUseMockMode] = useState(false);
    const [error, setError] = useState(null);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const intervalRef = useRef(null);
    const timerRef = useRef(null);
    const faceapiRef = useRef(null);

    // Smoothing refs — prevent flickering by requiring N consecutive same detections
    const rawBufferRef = useRef([]);        // last N raw detections
    const stableEmotionRef = useRef(null);  // currently displayed stable emotion
    const mockEmotionRef = useRef('neutral'); // mock mode: current simulated emotion

    // FIX: Use a ref to track emotionHistory so stopCapture always has the latest data.
    // The useState closure in setInterval callbacks captures stale state; refs don't.
    const emotionHistoryRef = useRef([]);

    useEffect(() => {
        if (!currentSession) {
            navigate('/dashboard');
            return;
        }
        loadFaceApi();
        return cleanup;
    }, [currentSession, navigate]);

    const cleanup = () => {
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const loadFaceApi = async () => {
        try {
            const faceapi = await import('@vladmandic/face-api');
            faceapiRef.current = faceapi;

            const MODEL_URL = '/models';
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
            ]);
            setModelsLoaded(true);
            setUseMockMode(false);
            console.log('[OK] @vladmandic/face-api models loaded successfully');
        } catch (err) {
            console.warn('[WARN] Face-api models failed to load, using demo mode:', err.message);
            setUseMockMode(true);
            setModelsLoaded(true);
        }
    };

    const startCapture = async () => {
        setError(null);
        setState('loading');
        rawBufferRef.current = [];
        stableEmotionRef.current = null;
        mockEmotionRef.current = 'neutral';
        emotionHistoryRef.current = []; // Reset the ref too

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }

            setState('capturing');
            setCountdown(CAPTURE_DURATION);
            setEmotionHistory([]);
            setCurrentEmotion(null);

            // Countdown timer
            timerRef.current = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        stopCapture();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            // Real-time emotion detection loop
            intervalRef.current = setInterval(() => {
                detectEmotion();
            }, DETECTION_INTERVAL);
        } catch {
            setState('idle');
            setError('Camera access denied. Please allow camera access and try again.');
        }
    };

    /** Helper to add a frame to both state AND ref */
    const addEmotionFrame = (frame) => {
        emotionHistoryRef.current = [...emotionHistoryRef.current, frame];
        setEmotionHistory((prev) => [...prev, frame]);
    };

    /** Apply smoothing: only switch displayed emotion using a majority vote over the last N detections */
    const applySmoothing = (rawEmotion, confidence) => {
        const buf = rawBufferRef.current;
        buf.push(rawEmotion);
        if (buf.length > SMOOTHING_THRESHOLD * 2) buf.shift(); // keep buffer small

        // Count how many of the last N detections are the same
        const recent = buf.slice(-SMOOTHING_THRESHOLD);

        const counts = {};
        let dominantCount = 0;
        let dominantEmo = rawEmotion;

        for (const e of recent) {
            counts[e] = (counts[e] || 0) + 1;
            if (counts[e] > dominantCount) {
                dominantCount = counts[e];
                dominantEmo = e;
            }
        }

        // Switch to the new emotion if it's the majority in recent frames
        const majorityReached = recent.length >= SMOOTHING_THRESHOLD && dominantCount >= Math.ceil(SMOOTHING_THRESHOLD / 2);

        if (majorityReached || !stableEmotionRef.current) {
            stableEmotionRef.current = dominantEmo;
            setCurrentEmotion({ label: dominantEmo, confidence });
        } else {
            // Keep showing the stable emotion with updated confidence
            setCurrentEmotion((prev) => prev ? { ...prev, confidence } : { label: rawEmotion, confidence });
        }

        return stableEmotionRef.current;
    };

    const detectEmotion = async () => {
        if (useMockMode) {
            // Mock mode: STABLE simulation — stays on same emotion, changes slowly
            // 90% chance to stay, 10% chance to shift
            const shouldChange = Math.random() < 0.1;
            if (shouldChange) {
                const pool = ['happy', 'neutral', 'sad'];
                const diff = pool.filter((e) => e !== mockEmotionRef.current);
                mockEmotionRef.current = diff[Math.floor(Math.random() * diff.length)];
            }
            const emo = mockEmotionRef.current;
            const confidence = 0.75 + Math.random() * 0.2;
            const frame = {
                emotions: { happy: 0.1, sad: 0.1, neutral: 0.5, angry: 0.05, surprised: 0.05, fearful: 0.05, disgusted: 0.05 },
                dominant_emotion: emo,
                confidence,
            };
            frame.emotions[emo] = confidence;

            applySmoothing(emo, confidence);
            addEmotionFrame(frame);

            // Send frame to backend (non-blocking) just like real mode
            videoAPI.sendEmotionFrame({
                session_id: currentSession.id,
                timestamp: Date.now() / 1000,
                emotions: frame.emotions,
                dominant_emotion: emo,
            }).catch(() => { });

            return;
        }

        // Real face-api detection using @vladmandic/face-api
        const faceapi = faceapiRef.current;
        const video = videoRef.current;
        if (!faceapi || !video || video.readyState < 2) return;

        try {
            // Detect ALL faces so we can pick the one closest to center box
            const allDetections = await faceapi
                .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
                .withFaceExpressions();

            if (allDetections && allDetections.length > 0) {
                // Pick the face closest to the center of the video (where the guide box is)
                const videoW = video.videoWidth || 640;
                const videoH = video.videoHeight || 480;
                const centerX = videoW / 2;
                const centerY = videoH / 2;

                let closestFace = allDetections[0];
                let minDist = Infinity;

                for (const det of allDetections) {
                    const box = det.detection.box;
                    const faceCenterX = box.x + box.width / 2;
                    const faceCenterY = box.y + box.height / 2;
                    const dist = Math.hypot(faceCenterX - centerX, faceCenterY - centerY);
                    if (dist < minDist) {
                        minDist = dist;
                        closestFace = det;
                    }
                }

                const expressions = closestFace.expressions;

                // The pre-trained model often under-predicts 'sad' and over-predicts 'neutral' or 'disgusted'.
                // We add multipliers to balance the sensitivity for our specific use case.
                const SCORE_MULTIPLIERS = {
                    sad: 50.0,       // Immense boost for sadness
                    angry: 20.0,     // Immense boost for anger
                    fearful: 20.0,   // Immense boost for fear
                    neutral: 0.05,   // Heavily penalize neutral
                    disgusted: 0.1,  // Suppress disgusted
                    happy: 1.0,
                    surprised: 1.0
                };

                // Add a small flat base to 'sad' if it's detected at all to help it overcome the math
                let maxEmotion = 'neutral';
                let maxScore = 0;

                const adjustedEmotions = { ...expressions };

                for (const [emotion, score] of Object.entries(expressions)) {
                    let adjustedScore = score;

                    if (['sad', 'fearful', 'angry'].includes(emotion) && score > 0.0001) {
                        // Non-linear boost: give it a massive head start if it's even slightly present
                        adjustedScore = (score * SCORE_MULTIPLIERS[emotion]) + 0.8;
                    } else if (SCORE_MULTIPLIERS[emotion] !== undefined) {
                        adjustedScore = score * SCORE_MULTIPLIERS[emotion];
                    }

                    adjustedEmotions[emotion] = adjustedScore;

                    if (adjustedScore > maxScore) {
                        maxScore = adjustedScore;
                        maxEmotion = emotion;
                    }
                }

                // Apply smoothing before displaying
                const stableEmo = applySmoothing(maxEmotion, maxScore);
                addEmotionFrame({
                    emotions: adjustedEmotions,
                    dominant_emotion: stableEmo,
                    confidence: maxScore,
                });

                // Send frame to backend (non-blocking)
                videoAPI.sendEmotionFrame({
                    session_id: currentSession.id,
                    timestamp: Date.now() / 1000,
                    emotions: adjustedEmotions,
                    dominant_emotion: stableEmo,
                }).catch(() => { });
            } else {
                // No face detected — keep last stable emotion
                if (stableEmotionRef.current) {
                    setCurrentEmotion((prev) => prev || { label: 'neutral', confidence: 0.3 });
                }
            }
        } catch (err) {
            console.warn('Detection error:', err.message);
        }
    };

    const stopCapture = useCallback(async () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (timerRef.current) clearInterval(timerRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());

        setState('processing');

        // FIX: Use the ref instead of the stale state closure
        const history = emotionHistoryRef.current;
        console.log('[DEBUG] stopCapture: emotionHistory frames =', history.length);

        // Compute distribution from history
        const totals = {};
        history.forEach((f) => {
            Object.entries(f.emotions).forEach(([k, v]) => {
                totals[k] = (totals[k] || 0) + v;
            });
        });
        const total = Object.values(totals).reduce((a, b) => a + b, 1);
        const dist = {};
        Object.entries(totals).forEach(([k, v]) => {
            dist[k] = Math.round((v / total) * 100);
        });

        const dominant = Object.entries(totals).reduce(
            (a, b) => (b[1] > a[1] ? b : a), ['neutral', 0]
        )[0];

        // Try to finalize on backend — WAIT for success
        try {
            const { data } = await videoAPI.finalize(currentSession.id);
            console.log('[DEBUG] finalize response:', data);
            await refreshCurrentSession();
        } catch (err) {
            console.error('[WARN] Finalize failed:', err?.response?.data || err.message);
        }

        setDistribution(dist);
        setDominantEmotion(dominant);
        setState('done');
    }, [currentSession, refreshCurrentSession]);

    const restart = () => {
        cleanup();
        setState('idle');
        setCountdown(CAPTURE_DURATION);
        setCurrentEmotion(null);
        setEmotionHistory([]);
        emotionHistoryRef.current = [];
        setDistribution(null);
        setDominantEmotion(null);
    };

    const emotionConf = currentEmotion ? (EMOTION_CONFIG[currentEmotion.label] || EMOTION_CONFIG.neutral) : null;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div style={{ marginBottom: '24px' }}>
                <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    Video <span className="gradient-text">Analysis</span>
                </h1>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                    {CAPTURE_DURATION}-second facial expression analysis with real-time emotion detection
                    {useMockMode && <span style={{ color: 'var(--color-accent-amber)' }}> (Demo Mode)</span>}
                </p>
            </div>

            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Video Feed & Emotion Display */}
                <div style={{ display: 'flex', gap: '20px', marginBottom: '24px' }}>
                    {/* Video Card */}
                    <div className="glass-card-elevated" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                        <div style={{ position: 'relative', aspectRatio: '4/3', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    transform: 'scaleX(-1)',
                                    display: (state === 'capturing') ? 'block' : 'none',
                                }}
                            />

                            {/* Face Guide Box — shows during capture to indicate where to position face */}
                            {state === 'capturing' && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    pointerEvents: 'none', zIndex: 10,
                                }}>
                                    {/* Centered oval guide */}
                                    <div style={{
                                        width: '200px', height: '260px',
                                        border: '3px solid rgba(124, 58, 237, 0.7)',
                                        borderRadius: '50%',
                                        boxShadow: '0 0 0 9999px rgba(0,0,0,0.25), 0 0 30px rgba(124,58,237,0.4)',
                                        position: 'relative',
                                    }}>
                                        {/* Pulsing corners */}
                                        <div style={{
                                            position: 'absolute', top: '-8px', left: '50%', transform: 'translateX(-50%)',
                                            width: '40px', height: '3px', background: 'rgba(124,58,237,0.9)', borderRadius: '2px',
                                        }} />
                                        <div style={{
                                            position: 'absolute', bottom: '-8px', left: '50%', transform: 'translateX(-50%)',
                                            width: '40px', height: '3px', background: 'rgba(124,58,237,0.9)', borderRadius: '2px',
                                        }} />
                                        <div style={{
                                            position: 'absolute', left: '-8px', top: '50%', transform: 'translateY(-50%)',
                                            width: '3px', height: '40px', background: 'rgba(124,58,237,0.9)', borderRadius: '2px',
                                        }} />
                                        <div style={{
                                            position: 'absolute', right: '-8px', top: '50%', transform: 'translateY(-50%)',
                                            width: '3px', height: '40px', background: 'rgba(124,58,237,0.9)', borderRadius: '2px',
                                        }} />
                                    </div>
                                    {/* Label */}
                                    <p style={{
                                        position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
                                        color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: '500',
                                        textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        Position your face inside the oval
                                    </p>
                                </div>
                            )}

                            {/* Idle State */}
                            {state === 'idle' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px' }}>
                                    <div style={{
                                        width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        background: 'rgba(124,58,237,0.1)', border: '2px solid rgba(124,58,237,0.3)',
                                    }}>
                                        <VideoIcon size={32} style={{ color: 'var(--color-accent-purple)' }} />
                                    </div>
                                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)', textAlign: 'center' }}>
                                        Click Start to begin the {CAPTURE_DURATION}-second video capture
                                    </p>
                                </div>
                            )}

                            {/* Loading State */}
                            {state === 'loading' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px' }}>
                                    <Loader2 size={40} className="animate-spin" style={{ color: 'var(--color-accent-purple)' }} />
                                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Starting camera...</p>
                                </div>
                            )}

                            {/* Processing State */}
                            {state === 'processing' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px' }}>
                                    <Loader2 size={40} className="animate-spin" style={{ color: 'var(--color-accent-purple)' }} />
                                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Processing emotion data...</p>
                                </div>
                            )}

                            {/* Done State */}
                            {state === 'done' && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '48px' }}>
                                    <CheckCircle2 size={40} style={{ color: 'var(--color-accent-green)' }} />
                                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Video analysis complete!</p>
                                </div>
                            )}

                            {/* === LIVE OVERLAYS during capture === */}
                            {state === 'capturing' && (
                                <>
                                    {/* Countdown top-right */}
                                    <div style={{
                                        position: 'absolute', top: '12px', right: '12px',
                                        padding: '8px 16px', borderRadius: '12px',
                                        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
                                    }}>
                                        <span style={{
                                            fontSize: '24px', fontFamily: 'monospace', fontWeight: 'bold',
                                            color: countdown <= 5 ? '#EF4444' : 'var(--color-text-primary)',
                                        }}>
                                            {countdown}s
                                        </span>
                                    </div>

                                    {/* Recording indicator top-left */}
                                    <div style={{
                                        position: 'absolute', top: '12px', left: '12px',
                                        padding: '6px 14px', borderRadius: '12px',
                                        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)',
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                    }}>
                                        <div className="recording-pulse" style={{
                                            width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444',
                                        }} />
                                        <span style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>REC</span>
                                    </div>

                                    {/* === BIG REAL-TIME EMOTION LABEL bottom center === */}
                                    <div style={{
                                        position: 'absolute', bottom: '12px', left: '50%', transform: 'translateX(-50%)',
                                        padding: '10px 24px', borderRadius: '16px',
                                        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)',
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        border: `2px solid ${emotionConf?.color || 'transparent'}`,
                                        transition: 'border-color 0.2s ease',
                                    }}>
                                        <motion.span
                                            key={currentEmotion?.label}
                                            initial={{ scale: 0.5, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            style={{ fontSize: '28px' }}
                                        >
                                            {emotionConf?.emoji || '😐'}
                                        </motion.span>
                                        <div>
                                            <motion.p
                                                key={`label-${currentEmotion?.label}`}
                                                initial={{ y: 10, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                style={{
                                                    fontSize: '18px', fontWeight: '700',
                                                    color: emotionConf?.color || 'var(--color-text-primary)',
                                                    textTransform: 'capitalize',
                                                }}
                                            >
                                                {currentEmotion?.label || 'Detecting...'}
                                            </motion.p>
                                            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                                                {currentEmotion?.confidence ? `${(currentEmotion.confidence * 100).toFixed(0)}% confidence` : ''}
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Live Emotion Stats (only during capture or done) */}
                    {(state === 'capturing' || state === 'done') && (
                        <div className="glass-card" style={{ width: '220px', padding: '20px', flexShrink: 0 }}>
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                                {state === 'capturing' ? 'LIVE EMOTIONS' : 'RESULTS'}
                            </h3>

                            {/* Current big emotion */}
                            {state === 'capturing' && currentEmotion && (
                                <motion.div
                                    key={currentEmotion.label}
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    style={{
                                        textAlign: 'center', padding: '16px', borderRadius: '16px', marginBottom: '16px',
                                        background: emotionConf?.bg,
                                        border: `1px solid ${emotionConf?.color}30`,
                                    }}
                                >
                                    <span style={{ fontSize: '40px', display: 'block', marginBottom: '4px' }}>
                                        {emotionConf?.emoji}
                                    </span>
                                    <p style={{ fontSize: '16px', fontWeight: '700', color: emotionConf?.color }}>
                                        {emotionConf?.label}
                                    </p>
                                </motion.div>
                            )}

                            {/* Emotion frame count */}
                            <div style={{ marginBottom: '12px' }}>
                                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Frames analyzed</p>
                                <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                    {emotionHistory.length}
                                </p>
                            </div>

                            {/* Quick distribution during capture */}
                            {emotionHistory.length > 0 && (
                                <div style={{ marginTop: '12px' }}>
                                    <p className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)', marginBottom: '8px' }}>
                                        Distribution
                                    </p>
                                    {(() => {
                                        const counts = {};
                                        emotionHistory.forEach((f) => {
                                            counts[f.dominant_emotion] = (counts[f.dominant_emotion] || 0) + 1;
                                        });
                                        const total = emotionHistory.length;
                                        return Object.entries(counts)
                                            .sort(([, a], [, b]) => b - a)
                                            .slice(0, 4)
                                            .map(([emo, count]) => (
                                                <div key={emo} style={{ marginBottom: '8px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '2px' }}>
                                                        <span style={{ color: EMOTION_CONFIG[emo]?.color || 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
                                                            {EMOTION_CONFIG[emo]?.emoji} {emo}
                                                        </span>
                                                        <span style={{ color: 'var(--color-text-muted)' }}>{Math.round((count / total) * 100)}%</span>
                                                    </div>
                                                    <div className="progress-bar">
                                                        <div className="progress-bar-fill" style={{
                                                            width: `${(count / total) * 100}%`,
                                                            background: EMOTION_CONFIG[emo]?.color || 'var(--color-accent-purple)',
                                                        }} />
                                                    </div>
                                                </div>
                                            ));
                                    })()}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', marginBottom: '24px' }}>
                    {state === 'idle' && (
                        <motion.button
                            onClick={startCapture}
                            className="btn-primary"
                            style={{ fontSize: '16px', padding: '14px 32px' }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            disabled={!modelsLoaded}
                            id="video-start-btn"
                        >
                            <VideoIcon size={18} />
                            {modelsLoaded ? 'Start Video Capture' : 'Loading Models...'}
                        </motion.button>
                    )}

                    {state === 'capturing' && (
                        <motion.button onClick={() => stopCapture()} className="btn-secondary" whileTap={{ scale: 0.95 }}>
                            <RotateCcw size={16} /> Stop Early & Analyze
                        </motion.button>
                    )}

                    {state === 'done' && (
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <motion.button onClick={restart} className="btn-secondary" whileTap={{ scale: 0.95 }}>
                                <RotateCcw size={16} /> Redo
                            </motion.button>
                            <motion.button
                                onClick={() => navigate('/report')}
                                className="btn-primary"
                                whileHover={{ scale: 1.03 }}
                                id="video-continue-btn"
                            >
                                <CheckCircle2 size={16} /> Generate Report <ArrowRight size={16} />
                            </motion.button>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="glass-card" style={{ padding: '16px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', borderColor: 'rgba(239,68,68,0.3)' }}>
                        <AlertCircle size={18} style={{ color: '#EF4444' }} />
                        <p className="text-sm" style={{ color: '#F87171' }}>{error}</p>
                    </div>
                )}

                {/* Final Emotion Distribution */}
                <AnimatePresence>
                    {distribution && state === 'done' && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-card" style={{ padding: '24px' }}
                        >
                            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
                                EMOTION DISTRIBUTION
                            </h3>
                            <div style={{ display: 'grid', gap: '12px' }}>
                                {Object.entries(distribution)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([emotion, percentage]) => (
                                        <div key={emotion}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                                                <span style={{ color: EMOTION_CONFIG[emotion]?.color || 'var(--color-text-primary)', fontWeight: '500', textTransform: 'capitalize' }}>
                                                    {EMOTION_CONFIG[emotion]?.emoji} {emotion}
                                                </span>
                                                <span style={{ color: 'var(--color-text-secondary)' }}>{percentage}%</span>
                                            </div>
                                            <div className="progress-bar">
                                                <motion.div
                                                    className="progress-bar-fill"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${percentage}%` }}
                                                    transition={{ duration: 1, ease: 'easeOut' }}
                                                    style={{ background: EMOTION_CONFIG[emotion]?.color || 'var(--color-accent-purple)' }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                            </div>
                            <div style={{
                                marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Dominant Emotion</span>
                                <span style={{
                                    fontSize: '18px', fontWeight: '700', textTransform: 'capitalize',
                                    color: EMOTION_CONFIG[dominantEmotion]?.color || 'var(--color-text-primary)',
                                }}>
                                    {EMOTION_CONFIG[dominantEmotion]?.emoji} {dominantEmotion}
                                </span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
