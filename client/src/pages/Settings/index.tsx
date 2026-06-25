import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Plus, X, Building, Monitor, Printer } from 'lucide-react';
import api from '../../services/api';
import { formatDepartment } from '../../utils/formatters';
import './Settings.css';export default function Settings() {
    const [pcCategories, setPcCategories] = useState<string[]>([]);
    const [printerCategories, setPrinterCategories] = useState<string[]>([]);
    const [departments, setDepartments] = useState<string[]>([]);

    const [newPcCategory, setNewPcCategory] = useState('');
    const [newPrinterCategory, setNewPrinterCategory] = useState('');
    const [newDepartment, setNewDepartment] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setIsLoading(true);
        try {
            const catRes = await api.getSettings('categories');
            if (catRes.setting?.value) {
                setPcCategories(JSON.parse(catRes.setting.value));
            } else {
                setPcCategories(["User", "Shopfloor", "Server", "Kiosk", "Network", "Unassigned", "Other"]);
            }

            const printerCatRes = await api.getSettings('printer_categories');
            if (printerCatRes.setting?.value) {
                setPrinterCategories(JSON.parse(printerCatRes.setting.value));
            } else {
                setPrinterCategories(["OFFICE", "KSK", "DCIX", "SAP"]);
            }

            const depRes = await api.getSettings('departments');
            if (depRes.setting?.value) {
                setDepartments(JSON.parse(depRes.setting.value));
            } else {
                setDepartments([
                    "production", "ME", "ME_Autocad", "IT", "logistics", "MAINTENANCE",
                    "CUTTING", "QUALITY", "QUALITY_metrologie", "TRAINING CENTRE",
                    "logistics_Reception", "logistics_Expedition", "logistics_OPS",
                    "General management", "HR"
                ]);
            }
        } catch (error) {
            console.error('Failed to fetch settings:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSavePcCategories = async () => {
        setIsSaving(true);
        try {
            await api.updateSetting('categories', JSON.stringify(pcCategories));
            alert('PC Categories saved successfully!');
        } catch (error) {
            console.error('Failed to save PC categories:', error);
            alert('Failed to save PC categories.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSavePrinterCategories = async () => {
        setIsSaving(true);
        try {
            await api.updateSetting('printer_categories', JSON.stringify(printerCategories));
            alert('Printer Categories saved successfully!');
        } catch (error) {
            console.error('Failed to save printer categories:', error);
            alert('Failed to save printer categories.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveDepartments = async () => {
        setIsSaving(true);
        try {
            await api.updateSetting('departments', JSON.stringify(departments));
            alert('Departments saved successfully!');
        } catch (error) {
            console.error('Failed to save departments:', error);
            alert('Failed to save departments.')
        } finally {
            setIsSaving(false);
        }
    };

    const addPcCategory = () => {
        if (!newPcCategory.trim()) return;
        if (pcCategories.includes(newPcCategory.trim())) { alert('Category already exists!'); return; }
        setPcCategories([...pcCategories, newPcCategory.trim()]);
        setNewPcCategory('');
    };

    const removePcCategory = (cat: string) => setPcCategories(pcCategories.filter(c => c !== cat));

    const addPrinterCategory = () => {
        if (!newPrinterCategory.trim()) return;
        if (printerCategories.includes(newPrinterCategory.trim())) { alert('Category already exists!'); return; }
        setPrinterCategories([...printerCategories, newPrinterCategory.trim()]);
        setNewPrinterCategory('');
    };

    const removePrinterCategory = (cat: string) => setPrinterCategories(printerCategories.filter(c => c !== cat));

    const addDepartment = () => {
        if (!newDepartment.trim()) return;
        if (departments.includes(newDepartment.trim())) { alert('Department already exists!'); return; }
        setDepartments([...departments, newDepartment.trim()]);
        setNewDepartment('');
    };

    const removeDepartment = (dep: string) => setDepartments(departments.filter(d => d !== dep));

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="loader"></div>
            </div>
        );
    }

    return (
        <div className="settings-page" style={{ padding: 'var(--space-xl)', margin: '0 auto' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title flex items-center gap-sm">
                        <SettingsIcon size={28} className="text-primary" />
                        System Settings
                    </h1>
                    <p className="page-subtitle">Configure global dictionaries and dropdown values</p>
                </div>
            </div>

            <div className="settings-grid">
                {/* PC Categories Management */}
                <div className="settings-card">
                    <div className="settings-card-header">
                        <div className="icon-box info">
                            <Monitor size={24} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--aptiv-white)' }}>PC Categories</h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--aptiv-gray-500)', margin: 0 }}>Machine/PC categories (e.g. User, Shopfloor)</p>
                        </div>
                    </div>
                    
                    <div className="card-body">
                        <div className="dictionary-input-group">
                            <input
                                type="text"
                                placeholder="Add new PC category..."
                                value={newPcCategory}
                                onChange={(e) => setNewPcCategory(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addPcCategory()}
                            />
                            <button className="btn btn-secondary" onClick={addPcCategory}>
                                <Plus size={18} /> Add
                            </button>
                        </div>

                        <div className="dictionary-list-container">
                            {pcCategories.length === 0 ? (
                                <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--aptiv-gray-600)', fontStyle: 'italic', fontSize: '0.9rem' }}>No PC categories defined.</div>
                            ) : (
                                <ul className="dictionary-list">
                                    {pcCategories.map((cat, idx) => (
                                        <li key={idx} className="dictionary-list-item">
                                            <span style={{ fontWeight: 500, color: 'var(--aptiv-white)' }}>{cat}</span>
                                            <button
                                                className="btn-icon-danger"
                                                onClick={() => removePcCategory(cat)}
                                                title="Remove Category"
                                            >
                                                <X size={16} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                    
                    <div className="settings-card-footer">
                        <button className="btn btn-primary" onClick={handleSavePcCategories} disabled={isSaving}>
                            <Save size={18} /> {isSaving ? 'Saving...' : 'Save PC Categories'}
                        </button>
                    </div>
                </div>

                {/* Printer Categories Management */}
                <div className="settings-card">
                    <div className="settings-card-header">
                        <div className="icon-box purple">
                            <Printer size={24} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--aptiv-white)' }}>Printer Categories</h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--aptiv-gray-500)', margin: 0 }}>Printer/Scanner categories (e.g. OFFICE, KSK)</p>
                        </div>
                    </div>
                    
                    <div className="card-body">
                        <div className="dictionary-input-group">
                            <input
                                type="text"
                                placeholder="Add new printer category..."
                                value={newPrinterCategory}
                                onChange={(e) => setNewPrinterCategory(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addPrinterCategory()}
                            />
                            <button className="btn btn-secondary" onClick={addPrinterCategory}>
                                <Plus size={18} /> Add
                            </button>
                        </div>

                        <div className="dictionary-list-container">
                            {printerCategories.length === 0 ? (
                                <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--aptiv-gray-600)', fontStyle: 'italic', fontSize: '0.9rem' }}>No printer categories defined.</div>
                            ) : (
                                <ul className="dictionary-list">
                                    {printerCategories.map((cat, idx) => (
                                        <li key={idx} className="dictionary-list-item">
                                            <span style={{ fontWeight: 500, color: 'var(--aptiv-white)' }}>{cat}</span>
                                            <button
                                                className="btn-icon-danger"
                                                onClick={() => removePrinterCategory(cat)}
                                                title="Remove Category"
                                            >
                                                <X size={16} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                    
                    <div className="settings-card-footer">
                        <button className="btn btn-primary" onClick={handleSavePrinterCategories} disabled={isSaving}>
                            <Save size={18} /> {isSaving ? 'Saving...' : 'Save Printer Categories'}
                        </button>
                    </div>
                </div>

                {/* Departments Management */}
                <div className="settings-card">
                    <div className="settings-card-header">
                        <div className="icon-box warning">
                            <Building size={24} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--aptiv-white)' }}>Departments</h2>
                            <p style={{ fontSize: '0.8rem', color: 'var(--aptiv-gray-500)', margin: 0 }}>Manage organizational departments (e.g. HR, IT)</p>
                        </div>
                    </div>
                    
                    <div className="card-body">
                        <div className="dictionary-input-group">
                            <input
                                type="text"
                                placeholder="Add new department..."
                                value={newDepartment}
                                onChange={(e) => setNewDepartment(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addDepartment()}
                            />
                            <button className="btn btn-secondary" onClick={addDepartment}>
                                <Plus size={18} /> Add
                            </button>
                        </div>

                        <div className="dictionary-list-container">
                            {departments.length === 0 ? (
                                <div style={{ padding: 'var(--space-xl)', textAlign: 'center', color: 'var(--aptiv-gray-600)', fontStyle: 'italic', fontSize: '0.9rem' }}>No departments defined.</div>
                            ) : (
                                <ul className="dictionary-list">
                                    {departments.map((dep, idx) => (
                                        <li key={idx} className="dictionary-list-item">
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 600, color: 'var(--aptiv-white)' }}>{formatDepartment(dep)}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--aptiv-gray-500)', fontFamily: 'var(--font-mono)' }}>{dep}</span>
                                            </div>
                                            <button
                                                className="btn-icon-danger"
                                                onClick={() => removeDepartment(dep)}
                                                title="Remove Department"
                                            >
                                                <X size={16} />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                    
                    <div className="settings-card-footer">
                        <button className="btn btn-primary" onClick={handleSaveDepartments} disabled={isSaving}>
                            <Save size={18} /> {isSaving ? 'Saving...' : 'Save Departments'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
