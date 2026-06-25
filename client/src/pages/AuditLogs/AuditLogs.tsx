import { useState, useEffect } from 'react';
import {
    FileText,
    Calendar,
    User,
    ChevronLeft,
    ChevronRight,
    Search,
    Filter
} from 'lucide-react';
import api from '../../services/api';
import type { AuditLog, User as UserType } from '../../types';
import { formatDate } from '../../utils/formatters';
import './AuditLogs.css';

export default function AuditLogs() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [users, setUsers] = useState<UserType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filters, setFilters] = useState({
        page: 1,
        limit: 50,
        username: '',
        startDate: '',
        endDate: ''
    });
    const [totalPages, setTotalPages] = useState(1);
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        api.getUsers().then(setUsers).catch(console.error);
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [filters.page, filters.limit]);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const params: any = { page: filters.page, limit: filters.limit };
            if (filters.username) params.username = filters.username;
            if (filters.startDate) params.startDate = filters.startDate;
            if (filters.endDate) params.endDate = filters.endDate;

            const response = await api.getAuditLogs(params);
            setLogs(response.data);
            setTotalPages(response.pagination.totalPages);
        } catch (error) {
            console.error('Failed to fetch audit logs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleApplyFilters = () => {
        setFilters(prev => ({ ...prev, page: 1 }));
        fetchLogs();
    };

    const handleClearFilters = () => {
        setFilters({
            page: 1,
            limit: 50,
            username: '',
            startDate: '',
            endDate: ''
        });
        setTimeout(fetchLogs, 0);
    };


    const getActionColor = (action: string) => {
        if (action.includes('create') || action.includes('add')) return 'var(--status-success)';
        if (action.includes('delete') || action.includes('remove')) return 'var(--status-danger)';
        if (action.includes('update') || action.includes('edit')) return 'var(--status-warning)';
        if (action.includes('login')) return 'var(--status-info)';
        return 'var(--aptiv-gray-400)';
    };

    const formatActionText = (log: AuditLog) => {
        let action = log.action;
        
        // Handle task updates
        if (action.startsWith('Updated task:')) {
            const taskNameOrId = action.replace('Updated task:', '').trim();
            
            if (log.details?.updated) {
                const updatedKeys = Object.keys(log.details.updated).filter(k => 
                    log.details?.updated[k] !== undefined && k !== 'id' && k !== 'updated_at'
                );
                
                if (updatedKeys.length > 0) {
                    // Specific field formatting
                    if (updatedKeys.includes('status')) {
                        return `Changed status to '${log.details.updated.status}' for task '${taskNameOrId}'`;
                    }
                    if (updatedKeys.includes('description') && updatedKeys.length === 1) {
                        return `Modified description of task '${taskNameOrId}'`;
                    }
                    if (updatedKeys.includes('title') && updatedKeys.length === 1) {
                        return `Modified title of task '${taskNameOrId}'`;
                    }
                    if (updatedKeys.includes('assigned_to') || updatedKeys.includes('team')) {
                        return `Modified team assignments for task '${taskNameOrId}'`;
                    }
                    if (updatedKeys.includes('subtasks')) {
                        return `Modified subtasks for task '${taskNameOrId}'`;
                    }
                    
                    const fieldNames = updatedKeys.map(k => k.replace(/_/g, ' '));
                    return `Modified ${fieldNames.join(', ')} of task '${taskNameOrId}'`;
                }
            }
            
            return `Modified task '${taskNameOrId}'`;
        }
        
        if (action.startsWith('Created task:')) {
            const taskName = action.replace('Created task:', '').trim();
            return `Created new task '${taskName}'`;
        }

        if (action.startsWith('Soft-deleted task:')) {
            const taskName = action.replace('Soft-deleted task:', '').trim();
            return `Deleted task '${taskName}'`;
        }
        
        return action;
    };

    return (
        <div className="audit-logs-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">System Logs</h1>
                    <p className="page-subtitle">Track all system activities and administrative actions</p>
                </div>
                <button
                    className={`btn ${showFilters ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setShowFilters(!showFilters)}
                >
                    <Filter size={18} />
                    Filters
                </button>
            </div>

            {/* Filters Panel */}
            {showFilters && (
                <div className="audit-filters-panel">
                    <div className="audit-filters-grid">
                        <div className="form-group">
                            <label className="input-label">User</label>
                            <select
                                className="input"
                                value={filters.username}
                                onChange={(e) => setFilters(prev => ({ ...prev, username: e.target.value }))}
                            >
                                <option value="">All Users</option>
                                {users.map(user => (
                                    <option key={user.id} value={user.username}>
                                        {user.fullName || user.username}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="input-label">Start Date</label>
                            <input
                                type="date"
                                className="input"
                                value={filters.startDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                            />
                        </div>
                        <div className="form-group">
                            <label className="input-label">End Date</label>
                            <input
                                type="date"
                                className="input"
                                value={filters.endDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="audit-filters-actions">
                        <button className="btn btn-secondary" onClick={handleClearFilters}>
                            Clear Filters
                        </button>
                        <button className="btn btn-primary" onClick={handleApplyFilters}>
                            <Search size={16} />
                            Apply Filters
                        </button>
                    </div>
                </div>
            )}

            {/* Logs Table */}
            <div className="logs-container">
                {isLoading ? (
                    <div className="loading-state">
                        <div className="loader"></div>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="empty-state">
                        <FileText size={48} />
                        <p>No system logs found</p>
                    </div>
                ) : (
                    <div className="logs-list">
                        {logs.map((log) => (
                            <div key={log.id} className="log-entry">
                                <div
                                    className="log-indicator"
                                    style={{ background: getActionColor(log.action) }}
                                ></div>
                                <div className="log-content">
                                    <div className="log-action">
                                        <span className="action-text">{formatActionText(log)}</span>
                                        {log.resource && (
                                            <span className="resource-text">on {log.resource}</span>
                                        )}
                                    </div>
                                </div>
                                <div className="log-meta">
                                    <div className="meta-item">
                                        <User size={14} />
                                        {log.username || 'System'}
                                    </div>
                                    <div className="meta-item">
                                        <Calendar size={14} />
                                        {formatDate(log.createdAt)}
                                    </div>
                                    {log.ipAddress && (
                                        <div className="meta-item font-mono">
                                            {log.ipAddress}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="pagination">
                    <button
                        className="btn btn-ghost btn-sm"
                        disabled={filters.page === 1}
                        onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                    >
                        <ChevronLeft size={18} /> Previous
                    </button>
                    <span className="pagination-info">Page {filters.page} of {totalPages}</span>
                    <button
                        className="btn btn-ghost btn-sm"
                        disabled={filters.page === totalPages}
                        onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                    >
                        Next <ChevronRight size={18} />
                    </button>
                </div>
            )}
        </div>
    );
}
