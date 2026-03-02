import { create } from 'zustand';
import { sessionAPI } from '../services/api';

const useSessionStore = create((set, get) => ({
    currentSession: null,
    sessions: [],
    isLoading: false,

    createSession: async () => {
        set({ isLoading: true });
        try {
            const { data } = await sessionAPI.create();
            set((state) => ({
                currentSession: data,
                sessions: [data, ...state.sessions],
                isLoading: false,
            }));
            return data;
        } catch (err) {
            set({ isLoading: false });
            console.error('Failed to create session:', err?.response?.status, err?.response?.data || err.message);
            // If unauthorized, token is stale — clear and redirect to login
            if (err?.response?.status === 401) {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('auth_user');
                window.location.href = '/login';
            }
            return null;
        }
    },

    loadSessions: async () => {
        set({ isLoading: true });
        try {
            const { data } = await sessionAPI.list();
            set({ sessions: data, isLoading: false });
        } catch (err) {
            set({ isLoading: false });
            console.error('Failed to load sessions:', err);
        }
    },

    setCurrentSession: (session) => set({ currentSession: session }),

    refreshCurrentSession: async () => {
        const { currentSession } = get();
        if (!currentSession) return;
        try {
            const { data } = await sessionAPI.get(currentSession.id);
            set({ currentSession: data });
        } catch (err) {
            console.error('Failed to refresh session:', err);
        }
    },
}));

export default useSessionStore;
