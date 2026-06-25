import { useState, useEffect } from 'react';
import {
    Database,
    Download,
    Upload,
    Trash2,
    RefreshCw,
    Clock,
    HardDrive,
    CheckCircle,
    AlertTriangle
} from 'lucide-react';
import { formatDate, formatBytes } from '../../utils/formatters';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import type { Backup } from '../../types';
import './BackupManagement.css';

export default function BackupManagement() {
    const { user } = useAuth();
    const [backups, setBackups] = useState<Backup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [lastBackup, setLastBackup] = useState<string | null>(null);

    useEffect(() => {
        fetchBackups();
    }, []);

    const fetchBackups = async () => {
        setIsLoading(true);
        try {
            const data = await api.getBackups();
            setBackups(data);
            if (data.length > 0) {
                // Assuming sorted by date descending from API
                setLastBackup(data[0].createdAt);
            }
        } catch (error) {
            console.error('Failed to fetch backups:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateBackup = async () => {
        setIsCreating(true);
        try {
            await api.createBackup();
            await fetchBackups();
        } catch (error: any) {
            console.error('Failed to create backup:', error);
            const message = error.response?.data?.message || error.message || 'Failed to create backup';
            alert(message);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDownload = async (backup: Backup) => {
        try {
            await api.downloadBackup(backup.id, backup.filename);
        } catch (error) {
            console.error('Failed to download backup:', error);
            alert('Failed to download backup');
        }
    };

    const handleDelete = async (id: string | number) => {
        if (!confirm('Are you sure you want to delete this backup?')) return;
        try {
            await api.deleteBackup(id);
            setBackups(prev => prev.filter(b => b.id !== id));
        } catch (error) {
            console.error('Failed to delete backup:', error);
            alert('Failed to delete backup');
        }
    };

    const handleRestore = (backup: Backup) => {
        alert(`Restore functionality requires manual server access for safety. Please contact system administrator to restore from ${backup.filename}.`);
    };

    return (
        <div className="backup-management-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Backup Management</h1>
                    <p className="page-subtitle">Manage database backups and restore points</p>
                </div>
                <button
                    className="btn btn-primary"
                    onClick={handleCreateBackup}
                    disabled={isCreating}
                >
                    {isCreating ? (
                        <>
                            <RefreshCw size={18} className="spin" />
                            Creating...
                        </>
                    ) : (
                        <>
                            <Database size={18} />
                            Create Backup
                        </>
                    )}
                </button>
            </div>

            {/* Status Cards */}
            <div className="status-cards">
                <div className="status-card">
                    <div className="status-icon success">
                        <CheckCircle size={24} />
                    </div>
                    <div className="status-content">
                        <span className="status-label">Last Backup</span>
                        <span className="status-value">
                            {formatDate(lastBackup)}
                        </span>
                    </div>
                </div>
                <div className="status-card">
                    <div className="status-icon info">
                        <HardDrive size={24} />
                    </div>
                    <div className="status-content">
                        <span className="status-label">Total Backups</span>
                        <span className="status-value">{backups.length}</span>
                    </div>
                </div>
                <div className="status-card">
                    <div className="status-icon warning">
                        <Clock size={24} />
                    </div>
                    <div className="status-content">
                        <span className="status-label">Auto-Backup</span>
                        <span className="status-value">Daily @ 19:00</span>
                    </div>
                </div>
            </div>

            {/* Backups List */}
            <div className="backups-container">
                <h2 className="section-title">Available Backups</h2>
                {isLoading ? (
                    <div className="loading-state">
                        <div className="loader"></div>
                    </div>
                ) : backups.length === 0 ? (
                    <div className="empty-state">
                        <Database size={48} />
                        <p>No backups available</p>
                        <button className="btn btn-primary" onClick={handleCreateBackup}>
                            Create your first backup
                        </button>
                    </div>
                ) : (
                    <div className="backups-list">
                        {backups.map((backup) => (
                            <div key={backup.id} className="backup-item">
                                <div className="backup-icon">
                                    <Database size={20} />
                                </div>
                                <div className="backup-info">
                                    <span className="backup-filename">{backup.filename}</span>
                                    <div className="backup-meta">
                                        <span className="badge badge-neutral">{formatBytes(backup.size)}</span>
                                        <span className={`badge ${backup.type === 'automatic' ? 'badge-info' : 'badge-success'}`}>
                                            {backup.type}
                                        </span>
                                        <span className="backup-date">
                                            {formatDate(backup.createdAt)}
                                        </span>
                                    </div>
                                </div>
                                <div className="backup-actions">
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => handleDownload(backup)}
                                    >
                                        <Download size={16} />
                                        Download
                                    </button>
                                    {user?.role === 'SuperAdmin' && (
                                        <>
                                            <button
                                                className="btn btn-warning btn-sm"
                                                onClick={() => handleRestore(backup)}
                                            >
                                                <Upload size={16} />
                                                Restore
                                            </button>
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => handleDelete(backup.id)}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Warning */}
            <div className="backup-warning">
                <AlertTriangle size={20} />
                <div>
                    <strong>Important:</strong> Restoring a backup will replace all current data.
                    Make sure to create a new backup before restoring if you want to preserve current state.
                </div>
            </div>
        </div>
    );
}
