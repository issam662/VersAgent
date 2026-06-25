import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Save,
    X,
    Server,
    Tag,
    Globe,
    AlertCircle
} from 'lucide-react';
import api from '../../services/api';
import type { Printer } from '../../types';
import { formatDepartment } from '../../utils/formatters';

export default function PrinterDetails() {
    const { id } = useParams<{ id: string }>();
    const isEditing = id !== undefined && id !== 'new';
    const navigate = useNavigate();

    const [isLoading, setIsLoading] = useState(isEditing);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState<Partial<Printer>>({
        ip_address: '',
        category: 'Other',
        department: '',
        mac_address: '',
        serial_number: '',
        hostname: '',
        model: '',
        queue_name: '',
        station_name: '',
        line: '',
        comment: '',
        custom_website_url: ''
    });

    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);

    useEffect(() => {
        if (isEditing) {
            fetchPrinter();
        }
        fetchDefinitions();
    }, [id]);

    const fetchDefinitions = async () => {
        try {
            const catRes = await api.getSettings('categories');
            if (catRes.setting?.value) {
                setAvailableCategories(JSON.parse(catRes.setting.value));
            }
            const depRes = await api.getSettings('departments');
            if (depRes.setting?.value) {
                setAvailableDepartments(JSON.parse(depRes.setting.value));
            }
        } catch (error) {
            console.error('Failed to fetch local definitions:', error);
        }
    };

    const fetchPrinter = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await api.getPrinter(id as string);
            setFormData({
                ip_address: data.ip_address || '',
                category: data.category || 'Other',
                department: data.department || '',
                mac_address: data.mac_address || '',
                serial_number: data.serial_number || '',
                hostname: data.hostname || '',
                model: data.model || '',
                queue_name: data.queue_name || '',
                station_name: data.station_name || '',
                line: data.line || '',
                comment: data.comment || '',
                custom_website_url: data.custom_website_url || ''
            });
        } catch (error: any) {
            console.error('Failed to fetch printer:', error);
            setError(error.response?.data?.error || 'Failed to fetch printer details.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.ip_address) {
            setError('IP Address is required.');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            if (isEditing) {
                await api.updatePrinter(id as string, formData);
            } else {
                await api.createPrinter(formData);
            }
            navigate('/admin/printers');
        } catch (error: any) {
            console.error('Failed to save printer:', error);
            setError(error.response?.data?.error || 'Failed to save printer. Please check your inputs.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="loader"></div>
            </div>
        );
    }

    return (
        <div className="machines-page" style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">{isEditing ? 'Edit Printer' : 'Add New Printer'}</h1>
                    <p className="page-subtitle">
                        {isEditing ? 'Update existing printer details' : 'Register a new network printer or copier'}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => navigate('/admin/printers')}
                        disabled={isSaving}
                    >
                        <X size={16} />
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={isSaving}
                    >
                        {isSaving ? <div className="loader-sm" /> : <Save size={16} />}
                        {isSaving ? 'Saving...' : 'Save Printer'}
                    </button>
                </div>
            </div>

            <div className="card mt-6">
                <form onSubmit={handleSubmit}>
                    {error && (
                        <div className="alert alert-danger mb-lg">
                            <AlertCircle size={18} />
                            {error}
                        </div>
                    )}

                    <div className="mb-xl">
                        <h3 className="flex items-center gap-2 mb-md text-lg font-semibold" style={{ color: 'var(--aptiv-white)' }}>
                            <Server size={18} style={{ color: 'var(--aptiv-primary)' }} />
                            Network Settings
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                            <div className="form-group">
                                <label htmlFor="ip_address" className="input-label">
                                    IP Address *
                                </label>
                                <input
                                    type="text"
                                    name="ip_address"
                                    id="ip_address"
                                    required
                                    className="input"
                                    placeholder="192.168.1.50"
                                    value={formData.ip_address || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="mac_address" className="input-label">
                                    MAC Address
                                </label>
                                <input
                                    type="text"
                                    name="mac_address"
                                    id="mac_address"
                                    className="input"
                                    placeholder="00:1A:2B:3C:4D:5E"
                                    value={formData.mac_address || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="hostname" className="input-label">
                                    Hostname
                                </label>
                                <input
                                    type="text"
                                    name="hostname"
                                    id="hostname"
                                    className="input"
                                    placeholder="PRINTER-HR-01"
                                    value={formData.hostname || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mb-xl">
                        <h3 className="flex items-center gap-2 mb-md text-lg font-semibold border-t pt-lg" style={{ color: 'var(--aptiv-white)', borderColor: 'rgba(255,255,255,0.05)' }}>
                            <Tag size={18} style={{ color: '#00c853' }} />
                            Device Identity
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                            <div className="form-group">
                                <label className="input-label">
                                    Category
                                </label>
                                <select
                                    className="input"
                                    name="category"
                                    value={formData.category || ''}
                                    onChange={handleChange}
                                >
                                    <option value="">Select Category</option>
                                    {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="input-label">
                                    Department
                                </label>
                                <select
                                    className="input"
                                    name="department"
                                    value={formData.department || ''}
                                    onChange={handleChange}
                                >
                                    <option value="">Select Department</option>
                                    {availableDepartments.map(d => <option key={d} value={d}>{formatDepartment(d)}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label htmlFor="model" className="input-label">
                                    Model / Make
                                </label>
                                <input
                                    type="text"
                                    name="model"
                                    id="model"
                                    className="input"
                                    placeholder="HP LaserJet Pro M404"
                                    value={formData.model || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="serial_number" className="input-label">
                                    Serial Number
                                </label>
                                <input
                                    type="text"
                                    name="serial_number"
                                    id="serial_number"
                                    className="input"
                                    placeholder="VNB3F..."
                                    value={formData.serial_number || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mb-xl">
                        <h3 className="flex items-center gap-2 mb-md text-lg font-semibold border-t pt-lg" style={{ color: 'var(--aptiv-white)', borderColor: 'rgba(255,255,255,0.05)' }}>
                            <Globe size={18} style={{ color: '#00b0ff' }} />
                            Configuration & Access
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">
                            <div className="form-group">
                                <label htmlFor="queue_name" className="input-label">
                                    Queue Name
                                </label>
                                <input
                                    type="text"
                                    name="queue_name"
                                    id="queue_name"
                                    className="input"
                                    placeholder="PRINTER-HR-Q1"
                                    value={formData.queue_name || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="station_name" className="input-label">
                                    Station Name
                                </label>
                                <input
                                    type="text"
                                    name="station_name"
                                    id="station_name"
                                    className="input"
                                    placeholder="ST-01"
                                    value={formData.station_name || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group md:col-span-2">
                                <label htmlFor="line" className="input-label">
                                    Line
                                </label>
                                <input
                                    type="text"
                                    name="line"
                                    id="line"
                                    className="input"
                                    placeholder="Production Line 1"
                                    value={formData.line || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group md:col-span-2">
                                <label htmlFor="comment" className="input-label">
                                    Comment / Notes
                                </label>
                                <textarea
                                    name="comment"
                                    id="comment"
                                    rows={3}
                                    className="input textarea"
                                    placeholder="Add any additional notes about this printer here..."
                                    value={formData.comment || ''}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="form-group md:col-span-2">
                                <label htmlFor="custom_website_url" className="input-label">
                                    Custom Website URL (optional)
                                </label>
                                <p style={{ fontSize: '0.75rem', color: 'var(--aptiv-gray-500)', marginTop: '-4px', marginBottom: '8px' }}>
                                    Overrides the direct IP link on the dashboard.
                                </p>
                                <input
                                    type="url"
                                    name="custom_website_url"
                                    id="custom_website_url"
                                    className="input"
                                    placeholder="https://10.10.1.5/admin"
                                    value={formData.custom_website_url || ''}
                                    onChange={handleChange}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Hidden actual submit button, UI trigger is in the header */}
                    <button type="submit" className="hidden" />
                </form>
            </div>
        </div>
    );
}
