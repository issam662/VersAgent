import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Wifi, User, LogOut, Moon, Sun, Car, HardDrive } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { NewsCarousel } from '../../components/NewsCarousel';
import type { PublicStats, NewsItem, ShareUsage } from '../../types';
import './PublicDashboard.css';

type ChartPoint = { label: string; count: number };

/* ── Donut Chart (SVG) ── */
function DonutChart({ percent, size = 70, strokeWidth = 7 }: {
    percent: number; size?: number; strokeWidth?: number;
}) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;
    // 3-tier color: green < 80%, yellow 80-89%, red >= 90%
    const color = percent >= 90 ? 'var(--status-danger)' : percent >= 80 ? '#f9a825' : '#4caf50';

    return (
        <div className="donut-chart" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <defs>
                    <filter id="donut-glow">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>
                {/* Background ring */}
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none"
                    stroke="var(--aptiv-gray-800)"
                    strokeWidth={strokeWidth}
                />
                {/* Progress ring */}
                <circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    filter="url(#donut-glow)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
                />
            </svg>
            <div className="donut-center">
                <span className="donut-percent" style={{ color }}>{percent}%</span>
            </div>
        </div>
    );
}

/* ── Status Distribution Bar ── */
function StatusBar({ online, offline, intervention, temporary }: { online: number; offline: number; intervention: number; temporary: number }) {
    const total = online + offline + intervention + temporary;
    if (total === 0) return null;
    const onlinePct   = (online / total) * 100;
    const offlinePct  = (offline / total) * 100;
    const interPct    = (intervention / total) * 100;
    const tempPct     = (temporary / total) * 100;

    return (
        <div className="category-bar-wrapper">
            <div className="category-bar-header">
                <span className="category-bar-title">DEVICE STATUS</span>
            </div>
            <div className="category-bar">
                {online > 0 && (
                    <div className="category-segment cat-shopfloor" style={{ width: `${onlinePct}%` }} title={`Online: ${online}`} />
                )}
                {offline > 0 && (
                    <div className="category-segment cat-offline" style={{ width: `${offlinePct}%` }} title={`Offline: ${offline}`} />
                )}
                {intervention > 0 && (
                    <div className="category-segment" style={{ width: `${interPct}%`, background: '#f97316' }} title={`Intervention: ${intervention}`} />
                )}
                {temporary > 0 && (
                    <div className="category-segment" style={{ width: `${tempPct}%`, background: '#6b7280' }} title={`Temporary Offline: ${temporary}`} />
                )}
            </div>
            <div className="category-legend">
                <span className="legend-item"><span className="legend-dot cat-shopfloor-dot" />On {Math.round(onlinePct)}%</span>
                <span className="legend-item"><span className="legend-dot cat-offline-dot" />Off {Math.round(offlinePct)}%</span>
                {intervention > 0 && <span className="legend-item"><span className="legend-dot" style={{ background: '#f97316' }} />Int {Math.round(interPct)}%</span>}
                {temporary > 0 && <span className="legend-item"><span className="legend-dot" style={{ background: '#6b7280' }} />Tmp {Math.round(tempPct)}%</span>}
            </div>
        </div>
    );
}

/* ── Mini Bar Chart (SVG) — Incidents by Month ── */
function MiniBarChart({ data, color, accentColor }: { data: ChartPoint[]; color: string; accentColor: string }) {
    if (!data.length) return null;
    const max = Math.max(...data.map(d => d.count), 1);
    const barW = 100 / data.length;
    const gap = barW * 0.25;

    return (
        <div className="mini-bar-chart-wrapper">
            <div className="mini-bar-chart-header">
                <span className="mini-bar-chart-title">INCIDENTS BY MONTH</span>
                <span className="mini-bar-chart-subtitle">Last 12 months</span>
            </div>
            <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mini-bar-svg">
                {data.map((d, i) => {
                    const barHeight = d.count > 0 ? Math.max((d.count / max) * 26, 2) : 1.5;
                    const x = i * barW + gap / 2;
                    const y = 32 - barHeight;
                    const isActive = d.count > 0;
                    return (
                        <rect
                            key={i}
                            x={x}
                            y={y}
                            width={barW - gap}
                            height={barHeight}
                            rx="1"
                            fill={isActive ? color : accentColor}
                            opacity={isActive ? 1 : 0.25}
                        />
                    );
                })}
            </svg>
            <div className="mini-bar-labels">
                {data.map((d, i) => (
                    <span key={i} className="mini-bar-label">{d.label}</span>
                ))}
            </div>
        </div>
    );
}

/* ── Format bytes helper ── */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function PublicDashboard() {
    const [stats, setStats] = useState<PublicStats>({
        totalOnline: 0,
        shopfloorOnline: 0,
        userOnline: 0,
        othersOnline: 0,
        offlineCount: 0,
        interventionCount: 0,
        temporaryCount: 0,
        openIncidents: 0,
        inProgressIncidents: 0,
        closedIncidents: 0
    });
    const [news, setNews] = useState<NewsItem[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState(false);
    const { user, isAuthenticated } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [autoscrollInterval, setAutoscrollInterval] = useState(5000);
    const [urgentTicker, setUrgentTicker] = useState<string>('');
    const [tickerSpeedMultiplier, setTickerSpeedMultiplier] = useState(0.08);
    const [incidentsByMonth, setIncidentsByMonth] = useState<ChartPoint[]>([]);
    const [shareUsage, setShareUsage] = useState<ShareUsage[] | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [statsData, newsData, settingsData, tickerData, speedData, chartsData, shareData] = await Promise.all([
                    api.getPublicStats(),
                    api.getPublicNews(),
                    api.getPublicSetting('news_autoscroll_interval'),
                    api.getPublicSetting('urgent_news_ticker'),
                    api.getPublicSetting('urgent_ticker_speed'),
                    api.getPublicCharts().catch(() => ({ incidentsByMonth: [], totalMachines: 0 })),
                    api.getPublicShareUsage().catch(() => null)
                ]);
                setStats(statsData);
                setNews(newsData);
                if (settingsData.setting?.value) {
                    setAutoscrollInterval(parseInt(settingsData.setting.value));
                }
                if (tickerData.setting?.value) {
                    setUrgentTicker(tickerData.setting.value);
                } else {
                    setUrgentTicker('');
                }
                if (speedData.setting?.value) {
                    setTickerSpeedMultiplier(parseFloat(speedData.setting.value));
                }
                setIncidentsByMonth(chartsData.incidentsByMonth || []);
                setShareUsage(shareData);
                setApiError(false);
            } catch (err) {
                console.error('Failed to fetch public data:', err);
                setApiError(true);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
        const dataInterval = setInterval(fetchData, 30000);
        const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => { clearInterval(dataInterval); clearInterval(clockInterval); };
    }, []);

    const parsedTickerText = urgentTicker
        .split('\n')
        .map(t => t.trim())
        .filter(t => t.length > 0)
        .join('  •  ');

    return (
        <div className="public-dashboard">
            {/* Header */}
            <header className="public-header">
                <div className="public-logo">
                    <div className="logo-container">
                        <img src="/versigent-shield.png" alt="VersAgent" className="logo-image" />
                        <span className="header-logo-text">ersAgent</span>
                    </div>
                    <div className="site-name">Dashboard</div>
                    {isLoading ? (
                        <span className="logo-badge" style={{ background: '#666' }}>LOADING</span>
                    ) : apiError ? (
                        <span className="logo-badge" style={{ background: '#ff3d00' }}>OFFLINE</span>
                    ) : (
                        <span className="logo-badge">LIVE</span>
                    )}
                </div>
                <div className="public-time">
                    <div className="time-value">
                        {currentTime.toLocaleTimeString('en-US', {
                            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
                        })}
                    </div>
                    <div className="time-date">
                        {currentTime.toLocaleDateString('en-US', {
                            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                        })}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                        onClick={toggleTheme}
                        className="btn btn-ghost"
                        style={{ padding: '0.5rem', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                    >
                        {theme === 'dark' ? <Sun size={20} className="text-primary" /> : <Moon size={20} className="text-primary" />}
                    </button>

                    {isAuthenticated ? (
                        <div className="header-user-section">
                            <Link to="/admin" className="header-user-info">
                                <User size={18} />
                                <span>{user?.fullName || user?.full_name || user?.username}</span>
                            </Link>
                            <button
                                className="header-logout-btn"
                                onClick={() => { localStorage.removeItem('token'); window.location.href = '/'; }}
                                title="Logout"
                            >
                                <LogOut size={18} />
                            </button>
                        </div>
                    ) : (
                        <Link to="/login" className="header-login-link">
                            <User size={18} />
                            <span>Admin Access</span>
                        </Link>
                    )}
                </div>
            </header>

            {/* Stats Grid — 3 columns */}
            {/* Main Layout: Left Content (Stats + News) | Right Sidebar (Shares) */}
            <main className="public-main-layout">
                <div className="main-content-left">
                    <div className="stats-grid-dual">
                        {/* Online PCs */}
                        <div className="stat-widget stat-online">
                            <div className="stat-icon">
                                <Wifi size={36} />
                            </div>
                            <div className="stat-content">
                                <div className="stat-value stat-value-green">{stats?.totalOnline || 0}</div>
                                <div className="stat-label">Devices Online</div>
                            </div>
                            <div className="stat-breakdown-col">
                                <div className="stat-breakdown stat-breakdown-no-border">
                                    <div className="breakdown-item">
                                        <span className="breakdown-value">{stats?.shopfloorOnline || 0}</span>
                                        <span className="breakdown-label">Shopfloor</span>
                                    </div>
                                    <div className="breakdown-divider"></div>
                                    <div className="breakdown-item">
                                        <span className="breakdown-value">{stats?.userOnline || 0}</span>
                                        <span className="breakdown-label">User</span>
                                    </div>
                                    <div className="breakdown-divider"></div>
                                    <div className="breakdown-item">
                                        <span className="breakdown-value">{stats?.othersOnline || 0}</span>
                                        <span className="breakdown-label">Others</span>
                                    </div>
                                </div>
                                <div className="stat-breakdown stat-breakdown-no-border stat-breakdown-offline-row">
                                    <div className="breakdown-item">
                                        <span className="breakdown-value" style={{ color: '#ef4444' }}>{stats?.offlineCount || 0}</span>
                                        <span className="breakdown-label">Offline</span>
                                    </div>
                                    <div className="breakdown-divider"></div>
                                    <div className="breakdown-item">
                                        <span className="breakdown-value" style={{ color: '#f97316' }}>{stats?.interventionCount || 0}</span>
                                        <span className="breakdown-label">Intervention</span>
                                    </div>
                                    <div className="breakdown-divider"></div>
                                    <div className="breakdown-item">
                                        <span className="breakdown-value" style={{ color: '#9ca3af' }}>{stats?.temporaryCount || 0}</span>
                                        <span className="breakdown-label">Temp. Off</span>
                                    </div>
                                </div>
                            </div>
                            <div className="stat-chart-inline">
                                <StatusBar
                                    online={stats?.totalOnline || 0}
                                    offline={stats?.offlineCount || 0}
                                    intervention={stats?.interventionCount || 0}
                                    temporary={stats?.temporaryCount || 0}
                                />
                            </div>
                        </div>

                        {/* Incidents */}
                        <div className="stat-widget stat-incidents">
                            <div className="stat-icon">
                                <AlertTriangle size={36} />
                            </div>
                            <div className="stat-content stat-content-tight">
                                <div className="stat-value">{(stats?.openIncidents || 0) + (stats?.inProgressIncidents || 0)}</div>
                                <div className="stat-label">Active Incidents</div>
                            </div>
                            <div className="stat-chart-inline stat-chart-grow">
                                <MiniBarChart
                                    data={incidentsByMonth}
                                    color="var(--aptiv-primary)"
                                    accentColor="var(--aptiv-primary-dark)"
                                />
                            </div>
                            <div className="stat-breakdown stat-breakdown-compact">
                                <div className="breakdown-item">
                                    <span className="breakdown-value breakdown-danger">{stats?.openIncidents || 0}</span>
                                    <span className="breakdown-label">Open</span>
                                </div>
                                <div className="breakdown-divider"></div>
                                <div className="breakdown-item">
                                    <span className="breakdown-value breakdown-warning">{stats?.inProgressIncidents || 0}</span>
                                    <span className="breakdown-label">On Hold</span>
                                </div>
                                <div className="breakdown-divider"></div>
                                <div className="breakdown-item">
                                    <span className="breakdown-value breakdown-success">{stats?.closedIncidents || 0}</span>
                                    <span className="breakdown-label">Closed</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* News Section */}
                    <div className="news-section">
                        <div className="news-header">
                            <h2>📰 Latest News & Announcements</h2>
                        </div>
                        <div className="news-carousel-container">
                            <NewsCarousel
                                news={news}
                                visibleCount={2}
                                autoScrollInterval={autoscrollInterval}
                            />
                        </div>
                        {parsedTickerText && (() => {
                            const tickerContent = Array(10).fill(parsedTickerText).join('  •  ');
                            // Calculate duration: default ~0.08 seconds per character, adjustable via settings
                            const durationSeconds = Math.max(15, tickerContent.length * tickerSpeedMultiplier);
                            
                            return (
                                <div className="urgent-ticker-container">
                                    <div className="urgent-ticker-label">BREAKING NEWS</div>
                                    <div className="urgent-ticker-scroll">
                                        <div 
                                            className="urgent-ticker-content"
                                            style={{ animationDuration: `${durationSeconds}s` }}
                                        >
                                            {tickerContent}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Right Sidebar: Storage Shares */}
                <aside className="shares-sidebar">
                    {shareUsage && Array.isArray(shareUsage) ? (
                        shareUsage.map((share, idx) => (
                            <div key={idx} className={`stat-widget stat-storage ${!share.ok ? 'storage-error' : ''}`}>
                                <div className="stat-storage-inner">
                                    {share.ok ? (
                                        <>
                                            <DonutChart
                                                percent={share.usedPercent || 0}
                                                size={54}
                                                strokeWidth={5}
                                            />
                                            <div className="storage-details">
                                                <div className="storage-title">
                                                    <HardDrive size={12} />
                                                    <span>{share.name}</span>
                                                </div>
                                                <div className="storage-info">
                                                    <span className="storage-used">{formatBytes(share.usedBytes || 0)}</span>
                                                    <span className="storage-total">/ {formatBytes(share.totalBytes || 0)}</span>
                                                </div>
                                                <div className="storage-free">{formatBytes(share.freeBytes || 0)} free</div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="storage-offline">
                                            <div className="storage-title">
                                                <HardDrive size={12} />
                                                <span>{share.name}</span>
                                            </div>
                                            <span className="error-text">Inaccessible</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="shares-loading">
                            <span>Checking Shares...</span>
                        </div>
                    )}
                </aside>
            </main>

            {/* Footer */}
            <footer className="public-footer">
                <span className="footer-text">VersAgent PC Inventory & Compliance Dashboard</span>
                <div className="footer-car-track">
                    <div className="premium-car-wrapper">
                        <Car className="footer-car" size={18} />
                    </div>
                </div>
                <div className="footer-credit">
                    Developed by <a href="https://www.linkedin.com/in/issamhamzaoui/" target="_blank" rel="noopener noreferrer">Issam Hamzaoui</a>
                </div>
            </footer>
        </div>
    );
}
