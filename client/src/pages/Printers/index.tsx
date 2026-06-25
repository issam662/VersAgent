import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Search,
    Filter,
    Plus,
    Printer as PrinterIcon,
    Wifi,
    WifiOff,
    RefreshCw,
    Eye,
    Trash2,
    X,
    ExternalLink
} from 'lucide-react';
import api from '../../services/api';
import type { Printer } from '../../types';
import { formatDepartment } from '../../utils/formatters';
import '../Machines/Machines.css';

interface PrinterWithStatus extends Printer {
    isOnline?: boolean;
    isPinging?: boolean;
}

export default function Printers() {
    const navigate = useNavigate();
    const [printers, setPrinters] = useState<PrinterWithStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({ category: '', department: '', status: '' });
    const [showFilters, setShowFilters] = useState(false);

    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);

    useEffect(() => {
        fetchPrinters();
        fetchDefinitions();
    }, []);

    const fetchDefinitions = async () => {
        try {
            const catRes = await api.getSettings('printer_categories');
            if (catRes.setting?.value) {
                setAvailableCategories(JSON.parse(catRes.setting.value));
            } else {
                setAvailableCategories(['OFFICE', 'KSK', 'DCIX', 'SAP']);
            }
            const depRes = await api.getSettings('departments');
            if (depRes.setting?.value) {
                setAvailableDepartments(JSON.parse(depRes.setting.value));
            }
        } catch (error) {
            console.error('Failed to fetch local definitions:', error);
        }
    };

    const fetchPrinters = async () => {
        setIsLoading(true);
        try {
            const data = await api.getPrinters();
            // Start pinging in the background for all printers
            setPrinters(data.map(p => ({ ...p, isPinging: true })));

            // Ping each printer in batches to prevent overwhelming the browser/OS
            // Spawning hundreds of simultaneous connections/ping processes can cause STATUS_ACCESS_VIOLATION
            const BATCH_SIZE = 5;
            for (let i = 0; i < data.length; i += BATCH_SIZE) {
                const batch = data.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(p => pingPrinter(p.id)));
            }
        } catch (error) {
            console.error('Failed to fetch printers:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const pingPrinter = async (id: string) => {
        try {
            setPrinters(prev => prev.map(p => p.id === id ? { ...p, isPinging: true } : p));
            const status = await api.getPrinterStatus(id);
            setPrinters(prev => prev.map(p =>
                p.id === id ? { ...p, isOnline: status.online, isPinging: false } : p
            ));
        } catch (error) {
            console.error(`Failed to ping printer ${id}:`, error);
            setPrinters(prev => prev.map(p =>
                p.id === id ? { ...p, isOnline: false, isPinging: false } : p
            ));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this printer?')) return;
        try {
            await api.deletePrinter(id);
            setPrinters(prev => prev.filter(p => p.id !== id));
        } catch (error) {
            console.error('Failed to delete printer:', error);
            alert('Failed to delete printer');
        }
    };

    const handleCategoryChange = async (id: string, newCategory: string) => {
        try {
            setPrinters(prev => prev.map(p => p.id === id ? { ...p, category: newCategory } : p));
            await api.updatePrinterCategory(id, newCategory);
        } catch (error) {
            console.error('Failed to update category:', error);
            fetchPrinters(); // Revert
        }
    };

    const handleDepartmentChange = async (id: string, newDept: string) => {
        try {
            setPrinters(prev => prev.map(p => p.id === id ? { ...p, department: newDept } : p));
            await api.updatePrinterDepartment(id, newDept);
        } catch (error) {
            console.error('Failed to update department:', error);
            fetchPrinters(); // Revert
        }
    };

    // Filtered computation
    const filteredPrinters = printers.filter(p => {
        const matchesSearch = (p.hostname?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            p.ip_address.includes(searchTerm) ||
            (p.model?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
            (p.mac_address?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        const matchesCat = filters.category ? p.category === filters.category : true;
        const matchesDept = filters.department ? p.department === filters.department : true;
        const matchesStatus = filters.status === 'online' ? p.isOnline === true :
                              filters.status === 'offline' ? p.isOnline === false : true;
        return matchesSearch && matchesCat && matchesDept && matchesStatus;
    });

    // Extract unique values for filters along with global available ones
    const dynamicAllCategories = Array.from(new Set([...(printers.map(p => p.category).filter(Boolean) as string[]), ...availableCategories]));
    const dynamicAllDepartments = Array.from(new Set([...(printers.map(p => p.department).filter(Boolean) as string[]), ...availableDepartments]));



    return (
        <div className="machines-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Printers & Scanners</h1>
                    <p className="page-subtitle">Manage and monitor {printers.length} network devices in your inventory</p>
                </div>
                <button className="btn btn-primary" onClick={() => navigate('/admin/printers/new')}>
                    <Plus size={18} />
                    Add Printer
                </button>
            </div>

            {/* Toolbar */}
            <div className="machines-toolbar">
                <div className="search-box">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        className="input search-input"
                        placeholder="Search IP, Hostname, Model..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <button
                    className={`btn btn-secondary ${showFilters ? 'active' : ''}`}
                    onClick={() => setShowFilters(!showFilters)}
                >
                    <Filter size={18} /> Filters
                </button>
                {(filters.category || filters.department || filters.status || searchTerm) && (
                    <button
                        className="btn btn-ghost"
                        onClick={() => {
                            setFilters({ category: '', department: '', status: '' });
                            setSearchTerm('');
                        }}
                        title="Clear all filters"
                    >
                        <X size={18} /> Clear
                    </button>
                )}
                <button
                    className="btn btn-secondary"
                    onClick={fetchPrinters}
                    title="Refresh and Ping All"
                >
                    <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            {showFilters && (
                <div className="filters-panel">
                    <div className="filter-group">
                        <label className="input-label">Category</label>
                        <select
                            className="input"
                            value={filters.category}
                            onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                        >
                            <option value="">All Categories</option>
                            {dynamicAllCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label className="input-label">Department</label>
                        <select
                            className="input"
                            value={filters.department}
                            onChange={(e) => setFilters(prev => ({ ...prev, department: e.target.value }))}
                        >
                            <option value="">All Departments</option>
                            {dynamicAllDepartments.map(d => <option key={d} value={d}>{formatDepartment(d)}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label className="input-label">Status</label>
                        <select
                            className="input"
                            value={filters.status}
                            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        >
                            <option value="">All Statuses</option>
                            <option value="online">Online</option>
                            <option value="offline">Offline</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="table-container mt-6">
                {isLoading && printers.length === 0 ? (
                    <div className="table-loading">
                        <div className="loader"></div>
                    </div>
                ) : filteredPrinters.length === 0 ? (
                    <div className="table-empty">
                        <PrinterIcon size={48} className="opacity-50 mb-4" />
                        <p className="text-lg font-medium">No printers found</p>
                    </div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>IP Address</th>
                                <th>Status</th>
                                <th>Model</th>
                                <th>Queue</th>
                                <th>Line</th>
                                <th>Station</th>
                                <th>Category</th>
                                <th>Department</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPrinters.map((printer) => (
                                <tr key={printer.id}>
                                    <td>
                                        <a
                                            href={printer.custom_website_url || `http://${printer.ip_address}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="custom-url-link flex items-center gap-1.5"
                                        >
                                            <ExternalLink size={14} />
                                            <span className="font-mono">{printer.ip_address}</span>
                                        </a>
                                    </td>
                                    <td>
                                        {printer.isPinging ? (
                                            <span className="badge badge-neutral">
                                                <div className="loader-sm w-3 h-3"></div> Checking...
                                            </span>
                                        ) : printer.isOnline ? (
                                            <span className="badge badge-success">
                                                <Wifi size={12} /> Online
                                            </span>
                                        ) : (
                                            <span className="badge badge-danger">
                                                <WifiOff size={12} /> Offline
                                            </span>
                                        )}
                                    </td>
                                    <td>{printer.model || '-'}</td>
                                    <td>{printer.queue_name || '-'}</td>
                                    <td>{printer.line || '-'}</td>
                                    <td>{printer.station_name || '-'}</td>
                                    <td>
                                        <select
                                            className="input"
                                            value={printer.category || ''}
                                            onChange={(e) => handleCategoryChange(printer.id, e.target.value)}
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                        >
                                            <option value="">Select Category</option>
                                            {dynamicAllCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </td>
                                    <td>
                                        <select
                                            className="input"
                                            value={printer.department || ''}
                                            onChange={(e) => handleDepartmentChange(printer.id, e.target.value)}
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                        >
                                            <option value="">Select Department</option>
                                            {dynamicAllDepartments.map(d => <option key={d} value={d}>{formatDepartment(d)}</option>)}
                                        </select>
                                    </td>
                                    <td>
                                        <div className="table-actions">
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => pingPrinter(printer.id)}
                                                title="Ping Status"
                                            >
                                                <RefreshCw size={16} className={printer.isPinging ? 'animate-spin' : ''} />
                                            </button>
                                            <Link
                                                to={`/admin/printers/${printer.id}/edit`}
                                                className="btn btn-ghost btn-sm"
                                                title="Edit Details"
                                            >
                                                <Eye size={16} />
                                            </Link>
                                            <button
                                                className="btn btn-ghost btn-sm btn-danger"
                                                onClick={() => handleDelete(printer.id)}
                                                title="Delete"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
