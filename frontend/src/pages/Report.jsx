import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, Download, Loader2, AlertTriangle, Shield,
    Brain, Mic, Video, TrendingDown, Heart, ChevronDown
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import useSessionStore from '../stores/sessionStore';
import { reportAPI } from '../services/api';

const riskColors = {
    Low: 'var(--color-accent-green)',
    Moderate: 'var(--color-accent-amber)',
    High: '#F97316',
    Severe: 'var(--color-accent-red)',
};

const modalityIcons = { text: Brain, audio: Mic, video: Video };

export default function Report() {
    const { currentSession } = useSessionStore();
    const [report, setReport] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);
    const [pastReports, setPastReports] = useState([]);

    useEffect(() => {
        reportAPI.history().then(({ data }) => setPastReports(data)).catch(() => { });
    }, []);

    const generateReport = async () => {
        if (!currentSession) return;
        setIsGenerating(true);
        setError(null);

        try {
            const { data } = await reportAPI.generate(currentSession.id);
            setReport(data);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to generate report');
        } finally {
            setIsGenerating(false);
        }
    };

    const sarvam = report?.sarvam_response_json;

    // Prepare chart data
    const pieData = sarvam?.explainability
        ? [
            { name: 'Text', value: sarvam.explainability.text_weight, color: '#7C3AED' },
            { name: 'Audio', value: sarvam.explainability.audio_weight, color: '#06B6D4' },
            { name: 'Video', value: sarvam.explainability.video_weight, color: '#EC4899' },
        ]
        : [];

    const projectionData = sarvam?.lifetime_risk_projection
        ? [
            { period: 'Current', risk: Math.round(sarvam.lifetime_risk_projection.current * 100) },
            { period: '6 Months', risk: Math.round(sarvam.lifetime_risk_projection['6_months'] * 100) },
            { period: '1 Year', risk: Math.round(sarvam.lifetime_risk_projection['1_year'] * 100) },
        ]
        : [];

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-6">
                <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    Analysis <span className="gradient-text">Report</span>
                </h1>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                    Comprehensive depression risk assessment powered by Sarvam AI
                </p>
            </div>

            {/* Generate Button */}
            {!report && (
                <div className="glass-card-elevated p-12 text-center mb-8">
                    <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center float-animation"
                        style={{ background: 'linear-gradient(135deg, var(--color-accent-purple), var(--color-accent-cyan))' }}>
                        <FileText size={36} color="white" />
                    </div>
                    <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                        Ready to Generate Your Report
                    </h2>
                    <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                        All modality data will be analyzed using Sarvam AI to produce a comprehensive depression risk assessment with personalized recommendations.
                    </p>

                    {error && (
                        <div className="mb-4 p-3 rounded-lg text-sm max-w-md mx-auto"
                            style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#F87171' }}>
                            {error}
                        </div>
                    )}

                    <motion.button
                        onClick={generateReport}
                        disabled={isGenerating || !currentSession}
                        className="btn-primary text-base px-10 py-4"
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        id="generate-report-btn"
                    >
                        {isGenerating ? (
                            <><Loader2 size={20} className="animate-spin" /> Analyzing...</>
                        ) : (
                            <><Brain size={20} /> Analyze & Generate Report</>
                        )}
                    </motion.button>
                </div>
            )}

            {/* Report Content */}
            <AnimatePresence>
                {report && sarvam && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        {/* Risk Level Banner */}
                        <div className="glass-card-elevated p-8 text-center relative overflow-hidden">
                            <div className="absolute inset-0 opacity-5"
                                style={{ background: `radial-gradient(circle, ${riskColors[sarvam.risk_level]}, transparent)` }} />
                            <p className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                                DEPRESSION RISK LEVEL
                            </p>
                            <h2 className="text-5xl font-extrabold mb-2" style={{ color: riskColors[sarvam.risk_level] }}>
                                {sarvam.risk_level}
                            </h2>
                            <div className="flex items-center justify-center gap-2 mb-4">
                                <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Fusion Score:</span>
                                <span className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                    {(sarvam.fusion_score * 100).toFixed(0)}%
                                </span>
                            </div>
                            <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
                                {sarvam.summary}
                            </p>
                        </div>

                        {/* Per-Modality Analysis */}
                        <div className="grid grid-cols-3 gap-5">
                            {Object.entries(sarvam.per_modality).map(([key, mod]) => {
                                const Icon = modalityIcons[key] || Brain;
                                return (
                                    <motion.div key={key} className="glass-card p-6" whileHover={{ y: -3 }}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <Icon size={18} style={{ color: pieData.find((d) => d.name.toLowerCase() === key)?.color }} />
                                            <h3 className="text-sm font-semibold capitalize" style={{ color: 'var(--color-text-primary)' }}>
                                                {key} Analysis
                                            </h3>
                                        </div>
                                        <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--color-text-secondary)' }}>
                                            {mod.summary}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Risk Score:</span>
                                            <span className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                                {(mod.risk_contribution * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>

                        {/* Charts Row */}
                        <div className="grid grid-cols-2 gap-5">
                            {/* Modality Weights Pie */}
                            <div className="glass-card p-6">
                                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                                    MODALITY WEIGHTAGE
                                </h3>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={80}
                                                dataKey="value"
                                                label={({ name, value }) => `${name} ${value}%`}
                                                labelLine={false}
                                            >
                                                {pieData.map((entry, i) => (
                                                    <Cell key={i} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Risk Projection Bar */}
                            <div className="glass-card p-6">
                                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                                    LIFETIME RISK PROJECTION
                                </h3>
                                <div className="h-52">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={projectionData}>
                                            <XAxis dataKey="period" tick={{ fill: '#8B949E', fontSize: 12 }} axisLine={false} tickLine={false} />
                                            <YAxis tick={{ fill: '#8B949E', fontSize: 12 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                                            <Tooltip
                                                contentStyle={{ background: '#161B22', border: '1px solid rgba(139,148,158,0.15)', borderRadius: 12 }}
                                                labelStyle={{ color: '#E6EDF3' }}
                                                itemStyle={{ color: '#8B949E' }}
                                            />
                                            <Bar dataKey="risk" fill="url(#gradient)" radius={[8, 8, 0, 0]} />
                                            <defs>
                                                <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#7C3AED" />
                                                    <stop offset="100%" stopColor="#06B6D4" />
                                                </linearGradient>
                                            </defs>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                {sarvam.lifetime_risk_projection?.notes && (
                                    <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                                        {sarvam.lifetime_risk_projection.notes}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Key Factors */}
                        {sarvam.explainability?.key_factors?.length > 0 && (
                            <div className="glass-card p-6">
                                <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                                    KEY CONTRIBUTING FACTORS
                                </h3>
                                <div className="space-y-3">
                                    {sarvam.explainability.key_factors.map((factor, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg"
                                            style={{ background: 'rgba(124, 58, 237, 0.05)' }}>
                                            <TrendingDown size={16} className="mt-0.5 flex-shrink-0"
                                                style={{ color: 'var(--color-accent-amber)' }} />
                                            <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                                {factor}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Remedies */}
                        {sarvam.remedies?.length > 0 && (
                            <div className="glass-card p-6">
                                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                                    <Heart size={16} style={{ color: 'var(--color-accent-pink)' }} />
                                    PERSONALIZED RECOMMENDATIONS
                                </h3>
                                <div className="grid grid-cols-2 gap-3">
                                    {sarvam.remedies.map((remedy, i) => (
                                        <div key={i} className="flex items-start gap-3 p-4 rounded-xl"
                                            style={{ background: 'var(--color-bg-primary)' }}>
                                            <span className="text-lg flex-shrink-0">
                                                {['🧠', '💤', '🏃', '🧘', '👥', '📱'][i] || '✨'}
                                            </span>
                                            <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                                {remedy}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Disclaimer */}
                        <div className="p-4 rounded-xl flex items-start gap-3"
                            style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--color-accent-amber)' }} />
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                {sarvam.disclaimer}
                            </p>
                        </div>

                        {/* Download Button */}
                        <div className="flex justify-center pt-4">
                            <motion.button
                                className="btn-primary text-base px-10 py-4"
                                whileHover={{ scale: 1.03 }}
                                onClick={() => {
                                    const token = localStorage.getItem('auth_token');
                                    const reportId = report.id;
                                    const fileName = `MindScan_Report_${(reportId || 'report').slice(0, 8)}.pdf`;

                                    const xhr = new XMLHttpRequest();
                                    xhr.open('GET', `/api/report/download/${reportId}`, true);
                                    xhr.responseType = 'blob';
                                    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

                                    xhr.onload = function () {
                                        if (xhr.status === 200) {
                                            const blob = new Blob([xhr.response], { type: 'application/pdf' });
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = fileName;
                                            document.body.appendChild(a);
                                            a.click();
                                            setTimeout(() => {
                                                document.body.removeChild(a);
                                                window.URL.revokeObjectURL(url);
                                            }, 3000);
                                        } else {
                                            alert('Failed to download PDF. Server returned status: ' + xhr.status);
                                        }
                                    };

                                    xhr.onerror = function () {
                                        alert('Network error while downloading PDF.');
                                    };

                                    xhr.send();
                                }}
                                id="download-report-btn"
                            >
                                <Download size={20} /> Download PDF Report
                            </motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Past Reports */}
            {pastReports.length > 0 && !report && (
                <div className="mt-8">
                    <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--color-text-primary)' }}>
                        Report History
                    </h2>
                    <div className="space-y-3">
                        {pastReports.map((r) => (
                            <div key={r.id} className="glass-card p-4 flex items-center justify-between cursor-pointer"
                                onClick={() => setReport(r)}>
                                <div className="flex items-center gap-3">
                                    <FileText size={16} style={{ color: 'var(--color-accent-purple)' }} />
                                    <div>
                                        <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                            Report {r.id?.slice(0, 8)}
                                        </p>
                                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                            {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </p>
                                    </div>
                                </div>
                                <span className={`badge ${r.risk_level === 'Low' ? 'badge-green' : r.risk_level === 'Moderate' ? 'badge-amber' : 'badge-red'}`}>
                                    {r.risk_level}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );
}
