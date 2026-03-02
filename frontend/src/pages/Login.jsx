import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import useAuthStore from '../stores/authStore';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, isLoading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const success = await login(email, password);
        if (success) navigate('/dashboard');
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
            style={{ background: 'var(--color-bg-primary)' }}>

            {/* Background gradient orbs */}
            <div className="absolute top-1/4 -left-32 w-96 h-96 rounded-full opacity-20 blur-3xl"
                style={{ background: 'var(--color-accent-purple)' }} />
            <div className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full opacity-15 blur-3xl"
                style={{ background: 'var(--color-accent-cyan)' }} />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="glass-card-elevated p-10 w-full max-w-md relative z-10"
            >
                {/* Logo */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: 'spring' }}
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, var(--color-accent-purple), var(--color-accent-cyan))' }}
                    >
                        <Brain size={26} color="white" />
                    </motion.div>
                    <div>
                        <h1 className="text-2xl font-bold gradient-text">MindScan</h1>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Multimodal Depression Detection</p>
                    </div>
                </div>

                <h2 className="text-xl font-semibold text-center mb-2" style={{ color: 'var(--color-text-primary)' }}>
                    Welcome back
                </h2>
                <p className="text-center text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
                    Sign in to access your mental health analysis
                </p>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mb-4 p-3 rounded-lg text-sm"
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#F87171' }}
                    >
                        {error}
                    </motion.div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                            Email
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={{
                                position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                                color: 'var(--color-text-muted)', pointerEvents: 'none', display: 'flex', alignItems: 'center'
                            }}>
                                <Mail size={16} />
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                                placeholder="you@example.com"
                                className="input-field"
                                style={{ paddingLeft: '42px' }}
                                required
                                id="login-email"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                            Password
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={{
                                position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                                color: 'var(--color-text-muted)', pointerEvents: 'none', display: 'flex', alignItems: 'center'
                            }}>
                                <Lock size={16} />
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                                placeholder="Enter your password"
                                className="input-field"
                                style={{ paddingLeft: '42px' }}
                                required
                                id="login-password"
                            />
                        </div>
                    </div>

                    <motion.button
                        type="submit"
                        disabled={isLoading}
                        className="btn-primary w-full"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        id="login-submit"
                    >
                        {isLoading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <>
                                Sign In <ArrowRight size={16} />
                            </>
                        )}
                    </motion.button>
                </form>

                <p className="mt-6 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Don't have an account?{' '}
                    <Link to="/register" className="font-semibold hover:underline"
                        style={{ color: 'var(--color-accent-purple)' }}>
                        Create one
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
