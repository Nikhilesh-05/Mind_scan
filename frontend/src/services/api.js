import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// JWT interceptor — attach token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor — handle 401
api.interceptors.response.use(
    (res) => res,
    (err) => {
        if (err.response?.status === 401) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            window.location.href = '/login';
        }
        return Promise.reject(err);
    }
);

// ====== Auth ======
export const authAPI = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    getMe: () => api.get('/auth/me'),
};

// ====== Sessions ======
export const sessionAPI = {
    create: () => api.post('/sessions/'),
    list: () => api.get('/sessions/'),
    get: (id) => api.get(`/sessions/${id}`),
};

// ====== Chat ======
export const chatAPI = {
    sendMessage: (data) => api.post('/chat/message', data),
    getHistory: (sessionId) => api.get(`/chat/session/${sessionId}`),
};

// ====== Audio ======
export const audioAPI = {
    analyze: (sessionId, audioBlob) => {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('audio_file', audioBlob, 'recording.webm');
        return api.post('/audio/analyze', formData, {
            headers: { 'Content-Type': undefined },
        });
    },
    getResult: (sessionId) => api.get(`/audio/result/${sessionId}`),
};

// ====== Video ======
export const videoAPI = {
    sendEmotionFrame: (data) => api.post('/video/emotion-frame', data),
    finalize: (sessionId) => api.post(`/video/finalize/${sessionId}`),
    getResult: (sessionId) => api.get(`/video/result/${sessionId}`),
};

// ====== Report ======
export const reportAPI = {
    generate: (sessionId) => api.post('/report/generate', { session_id: sessionId }),
    download: (reportId) => api.get(`/report/download/${reportId}`, { responseType: 'blob' }),
    history: () => api.get('/report/history'),
};

export default api;
