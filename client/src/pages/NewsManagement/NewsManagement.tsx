import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
    Newspaper,
    Plus,
    Edit2,
    Trash2,
    Eye,
    EyeOff,
    X,
    GripVertical,
    Settings,
    Zap,
    Clock
} from 'lucide-react';
import api from '../../services/api';
import type { NewsItem } from '../../types';
import './NewsManagement.css';

export default function NewsManagement() {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
    const [imageMode, setImageMode] = useState<'url' | 'file'>('url');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [autoscrollInterval, setAutoscrollInterval] = useState(5000);

    const [tickerLines, setTickerLines] = useState<string[]>(['']);
    const [tickerSpeedMultiplier, setTickerSpeedMultiplier] = useState(0.08);
    const [isSavingTicker, setIsSavingTicker] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        imageUrl: '',
        link: '',
        priority: 1,
        isActive: true,
        expiresAt: ''
    });

    useEffect(() => {
        if (!settingsLoaded) return;
        const saveTimer = setTimeout(async () => {
            try {
                await api.updateSetting('news_autoscroll_interval', autoscrollInterval);
                await api.updateSetting('urgent_ticker_speed', tickerSpeedMultiplier.toString());
            } catch (error) {
                console.error('Failed to auto-save settings:', error);
            }
        }, 500);
        return () => clearTimeout(saveTimer);
    }, [autoscrollInterval, tickerSpeedMultiplier, settingsLoaded]);

    const handleSaveTickerSettings = async () => {
        setIsSavingTicker(true);
        try {
            const joinedTicker = tickerLines.join('\n');
            await api.updateSetting('urgent_news_ticker', joinedTicker);
            await api.updateSetting('urgent_ticker_speed', tickerSpeedMultiplier.toString());
            alert('Urgent ticker saved successfully!');
        } catch (error) {
            console.error('Failed to save urgent ticker:', error);
            alert('Failed to save urgent ticker');
        } finally {
            setIsSavingTicker(false);
        }
    };

    useEffect(() => {
        fetchNews();
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const data = await api.getSettings('news_autoscroll_interval');
            if (data.setting?.value) setAutoscrollInterval(parseInt(data.setting.value));
            const tickerData = await api.getSettings('urgent_news_ticker');
            if (tickerData.setting?.value) {
                const lines = tickerData.setting.value.split('\n');
                setTickerLines(lines.length > 0 ? lines : ['']);
            }
            const speedData = await api.getSettings('urgent_ticker_speed');
            if (speedData.setting?.value) {
                setTickerSpeedMultiplier(parseFloat(speedData.setting.value));
            }
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        } finally {
            setSettingsLoaded(true);
        }
    };

    const fetchNews = async () => {
        setIsLoading(true);
        try {
            const data = await api.getNews();
            setNews(data);
        } catch (error) {
            console.error('Failed to fetch news:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = () => {
        setSelectedNews(null);
        setFormData({ title: '', content: '', imageUrl: '', link: '', priority: 1, isActive: true, expiresAt: '' });
        setImageMode('url');
        setImageFile(null);
        setShowModal(true);
    };

    const handleEdit = (item: NewsItem) => {
        setSelectedNews(item);
        setFormData({
            title: item.title,
            content: item.content || '',
            imageUrl: (item as any).imageUrl || (item as any).image_url || (item as any).image_path || '',
            link: item.link || '',
            priority: item.priority,
            isActive: item.isActive,
            expiresAt: item.expiresAt ? new Date(item.expiresAt).toISOString().split('T')[0] : ''
        });
        setImageMode('url');
        setImageFile(null);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (imageMode === 'file' && imageFile) {
                const fd = new FormData();
                fd.append('title', formData.title);
                fd.append('content', formData.content || '');
                fd.append('priority', formData.priority.toString());
                fd.append('isActive', formData.isActive.toString());
                fd.append('sortOrder', formData.priority.toString());
                fd.append('link', formData.link || '');
                if (formData.expiresAt) fd.append('expiresAt', formData.expiresAt);
                fd.append('image', imageFile);
                if (selectedNews) {
                    await api.updateNewsWithFile(selectedNews.id, fd);
                } else {
                    await api.createNewsWithFile(fd);
                }
            } else {
                const data = { ...formData, expiresAt: formData.expiresAt || null };
                if (selectedNews) {
                    await api.updateNews(selectedNews.id, data);
                } else {
                    await api.createNews(data);
                }
            }
            setShowModal(false);
            fetchNews();
        } catch (error) {
            console.error('Failed to save news:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this news item?')) return;
        try {
            await api.deleteNews(id);
            fetchNews();
        } catch (error) {
            console.error('Failed to delete news:', error);
        }
    };

    const toggleActive = async (item: NewsItem) => {
        try {
            await api.updateNews(item.id, { isActive: !item.isActive });
            fetchNews();
        } catch (error) {
            console.error('Failed to toggle news:', error);
        }
    };

    const [draggedItem, setDraggedItem] = useState<NewsItem | null>(null);

    const handleDragStart = (e: React.DragEvent, item: NewsItem) => {
        setDraggedItem(item);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetItem: NewsItem) => {
        e.preventDefault();
        if (!draggedItem || draggedItem.id === targetItem.id) return;
        const newNews = [...news];
        const draggedIndex = newNews.findIndex(n => n.id === draggedItem.id);
        const targetIndex = newNews.findIndex(n => n.id === targetItem.id);
        const [removed] = newNews.splice(draggedIndex, 1);
        newNews.splice(targetIndex, 0, removed);
        setNews(newNews);
        try {
            await api.updateNews(draggedItem.id, { priority: targetIndex });
            await api.updateNews(targetItem.id, { priority: draggedIndex });
        } catch (error) {
            console.error('Failed to reorder:', error);
            fetchNews();
        }
        setDraggedItem(null);
    };

    const handleDragEnd = () => setDraggedItem(null);

    const activeCount   = news.filter(n => n.isActive).length;
    const inactiveCount = news.filter(n => !n.isActive).length;

    // Active items first, hidden items sink to the bottom
    const sortedNews = [...news].sort((a, b) => {
        if (a.isActive === b.isActive) return 0;
        return a.isActive ? -1 : 1;
    });


    return (
        <div className="news-page">
            {/* ── Page Header ─────────────────────────────────── */}
            <div className="page-header">
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Newspaper size={22} style={{ color: 'var(--aptiv-primary)' }} />
                        News Ticker
                    </h1>
                    <p className="page-subtitle">Manage announcements shown on the public dashboard</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreate}>
                    <Plus size={16} />
                    Add News
                </button>
            </div>

            {/* ── Stats Row ────────────────────────────────────── */}
            {!isLoading && (
                <div className="news-stats-row">
                    <div className="news-stat-card">
                        <div className="news-stat-icon total"><Newspaper size={18} /></div>
                        <div className="news-stat-info">
                            <div className="news-stat-value">{news.length}</div>
                            <div className="news-stat-label">Total Items</div>
                        </div>
                    </div>
                    <div className="news-stat-card">
                        <div className="news-stat-icon active"><Eye size={18} /></div>
                        <div className="news-stat-info">
                            <div className="news-stat-value">{activeCount}</div>
                            <div className="news-stat-label">Visible on Dashboard</div>
                        </div>
                    </div>
                    <div className="news-stat-card">
                        <div className="news-stat-icon inactive"><EyeOff size={18} /></div>
                        <div className="news-stat-info">
                            <div className="news-stat-value">{inactiveCount}</div>
                            <div className="news-stat-label">Hidden</div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Settings & Preview Card ───────────────────────── */}
            <div className="ticker-settings-card">
                <div className="ticker-settings-header">
                    <div className="ticker-settings-header-icon"><Settings size={16} /></div>
                    <h2>Configuration</h2>
                </div>

                <div className="ticker-settings-body">
                    <div className="ticker-settings-grid">
                        {/* Urgent Ticker Lines */}
                        <div className="settings-panel">
                            <div className="panel-label-row">
                                <Zap size={13} style={{ color: 'var(--aptiv-primary)', flexShrink: 0 }} />
                                <label className="input-label">Urgent Ticker Lines</label>
                            </div>
                            <p className="panel-hint">These scroll across the bottom of the public dashboard. Press Enter to add a line, Backspace to remove an empty one.</p>

                            {tickerLines.map((line, index) => (
                                <div key={index} className="ticker-line-row">
                                    <input
                                        type="text"
                                        className="input"
                                        value={line}
                                        onChange={(e) => {
                                            const nl = [...tickerLines];
                                            nl[index] = e.target.value;
                                            setTickerLines(nl);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const nl = [...tickerLines];
                                                nl.splice(index + 1, 0, '');
                                                setTickerLines(nl);
                                            } else if (e.key === 'Backspace' && line === '' && tickerLines.length > 1) {
                                                e.preventDefault();
                                                const nl = [...tickerLines];
                                                nl.splice(index, 1);
                                                setTickerLines(nl);
                                            }
                                        }}
                                        placeholder={index === 0 ? 'e.g. Network maintenance at 5 PM — plan accordingly' : 'Next ticker line…'}
                                        autoFocus={index === tickerLines.length - 1 && tickerLines.length > 1}
                                    />
                                    {tickerLines.length > 1 && (
                                        <button
                                            type="button"
                                            className="btn-remove-line"
                                            onClick={() => {
                                                const nl = [...tickerLines];
                                                nl.splice(index, 1);
                                                setTickerLines(nl);
                                            }}
                                            title="Remove line"
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}

                            <div className="ticker-lines-footer">
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={handleSaveTickerSettings}
                                    disabled={isSavingTicker}
                                >
                                    {isSavingTicker ? 'Saving…' : 'Save Ticker'}
                                </button>
                            </div>
                        </div>

                        {/* Scroll Speed */}
                        <div className="settings-panel">
                            <div className="panel-label-row">
                                <Clock size={13} style={{ color: 'var(--aptiv-primary)', flexShrink: 0 }} />
                                <label className="input-label">Slide Speed</label>
                            </div>

                            {/* Big seconds display */}
                            <div className="speed-display-block">
                                <span className="speed-seconds">{(autoscrollInterval / 1000).toFixed(0)}</span>
                                <span className="speed-unit">sec / slide</span>
                            </div>

                            {/* Stepper buttons */}
                            <div className="speed-stepper">
                                <button
                                    type="button"
                                    className="speed-adjust-btn"
                                    onClick={() => setAutoscrollInterval(v => Math.max(1000, v - 1000))}
                                    title="Decrease by 1s"
                                >−</button>
                                <div className="speed-stepper-track">
                                    <div
                                        className="speed-stepper-fill"
                                        style={{ width: `${Math.min(100, ((autoscrollInterval - 1000) / 59000) * 100)}%` }}
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="speed-adjust-btn"
                                    onClick={() => setAutoscrollInterval(v => Math.min(60000, v + 1000))}
                                    title="Increase by 1s"
                                >+</button>
                            </div>

                            {/* Preset chips */}
                            <div className="speed-presets">
                                {[5000, 15000, 30000, 60000].map(ms => (
                                    <button
                                        key={ms}
                                        type="button"
                                        className={`speed-preset-chip ${autoscrollInterval === ms ? 'active' : ''}`}
                                        onClick={() => setAutoscrollInterval(ms)}
                                    >{ms / 1000}s</button>
                                ))}
                            </div>

                        </div>
                    </div>

                    {/* Live Preview Strip */}
                    <div className="ticker-preview-strip">
                        <div className="ticker-preview-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem' }}>
                            <div className="ticker-preview-label" style={{ padding: 0 }}>
                                <div className="ticker-live-dot" />
                                Live Preview — Urgent Ticker
                            </div>
                            <div className="ticker-speed-controls" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTickerSpeedMultiplier(m => Math.min(0.2, m + 0.01))} title="Slow down">-</button>
                                <span style={{ fontSize: '0.8rem', color: 'var(--aptiv-gray-400)', minWidth: '40px', textAlign: 'center' }}>Speed</span>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTickerSpeedMultiplier(m => Math.max(0.01, m - 0.01))} title="Speed up">+</button>
                            </div>
                        </div>
                        <div className="preview-ticker" style={{ overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                            <div className="preview-track" style={{ 
                                animation: `tickerScroll ${Math.max(15, Array(10).fill(tickerLines.filter(l => l.trim()).join('  •  ')).join('  •  ').length * tickerSpeedMultiplier)}s linear infinite`,
                                display: 'inline-block',
                                paddingLeft: '100%',
                                fontWeight: 600
                            }}>
                                {tickerLines.filter(l => l.trim()).length === 0 ? (
                                    <span className="preview-empty">No urgent lines added</span>
                                ) : (
                                    Array(10).fill(tickerLines.filter(l => l.trim()).join('  •  ')).join('  •  ')
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── News Items List ──────────────────────────────── */}
            <div className="news-list-section">
                <div className="news-list-header">
                    <span className="news-list-title">
                        News Items
                        <span className="count-badge">{news.length}</span>
                    </span>
                    {activeCount > 0 && (
                        <span className="news-list-active-label">
                            <span className="news-list-active-dot" />
                            {activeCount} live on dashboard
                        </span>
                    )}
                </div>

                {isLoading ? (
                    <div className="loading-state">
                        <div className="loader" />
                    </div>
                ) : news.length === 0 ? (
                    <div className="news-empty-state">
                        <Newspaper size={44} style={{ opacity: 0.25 }} />
                        <p>No news items yet</p>
                        <button className="btn btn-primary btn-sm" onClick={handleCreate}>
                            <Plus size={15} /> Create first announcement
                        </button>
                    </div>
                ) : (
                    <div className="news-list">
                        {sortedNews.map((item) => (
                            <div
                                key={item.id}
                                className={`admin-news-card${!item.isActive ? ' inactive' : ''}${draggedItem?.id === item.id ? ' dragging' : ''}`}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item)}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, item)}
                                onDragEnd={handleDragEnd}
                            >
                                {/* Active indicator strip */}
                                {item.isActive && <div className="news-active-strip" />}

                                {/* Drag handle */}
                                <div className="news-drag" title="Drag to reorder">
                                    <GripVertical size={15} />
                                </div>

                                {/* Main content */}
                                <div className="news-content">
                                    <div className="news-meta-row">
                                        <h3 className="news-title">{item.title}</h3>
                                        <div className="news-badges">
                                            <span className="badge badge-neutral" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                                                #{item.priority}
                                            </span>
                                            {item.expiresAt && (
                                                <span className="badge badge-warning">
                                                    Expires {new Date(item.expiresAt).toLocaleDateString()}
                                                </span>
                                            )}
                                            {!item.isActive && (
                                                <span className="badge badge-neutral" style={{ opacity: 0.6 }}>Hidden</span>
                                            )}
                                        </div>
                                    </div>
                                    {item.content && (
                                        <p className="news-body">{item.content}</p>
                                    )}
                                </div>

                                {/* Thumbnail */}
                                {((item as any).imageUrl || (item as any).image_path) && (
                                    <div className="news-image-thumb">
                                        <img
                                            src={(item as any).imageUrl || (item as any).image_path}
                                            alt={item.title}
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                                e.currentTarget.parentElement!.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="news-actions">
                                    <button
                                        className={`news-action-btn ${item.isActive ? 'active-btn' : ''}`}
                                        onClick={() => toggleActive(item)}
                                        title={item.isActive ? 'Hide from dashboard' : 'Show on dashboard'}
                                    >
                                        {item.isActive ? <Eye size={15} /> : <EyeOff size={15} />}
                                    </button>
                                    <button
                                        className="news-action-btn"
                                        onClick={() => handleEdit(item)}
                                        title="Edit"
                                    >
                                        <Edit2 size={15} />
                                    </button>
                                    <button
                                        className="news-action-btn delete-btn"
                                        onClick={() => handleDelete(item.id)}
                                        title="Delete"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Modal ───────────────────────────────────────── */}
            {showModal && ReactDOM.createPortal(
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(212,122,38,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Newspaper size={18} style={{ color: 'var(--aptiv-primary)' }} />
                                </div>
                                <h2>{selectedNews ? 'Edit News Item' : 'Add News Item'}</h2>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="input-label">Title *</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.title}
                                        onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
                                        required
                                        placeholder="Announcement headline"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="input-label">
                                        Content <span style={{ color: 'var(--aptiv-gray-600)', fontWeight: 400 }}>(optional)</span>
                                    </label>
                                    <textarea
                                        className="input textarea"
                                        rows={3}
                                        value={formData.content}
                                        onChange={(e) => setFormData(p => ({ ...p, content: e.target.value }))}
                                        placeholder="Additional details shown below the headline…"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="input-label">
                                        Link URL <span style={{ color: 'var(--aptiv-gray-600)', fontWeight: 400 }}>(optional)</span>
                                    </label>
                                    <input
                                        type="url"
                                        className="input"
                                        value={formData.link}
                                        onChange={(e) => setFormData(p => ({ ...p, link: e.target.value }))}
                                        placeholder="https://example.com"
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="input-label">
                                        Image <span style={{ color: 'var(--aptiv-gray-600)', fontWeight: 400 }}>(optional)</span>
                                    </label>
                                    <div className="image-mode-toggle">
                                        <button
                                            type="button"
                                            className={`img-toggle-btn ${imageMode === 'url' ? 'active' : ''}`}
                                            onClick={() => { setImageMode('url'); setImageFile(null); }}
                                        >
                                            URL Link
                                        </button>
                                        <button
                                            type="button"
                                            className={`img-toggle-btn ${imageMode === 'file' ? 'active' : ''}`}
                                            onClick={() => { setImageMode('file'); setFormData(p => ({ ...p, imageUrl: '' })); }}
                                        >
                                            Upload File
                                        </button>
                                    </div>

                                    {imageMode === 'url' ? (
                                        <>
                                            <input
                                                type="text"
                                                className="input"
                                                value={formData.imageUrl}
                                                onChange={(e) => setFormData(p => ({ ...p, imageUrl: e.target.value }))}
                                                placeholder="https://example.com/image.jpg"
                                            />
                                            {formData.imageUrl && (
                                                <div className="image-preview-box">
                                                    <img src={formData.imageUrl} alt="Preview" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <input
                                                type="file"
                                                className="input"
                                                accept="image/*"
                                                onChange={(e) => { const f = e.target.files?.[0]; if (f) setImageFile(f); }}
                                            />
                                            {imageFile && (
                                                <div className="image-preview-box">
                                                    <img src={URL.createObjectURL(imageFile)} alt="Preview" />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="input-label">Priority</label>
                                        <input
                                            type="number"
                                            className="input"
                                            min="1"
                                            max="100"
                                            value={formData.priority}
                                            onChange={(e) => setFormData(p => ({ ...p, priority: parseInt(e.target.value) || 1 }))}
                                        />
                                        <small className="form-hint">Higher number = shown first</small>
                                    </div>
                                    <div className="form-group">
                                        <label className="input-label">Expires On</label>
                                        <input
                                            type="date"
                                            className="input"
                                            value={formData.expiresAt}
                                            onChange={(e) => setFormData(p => ({ ...p, expiresAt: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <div className="form-group" style={{ borderTop: '1px solid var(--aptiv-gray-800)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.isActive}
                                            onChange={(e) => setFormData(p => ({ ...p, isActive: e.target.checked }))}
                                            style={{ width: '16px', height: '16px', accentColor: 'var(--aptiv-primary)', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontSize: '0.875rem', color: 'var(--aptiv-gray-300)' }}>
                                            Show on public dashboard
                                        </span>
                                    </label>
                                </div>
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {selectedNews ? 'Save Changes' : 'Publish News'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
