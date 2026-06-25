import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Bug, ChevronDown, ChevronUp, Server, TrendingUp, ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const SEV_ORDER   = ['critical', 'high', 'medium', 'low', 'unknown'];
const SEV_COLORS: Record<string, string> = {
    critical: '#ff4d4f',
    high: '#fa8c16',
    medium: '#faad14',
    low: '#1890ff',
    unknown: '#d9d9d9'
};
const SEV_BADGE: Record<string, string> = {
    critical: 'badge-error',
    high: 'badge-warning',
    medium: 'badge-warning',
    low: 'badge-info',
    unknown: 'badge-neutral'
};

const CveList: React.FC = () => {
    const navigate = useNavigate();
    const [cves, setCves] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedRows, setExpandedRows] = useState<Record<string, any[] | null>>({});
    const [sevFilter, setSevFilter] = useState('all');
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        const fetchCves = async () => {
            try {
                setLoading(true);
                // Fetch ALL CVEs for the specific severity
                const data = await api.getVulnerabilityStats(false, true, sevFilter);
                setCves(data.topCves || []);
                setStats(data.stats);
            } catch (err) {
                console.error('Failed to load CVEs:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchCves();
    }, [sevFilter]);

    const toggleRow = async (cveId: string) => {
        if (expandedRows[cveId] !== undefined) {
            // Toggle off
            setExpandedRows(prev => {
                const next = { ...prev };
                delete next[cveId];
                return next;
            });
            return;
        }

        // Set to null while loading
        setExpandedRows(prev => ({ ...prev, [cveId]: null }));

        try {
            const machines = await api.getCveAffectedMachines(cveId);
            setExpandedRows(prev => ({ ...prev, [cveId]: machines }));
        } catch (err) {
            console.error('Failed to fetch machines for CVE:', err);
            setExpandedRows(prev => ({ ...prev, [cveId]: [] })); // empty on error
        }
    };



    const sevCounts = stats?.globalSevCounts || { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    const totalAffectedCves = Object.values(sevCounts).reduce((a: any, b: any) => a + b, 0) as number;

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
                <Bug size={24} style={{ color: 'var(--aptiv-primary)' }} />
                Network Vulnerabilities List
            </h1>

            {/* Filter chips */}
            {!loading && (
                <div className="cve-filter-chips mb-4" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['all', ...SEV_ORDER.filter(s => sevCounts[s] > 0)].map(s => (
                        <button
                            key={s}
                            className={`cve-chip ${sevFilter === s ? 'active' : ''}`}
                            onClick={() => setSevFilter(s)}
                            style={sevFilter === s && s !== 'all'
                                ? { background: SEV_COLORS[s] + '22', borderColor: SEV_COLORS[s] + '66', color: SEV_COLORS[s] }
                                : undefined}
                        >
                            {s === 'all' ? `All (${totalAffectedCves})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${sevCounts[s]})`}
                        </button>
                    ))}
                </div>
            )}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                        <div className="loader" />
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="cve-table w-full">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>CVE ID</th>
                                    <th>Severity</th>
                                    <th>CVSS Score</th>
                                    <th>Published</th>
                                    <th>App Affected</th>
                                    <th>Affected Machines</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cves.length === 0 ? (
                                <tr>
                                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                                            No CVEs match the selected filter.
                                        </td>
                                    </tr>
                                ) : cves.map(c => {
                                    const isExpanded = expandedRows[c.cve_id] !== undefined;
                                    const machines = expandedRows[c.cve_id];
                                    const sev = c.severity?.toLowerCase() || 'unknown';

                                    return (
                                        <React.Fragment key={c.cve_id}>
                                            <tr onClick={() => toggleRow(c.cve_id)} style={{ cursor: 'pointer' }} className={isExpanded ? 'active-row' : ''}>
                                                <td style={{ width: '40px', textAlign: 'center' }}>
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </td>
                                                <td style={{ fontWeight: 600, color: 'var(--aptiv-primary)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <a 
                                                            href={`https://nvd.nist.gov/vuln/detail/${c.cve_id}`} 
                                                            target="_blank" 
                                                            rel="noreferrer" 
                                                            onClick={e => e.stopPropagation()}
                                                            style={{ color: 'inherit', textDecoration: 'none' }}
                                                            className="hover:underline"
                                                        >
                                                            {c.cve_id}
                                                        </a>
                                                        {c.cisa_kev === 1 && (
                                                            <span className="badge badge-error" style={{ fontSize: '0.7em', padding: '0.1rem 0.4rem', background: '#ff4d4f', color: '#fff', border: 'none' }}>
                                                                KEV
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`badge ${SEV_BADGE[sev] || 'badge-neutral'}`}
                                                          style={{ background: SEV_COLORS[sev] || SEV_COLORS.unknown, color: '#1a1a1a', border: 'none', fontWeight: 600 }}>
                                                        {c.severity || 'UNKNOWN'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div className="score-bar-container" style={{ width: '60px', height: '6px', background: 'var(--aptiv-gray-700)', borderRadius: '3px', overflow: 'hidden' }}>
                                                            <div className="score-bar-fill" style={{ width: `${(c.cvss_score / 10) * 100}%`, height: '100%', background: SEV_COLORS[sev] || SEV_COLORS.unknown }} />
                                                        </div>
                                                        <span style={{ fontWeight: 600 }}>{c.cvss_score?.toFixed(1) || '-'}</span>
                                                    </div>
                                                </td>
                                                <td style={{ opacity: 0.7, fontSize: '0.9em' }}>
                                                    {c.published_date ? new Date(c.published_date).toLocaleDateString() : '-'}
                                                </td>
                                                <td style={{ maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9em' }} title={c.affected_apps}>
                                                    {c.affected_apps || '-'}
                                                </td>
                                                <td>
                                                    <span className="badge badge-neutral">
                                                        <Server size={12} style={{ marginRight: 4 }} />
                                                        {c.affected_machines}
                                                    </span>
                                                </td>
                                            </tr>
                                            
                                            {/* Expanded Row */}
                                            {isExpanded && (
                                                <tr style={{ background: 'var(--aptiv-gray-900)' }}>
                                                    <td colSpan={5} style={{ padding: 0 }}>
                                                        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--aptiv-gray-700)' }}>
                                                            <div style={{ display: 'flex', gap: '2rem' }}>
                                                                {/* Left side: Description */}
                                                                <div style={{ flex: 1 }}>
                                                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--aptiv-gray-300)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <TrendingUp size={16} /> CVE Description
                                                                    </h4>
                                                                    <p style={{ opacity: 0.8, fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                                                                        {c.description || 'No description provided by the vulnerability database.'}
                                                                    </p>

                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem', background: 'var(--aptiv-gray-800)', padding: '1rem', borderRadius: '8px' }}>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.8rem', color: 'var(--aptiv-gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Exploitability Score</div>
                                                                            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--aptiv-gray-200)' }}>{c.exploitability_score?.toFixed(1) || '-'}</div>
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.8rem', color: 'var(--aptiv-gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Impact Score</div>
                                                                            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--aptiv-gray-200)' }}>{c.impact_score?.toFixed(1) || '-'}</div>
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.8rem', color: 'var(--aptiv-gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Attack Vector</div>
                                                                            <div style={{ fontSize: '1rem', color: 'var(--aptiv-gray-200)' }}>{c.attack_vector || '-'}</div>
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontSize: '0.8rem', color: 'var(--aptiv-gray-400)', textTransform: 'uppercase', fontWeight: 600 }}>Status</div>
                                                                            <div style={{ fontSize: '1rem', color: c.cisa_kev ? '#ff4d4f' : 'var(--aptiv-gray-400)' }}>
                                                                                {c.cisa_kev ? 'Known Exploited' : 'Standard'}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <h4 style={{ marginBottom: '0.5rem', color: 'var(--aptiv-gray-300)', fontSize: '0.9rem' }}>
                                                                        Remediation Links & References
                                                                    </h4>
                                                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto' }}>
                                                                        {(() => {
                                                                            try {
                                                                                const links = JSON.parse(c.remediation_links || '[]');
                                                                                if (links.length === 0) return <li style={{ opacity: 0.5, fontSize: '0.9rem' }}>No references available</li>;
                                                                                return links.map((link: string, i: number) => (
                                                                                    <li key={i} style={{ marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                        <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--aptiv-primary)', fontSize: '0.9rem', textDecoration: 'none' }} className="hover:underline">
                                                                                            {link}
                                                                                        </a>
                                                                                    </li>
                                                                                ));
                                                                            } catch (e) {
                                                                                return <li style={{ opacity: 0.5 }}>Error parsing links</li>;
                                                                            }
                                                                        })()}
                                                                    </ul>
                                                                </div>

                                                                {/* Right side: Affected Machines Table */}
                                                                <div style={{ flex: 1 }}>
                                                                    <h4 style={{ marginBottom: '1rem', color: 'var(--aptiv-gray-300)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                        <Server size={16} /> Affected Machines
                                                                    </h4>
                                                                    
                                                                    {!machines ? (
                                                                        <div className="loader" style={{ width: 24, height: 24, margin: '1rem 0' }} />
                                                                    ) : machines.length === 0 ? (
                                                                        <p style={{ opacity: 0.5 }}>No machines found in database.</p>
                                                                    ) : (
                                                                        <div style={{ maxHeight: '300px', overflowY: 'auto', background: 'var(--aptiv-gray-800)', borderRadius: '8px' }}>
                                                                            <table className="cve-table w-full" style={{ margin: 0 }}>
                                                                                <thead style={{ background: 'var(--aptiv-gray-900)' }}>
                                                                                    <tr>
                                                                                        <th>Hostname</th>
                                                                                        <th>IP Address</th>
                                                                                        <th>Vulnerable Software</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {machines.map((m: any, idx) => (
                                                                                        <tr key={idx}>
                                                                                            <td style={{ fontWeight: 600 }}>
                                                                                                <Link 
                                                                                                    to={`/admin/machines/${m.id}`} 
                                                                                                    style={{ color: 'var(--aptiv-primary)', textDecoration: 'none' }}
                                                                                                    className="hover:underline"
                                                                                                >
                                                                                                    {m.hostname}
                                                                                                </Link>
                                                                                            </td>
                                                                                            <td style={{ fontFamily: 'monospace', opacity: 0.8 }}>{m.ip_address}</td>
                                                                                            <td>
                                                                                                {m.app_name} <span style={{ opacity: 0.6, fontSize: '0.85em' }}>v{m.app_version}</span>
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
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
                )}
            </div>
        </div>
    );
};

export default CveList;
