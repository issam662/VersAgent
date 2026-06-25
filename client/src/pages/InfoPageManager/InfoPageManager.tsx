import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, FileText, Table, StickyNote } from 'lucide-react';
import api from '../../services/api';
import './InfoPageManager.css';

interface InfoTable {
    title: string;
    headers: string[];
    rows: string[][];
}

interface InfoPageContent {
    tables: InfoTable[];
    notes: string;
}

const EMPTY_TABLE: InfoTable = {
    title: 'New Table',
    headers: ['Column 1', 'Column 2'],
    rows: [['', '']],
};

export default function InfoPageManager() {
    const [content, setContent] = useState<InfoPageContent>({ tables: [], notes: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        loadContent();
    }, []);

    const loadContent = async () => {
        try {
            const result = await api.getSettings('agent_info_page');
            if (result.setting?.value) {
                const parsed = JSON.parse(result.setting.value);
                setContent(parsed);
            }
        } catch (err) {
            console.error('Failed to load info page:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await api.updateSetting('agent_info_page', JSON.stringify(content));
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Failed to save:', err);
            alert('Failed to save info page content');
        } finally {
            setIsSaving(false);
        }
    };

    const addTable = () => {
        setContent(prev => ({
            ...prev,
            tables: [...prev.tables, { ...EMPTY_TABLE, headers: [...EMPTY_TABLE.headers], rows: EMPTY_TABLE.rows.map(r => [...r]) }],
        }));
    };

    const removeTable = (index: number) => {
        setContent(prev => ({
            ...prev,
            tables: prev.tables.filter((_, i) => i !== index),
        }));
    };

    const updateTableTitle = (tableIndex: number, title: string) => {
        setContent(prev => {
            const tables = [...prev.tables];
            tables[tableIndex] = { ...tables[tableIndex], title };
            return { ...prev, tables };
        });
    };

    const updateHeader = (tableIndex: number, headerIndex: number, value: string) => {
        setContent(prev => {
            const tables = [...prev.tables];
            const headers = [...tables[tableIndex].headers];
            headers[headerIndex] = value;
            tables[tableIndex] = { ...tables[tableIndex], headers };
            return { ...prev, tables };
        });
    };

    const updateCell = (tableIndex: number, rowIndex: number, colIndex: number, value: string) => {
        setContent(prev => {
            const tables = [...prev.tables];
            const rows = tables[tableIndex].rows.map(r => [...r]);
            rows[rowIndex][colIndex] = value;
            tables[tableIndex] = { ...tables[tableIndex], rows };
            return { ...prev, tables };
        });
    };

    const addRow = (tableIndex: number) => {
        setContent(prev => {
            const tables = [...prev.tables];
            const colCount = tables[tableIndex].headers.length;
            tables[tableIndex] = {
                ...tables[tableIndex],
                rows: [...tables[tableIndex].rows, Array(colCount).fill('')],
            };
            return { ...prev, tables };
        });
    };

    const removeRow = (tableIndex: number, rowIndex: number) => {
        setContent(prev => {
            const tables = [...prev.tables];
            tables[tableIndex] = {
                ...tables[tableIndex],
                rows: tables[tableIndex].rows.filter((_, i) => i !== rowIndex),
            };
            return { ...prev, tables };
        });
    };

    const addColumn = (tableIndex: number) => {
        setContent(prev => {
            const tables = [...prev.tables];
            tables[tableIndex] = {
                ...tables[tableIndex],
                headers: [...tables[tableIndex].headers, `Column ${tables[tableIndex].headers.length + 1}`],
                rows: tables[tableIndex].rows.map(r => [...r, '']),
            };
            return { ...prev, tables };
        });
    };

    const removeColumn = (tableIndex: number, colIndex: number) => {
        setContent(prev => {
            const tables = [...prev.tables];
            tables[tableIndex] = {
                ...tables[tableIndex],
                headers: tables[tableIndex].headers.filter((_, i) => i !== colIndex),
                rows: tables[tableIndex].rows.map(r => r.filter((_, i) => i !== colIndex)),
            };
            return { ...prev, tables };
        });
    };

    if (isLoading) {
        return (
            <div className="page-loading">
                <div className="loader"></div>
            </div>
        );
    }

    return (
        <div className="info-page-manager">
            <div className="info-page-header">
                <div>
                    <h1 className="page-title flex items-center gap-3">
                        <FileText size={24} style={{ color: 'var(--aptiv-primary)' }} />
                        Agent Info Page
                    </h1>
                    <p className="page-subtitle">
                        Manage content that appears in the agent popup's Info Page tab on all PCs
                    </p>
                </div>
                <button
                    className={`btn btn-primary ${saved ? 'bg-green-600 border-green-600' : ''}`}
                    onClick={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? <div className="loader-sm" /> : <Save size={16} />}
                    {isSaving ? 'Saving...' : saved ? 'Saved!' : 'Save & Push to All'}
                </button>
            </div>

            {/* Tables Section */}
            <div className="info-card">
                <div className="info-card-header">
                    <h2 className="info-card-title">
                        <Table size={18} style={{ color: 'var(--aptiv-primary)' }} /> 
                        Tables
                    </h2>
                    <button className="btn btn-secondary btn-sm" onClick={addTable}>
                        <Plus size={14} /> Add Table
                    </button>
                </div>

                {content.tables.length === 0 && (
                    <div className="info-empty-state">
                        <Table size={40} className="mb-md" style={{ color: 'var(--aptiv-gray-500)' }} />
                        <p>No tables yet. Add one to display data like kiosk accounts.</p>
                    </div>
                )}

                {content.tables.map((table, tableIndex) => (
                    <div key={tableIndex} className="info-table-wrapper">
                        <div className="info-table-toolbar">
                            <input
                                type="text"
                                className="info-glass-input"
                                style={{ flex: 1, marginRight: '16px' }}
                                value={table.title}
                                onChange={(e) => updateTableTitle(tableIndex, e.target.value)}
                                placeholder="Table title..."
                            />
                            <div className="flex gap-2">
                                <button className="btn btn-secondary btn-sm" onClick={() => addColumn(tableIndex)} title="Add column">
                                    <Plus size={14} /> Col
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => addRow(tableIndex)} title="Add row">
                                    <Plus size={14} /> Row
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => removeTable(tableIndex)} title="Delete table">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="info-table">
                                <thead>
                                    <tr>
                                        {table.headers.map((header, hi) => (
                                            <th key={hi}>
                                                <div className="flex items-center">
                                                    <input
                                                        type="text"
                                                        value={header}
                                                        onChange={(e) => updateHeader(tableIndex, hi, e.target.value)}
                                                        className="info-table-header-input"
                                                    />
                                                    {table.headers.length > 1 && (
                                                        <button
                                                            className="info-btn-icon danger flex-shrink-0 mr-2"
                                                            onClick={() => removeColumn(tableIndex, hi)}
                                                            title="Remove column"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            </th>
                                        ))}
                                        <th className="info-table-action-cell"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {table.rows.map((row, ri) => (
                                        <tr key={ri} className="group">
                                            {row.map((cell, ci) => (
                                                <td key={ci}>
                                                    <input
                                                        type="text"
                                                        value={cell}
                                                        onChange={(e) => updateCell(tableIndex, ri, ci, e.target.value)}
                                                        className="info-table-cell-input"
                                                        placeholder="..."
                                                    />
                                                </td>
                                            ))}
                                            <td className="info-table-action-cell">
                                                <button
                                                    className="info-btn-icon danger mx-auto"
                                                    onClick={() => removeRow(tableIndex, ri)}
                                                    title="Remove row"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>

            {/* Notes Section */}
            <div className="info-card">
                <div className="info-card-header">
                    <h2 className="info-card-title">
                        <StickyNote size={18} style={{ color: '#00b0ff' }} />
                        Notes
                    </h2>
                </div>
                <textarea
                    className="info-textarea"
                    value={content.notes}
                    onChange={(e) => setContent(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Add any free-form notes here... These will appear in the Info Page tab on all agent popups."
                />
            </div>
        </div>
    );
}
