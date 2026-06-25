import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ShieldAlert, ChevronDown, ChevronUp, Cpu, Monitor, Server, AlertTriangle, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const SEV_COLORS: Record<string, string> = {
    critical: '#ff4d4f',
    high: '#fa8c16',
    medium: '#faad14',
    low: '#1890ff',
    unknown: '#d9d9d9'
};

const VulnerableMachines: React.FC = () => {
    const navigate = useNavigate();
    const [machines, setMachines] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Record<string, any[] | null>>({});

    useEffect(() => {
        const fetchMachines = async () => {
            try {
                setLoading(true);
                const data = await api.getVulnerabilityStats(true, false);
                setMachines(data.topMachines || []);
            } catch (err) {
                console.error('Failed to load vulnerable machines:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchMachines();
    }, []);

    const toggleRow = async (machineId: string) => {
        if (expandedRows[machineId] !== undefined) {
            // Toggle off
            setExpandedRows(prev => {
                const next = { ...prev };
                delete next[machineId];
                return next;
            });
            return;
        }

        // Set to null while loading
        setExpandedRows(prev => ({ ...prev, [machineId]: null }));

        try {
            const vulns = await api.getMachineVulnerabilities(machineId);
            setExpandedRows(prev => ({ ...prev, [machineId]: vulns }));
        } catch (err) {
            console.error('Failed to fetch machine vulns:', err);
            setExpandedRows(prev => ({ ...prev, [machineId]: [] })); // empty on error
        }
    };

    const getOsIcon = (osName: string = '') => {
        const lower = osName.toLowerCase();
        if (lower.includes('server')) return <Server size={16} />;
        if (lower.includes('windows')) return <Monitor size={16} />;
        return <Cpu size={16} />;
    };

    if (loading) {
        return (
            <div className="p-6">
                <h1 className="page-title mb-4">Vulnerable Machines</h1>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                    <div className="loader" />
                </div>
            </div>
        );
    }

    return (
        <div className="p-6">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button 
                    onClick={() => navigate('/admin/vulnerabilities')} 
                    className="btn btn-ghost btn-sm" 
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem' }}
                >
                    <ArrowLeft size={16} /> Back to Dashboard
                </button>
            </div>
            <h1 className="page-title mb-6" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={24} style={{ color: 'var(--status-danger)' }} />
                Vulnerable Machines ({machines.length})
            </h1>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table className="cve-table w-full">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Hostname</th>
                                <th>Operating System</th>
                                <th>Total CVEs</th>
                                <th>Critical CVEs</th>
                            </tr>
                        </thead>
                        <tbody>
                            {machines.length === 0 ? (
                                <tr>
                                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                                        No vulnerable machines found.
                                    </td>
                                </tr>
                            ) : machines.map(m => {
                                const isExpanded = expandedRows[m.id] !== undefined;
                                const vulns = expandedRows[m.id];
                                return (
                                    <React.Fragment key={m.id}>
                                        <tr onClick={() => toggleRow(m.id)} style={{ cursor: 'pointer' }} className={isExpanded ? 'active-row' : ''}>
                                            <td style={{ width: '40px', textAlign: 'center' }}>
                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </td>
                                            <td style={{ fontWeight: 600 }}>
                                                <Link 
                                                    to={`/admin/machines/${m.id}`} 
                                                    style={{ color: 'inherit', textDecoration: 'none' }}
                                                    className="hover:underline"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {m.hostname}
                                                </Link>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--aptiv-gray-400)' }}>
                                                    {getOsIcon(m.os_name)}
                                                    {m.os_name}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge badge-warning">
                                                    {m.vuln_count || 0}
                                                </span>
                                            </td>
                                            <td>
                                                {m.critical_count > 0 ? (
                                                    <span className="badge badge-error">
                                                        <AlertTriangle size={12} style={{ marginRight: 4 }} />
                                                        {m.critical_count}
                                                    </span>
                                                ) : (
                                                    <span className="badge badge-success">0</span>
                                                )}
                                            </td>
                                        </tr>
                                        
                                        {/* Expanded Row */}
                                        {isExpanded && (
                                            <tr style={{ background: 'var(--aptiv-gray-900)' }}>
                                                <td colSpan={5} style={{ padding: 0 }}>
                                                    <div style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--aptiv-gray-700)' }}>
                                                        <h4 style={{ marginBottom: '1rem', color: 'var(--aptiv-gray-300)', fontSize: '0.9rem' }}>
                                                            Vulnerabilities Detected on {m.hostname}
                                                        </h4>
                                                        
                                                        {!vulns ? (
                                                            <div className="loader" style={{ width: 24, height: 24, margin: '1rem 0' }} />
                                                        ) : vulns.length === 0 ? (
                                                            <p style={{ opacity: 0.5 }}>No details found.</p>
                                                        ) : (
                                                            <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'var(--aptiv-gray-800)', borderRadius: '8px' }}>
                                                                <table className="cve-table w-full" style={{ margin: 0 }}>
                                                                    <thead style={{ background: 'var(--aptiv-gray-900)' }}>
                                                                        <tr>
                                                                            <th>CVE ID</th>
                                                                            <th>Severity</th>
                                                                            <th>Score</th>
                                                                            <th>Attack Vector</th>
                                                                            <th>Vulnerable App</th>
                                                                            <th>Published</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {vulns.map((v: any, idx) => (
                                                                            <tr key={idx}>
                                                                                <td style={{ fontWeight: 600, color: 'var(--aptiv-primary)' }}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                        <a 
                                                                                            href={`https://nvd.nist.gov/vuln/detail/${v.cve_id}`} 
                                                                                            target="_blank" 
                                                                                            rel="noreferrer" 
                                                                                            onClick={e => e.stopPropagation()}
                                                                                            style={{ color: 'inherit', textDecoration: 'none' }}
                                                                                            className="hover:underline"
                                                                                        >
                                                                                            {v.cve_id}
                                                                                        </a>
                                                                                        {v.cisa_kev === 1 && (
                                                                                            <span className="badge badge-error" style={{ fontSize: '0.7em', padding: '0.1rem 0.4rem', background: '#ff4d4f', color: '#fff', border: 'none' }}>
                                                                                                KEV
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </td>
                                                                                <td>
                                                                                    <span 
                                                                                        className="legend-dot" 
                                                                                        style={{ background: SEV_COLORS[v.severity?.toLowerCase()] || SEV_COLORS.unknown, marginRight: 6 }} 
                                                                                    />
                                                                                    {v.severity || 'UNKNOWN'}
                                                                                </td>
                                                                                <td>{v.cvss_score?.toFixed(1) || '-'}</td>
                                                                                <td style={{ fontSize: '0.9em' }}>{v.attack_vector || '-'}</td>
                                                                                <td>
                                                                                    {v.app_name} {v.app_version && <span style={{ opacity: 0.6, fontSize: '0.85em' }}>v{v.app_version}</span>}
                                                                                </td>
                                                                                <td style={{ opacity: 0.7, fontSize: '0.9em' }}>
                                                                                    {v.published_date ? new Date(v.published_date).toLocaleDateString() : '-'}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default VulnerableMachines;
