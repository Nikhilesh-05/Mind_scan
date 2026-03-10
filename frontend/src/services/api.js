import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000, // 15 second default timeout
});

// JWT interceptor — attach token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor — handle 401 and add retry logic for network errors
api.interceptors.response.use(
    (res) => res,
    async (err) => {
        const config = err.config;

        // Handle 401 — invalid/expired token
        if (err.response?.status === 401) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_user');
            window.location.href = '/login';
            return Promise.reject(err);
        }

        // Auto-retry on network errors (not 4xx/5xx) — max 2 retries
        if (!err.response && !config._retryCount) {
            config._retryCount = 0;
        }
        if (!err.response && config._retryCount < 2) {
            config._retryCount += 1;
            console.log(`[API] Retry ${config._retryCount}/2 for ${config.url}`);
            // Exponential backoff: 1s, 2s
            await new Promise((r) => setTimeout(r, config._retryCount * 1000));
            return api(config);
        }

        return Promise.reject(err);
    }
);

// ====== Health Check ======
export const healthCheck = async () => {
    try {
        const res = await axios.get('/api/health', { timeout: 5000 });
        return res.data?.status === 'healthy';
    } catch {
        return false;
    }
};

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
            timeout: 30000, // 30s for upload
        });
    },
    getResult: (sessionId) => api.get(`/audio/result/${sessionId}`),
};

// ====== Video ======
export const videoAPI = {
    sendEmotionFrame: (data) => api.post('/video/emotion-frame', data, { timeout: 5000 }),
    finalize: (sessionId) => api.post(`/video/finalize/${sessionId}`, null, { timeout: 30000 }),
    getResult: (sessionId) => api.get(`/video/result/${sessionId}`),
};

// ====== Report ======
export const reportAPI = {
    generate: (sessionId) => api.post('/report/generate', { session_id: sessionId }, { timeout: 60000 }), // 60s for AI
    download: (reportId) => api.get(`/report/download/${reportId}`, { responseType: 'blob', timeout: 30000 }),
    history: () => api.get('/report/history'),
};

export default api;
