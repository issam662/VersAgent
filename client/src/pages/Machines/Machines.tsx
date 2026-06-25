import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  getSortedRowModel,
} from '@tanstack/react-table';
import type { SortingState } from '@tanstack/react-table';
import {
    Search,
    Filter,
    Plus,
    Monitor,
    Wifi,
    WifiOff,
    RefreshCw,
    Eye,
    ChevronLeft,
    ChevronRight,
    X,
    Trash2,
    AlertTriangle
} from 'lucide-react';
import api from '../../services/api';
import type { Machine, MachineFilters } from '../../types';
import { formatDate } from '../../utils/formatters';
import './Machines.css';

export default function Machines() {
    const queryClient = useQueryClient();
    const [isPinging, setIsPinging] = useState(false);
    const [filters, setFilters] = useState<MachineFilters>({
        search: '',
        category: '',
        status: '',
        os: '',
        page: 1,
        limit: 20
    });
    const [showFilters, setShowFilters] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({
        hostname: '',
        category: 'User',
        operatingSystem: '',
        notes: '',
        ipAddress: '',
        macAddress: ''
    });
    const [formError, setFormError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sorting, setSorting] = useState<SortingState>([]);

    const { data: categoriesData } = useQuery({
        queryKey: ['categories'],
        queryFn: async () => {
            const res = await api.getSettings('categories');
            return res.setting?.value ? JSON.parse(res.setting.value) : ['User', 'Shopfloor', 'Server', 'Kiosk', 'Network', 'Unassigned', 'Other'];
        },
        initialData: ['User', 'Shopfloor', 'Server', 'Kiosk', 'Network', 'Unassigned', 'Other']
    });
    const availableCategories = (categoriesData || []) as string[];

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            setFilters(prev => ({ ...prev, search: searchTerm, page: 1 }));
        }, 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    const { data: machinesData, isLoading, refetch: fetchMachines } = useQuery({
        queryKey: ['machines', filters],
        queryFn: async () => {
            const response = await api.getMachines(filters);
            // If current page exceeds new totalPages, adjust it
            if ((filters.page || 1) > response.pagination.totalPages && response.pagination.totalPages > 0) {
                setFilters(prev => ({ ...prev, page: 1 }));
            }
            return response;
        },
    });

    const machines = machinesData?.data || [];
    const totalPages = machinesData?.pagination?.totalPages || 1;
    const totalMachines = machinesData?.pagination?.total || 0;

    const handleSearch = (value: string) => {
        setSearchTerm(value);
    };

    const handleFilterChange = (key: keyof MachineFilters, value: any) => {
        setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
    };

    const refreshMutation = useMutation({
        mutationFn: (machineId: string | number) => api.refreshMachine(machineId)
    });

    const handleRefresh = (machineId: string | number) => {
        refreshMutation.mutate(machineId);
    };

    const deleteMutation = useMutation({
        mutationFn: (machineId: string | number) => api.deleteMachine(machineId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['machines'] })
    });

    const handleDelete = (machineId: string | number) => {
        if (!confirm('Are you sure you want to delete this machine?')) return;
        deleteMutation.mutate(machineId);
    };

    const handleCreate = () => {
        setFormData({
            hostname: '',
            category: 'User',
            operatingSystem: '',
            notes: '',
            ipAddress: '',
            macAddress: ''
        });
        setShowModal(true);
    };

    const createMutation = useMutation({
        mutationFn: (data: any) => api.createMachine(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['machines'] });
            setShowModal(false);
            setFormError(null);
        },
        onError: (error: any) => {
            const msg = error.response?.data?.error?.message || error.response?.data?.message || 'Failed to create machine. Please check if the machine or IP/MAC already exists.';
            setFormError(msg);
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);
        createMutation.mutate({
            hostname: formData.hostname,
            category: formData.category,
            operatingSystem: formData.operatingSystem,
            notes: formData.notes,
            ipAddress: formData.ipAddress,
            macAddress: formData.macAddress
        });
    };

    const offlineReasonMutation = useMutation({
        mutationFn: ({ machineId, reason }: { machineId: string, reason: 'intervention' | 'temporary' | null }) => api.setOfflineReason(machineId, reason),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['machines'] })
    });

    const handleOfflineReasonChange = (machineId: string, reason: 'intervention' | 'temporary' | null) => {
        queryClient.setQueryData(['machines', filters], (old: any) => {
            if (!old) return old;
            return {
                ...old,
                data: old.data.map((m: Machine) => m.id === machineId ? { ...m, offlineReason: reason } : m)
            };
        });
        offlineReasonMutation.mutate({ machineId, reason });
    };

    const StatusBadge = ({ machine }: { machine: Machine }) => {
        const [isOpen, setIsOpen] = useState(false);
        const wrapperRef = useRef<HTMLDivElement>(null);

        const isOnline = machine.status === 'online' && machine.isManaged;
        const isPingOnly = !machine.isManaged && (machine.status === 'online' || machine.status === 'detected' || machine.lastSeenType === 'Ping');
        const reason = machine.offlineReason || null;

        useEffect(() => {
            const handleClickOutside = (e: MouseEvent) => {
                if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                    setIsOpen(false);
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, []);

        if (isOnline) {
            return <span className="badge badge-success"><Wifi size={12} /> Online</span>;
        }
        if (isPingOnly) {
            return (
                <span className="badge badge-warning" title="Detected by ping — no agent installed">
                    <Wifi size={12} /> Online
                </span>
            );
        }

        let badgeClass = 'badge-danger';
        let label = 'Offline';
        if (reason === 'intervention') { badgeClass = 'badge-intervention'; label = 'Intervention'; }
        else if (reason === 'temporary') { badgeClass = 'badge-temporary'; label = 'Temp. Offline'; }

        return (
            <div className="status-badge-wrapper" ref={wrapperRef}>
                <span
                    className={`badge ${badgeClass}`}
                    onClick={() => setIsOpen(o => !o)}
                    title="Click to set offline reason"
                >
                    <WifiOff size={12} /> {label}
                </span>
                {isOpen && (
                    <div className="status-dropdown">
                        <div
                            className={`status-dropdown-item ${!reason ? 'active' : ''}`}
                            onClick={() => { handleOfflineReasonChange(machine.id, null); setIsOpen(false); }}
                        >
                            <span className="dot dot-offline" />
                            Offline
                        </div>
                        <div
                            className={`status-dropdown-item ${reason === 'intervention' ? 'active' : ''}`}
                            onClick={() => { handleOfflineReasonChange(machine.id, 'intervention'); setIsOpen(false); }}
                        >
                            <span className="dot dot-intervention" />
                            Intervention
                        </div>
                        <div
                            className={`status-dropdown-item ${reason === 'temporary' ? 'active' : ''}`}
                            onClick={() => { handleOfflineReasonChange(machine.id, 'temporary'); setIsOpen(false); }}
                        >
                            <span className="dot dot-temporary" />
                            Temporary Offline
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const categoryMutation = useMutation({
        mutationFn: ({ machineId, category }: { machineId: string, category: string }) => api.updateMachine(machineId, { category }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['machines'] })
    });

    const handleCategoryChange = (machineId: string, newCategory: string) => {
        queryClient.setQueryData(['machines', filters], (old: any) => {
            if (!old) return old;
            return {
                ...old,
                data: old.data.map((m: Machine) => m.id === machineId ? { ...m, category: newCategory } : m)
            };
        });
        categoryMutation.mutate({ machineId, category: newCategory }, {
            onError: () => alert('Failed to update category')
        });
    };

    // Custom Dropdown Component for Category
    const CategoryDropdown = ({ machine }: { machine: Machine }) => {
        const [isOpen, setIsOpen] = useState(false);
        const dropdownRef = useRef<HTMLDivElement>(null);

        const currentCategory = machine.category || 'User';

        const categoryColors: Record<string, string> = {
            shopfloor: 'badge-info',
            user: 'badge-warning',
            server: 'badge-success',
            network: 'badge-neutral',
            kiosk: 'badge-error',
            unassigned: 'badge-neutral',
            other: 'badge-neutral'
        };

        const badgeClass = categoryColors[currentCategory.toLowerCase()] || 'badge-neutral';

        // Close when clicking outside
        useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, []);

        const handleSelect = (category: string) => {
            handleCategoryChange(machine.id, category);
            setIsOpen(false);
        };

        return (
            <div className="status-badge-wrapper" ref={dropdownRef}>
                <span
                    className={`badge ${badgeClass} cursor-pointer`}
                    onClick={() => setIsOpen(!isOpen)}
                    title="Click to change category"
                >
                    {currentCategory}
                </span>

                {isOpen && (
                    <div className="status-dropdown">
                        {availableCategories.map((cat) => (
                            <div
                                key={cat}
                                className={`status-dropdown-item ${currentCategory === cat ? 'active' : ''}`}
                                onClick={() => handleSelect(cat)}
                            >
                                <span className={`dot ${categoryColors[cat.toLowerCase()] ? categoryColors[cat.toLowerCase()].replace('badge-', 'bg-') : 'bg-gray-500'}`} style={{ backgroundColor: cat === 'Shopfloor' ? '#0ea5e9' : cat === 'User' ? '#f59e0b' : cat === 'Server' ? '#10b981' : cat === 'Kiosk' ? '#ef4444' : '#6b7280' }} />
                                {cat}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const getCategoryBadge = (machine: Machine) => {
        return <CategoryDropdown machine={machine} />;
    };

    const columnHelper = createColumnHelper<Machine>();

    const columns = useMemo(() => [
        columnHelper.accessor('hostname', {
            header: 'Hostname',
            cell: info => (
                <Link to={`/admin/machines/${info.row.original.id}`} className="machine-link">
                    <Monitor size={16} />
                    <span>{info.getValue()}</span>
                </Link>
            )
        }),
        columnHelper.display({
            id: 'status',
            header: 'Status',
            cell: info => <StatusBadge machine={info.row.original} />
        }),
        columnHelper.display({
            id: 'category',
            header: 'Category',
            cell: info => getCategoryBadge(info.row.original)
        }),
        columnHelper.accessor(row => row.lastKnownIp || row.ipAddress || '-', {
            id: 'ipAddress',
            header: 'IP Address',
            cell: info => <span className="font-mono">{info.getValue()}</span>
        }),
        columnHelper.accessor('operatingSystem', {
            header: 'OS',
            cell: info => info.getValue() || '-'
        }),
        columnHelper.accessor(row => row.last_seen || row.lastHeartbeat || row.last_heartbeat, {
            id: 'lastSeen',
            header: 'Last Seen',
            cell: info => (
                <div className="flex flex-col">
                    <span className="text-sm">
                        {formatDate(info.getValue())}
                    </span>
                    {info.row.original.lastSeenType && (
                        <span className="text-[10px] text-muted-foreground opacity-70">
                            via {info.row.original.lastSeenType}
                        </span>
                    )}
                </div>
            )
        }),
        columnHelper.display({
            id: 'actions',
            header: 'Actions',
            cell: info => (
                <div className="table-actions">
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRefresh(info.row.original.id)}
                        title="Refresh"
                    >
                        <RefreshCw size={16} />
                    </button>
                    <Link
                        to={`/admin/machines/${info.row.original.id}`}
                        className="btn btn-ghost btn-sm"
                        title="View Details"
                    >
                        <Eye size={16} />
                    </Link>
                    <button
                        className="btn btn-ghost btn-sm btn-danger"
                        onClick={() => handleDelete(info.row.original.id)}
                        title="Delete Machine"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )
        })
    ], [machines]);

    const table = useReactTable({
        data: machines,
        columns,
        state: {
            sorting,
        },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
    });

    return (
        <div className="machines-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Machines</h1>
                    <p className="page-subtitle">Manage and monitor {totalMachines} PCs in your inventory</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreate}>
                    <Plus size={18} />
                    Add Machine
                </button>
            </div>

            {/* Search and Filters */}
            <div className="machines-toolbar">
                <div className="search-box">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        className="input search-input"
                        placeholder="Search by IP, Hostname, MAC, Location, Family..."
                        value={searchTerm}
                        onChange={(e) => handleSearch(e.target.value)}
                    />
                </div>
                <button
                    className={`btn btn-secondary ${showFilters ? 'active' : ''}`}
                    onClick={() => setShowFilters(!showFilters)}
                >
                    <Filter size={18} />
                    Filters
                </button>
                {(filters.category || filters.status || filters.os || filters.isManaged || searchTerm) && (
                    <button
                        className="btn btn-ghost"
                        onClick={() => {
                            setFilters({ search: '', category: '', status: '', os: '', page: 1, limit: 20 });
                            setSearchTerm('');
                        }}
                        title="Clear all filters"
                    >
                        <X size={18} />
                        Clear
                    </button>
                )}


                <button
                    className="btn btn-secondary"
                    onClick={async () => {
                        if (confirm('Ping all unmanaged machines to verify status?')) {
                            setIsPinging(true);
                            try {
                                const res = await api.pingUnmanaged();
                                alert(res.message);
                                fetchMachines();
                            } catch (error) {
                                console.error('Ping failed:', error);
                                alert('Failed to ping machines');
                            } finally {
                                setIsPinging(false);
                            }
                        }
                    }}
                    title="Ping all unmanaged machines"
                    disabled={isPinging}
                >
                    {isPinging ? <div className="loader-sm"></div> : <Wifi size={18} />}
                    {isPinging ? 'Pinging...' : 'Ping Unmanaged'}
                </button>
            </div>

            {showFilters && (
                <div className="filters-panel">
                    <div className="filter-group">
                        <label className="input-label">Category</label>
                        <select
                            className="input"
                            value={filters.category}
                            onChange={(e) => handleFilterChange('category', e.target.value)}
                        >
                            <option value="">All Categories</option>
                            {availableCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label className="input-label">Status</label>
                        <select
                            className="input"
                            value={filters.status}
                            onChange={(e) => handleFilterChange('status', e.target.value)}
                        >
                            <option value="">All Statuses</option>
                            <option value="online">Online</option>
                            <option value="offline">Offline</option>
                            <option value="intervention">Intervention</option>
                            <option value="temporary">Temporary Offline</option>
                        </select>
                    </div>
                    <div className="filter-group">
                        <label className="input-label">Operating System</label>
                        <input
                            type="text"
                            className="input"
                            placeholder="e.g. Windows 11"
                            value={filters.os || ''}
                            onChange={(e) => handleFilterChange('os', e.target.value)}
                        />
                    </div>
                    <div className="filter-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '24px' }}>
                        <input
                            type="checkbox"
                            id="managedOnly"
                            checked={filters.isManaged || false}
                            onChange={(e) => handleFilterChange('isManaged', e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                        />
                        <label htmlFor="managedOnly" className="input-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Managed Only</label>
                    </div>
                </div>
            )}

            {/* Machines Table */}
            <div className="table-container">
                {isLoading ? (
                    <div className="table-loading">
                        <div className="loader"></div>
                    </div>
                ) : machines.length === 0 ? (
                    <div className="table-empty">
                        <Monitor size={48} />
                        <p>No machines found</p>
                        <button className="btn btn-primary" onClick={handleCreate}>
                            Add your first machine
                        </button>
                    </div>
                ) : (
                    <table className="table">
                        <thead>
                            {table.getHeaderGroups().map(headerGroup => (
                                <tr key={headerGroup.id}>
                                    {headerGroup.headers.map(header => (
                                        <th key={header.id} 
                                            onClick={header.column.getToggleSortingHandler()} 
                                            style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                                <span style={{ fontSize: '0.8em', opacity: 0.5 }}>
                                                    {{
                                                        asc: '▲',
                                                        desc: '▼',
                                                    }[header.column.getIsSorted() as string] ?? null}
                                                </span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            ))}
                        </thead>
                        <tbody>
                            {table.getRowModel().rows.map(row => (
                                <tr key={row.id}>
                                    {row.getVisibleCells().map(cell => (
                                        <td key={cell.id}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="pagination">
                    <button
                        className="btn btn-ghost btn-sm"
                        disabled={filters.page === 1}
                        onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) - 1 }))}
                    >
                        <ChevronLeft size={18} />
                        Previous
                    </button>
                    <span className="pagination-info">
                        Page {filters.page} of {totalPages}
                    </span>
                    <button
                        className="btn btn-ghost btn-sm"
                        disabled={filters.page === totalPages}
                        onClick={() => setFilters(prev => ({ ...prev, page: (prev.page || 1) + 1 }))}
                    >
                        Next
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}

            {/* Add Machine Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Add New Machine</h2>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                {formError && (
                                    <div className="alert alert-danger mb-md">
                                        <AlertTriangle size={18} />
                                        {formError}
                                    </div>
                                )}
                                <div className="form-group">
                                    <label className="input-label">Hostname (Optional if IP provided)</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.hostname}
                                        onChange={(e) => setFormData(prev => ({ ...prev, hostname: e.target.value }))}
                                        placeholder="e.g., PC-SHOPFLOOR-001"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="input-label">Category</label>
                                    <select
                                        className="input"
                                        value={formData.category}
                                        onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                                    >
                                        <option value="">Select Category</option>
                                        {availableCategories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group grid grid-cols-2 gap-4">
                                    <div className="flex-1">
                                        <label className="input-label">IP Address</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formData.ipAddress}
                                            onChange={(e) => setFormData(prev => ({ ...prev, ipAddress: e.target.value }))}
                                            placeholder="192.168.1.x"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="input-label">MAC Address</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formData.macAddress}
                                            onChange={(e) => setFormData(prev => ({ ...prev, macAddress: e.target.value }))}
                                            placeholder="AA:BB:CC:DD:EE:FF"
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="input-label">Operating System</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.operatingSystem}
                                        onChange={(e) => setFormData(prev => ({ ...prev, operatingSystem: e.target.value }))}
                                        placeholder="e.g., Windows 11 Pro"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="input-label">Notes</label>
                                    <textarea
                                        className="input textarea"
                                        rows={3}
                                        value={formData.notes}
                                        onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                                        placeholder="Additional notes about this machine..."
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    Add Machine
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
