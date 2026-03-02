import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import useSessionStore from '../stores/sessionStore';
import { chatAPI } from '../services/api';

export default function Chat() {
    const { currentSession, refreshCurrentSession } = useSessionStore();
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [sentiment, setSentiment] = useState(null);
    const [isComplete, setIsComplete] = useState(false);
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (!currentSession) {
            navigate('/dashboard');
            return;
        }
        // Load existing chat history
        chatAPI.getHistory(currentSession.id).then(({ data }) => {
            if (data.messages?.length > 0) {
                setMessages(data.messages);
                setSentiment(data.sentiment_scores);
            } else {
                // Initial bot greeting
                setMessages([{
                    role: 'assistant',
                    content: "Hello! I'm here to listen and help you explore your feelings. This is a safe space — take your time. How are you feeling today?",
                }]);
            }
        }).catch(console.error);
    }, [currentSession]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isTyping) return;
        const userMsg = input.trim();
        setInput('');
        setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
        setIsTyping(true);

        try {
            const { data } = await chatAPI.sendMessage({
                session_id: currentSession.id,
                message: userMsg,
            });
            setMessages((prev) => [...prev, { role: 'assistant', content: data.bot_reply }]);
            setSentiment(data.sentiment);
        } catch (err) {
            setMessages((prev) => [...prev, {
                role: 'assistant',
                content: "I'm sorry, I'm having trouble right now. Please try again.",
            }]);
        } finally {
            setIsTyping(false);
            inputRef.current?.focus();
        }
    };

    const handleComplete = () => {
        setIsComplete(true);
        refreshCurrentSession();
        setTimeout(() => navigate('/audio'), 1500);
    };

    const userMessageCount = messages.filter((m) => m.role === 'user').length;

    return (
        <div className="flex flex-col h-[calc(100vh-64px)]">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                        Chat <span className="gradient-text">Analysis</span>
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                        Talk freely about your feelings • {userMessageCount} messages sent
                    </p>
                </div>
                {userMessageCount >= 3 && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={handleComplete}
                        className="btn-primary"
                        id="chat-complete-btn"
                    >
                        {isComplete ? <CheckCircle2 size={16} /> : <ArrowRight size={16} />}
                        {isComplete ? 'Completed!' : 'Complete & Continue'}
                    </motion.button>
                )}
            </div>

            <div className="flex gap-5 flex-1 min-h-0">
                {/* Chat Window */}
                <div className="flex-1 flex flex-col glass-card overflow-hidden">
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                        <AnimatePresence>
                            {messages.map((msg, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                                >
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{ background: 'linear-gradient(135deg, var(--color-accent-purple), var(--color-accent-cyan))' }}>
                                            <Bot size={16} color="white" />
                                        </div>
                                    )}
                                    <div
                                        className="max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed"
                                        style={{
                                            background: msg.role === 'user'
                                                ? 'linear-gradient(135deg, var(--color-accent-purple), var(--color-accent-cyan))'
                                                : 'var(--color-bg-tertiary)',
                                            color: 'var(--color-text-primary)',
                                            borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
                                            borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '16px',
                                        }}
                                    >
                                        {msg.content}
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                            style={{ background: 'var(--color-bg-tertiary)' }}>
                                            <User size={16} style={{ color: 'var(--color-text-secondary)' }} />
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>

                        {isTyping && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex gap-3 items-center"
                            >
                                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                                    style={{ background: 'linear-gradient(135deg, var(--color-accent-purple), var(--color-accent-cyan))' }}>
                                    <Bot size={16} color="white" />
                                </div>
                                <div className="px-4 py-3 rounded-2xl" style={{ background: 'var(--color-bg-tertiary)' }}>
                                    <div className="flex gap-1">
                                        {[0, 1, 2].map((i) => (
                                            <motion.div
                                                key={i}
                                                className="w-2 h-2 rounded-full"
                                                style={{ background: 'var(--color-text-muted)' }}
                                                animate={{ y: [0, -6, 0] }}
                                                transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex gap-3">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                placeholder="Type your message..."
                                className="input-field flex-1"
                                disabled={isTyping}
                                id="chat-input"
                            />
                            <motion.button
                                onClick={handleSend}
                                disabled={!input.trim() || isTyping}
                                className="btn-primary px-4"
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                id="chat-send-btn"
                            >
                                {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                            </motion.button>
                        </div>
                    </div>
                </div>

                {/* Sentiment Panel */}
                <div className="w-64 flex-shrink-0 glass-card p-5 h-fit">
                    <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                        SENTIMENT ANALYSIS
                    </h3>
                    {sentiment ? (
                        <div className="space-y-4">
                            {Object.entries(sentiment).map(([key, value]) => (
                                <div key={key}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="capitalize" style={{ color: 'var(--color-text-secondary)' }}>
                                            {key}
                                        </span>
                                        <span style={{ color: 'var(--color-text-primary)' }}>
                                            {(value * 100).toFixed(0)}%
                                        </span>
                                    </div>
                                    <div className="progress-bar">
                                        <motion.div
                                            className="progress-bar-fill"
                                            initial={{ width: 0 }}
                                            animate={{ width: `${value * 100}%` }}
                                            transition={{ duration: 0.8, ease: 'easeOut' }}
                                            style={{
                                                background: key === 'positive' ? 'var(--color-accent-green)'
                                                    : key === 'negative' ? 'var(--color-accent-red)'
                                                        : 'var(--color-accent-amber)'
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Send a message to see real-time sentiment analysis
                        </p>
                    )}

                    <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            💡 Send at least 3 messages before completing this module
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
