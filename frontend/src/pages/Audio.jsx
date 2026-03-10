import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Square, RotateCcw, Upload, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import useSessionStore from '../stores/sessionStore';
import { audioAPI } from '../services/api';

export default function Audio() {
    const { currentSession, refreshCurrentSession } = useSessionStore();
    const navigate = useNavigate();
    const [recordingState, setRecordingState] = useState('idle'); // idle | recording | stopped | uploading | done
    const [audioBlob, setAudioBlob] = useState(null);
    const [duration, setDuration] = useState(0);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [waveform, setWaveform] = useState([]);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const analyserRef = useRef(null);
    const animFrameRef = useRef(null);

    useEffect(() => {
        if (!currentSession) {
            navigate('/dashboard');
        }
        return () => {
            if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
            if (timerRef.current) clearInterval(timerRef.current);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [currentSession, navigate]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            // Audio visualization
            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            analyserRef.current = analyser;

            const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            const chunks = [];

            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                setAudioBlob(blob);
                setRecordingState('stopped');
                if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            };

            recorder.start();
            mediaRecorderRef.current = recorder;
            setRecordingState('recording');
            setDuration(0);

            timerRef.current = setInterval(() => {
                setDuration((d) => d + 1);
            }, 1000);

            // Waveform animation
            const updateWaveform = () => {
                const data = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(data);
                setWaveform(Array.from(data.slice(0, 24)));
                animFrameRef.current = requestAnimationFrame(updateWaveform);
            };
            updateWaveform();
        } catch {
            setError('Microphone access denied. Please allow microphone access.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
            streamRef.current?.getTracks().forEach((t) => t.stop());
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const restartRecording = () => {
        setAudioBlob(null);
        setResult(null);
        setDuration(0);
        setWaveform([]);
        setRecordingState('idle');
    };

    const analyzeAudio = async () => {
        if (!audioBlob) return;
        setRecordingState('uploading');
        setError(null);

        try {
            const { data } = await audioAPI.analyze(currentSession.id, audioBlob);
            setResult(data);
            setRecordingState('done');
            refreshCurrentSession();
        } catch {
            setError('Analysis failed. Please try again.');
            setRecordingState('stopped');
        }
    };

    const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    const emotionConfig = {
        sad: { color: 'var(--color-accent-red)', emoji: '🔴', bg: 'rgba(239, 68, 68, 0.12)' },
        neutral: { color: 'var(--color-accent-amber)', emoji: '🟡', bg: 'rgba(245, 158, 11, 0.12)' },
        happy: { color: 'var(--color-accent-green)', emoji: '🟢', bg: 'rgba(16, 185, 129, 0.12)' },
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-6">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    Voice <span className="gradient-text">Analysis</span>
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Record your voice for emotional and prosodic analysis
                </p>
            </div>

            <div className="max-w-2xl mx-auto">
                {/* Recorder Card */}
                <div className="glass-card-elevated p-8 text-center mb-6">
                    {/* Waveform Visualization */}
                    <div className="flex items-center justify-center gap-1 h-24 mb-6">
                        {recordingState === 'recording' ? (
                            waveform.map((val, i) => (
                                <motion.div
                                    key={i}
                                    className="w-1.5 rounded-full"
                                    style={{ background: 'linear-gradient(to top, var(--color-accent-purple), var(--color-accent-cyan))' }}
                                    animate={{ height: Math.max(8, val / 3) }}
                                    transition={{ duration: 0.1 }}
                                />
                            ))
                        ) : (
                            <div className="flex items-center justify-center gap-1 h-24">
                                {Array.from({ length: 24 }).map((_, i) => (
                                    <div key={i} className="w-1.5 h-2 rounded-full" style={{ background: 'var(--color-border)' }} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Timer */}
                    <div className="text-4xl font-mono font-bold mb-6" style={{ color: 'var(--color-text-primary)' }}>
                        {formatTime(duration)}
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-center gap-4">
                        {recordingState === 'idle' && (
                            <motion.button
                                onClick={startRecording}
                                className="w-16 h-16 rounded-full flex items-center justify-center"
                                style={{ background: 'linear-gradient(135deg, var(--color-accent-purple), var(--color-accent-cyan))' }}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                id="audio-record-btn"
                            >
                                <Mic size={28} color="white" />
                            </motion.button>
                        )}

                        {recordingState === 'recording' && (
                            <motion.button
                                onClick={stopRecording}
                                className="w-16 h-16 rounded-full flex items-center justify-center recording-pulse"
                                style={{ background: 'var(--color-accent-red)' }}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                id="audio-stop-btn"
                            >
                                <Square size={24} color="white" />
                            </motion.button>
                        )}

                        {recordingState === 'stopped' && (
                            <>
                                <motion.button onClick={restartRecording} className="btn-secondary" whileTap={{ scale: 0.95 }}>
                                    <RotateCcw size={16} /> Restart
                                </motion.button>
                                <motion.button onClick={analyzeAudio} className="btn-primary" whileTap={{ scale: 0.95 }} id="audio-analyze-btn">
                                    <Upload size={16} /> Analyze
                                </motion.button>
                            </>
                        )}

                        {recordingState === 'uploading' && (
                            <div className="flex items-center gap-3" style={{ color: 'var(--color-text-secondary)' }}>
                                <Loader2 size={20} className="animate-spin" />
                                <span className="text-sm">Analyzing your voice...</span>
                            </div>
                        )}

                        {recordingState === 'done' && (
                            <motion.button
                                onClick={() => navigate('/video')}
                                className="btn-primary"
                                whileHover={{ scale: 1.03 }}
                                id="audio-continue-btn"
                            >
                                <CheckCircle2 size={16} /> Continue to Video <ArrowRight size={16} />
                            </motion.button>
                        )}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="mb-6 p-4 rounded-xl text-sm"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#F87171' }}>
                        {error}
                    </motion.div>
                )}

                {/* Results */}
                <AnimatePresence>
                    {result && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4"
                        >
                            {/* Emotion Badge */}
                            <div className="glass-card p-6 flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                                        DETECTED EMOTION
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        <span className="text-2xl">
                                            {emotionConfig[result.emotion_label]?.emoji || '⚪'}
                                        </span>
                                        <span className="text-xl font-bold capitalize" style={{
                                            color: emotionConfig[result.emotion_label]?.color || 'var(--color-text-primary)'
                                        }}>
                                            {result.emotion_label}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Confidence</p>
                                    <p className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                        {(result.confidence * 100).toFixed(0)}%
                                    </p>
                                </div>
                            </div>

                            {/* Transcription */}
                            {result.transcription && (
                                <div className="glass-card p-6">
                                    <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                                        TRANSCRIPTION
                                    </h3>
                                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>
                                        "{result.transcription}"
                                    </p>
                                </div>
                            )}

                            {/* Prosodic Features */}
                            {result.prosodic_features_json && (
                                <div className="glass-card p-6">
                                    <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                                        PROSODIC FEATURES
                                    </h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        {[
                                            { label: 'Pitch Mean', value: result.prosodic_features_json.pitch_mean?.toFixed(1), unit: 'Hz' },
                                            { label: 'Energy', value: result.prosodic_features_json.energy_mean?.toFixed(2), unit: '' },
                                            { label: 'Speech Rate', value: result.prosodic_features_json.speech_rate?.toFixed(1), unit: 'syl/s' },
                                            { label: 'Pitch Var', value: result.prosodic_features_json.pitch_std?.toFixed(1), unit: 'Hz' },
                                            { label: 'Pause Ratio', value: (result.prosodic_features_json.pause_ratio * 100)?.toFixed(0), unit: '%' },
                                            { label: 'Energy Var', value: result.prosodic_features_json.energy_std?.toFixed(2), unit: '' },
                                        ].map(({ label, value, unit }) => (
                                            <div key={label} className="p-3 rounded-lg" style={{ background: 'var(--color-bg-primary)' }}>
                                                <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                                                <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                                    {value}<span className="text-xs font-normal ml-1" style={{ color: 'var(--color-text-muted)' }}>{unit}</span>
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}
