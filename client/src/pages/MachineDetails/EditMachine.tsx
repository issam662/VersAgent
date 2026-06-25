import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import api from '../../services/api';
import { formatDepartment } from '../../utils/formatters';
import './MachineDetails.css'; // Reusing styles

export default function EditMachine() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isManaged, setIsManaged] = useState(true);
    const [formData, setFormData] = useState({
        hostname: '',
        category: 'Unassigned',
        location: '',
        department: '',
        family: '',
        description: '',
        tags: '',
        notes: ''
    });
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);

    useEffect(() => {
        fetchMachine();
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
            console.error('Failed to fetch categories/departments:', error);
        }
    };

    const fetchMachine = async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const data = await api.getMachine(id);
            setIsManaged((data as any).is_managed === 1 || data.is_managed === true || data.isManaged === true);
            setFormData({
                hostname: data.hostname || '',
                category: data.category || 'Unassigned',
                location: data.location || '',
                department: data.department || '',
                family: data.family || '',
                description: data.description || '',
                tags: Array.isArray(data.tags) ? data.tags.join(', ') : '',
                notes: data.notes || ''
            });
        } catch (error) {
            console.error('Failed to fetch machine:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;

        setIsSaving(true);
        try {
            // Convert tags string back to array
            const formattedData = {
                ...formData,
                tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean)
            };

            await api.updateMachine(id, formattedData);
            navigate(`/admin/machines/${id}`);
        } catch (error) {
            console.error('Failed to update machine:', error);
            alert('Failed to update machine. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="machine-details-loading">
                <div className="loader"></div>
            </div>
        );
    }

    return (
        <div className="machine-details">
            <div className="details-header">
                <div className="header-left">
                    <button className="btn btn-ghost" onClick={() => navigate(-1)}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className="machine-title">
                        <h1>Edit: {formData.hostname}</h1>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm text-primary ml-4"
                            onClick={() => {
                                if (confirm('Go to Machine Details to scan?')) {
                                    navigate(`/admin/machines/${id}`);
                                }
                            }}
                        >
                            Go to Details to Scan
                        </button>
                    </div>
                </div>
            </div>

            <div className="details-content">
                <div className="overview-grid">
                    <div className="info-card full-width">
                        <h3>Edit Configuration</h3>
                        <form onSubmit={handleSubmit}>
                            {!isManaged && (
                                <div className="form-group">
                                    <label className="input-label">Hostname</label>
                                    <input
                                        type="text"
                                        name="hostname"
                                        className="input"
                                        value={formData.hostname}
                                        onChange={handleChange}
                                        placeholder="Enter machine hostname"
                                        required
                                    />
                                    <p className="text-xs text-muted mt-1">This machine is unmanaged, so you can edit its hostname.</p>
                                </div>
                            )}
                            <div className="form-group">
                                <label className="input-label">Category</label>
                                <select
                                    name="category"
                                    className="input"
                                    value={formData.category}
                                    onChange={handleChange}
                                >
                                    <option value="Unassigned">Unassigned</option>
                                    {availableCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Category-dependent fields */}
                            <div className="form-group">
                                <label className="input-label">Location</label>
                                <input
                                    type="text"
                                    name="location"
                                    className="input"
                                    value={formData.location}
                                    onChange={handleChange}
                                    placeholder="e.g. Building A, Floor 2"
                                />
                            </div>

                            <div className="form-group">
                                <label className="input-label">Department</label>
                                <select
                                    name="department"
                                    className="input"
                                    value={formData.department}
                                    onChange={handleChange}
                                >
                                    <option value="">Select Department</option>
                                    {availableDepartments.map(dept => (
                                        <option key={dept} value={dept}>{formatDepartment(dept)}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group">
                                <label className="input-label">Family</label>
                                <input
                                    type="text"
                                    name="family"
                                    className="input"
                                    value={formData.family}
                                    onChange={handleChange}
                                    placeholder="e.g. Assembly, Welding, Paint"
                                />
                            </div>

                            <div className="form-group">
                                <label className="input-label">Description</label>
                                <textarea
                                    name="description"
                                    className="input"
                                    value={formData.description}
                                    onChange={handleChange}
                                    rows={3}
                                    placeholder="Brief description of the machine's purpose"
                                />
                            </div>

                            <div className="form-group">
                                <label className="input-label">Tags (comma separated)</label>
                                <input
                                    type="text"
                                    name="tags"
                                    className="input"
                                    value={formData.tags}
                                    onChange={handleChange}
                                    placeholder="e.g. engineering, high-performance, legacy"
                                />
                            </div>

                            <div className="form-group">
                                <label className="input-label">Notes</label>
                                <textarea
                                    name="notes"
                                    className="input"
                                    value={formData.notes}
                                    onChange={handleChange}
                                    rows={5}
                                    placeholder="Internal notes about this machine"
                                />
                            </div>

                            <div className="form-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => navigate(-1)}
                                    disabled={isSaving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={isSaving}
                                >
                                    <Save size={18} />
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
