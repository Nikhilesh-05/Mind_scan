import { create } from 'zustand';
import { authAPI } from '../services/api';

const useAuthStore = create((set, get) => ({
    user: JSON.parse(localStorage.getItem('auth_user') || 'null'),
    token: localStorage.getItem('auth_token') || null,
    isAuthenticated: !!localStorage.getItem('auth_token'),
    isLoading: false,
    error: null,

    login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await authAPI.login({ email, password });
            localStorage.setItem('auth_token', data.access_token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));
            set({ user: data.user, token: data.access_token, isAuthenticated: true, isLoading: false });
            return true;
        } catch (err) {
            set({ error: err.response?.data?.detail || 'Login failed', isLoading: false });
            return false;
        }
    },

    register: async (name, email, password) => {
        set({ isLoading: true, error: null });
        try {
            const { data } = await authAPI.register({ name, email, password });
            localStorage.setItem('auth_token', data.access_token);
            localStorage.setItem('auth_user', JSON.stringify(data.user));
            set({ user: data.user, token: data.access_token, isAuthenticated: true, isLoading: false });
            return true;
        } catch (err) {
            set({ error: err.response?.data?.detail || 'Registration failed', isLoading: false });
            return false;
        }
    },

    logout: () => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        set({ user: null, token: null, isAuthenticated: false, error: null });
    },

    clearError: () => set({ error: null }),
}));

export default useAuthStore;
