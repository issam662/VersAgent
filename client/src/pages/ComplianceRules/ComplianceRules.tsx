import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ShieldCheck,
    Plus,
    Edit,
    Trash2,
    ToggleLeft,
    ToggleRight,
    X,
    AlertCircle,
    Eye,
    EyeOff,
    CheckCircle,
    ShieldAlert,
    ShieldOff,
    Activity
} from 'lucide-react';
import api from '../../services/api';
import type { ComplianceRule } from '../../types';
import './ComplianceRules.css';

const RULE_TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
    software_required: { label: 'Required App',       icon: '📦', color: 'rgba(0,176,255,0.15)' },
    mandatory:         { label: 'Required App',       icon: '📦', color: 'rgba(0,176,255,0.15)' },
    blacklist:         { label: 'Forbidden App',      icon: '🚫', color: 'rgba(255,61,0,0.15)'  },
    outdated:          { label: 'Required Version',   icon: '🔖', color: 'rgba(212,122,38,0.15)' },
    minimum_version:   { label: 'Minimum Version',    icon: '⬆️', color: 'rgba(0,200,83,0.12)'  },
    os:                { label: 'Forbidden OS',       icon: '🖥️', color: 'rgba(255,61,0,0.15)'  },
    required_os:       { label: 'Required OS',        icon: '🖥️', color: 'rgba(0,200,83,0.12)'  },
};

const SEVERITY_CLASS: Record<string, string> = {
    critical: 'badge-critical-sev',
    high:     'badge-high-sev',
    medium:   'badge-medium-sev',
    low:      'badge-low-sev',
};

const FILTER_OPTIONS = [
    { value: 'all',             label: 'All' },
    { value: 'mandatory',       label: 'Required App' },
    { value: 'blacklist',       label: 'Forbidden App' },
    { value: 'outdated',        label: 'Required Version' },
    { value: 'minimum_version', label: 'Min Version' },
    { value: 'required_os',     label: 'Required OS' },
    { value: 'os',              label: 'Forbidden OS' },
];

export default function ComplianceRules() {
    const navigate = useNavigate();
    const [rules, setRules] = useState<ComplianceRule[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedRule, setSelectedRule] = useState<ComplianceRule | null>(null);
    const [filterType, setFilterType] = useState<string>('all');
    const [expandedRule, setExpandedRule] = useState<string | null>(null);
    const [violations, setViolations] = useState<any[]>([]);
    const [loadingViolations, setLoadingViolations] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        type: 'mandatory' as string,
        condition: '',
        severity: 'medium' as string,
        isActive: true,
        versionOperator: '>=' as string,
        versionValue: ''
    });

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        setIsLoading(true);
        try {
            const data = await api.getRules();
            setRules(data);
        } catch (error) {
            console.error('Failed to fetch rules:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = () => {
        setSelectedRule(null);
        setFormData({ name: '', description: '', type: 'mandatory', condition: '', severity: 'medium', isActive: true, versionOperator: '>=', versionValue: '' });
        setShowModal(true);
    };

    const handleEdit = (rule: ComplianceRule) => {
        setSelectedRule(rule);
        setFormData({
            name: rule.name,
            description: rule.description || '',
            type: rule.type,
            condition: rule.condition,
            severity: rule.severity,
            isActive: rule.isActive,
            versionOperator: rule.versionOperator || '>=',
            versionValue: rule.versionValue || ''
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const submitData = { ...formData };
            if (submitData.type === 'minimum_version') submitData.versionOperator = '>=';
            if (submitData.type !== 'outdated' && submitData.type !== 'minimum_version') {
                submitData.versionOperator = '';
                submitData.versionValue = '';
            }
            if (selectedRule) {
                await api.updateRule(selectedRule.id, submitData);
            } else {
                await api.createRule(submitData);
            }
            setShowModal(false);
            fetchRules();
        } catch (error) {
            console.error('Failed to save rule:', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            await api.deleteRule(id);
            fetchRules();
        } catch (error) {
            console.error('Failed to delete rule:', error);
        }
    };

    const toggleRule = async (rule: ComplianceRule) => {
        try {
            await api.updateRule(rule.id, { isActive: !rule.isActive });
            fetchRules();
        } catch (error) {
            console.error('Failed to toggle rule:', error);
        }
    };

    const toggleViolations = async (ruleId: string) => {
        if (expandedRule === ruleId) {
            setExpandedRule(null);
            setViolations([]);
            return;
        }
        setExpandedRule(ruleId);
        setLoadingViolations(true);
        try {
            const data = await api.getRuleViolations(ruleId);
            setViolations(data);
        } catch (error) {
            console.error('Failed to fetch violations:', error);
            setViolations([]);
        } finally {
            setLoadingViolations(false);
        }
    };

    const getSeverityColor = (severity: string) => {
        const colors: Record<string, string> = {
            critical: 'var(--status-danger)',
            high: 'var(--aptiv-primary)',
            medium: 'var(--status-warning)',
            low: 'var(--status-info)'
        };
        return colors[severity] || colors.medium;
    };

    const filteredRules = filterType === 'all' ? rules : rules.filter((r) => r.type === filterType);

    // Summary stats
    const totalViolations = rules.reduce((sum, r) => sum + (r.violationCount || 0), 0);
    const activeRules = rules.filter(r => r.isActive).length;
    const inactiveRules = rules.filter(r => !r.isActive).length;

    return (
        <div className="compliance-rules-page">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Compliance Rules</h1>
                    <p className="page-subtitle">Define and manage compliance policies for your infrastructure</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreate}>
                    <Plus size={18} />
                    Add Rule
                </button>
            </div>

            {/* Summary Cards */}
            {!isLoading && rules.length > 0 && (
                <div className="compliance-summary">
                    <div className="summary-card">
                        <div className="summary-icon total"><ShieldCheck size={20} /></div>
                        <div className="summary-info">
                            <span className="summary-value">{rules.length}</span>
                            <span className="summary-label">Total Rules</span>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-icon active"><Activity size={20} /></div>
                        <div className="summary-info">
                            <span className="summary-value">{activeRules}</span>
                            <span className="summary-label">Active Rules</span>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-icon violations"><ShieldAlert size={20} /></div>
                        <div className="summary-info">
                            <span className="summary-value">{totalViolations}</span>
                            <span className="summary-label">Total Violations</span>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-icon inactive"><ShieldOff size={20} /></div>
                        <div className="summary-info">
                            <span className="summary-value">{inactiveRules}</span>
                            <span className="summary-label">Inactive Rules</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Chips */}
            {!isLoading && rules.length > 0 && (
                <div className="compliance-filter-bar">
                    {FILTER_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            className={`filter-chip ${filterType === opt.value ? 'active' : ''}`}
                            onClick={() => setFilterType(opt.value)}
                        >
                            {opt.label}
                            {opt.value !== 'all' && (
                                <span style={{ marginLeft: '4px', opacity: 0.7 }}>
                                    ({rules.filter(r => opt.value === 'all' || r.type === opt.value).length})
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Rules List */}
            <div className="rules-container">
                {isLoading ? (
                    <div className="loading-state">
                        <div className="loader"></div>
                    </div>
                ) : rules.length === 0 ? (
                    <div className="empty-state">
                        <ShieldCheck size={52} opacity={0.3} />
                        <p>No compliance rules defined yet</p>
                        <button className="btn btn-primary" onClick={handleCreate}>
                            <Plus size={16} /> Create your first rule
                        </button>
                    </div>
                ) : filteredRules.length === 0 ? (
                    <div className="empty-state">
                        <ShieldCheck size={52} opacity={0.3} />
                        <p>No rules match the selected filter</p>
                        <button className="btn btn-ghost" onClick={() => setFilterType('all')}>Clear Filter</button>
                    </div>
                ) : (
                    <div className="rules-list">
                        {filteredRules.map((rule) => {
                            const meta = RULE_TYPE_META[rule.type] || { label: rule.type, icon: '📋', color: 'rgba(126,149,183,0.15)' };
                            const isExpanded = expandedRule === rule.id;
                            return (
                                <div key={rule.id} className={`rule-card-wrapper ${isExpanded ? 'expanded' : ''}`}>
                                    <div className={`rule-card ${!rule.isActive ? 'inactive' : ''}`}>
                                        {/* Severity bar */}
                                        <div className="rule-indicator" style={{ background: getSeverityColor(rule.severity) }} />

                                        {/* Content */}
                                        <div className="rule-content">
                                            <div className="rule-header">
                                                <div className="rule-title-row">
                                                    <div className="rule-type-icon" style={{ background: meta.color }} title={meta.label}>
                                                        {meta.icon}
                                                    </div>
                                                    <h3 className="rule-name">{rule.name}</h3>
                                                </div>
                                                <div className="rule-badges">
                                                    <span className={`badge ${SEVERITY_CLASS[rule.severity] || 'badge-info'}`} style={{ textTransform: 'capitalize' }}>
                                                        {rule.severity}
                                                    </span>
                                                    <span className="badge badge-neutral">{meta.label}</span>
                                                    {(rule.violationCount || 0) > 0 ? (
                                                        <span className="badge badge-danger violation-badge">
                                                            <AlertCircle size={11} />
                                                            {rule.violationCount} violation{rule.violationCount !== 1 ? 's' : ''}
                                                        </span>
                                                    ) : (
                                                        <span className="badge badge-success compliant-badge">
                                                            <CheckCircle size={11} />
                                                            Compliant
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {rule.description && (
                                                <p className="rule-description">{rule.description}</p>
                                            )}

                                            <div className="rule-condition">
                                                <span className="rule-condition-prefix">MATCH</span>
                                                <code>
                                                    {rule.condition}
                                                    {rule.versionValue && (
                                                        <span style={{ color: 'var(--aptiv-primary-light)', marginLeft: '8px' }}>
                                                            {rule.type === 'minimum_version' ? '>=' : (rule.versionOperator || '=')} {rule.versionValue}
                                                        </span>
                                                    )}
                                                </code>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="rule-actions">
                                            {(rule.violationCount || 0) > 0 && (
                                                <button
                                                    className={`rule-action-btn view ${isExpanded ? 'active' : ''}`}
                                                    onClick={() => toggleViolations(rule.id)}
                                                    title={isExpanded ? 'Hide violations' : 'View violating machines'}
                                                >
                                                    {isExpanded ? <EyeOff size={15} /> : <Eye size={15} />}
                                                </button>
                                            )}
                                            <button
                                                className={`toggle-btn ${rule.isActive ? 'active' : ''}`}
                                                onClick={() => toggleRule(rule)}
                                                title={rule.isActive ? 'Disable rule' : 'Enable rule'}
                                            >
                                                {rule.isActive ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                                            </button>
                                            <button className="rule-action-btn" onClick={() => handleEdit(rule)} title="Edit rule">
                                                <Edit size={15} />
                                            </button>
                                            <button className="rule-action-btn danger" onClick={() => handleDelete(rule.id)} title="Delete rule">
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Violations Drawer */}
                                    {isExpanded && (
                                        <div className="violations-panel">
                                            <div className="violations-panel-header">
                                                <span className="violations-panel-title">Violating Machines</span>
                                                {!loadingViolations && violations.length > 0 && (
                                                    <span className="violations-count-badge">{violations.length} machine{violations.length !== 1 ? 's' : ''}</span>
                                                )}
                                            </div>
                                            {loadingViolations ? (
                                                <div className="violations-loading"><div className="loader"></div></div>
                                            ) : violations.length === 0 ? (
                                                <div className="violations-empty">
                                                    <CheckCircle size={16} opacity={0.5} />
                                                    No violations found
                                                </div>
                                            ) : (
                                                <table className="violations-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Hostname</th>
                                                            <th>OS</th>
                                                            <th>Category</th>
                                                            <th>Status</th>
                                                            <th>Details</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {violations.map((m: any) => (
                                                            <tr
                                                                key={m.id}
                                                                className="violation-row"
                                                                onClick={() => navigate(`/admin/machines/${m.id}`)}
                                                                title="View machine details"
                                                            >
                                                                <td>
                                                                    <span className="violation-hostname">{m.hostname}</span>
                                                                </td>
                                                                <td>{m.os_name || 'Unknown'}</td>
                                                                <td>{m.category || 'N/A'}</td>
                                                                <td>
                                                                    <span className={`badge badge-${m.status === 'online' ? 'success' : 'neutral'}`}>
                                                                        {m.status || 'offline'}
                                                                    </span>
                                                                </td>
                                                                <td className="violation-details">{m.details}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(212,122,38,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <ShieldCheck size={20} style={{ color: 'var(--aptiv-primary)' }} />
                                </div>
                                <h2>{selectedRule ? 'Edit Rule' : 'Create New Rule'}</h2>
                            </div>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="input-label">Rule Name *</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={formData.name}
                                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                        required
                                        placeholder="e.g., Antivirus Required"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="input-label">Description</label>
                                    <textarea
                                        className="input textarea"
                                        rows={3}
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Describe what this rule checks for..."
                                    />
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="input-label">Rule Type</label>
                                        <select
                                            className="input"
                                            value={formData.type}
                                            onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                                        >
                                            <option value="mandatory">Required App</option>
                                            <option value="blacklist">Forbidden App</option>
                                            <option value="outdated">Required App Version</option>
                                            <option value="minimum_version">Minimum Version</option>
                                            <option value="required_os">Required OS Version</option>
                                            <option value="os">Forbidden OS Version</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="input-label">Severity</label>
                                        <select
                                            className="input"
                                            value={formData.severity}
                                            onChange={(e) => setFormData(prev => ({ ...prev, severity: e.target.value }))}
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                            <option value="critical">Critical</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="input-label">
                                        {formData.type === 'os' || formData.type === 'required_os' ? 'OS Name *' : 'App Name *'}
                                    </label>
                                    <input
                                        type="text"
                                        className="input font-mono"
                                        value={formData.condition}
                                        onChange={(e) => setFormData(prev => ({ ...prev, condition: e.target.value }))}
                                        required
                                        placeholder={
                                            formData.type === 'os' || formData.type === 'required_os'
                                                ? 'e.g., Windows 10'
                                                : 'e.g., Microsoft Edge'
                                        }
                                    />
                                    <small className="form-hint">
                                        <AlertCircle size={12} />
                                        {formData.type === 'minimum_version'
                                            ? ' Enter the app name. Machines below the minimum version will be flagged.'
                                            : formData.type === 'outdated'
                                                ? ' Enter the app name. Specify the exact required version below.'
                                                : ' Enter the name to match against installed apps or OS.'}
                                    </small>
                                </div>
                                {(formData.type === 'outdated' || formData.type === 'minimum_version') && (
                                    <div className="form-row">
                                        {formData.type === 'outdated' && (
                                            <div className="form-group">
                                                <label className="input-label">Version Operator</label>
                                                <select
                                                    className="input"
                                                    value={formData.versionOperator}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, versionOperator: e.target.value }))}
                                                >
                                                    <option value="=">=  (Exact)</option>
                                                    <option value=">=">&gt;= (At least)</option>
                                                    <option value="<=">&lt;= (At most)</option>
                                                    <option value=">">&gt;  (Greater than)</option>
                                                    <option value="<">&lt;  (Less than)</option>
                                                </select>
                                            </div>
                                        )}
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label className="input-label">
                                                {formData.type === 'minimum_version' ? 'Minimum Version *' : 'Required Version *'}
                                            </label>
                                            <input
                                                type="text"
                                                className="input font-mono"
                                                value={formData.versionValue}
                                                onChange={(e) => setFormData(prev => ({ ...prev, versionValue: e.target.value }))}
                                                required
                                                placeholder="e.g., 145.0.3800.82"
                                            />
                                            {formData.type === 'minimum_version' && (
                                                <small className="form-hint">
                                                    <AlertCircle size={12} /> Any version below this will be flagged as non-compliant.
                                                </small>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="form-group">
                                    <label className="checkbox-label">
                                        <input
                                            type="checkbox"
                                            checked={formData.isActive}
                                            onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                                        />
                                        <span>Rule is active</span>
                                    </label>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {selectedRule ? 'Update' : 'Create'} Rule
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
