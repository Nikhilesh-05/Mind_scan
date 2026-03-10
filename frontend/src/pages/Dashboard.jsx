import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    MessageSquare, Mic, Video, FileText, Plus, Clock,
    CheckCircle2, Circle, ArrowRight, Activity, WifiOff, RefreshCw
} from 'lucide-react';
import useSessionStore from '../stores/sessionStore';
import { healthCheck } from '../services/api';

const moduleCards = [
    {
        key: 'chat',
        title: 'Chat Analysis',
        description: 'Express your feelings through conversation with our AI therapist',
        icon: MessageSquare,
        color: 'var(--color-accent-purple)',
        path: '/chat',
        field: 'chat_completed',
    },
    {
        key: 'audio',
        title: 'Voice Analysis',
        description: 'Record your voice for prosodic and emotional analysis',
        icon: Mic,
        color: 'var(--color-accent-cyan)',
        path: '/audio',
        field: 'audio_completed',
    },
    {
        key: 'video',
        title: 'Video Analysis',
        description: 'Capture facial expressions for real-time emotion detection',
        icon: Video,
        color: 'var(--color-accent-pink)',
        path: '/video',
        field: 'video_completed',
    },
];

const stepLabels = ['Chat', 'Audio', 'Video', 'Report'];

export default function Dashboard() {
    const { currentSession, sessions, isLoading, createSession, loadSessions, setCurrentSession, refreshCurrentSession } = useSessionStore();
    const navigate = useNavigate();
    const [error, setError] = useState(null);
    const [serverStatus, setServerStatus] = useState('checking'); // checking | online | offline
    const [retrying, setRetrying] = useState(false);

    useEffect(() => {
        checkServer();
    }, []);

    useEffect(() => {
        if (serverStatus === 'online') {
            loadSessions();
            if (currentSession) {
                refreshCurrentSession();
            }
        }
    }, [serverStatus, currentSession, loadSessions, refreshCurrentSession]);

    const checkServer = async () => {
        setServerStatus('checking');
        setRetrying(true);

        // Try up to 3 times with 2s delay
        for (let attempt = 1; attempt <= 3; attempt++) {
            const isHealthy = await healthCheck();
            if (isHealthy) {
                setServerStatus('online');
                setRetrying(false);
                return;
            }
            if (attempt < 3) {
                await new Promise((r) => setTimeout(r, 2000));
            }
        }

        setServerStatus('offline');
        setRetrying(false);
    };

    const handleNewSession = async () => {
        setError(null);
        const session = await createSession();
        if (session) {
            navigate('/chat');
        } else {
            setError('Failed to create session. Please try logging out and back in.');
        }
    };

    const handleResumeSession = (session) => {
        setCurrentSession(session);
        if (!session.chat_completed) navigate('/chat');
        else if (!session.audio_completed) navigate('/audio');
        else if (!session.video_completed) navigate('/video');
        else navigate('/report');
    };

    const getCompletedSteps = (session) => {
        let count = 0;
        if (session?.chat_completed) count++;
        if (session?.audio_completed) count++;
        if (session?.video_completed) count++;
        return count;
    };

    const containerVariants = {
        hidden: { opacity: 1 }, // Changed from 0 to 1 to prevent blank screen bug
        show: { opacity: 1, transition: { staggerChildren: 0.1 } },
    };

    const itemVariants = {
        hidden: { opacity: 1, y: 10 }, // Changed from 0 to 1
        show: { opacity: 1, y: 0 },
    };

    // Server offline banner
    if (serverStatus === 'offline') {
        return (
            <motion.div
                initial={{ opacity: 1 }} // Changed from 0 to 1
                animate={{ opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '24px' }}
            >
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(239, 68, 68, 0.1)', border: '2px solid rgba(239, 68, 68, 0.3)',
                }}>
                    <WifiOff size={36} style={{ color: '#EF4444' }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                    <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                        Backend Server Not Reachable
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)', maxWidth: '400px' }}>
                        The backend server is not running or not responding. Please make sure the backend is started with:
                    </p>
                    <code style={{
                        display: 'block', marginTop: '12px', padding: '12px 20px', borderRadius: '10px',
                        background: 'var(--color-bg-secondary)', color: 'var(--color-accent-cyan)',
                        fontSize: '13px', fontFamily: 'monospace',
                    }}>
                        cd backend && uvicorn app.main:app --reload
                    </code>
                </div>
                <motion.button
                    onClick={checkServer}
                    className="btn-primary"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    disabled={retrying}
                    id="retry-connection-btn"
                >
                    <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} />
                    {retrying ? 'Checking...' : 'Retry Connection'}
                </motion.button>
            </motion.div>
        );
    }

    // Loading state while checking server
    if (serverStatus === 'checking') {
        return (
            <motion.div
                initial={{ opacity: 1 }} // Changed from 0 to 1
                animate={{ opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px' }}
            >
                <RefreshCw size={32} className="animate-spin" style={{ color: 'var(--color-accent-purple)' }} />
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Connecting to server...</p>
            </motion.div>
        );
    }

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
        >
            {/* Header */}
            <motion.div variants={itemVariants} className="mb-8">
                <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                    Welcome to <span className="gradient-text">MindScan</span>
                </h1>
                <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
                    Complete all three analysis modules to generate your comprehensive mental health report.
                </p>
            </motion.div>

            {/* Progress Stepper (if active session) */}
            {currentSession && (
                <motion.div variants={itemVariants} className="glass-card p-6 mb-8">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                            SESSION PROGRESS
                        </h3>
                        <span className="badge badge-purple">
                            {getCompletedSteps(currentSession)}/3 Completed
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {stepLabels.map((label, i) => {
                            const isCompleted = i === 0 ? currentSession.chat_completed
                                : i === 1 ? currentSession.audio_completed
                                    : i === 2 ? currentSession.video_completed
                                        : currentSession.status === 'completed';
                            const isCurrent = !isCompleted && (
                                i === 0 ? true
                                    : i === 1 ? currentSession.chat_completed
                                        : i === 2 ? currentSession.chat_completed && currentSession.audio_completed
                                            : getCompletedSteps(currentSession) === 3
                            );

                            return (
                                <div key={label} className="flex items-center gap-2 flex-1">
                                    <div className="flex items-center gap-2">
                                        {isCompleted ? (
                                            <CheckCircle2 size={20} style={{ color: 'var(--color-accent-green)' }} />
                                        ) : isCurrent ? (
                                            <motion.div
                                                animate={{ scale: [1, 1.2, 1] }}
                                                transition={{ repeat: Infinity, duration: 2 }}
                                            >
                                                <Activity size={20} style={{ color: 'var(--color-accent-purple)' }} />
                                            </motion.div>
                                        ) : (
                                            <Circle size={20} style={{ color: 'var(--color-text-muted)' }} />
                                        )}
                                        <span className="text-sm font-medium" style={{
                                            color: isCompleted ? 'var(--color-accent-green)'
                                                : isCurrent ? 'var(--color-accent-purple)'
                                                    : 'var(--color-text-muted)'
                                        }}>
                                            {label}
                                        </span>
                                    </div>
                                    {i < stepLabels.length - 1 && (
                                        <div className="flex-1 h-px mx-2" style={{
                                            background: isCompleted
                                                ? 'var(--color-accent-green)'
                                                : 'var(--color-border)'
                                        }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}

            {/* New Session Button */}
            <motion.div variants={itemVariants} className="mb-8">
                <motion.button
                    onClick={handleNewSession}
                    className="btn-primary text-base px-8 py-4"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    disabled={isLoading}
                    id="new-session-btn"
                >
                    <Plus size={20} />
                    Start New Analysis Session
                </motion.button>
                {error && (
                    <p style={{
                        color: '#F87171', fontSize: '14px', marginTop: '12px',
                        padding: '10px 16px', borderRadius: '10px',
                        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                        display: 'inline-block',
                    }}>
                        {error}
                    </p>
                )}
            </motion.div>

            {/* Module Cards */}
            <motion.div variants={itemVariants} className="grid grid-cols-3 gap-5 mb-10">
                {moduleCards.map(({ key, title, description, icon: Icon, color, path, field }) => {
                    const isCompleted = currentSession?.[field];
                    return (
                        <motion.div
                            key={key}
                            className="glass-card p-6 cursor-pointer group"
                            whileHover={{ y: -4 }}
                            onClick={() => currentSession && navigate(path)}
                            style={{ opacity: currentSession ? 1 : 0.5 }}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                                    style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                                    <Icon size={20} style={{ color }} />
                                </div>
                                {isCompleted ? (
                                    <span className="badge badge-green">
                                        <CheckCircle2 size={12} /> Done
                                    </span>
                                ) : (
                                    <ArrowRight size={16} style={{ color: 'var(--color-text-muted)' }}
                                        className="group-hover:translate-x-1 transition-transform" />
                                )}
                            </div>
                            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                                {title}
                            </h3>
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                {description}
                            </p>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Past Sessions */}
            {sessions?.length > 0 && (
                <motion.div variants={itemVariants}>
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                        Past Sessions
                    </h2>
                    <div className="space-y-3">
                        {sessions.slice(0, 5).map((session) => (
                            <motion.div
                                key={session.id}
                                className="glass-card p-4 flex items-center justify-between cursor-pointer"
                                whileHover={{ x: 4 }}
                                onClick={() => handleResumeSession(session)}
                            >
                                <div className="flex items-center gap-4">
                                    <Clock size={16} style={{ color: 'var(--color-text-muted)' }} />
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                            Session {session.id.slice(0, 8)}
                                        </p>
                                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                            {new Date(session.created_at).toLocaleDateString('en-US', {
                                                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                                            })}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={`badge ${session.status === 'completed' ? 'badge-green' : 'badge-amber'}`}>
                                        {session.status === 'completed' ? 'Completed' : 'In Progress'}
                                    </span>
                                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                        {getCompletedSteps(session)}/3
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}
        </motion.div>
    );
}
