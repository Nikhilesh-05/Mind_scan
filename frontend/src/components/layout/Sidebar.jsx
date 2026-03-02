import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    MessageSquare, Mic, Video, FileText, LayoutDashboard,
    LogOut, Brain, Settings
} from 'lucide-react';
import useAuthStore from '../../stores/authStore';

const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/chat', label: 'Chat Analysis', icon: MessageSquare },
    { path: '/audio', label: 'Audio Analysis', icon: Mic },
    { path: '/video', label: 'Video Analysis', icon: Video },
    { path: '/report', label: 'Reports', icon: FileText },
];

export default function Sidebar() {
    const { user, logout } = useAuthStore();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed left-0 top-0 h-screen w-[260px] flex flex-col border-r z-50"
            style={{
                background: 'rgba(13, 17, 23, 0.95)',
                backdropFilter: 'blur(20px)',
                borderColor: 'var(--color-border)',
            }}
        >
            {/* Logo */}
            <div className="p-6 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, var(--color-accent-purple), var(--color-accent-cyan))' }}>
                    <Brain size={22} color="white" />
                </div>
                <div>
                    <h1 className="text-base font-bold gradient-text">MindScan</h1>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Depression Detection</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1">
                {navItems.map(({ path, label, icon: Icon }) => (
                    <NavLink
                        key={path}
                        to={path}
                        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    >
                        <Icon size={18} />
                        <span>{label}</span>
                    </NavLink>
                ))}
            </nav>

            {/* User Profile & Logout */}
            <div className="p-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-3 mb-3 px-2">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold"
                        style={{ background: 'linear-gradient(135deg, var(--color-accent-purple), var(--color-accent-cyan))' }}>
                        {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                            {user?.name || 'User'}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                            {user?.email || ''}
                        </p>
                    </div>
                </div>
                <button onClick={handleLogout} className="sidebar-link w-full" style={{ color: 'var(--color-accent-red)' }}>
                    <LogOut size={18} />
                    <span>Logout</span>
                </button>
            </div>
        </motion.aside>
    );
}
