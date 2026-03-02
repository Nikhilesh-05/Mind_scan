import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, Mail, Lock, User, ArrowRight, Loader2 } from 'lucide-react';
import useAuthStore from '../stores/authStore';

export default function Register() {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const { register, isLoading, error, clearError } = useAuthStore();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            useAuthStore.setState({ error: 'Passwords do not match' });
            return;
        }
        const success = await register(name, email, password);
        if (success) navigate('/dashboard');
    };

    const iconStyle = {
        position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
        color: 'var(--color-text-muted)', pointerEvents: 'none', display: 'flex', alignItems: 'center',
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
            style={{ background: 'var(--color-bg-primary)' }}>

            <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl"
                style={{ background: 'var(--color-accent-purple)' }} />
            <div className="absolute bottom-1/3 -left-32 w-96 h-96 rounded-full opacity-15 blur-3xl"
                style={{ background: 'var(--color-accent-cyan)' }} />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="glass-card-elevated p-10 w-full max-w-md relative z-10"
            >
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
                    Create your account
                </h2>
                <p className="text-center text-sm mb-8" style={{ color: 'var(--color-text-secondary)' }}>
                    Start your mental health analysis journey
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

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                            Full Name
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={iconStyle}><User size={16} /></div>
                            <input
                                type="text" value={name}
                                onChange={(e) => { setName(e.target.value); clearError(); }}
                                placeholder="John Doe"
                                className="input-field" style={{ paddingLeft: '42px' }}
                                required id="register-name"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                            Email
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={iconStyle}><Mail size={16} /></div>
                            <input
                                type="email" value={email}
                                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                                placeholder="you@example.com"
                                className="input-field" style={{ paddingLeft: '42px' }}
                                required id="register-email"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                            Password
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={iconStyle}><Lock size={16} /></div>
                            <input
                                type="password" value={password}
                                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                                placeholder="Min 6 characters"
                                className="input-field" style={{ paddingLeft: '42px' }}
                                required minLength={6} id="register-password"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                            Confirm Password
                        </label>
                        <div style={{ position: 'relative' }}>
                            <div style={iconStyle}><Lock size={16} /></div>
                            <input
                                type="password" value={confirmPassword}
                                onChange={(e) => { setConfirmPassword(e.target.value); clearError(); }}
                                placeholder="Re-enter your password"
                                className="input-field" style={{ paddingLeft: '42px' }}
                                required minLength={6} id="register-confirm-password"
                            />
                        </div>
                    </div>

                    <motion.button
                        type="submit" disabled={isLoading}
                        className="btn-primary w-full"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        id="register-submit"
                    >
                        {isLoading ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <>Create Account <ArrowRight size={16} /></>
                        )}
                    </motion.button>
                </form>

                <p className="mt-6 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Already have an account?{' '}
                    <Link to="/login" className="font-semibold hover:underline"
                        style={{ color: 'var(--color-accent-purple)' }}>
                        Sign in
                    </Link>
                </p>
            </motion.div>
        </div>
    );
}
