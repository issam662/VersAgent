import { useState, useEffect } from 'react';
import {
    AlertTriangle,
    Plus,
    Filter,
    Search,
    Clock,
    ChevronLeft,
    ChevronRight,
    Edit,
    Trash2,
    X,
    Hash,
    User as UserIcon
} from 'lucide-react';
import api from '../../services/api';
import type { Incident, User } from '../../types';
import './Incidents.css';

type SeverityType = 'P1' | 'P2' | 'P3' | 'P4';
type StatusType = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export default function Incidents() {
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: '',
        severity: '',
        assignedTo: '',
        page: 1,
        limit: 20
    });
    const [totalPages, setTotalPages] = useState(1);
    const [showFilters, setShowFilters] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        priority: 'P3' as SeverityType,
        status: 'Open' as StatusType,
        incidentDate: '',
        assignedTo: ''
    });

    useEffect(() => {
        fetchIncidents();
    }, [filters]);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const data = await api.getUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        }
    };

    const fetchIncidents = async () => {
        setIsLoading(true);
        try {
            const response = await api.getIncidents(filters);
            setIncidents(response.data);
            setTotalPages(response.pagination.totalPages);
        } catch (error) {
            console.error('Failed to fetch incidents:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = () => {
        setSelectedIncident(null);
        setFormData({
            title: '',
            description: '',
            priority: 'P3',
            status: 'Open',
            incidentDate: '',
            assignedTo: ''
        });
        setShowModal(true);
    };

    const handleEdit = (incident: Incident) => {
        setSelectedIncident(incident);
        setFormData({
            title: incident.title,
            description: incident.description || '',
            priority: (incident.priority || 'P3') as SeverityType,
            status: (incident.status || 'Open') as StatusType,
            assignedTo: incident.assignedTo || incident.assigned_to || '',
            incidentDate: incident.createdAt || incident.created_at
                ? new Date(incident.createdAt || incident.created_at || '').toISOString().slice(0, 16)
                : ''
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (selectedIncident) {
                await api.updateIncident(selectedIncident.id, formData);
            } else {
                await api.createIncident(formData);
            }
            setShowModal(false);
            fetchIncidents();
        } catch (error) {
            console.error('Failed to save incident:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this incident?')) return;
        try {
            await api.deleteIncident(id);
            fetchIncidents();
        } catch (error) {
            console.error('Failed to delete incident:', error);
        }
    };

    const getSeverityBadge = (priority: string) => {
        const colors: Record<string, string> = {
            'P1': 'badge-danger',
            'P2': 'badge-warning',
            'P3': 'badge-info',
            'P4': 'badge-neutral'
        };
        return <span className={`badge ${colors[priority] || 'badge-neutral'}`}>{priority}</span>;
    };

    const getStatusBadge = (status: string) => {
        const colors: Record<string, string> = {
            'Open': 'badge-danger',
            'In Progress': 'badge-warning',
            'Closed': 'badge-success'
        };
        return <span className={`badge ${colors[status] || 'badge-neutral'}`}>{status}</span>;
    };

    const getIncidentNumber = (id: string | number, createdAt: string) => {
        const date = new Date(createdAt);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const shortId = String(id).slice(-4).toUpperCase();
        return `INC-${year}${month}-${shortId}`;
    };

    return (
        <div className="incidents-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Incidents</h1>
                    <p className="page-subtitle">Track and manage incidents across your infrastructure</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreate}>
                    <Plus size={18} />
                    Report Incident
                </button>
            </div>

            {/* Toolbar */}
            <div className="incidents-toolbar">
                <div className="search-box">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        className="input search-input"
                        placeholder="Search incidents..."
                    />
                </div>
                <button
                    className={`btn btn-secondary ${showFilters ? 'active' : ''}`}
                    onClick={() => setShowFilters(!showFilters)}
                >
                    <Filter size={18} />
                    Filters
                </button>
            </div>

            {showFilters && (
                <div className="filters-panel">
                    <div className="filter-group">
                        <label className="input-label">Status</label>
                        <select
                            className="input"
                            value={filters.status}
                            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                        >
                            <option value="">All Statuses</option>
                            <option value="Open">Open</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Closed">Closed</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label className="input-label">Priority</label>
                        <select
                            className="input"
                            value={filters.severity}
                            onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value, page: 1 }))}
                        >
                            <option value="">All Priorities</option>
                            <option value="P1">P1 - Critical</option>
                            <option value="P2">P2 - High</option>
                            <option value="P3">P3 - Medium</option>
                            <option value="P4">P4 - Low</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label className="input-label">Assigned To</label>
                        <select
                            className="input"
                            value={filters.assignedTo}
                            onChange={(e) => setFilters(prev => ({ ...prev, assignedTo: e.target.value, page: 1 }))}
                        >
                            <option value="">All Persons</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.fullName || u.full_name || u.username}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Incidents List */}
            <div className="incidents-list">
                {isLoading ? (
                    <div className="loading-state">
                        <div className="loader"></div>
                    </div>
                ) : incidents.length === 0 ? (
                    <div className="empty-state">
                        <AlertTriangle size={48} />
                        <p>No incidents found</p>
                    </div>
                ) : (
                    <div className="incidents-cards">
                        {incidents.map((incident) => (
                            <div key={incident.id} className="incident-card">
                                <div className="incident-header">
                                    <div className="incident-badges">
                                        <span className="incident-number">
                                            <Hash size={12} />
                                            {getIncidentNumber(incident.id, incident.createdAt || incident.created_at || new Date().toISOString())}
                                        </span>
                                        {getSeverityBadge(incident.priority)}
                                        {getStatusBadge(incident.status)}
                                    </div>
                                    <div className="incident-actions">
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(incident)}>
                                            <Edit size={16} />
                                        </button>
                                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(incident.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <h3 className="incident-title">{incident.title}</h3>
                                {incident.description && (
                                    <p className="incident-description">{incident.description}</p>
                                )}
                                <div className="incident-meta">
                                    <span className="meta-item">
                                        <Clock size={14} />
                                        {new Date(incident.createdAt || incident.created_at || '').toLocaleDateString()}
                                    </span>
                                    {incident.assigned_to_name && (
                                        <span className="meta-item">
                                            <UserIcon size={14} />
                                            {incident.assigned_to_name}
                                        </span>
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

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedIncident ? 'Edit Incident' : 'Report New Incident'}</h2>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                <X size={20} />
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
                                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="input-label">Description</label>
                                    <textarea
                                        className="input textarea"
                                        rows={4}
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="input-label">Priority</label>
                                        <select
                                            className="input"
                                            value={formData.priority}
                                            onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value as SeverityType }))}
                                        >
                                            <option value="P4">P4 - Low</option>
                                            <option value="P3">P3 - Medium</option>
                                            <option value="P2">P2 - High</option>
                                            <option value="P1">P1 - Critical</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="input-label">Status</label>
                                        <select
                                            className="input"
                                            value={formData.status}
                                            onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as StatusType }))}
                                        >
                                            <option value="Open">Open</option>
                                            <option value="In Progress">In Progress</option>
                                            <option value="Closed">Closed</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="input-label">Assigned To</label>
                                    <select
                                        className="input"
                                        value={formData.assignedTo}
                                        onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                                    >
                                        <option value="">Unassigned</option>
                                        {users.map(u => (
                                            <option key={u.id} value={u.id}>{u.fullName || u.full_name || u.username}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="input-label">Incident Date</label>
                                    <input
                                        type="datetime-local"
                                        className="input"
                                        value={formData.incidentDate}
                                        onChange={(e) => setFormData(prev => ({ ...prev, incidentDate: e.target.value }))}
                                    />
                                    <span className="input-hint">Leave empty to use current date/time</span>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {selectedIncident ? 'Update' : 'Create'} Incident
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
