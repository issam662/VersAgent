import { useState, useEffect, useMemo } from 'react';
import {
    Bug, RefreshCw, AlertTriangle, Monitor, Download,
    ShieldAlert, Activity, Cpu, ExternalLink, Filter,
    TrendingUp, CheckCircle2, XCircle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { formatDate } from '../../utils/formatters';
import './Vulnerabilities.css';

/* ── Severity helpers ───────────────────────────────────────────────── */
const SEV_ORDER   = ['critical', 'high', 'medium', 'low', 'unknown'];
const SEV_COLORS: Record<string, string> = {
    critical: '#ff3d00',
    high:     '#ff6e00',
    medium:   '#ffab00',
    low:      '#00b0ff',
    unknown:  '#4e6080',
};
const SEV_BADGE: Record<string, string> = {
    critical: 'badge-danger',
    high:     'badge-warning',
    medium:   'badge-warning',
    low:      'badge-info',
    unknown:  'badge-neutral',
};

/** Compute a 0-100 risk score from critical + total counts */
function riskScore(critical: number, total: number): number {
    if (total === 0) return 0;
    return Math.min(100, Math.round((critical * 3 + total) / (total + 1) * 20));
}

function riskLabel(score: number): { label: string; cls: string } {
    if (score >= 75) return { label: 'Critical',  cls: 'risk-critical' };
    if (score >= 50) return { label: 'High',      cls: 'risk-high'     };
    if (score >= 25) return { label: 'Medium',    cls: 'risk-medium'   };
    return                  { label: 'Low',       cls: 'risk-low'      };
}

export default function Vulnerabilities() {
    const navigate = useNavigate();
    const [stats,       setStats]       = useState<any>(null);
    const [topMachines, setTopMachines] = useState<any[]>([]);
    const [topCves,     setTopCves]     = useState<any[]>([]);
    const [isLoading,   setIsLoading]   = useState(true);
    const [isSyncing,   setIsSyncing]   = useState(false);
    const [syncStatus,  setSyncStatus]  = useState<any>(null);
    const [sevFilter,   setSevFilter]   = useState<string>('all');
    const [showAllMachines] = useState(false);
    const [showAllCves]     = useState(false);

    useEffect(() => { fetchData(false); }, []);

    useEffect(() => {
        if (!isSyncing) return;
        const id = setInterval(() => fetchData(true, showAllMachines, showAllCves, sevFilter), 2000);
        return () => clearInterval(id);
    }, [isSyncing, showAllMachines, showAllCves, sevFilter]);

    const fetchData = async (silent = false, allMachines = showAllMachines, allCves = showAllCves, severity = sevFilter) => {
        if (!silent) setIsLoading(true);
        try {
            const data = await api.getVulnerabilityStats(allMachines, allCves, severity);
            setStats(data.stats);
            setSyncStatus(data.stats?.syncStatus);
            setIsSyncing(data.stats?.syncStatus?.isSyncing || false);
            setTopMachines(data.topMachines || []);
            setTopCves(data.topCves || []);
        } catch (err) {
            console.error('Failed to fetch vulnerability stats:', err);
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    const handleSync = async () => {
        if (isSyncing) { alert('A sync is already in progress.'); return; }
        if (!confirm('Warning: This will manually trigger a backend CVE sync. It may take several minutes. Continue?')) return;
        setIsSyncing(true);
        try {
            const res = await api.syncVulnerabilities();
            setSyncStatus(res.status);
        } catch (err) {
            console.error('Manual sync failed:', err);
            alert('Failed to trigger CVE sync.');
            setIsSyncing(false);
        }
    };

    const handleGlobalExport = async () => {
        try {
            const blob = await api.exportVulnerabilities();
            const url  = window.URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = 'network_vulnerabilities_export.csv';
            document.body.appendChild(a); a.click();
            window.URL.revokeObjectURL(url); document.body.removeChild(a);
        } catch (err) {
            console.error('Export error:', err);
            alert('Failed to export vulnerabilities.');
        }
    };

    const parseProgress = (msg: string | undefined): number | null => {
        if (!msg) return null;
        const m = msg.match(/(\d+)\s+of\s+(\d+)/);
        if (m) {
            const c = parseInt(m[1], 10), t = parseInt(m[2], 10);
            if (t > 0) return Math.min(100, Math.round((c / t) * 100));
        }
        return null;
    };

    /* ── Derived data ─────────────────────────────────────────────── */
    // Use global severity counts from the backend if available, fallback to local
    const sevCounts = useMemo(() => {
        if (stats?.globalSevCounts) return stats.globalSevCounts;
        
        const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
        topCves.forEach(c => {
            const s = c.severity?.toLowerCase() || 'unknown';
            counts[s in counts ? s : 'unknown']++;
        });
        return counts;
    }, [topCves, stats?.globalSevCounts]);

    const totalAffectedCves = useMemo<number>(() => {
        return Object.values(sevCounts).reduce((a: number, b: any) => a + (b as number), 0);
    }, [sevCounts]);

    // For the UI overview card (shows total tracked in database)
    const totalCvesTracked = stats?.totalCvesTracked ?? totalAffectedCves;

    /* CSS conic-gradient stops for donut */
    const donutGradient = useMemo(() => {
        if (totalAffectedCves === 0) return 'conic-gradient(var(--aptiv-gray-800) 0% 100%)';
        let angle = 0;
        const stops: string[] = [];
        SEV_ORDER.forEach(s => {
            const pct = (sevCounts[s] / totalAffectedCves) * 100;
            if (pct === 0) return;
            stops.push(`${SEV_COLORS[s]} ${angle.toFixed(1)}% ${(angle + pct).toFixed(1)}%`);
            angle += pct;
        });
        return `conic-gradient(${stops.join(', ')})`;
    }, [sevCounts, totalAffectedCves]);

    const filteredCves = useMemo(() =>
        sevFilter === 'all' ? topCves
            : topCves.filter(c => (c.severity?.toLowerCase() || 'unknown') === sevFilter),
    [topCves, sevFilter]);

    const maxVulns  = Math.max(...topMachines.map(m => m.vuln_count    || 0), 1);
    const maxScore  = Math.max(...topCves.map(c => c.cvss_score || 0), 10);

    const getSyncBannerClass = () => {
        if (!syncStatus || syncStatus.status === 'idle') return '';
        if (syncStatus.status === 'error')   return 'error';
        if (syncStatus.status === 'success') return 'success';
        return 'running';
    };

    if (isLoading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
            <div className="loader" />
        </div>
    );

    const progress = parseProgress(syncStatus?.message);

    return (
        <div className="cve-page">

            {/* ── Page Header ─────────────────────────────────── */}
            <div className="page-header">
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Bug size={22} style={{ color: 'var(--status-danger)' }} />
                        CVE Vulnerability Scanner
                    </h1>
                    <p className="page-subtitle">
                        Global overview of known software vulnerabilities affecting managed machines
                    </p>
                    <div className="last-sync-label" style={{ marginTop: '6px' }}>
                        <Activity size={12} />
                        <strong>Last Database Sync:</strong>
                        {stats?.lastSync ? formatDate(stats.lastSync) : 'Never'}
                    </div>
                </div>
                <div className="flex gap-md items-center">
                    <button className="btn btn-secondary" onClick={handleGlobalExport}>
                        <Download size={16} /> Export CSV
                    </button>
                    <button className="btn btn-primary" onClick={handleSync} disabled={isSyncing}>
                        <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
                        {isSyncing ? 'Syncing…' : 'Sync Now'}
                    </button>
                </div>
            </div>

            {/* ── Summary Stats ────────────────────────────────── */}
            <div className="cve-stats-grid">
                <div className="cve-stat-card">
                    <div className="cve-stat-icon danger"><ShieldAlert size={20} /></div>
                    <div>
                        <div className="cve-stat-value" style={{ color: 'var(--status-danger)' }}>
                            {stats?.totalVulnerableMachines || 0}
                        </div>
                        <div className="cve-stat-label">Vulnerable Machines</div>
                    </div>
                </div>
                <div className="cve-stat-card">
                    <div className="cve-stat-icon warning"><AlertTriangle size={20} /></div>
                    <div>
                        <div className="cve-stat-value" style={{ color: 'var(--status-warning)' }}>
                            {sevCounts.critical}
                        </div>
                        <div className="cve-stat-label">Critical CVEs</div>
                    </div>
                </div>
                <div className="cve-stat-card">
                    <div className="cve-stat-icon info"><Bug size={20} /></div>
                    <div>
                        <div className="cve-stat-value">{totalCvesTracked}</div>
                        <div className="cve-stat-label">Total CVEs Tracked</div>
                    </div>
                </div>
                <div className="cve-stat-card">
                    <div className="cve-stat-icon primary"><Cpu size={20} /></div>
                    <div>
                        <div className="cve-stat-value">{stats?.scannedMachines ?? topMachines.length}</div>
                        <div className="cve-stat-label">Machines Scanned</div>
                    </div>
                </div>
            </div>

            {/* ── Sync Status Banner ───────────────────────────── */}
            {syncStatus && syncStatus.status !== 'idle' && (
                <div className={`sync-banner ${getSyncBannerClass()}`}>
                    <div className="sync-banner-top">
                        <div className="sync-banner-left">
                            {syncStatus.isSyncing && (
                                <RefreshCw size={18} className="spin" style={{ color: 'var(--aptiv-primary)', flexShrink: 0 }} />
                            )}
                            <div>
                                <div className="sync-banner-title">
                                    {syncStatus.isSyncing ? 'Sync in Progress' : 'Backend Sync Status'}
                                </div>
                                <div className="sync-banner-msg">{syncStatus.message}</div>
                            </div>
                        </div>
                        {syncStatus.timestamp && (
                            <div className="sync-banner-time">
                                Updated: {new Date(syncStatus.timestamp).toLocaleTimeString()}
                            </div>
                        )}
                    </div>
                    {syncStatus.isSyncing && (
                        <div className="sync-progress-track">
                            {progress !== null
                                ? <div className="sync-progress-fill" style={{ width: `${progress}%` }} />
                                : <div className="sync-progress-indeterminate" />
                            }
                        </div>
                    )}
                </div>
            )}

            {/* ── Overview: Donut + Breakdown + Machine risk ───── */}
            {totalAffectedCves > 0 && (
                <div className="cve-overview-row">

                    {/* Severity Donut */}
                    <div className="cve-card cve-donut-card">
                        <div className="cve-card-header">
                            <h3 className="cve-card-title">
                                <TrendingUp size={15} style={{ color: 'var(--aptiv-primary)' }} />
                                Severity Distribution
                            </h3>
                        </div>
                        <div className="cve-card-body donut-body">
                            <div className="donut-wrap">
                                <div
                                    className="donut-ring"
                                    style={{ background: donutGradient }}
                                />
                                <div className="donut-center">
                                    <div className="donut-total">{totalAffectedCves}</div>
                                    <div className="donut-label">CVEs</div>
                                </div>
                            </div>
                            <div className="donut-legend">
                                {SEV_ORDER.filter(s => sevCounts[s] > 0).map(s => (
                                    <div key={s} className="legend-row">
                                        <span className="legend-dot" style={{ background: SEV_COLORS[s] }} />
                                        <span className="legend-name" style={{ textTransform: 'capitalize' }}>{s}</span>
                                        <span className="legend-count">{sevCounts[s]}</span>
                                        <span className="legend-pct">
                                            {Math.round((sevCounts[s] / totalAffectedCves) * 100)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Stacked Severity Breakdown */}
                    <div className="cve-card cve-breakdown-card">
                        <div className="cve-card-header">
                            <h3 className="cve-card-title">
                                <Filter size={15} style={{ color: 'var(--aptiv-primary)' }} />
                                Severity Breakdown
                            </h3>
                        </div>
                        <div className="cve-card-body">
                            {/* Stacked bar */}
                            <div className="stacked-bar-wrap">
                                <div className="stacked-bar">
                                    {SEV_ORDER.filter(s => sevCounts[s] > 0).map(s => (
                                        <div
                                            key={s}
                                            className="stacked-segment"
                                            style={{
                                                width: `${(sevCounts[s] / totalAffectedCves) * 100}%`,
                                                background: SEV_COLORS[s],
                                            }}
                                            title={`${s}: ${sevCounts[s]}`}
                                        />
                                    ))}
                                </div>
                            </div>
                            {/* Per-severity rows with bar */}
                            <div className="breakdown-rows">
                                {SEV_ORDER.filter(s => sevCounts[s] > 0).map(s => (
                                    <div key={s} className="breakdown-row">
                                        <span className="breakdown-label" style={{ textTransform: 'capitalize' }}>{s}</span>
                                        <div className="breakdown-track">
                                            <div
                                                className="breakdown-fill"
                                                style={{
                                                    width: `${(sevCounts[s] / totalAffectedCves) * 100}%`,
                                                    background: SEV_COLORS[s],
                                                }}
                                            />
                                        </div>
                                        <span className="breakdown-count">{sevCounts[s]}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Network Risk Summary */}
                    <div className="cve-card cve-risk-card">
                        <div className="cve-card-header">
                            <h3 className="cve-card-title">
                                <ShieldAlert size={15} style={{ color: 'var(--status-danger)' }} />
                                Network Risk Summary
                            </h3>
                        </div>
                        <div className="cve-card-body risk-body">
                            {/* Coverage ring */}
                            <div className="coverage-wrap">
                                <div
                                    className="coverage-ring"
                                    style={{
                                        background: `conic-gradient(
                                            var(--status-danger) 0% ${stats?.totalVulnerableMachines && stats?.scannedMachines
                                                ? (stats.totalVulnerableMachines / stats.scannedMachines * 100).toFixed(1)
                                                : 0}%,
                                            var(--status-success) 0% 100%
                                        )`
                                    }}
                                />
                                <div className="coverage-center">
                                    <div className="coverage-pct">
                                        {stats?.scannedMachines
                                            ? Math.round((stats.totalVulnerableMachines / stats.scannedMachines) * 100)
                                            : 0}%
                                    </div>
                                    <div className="coverage-label">affected</div>
                                </div>
                            </div>
                            {/* Two stats below ring */}
                            <div className="risk-split">
                                <div className="risk-split-item ok">
                                    <CheckCircle2 size={16} />
                                    <span className="risk-split-num">
                                        {Math.max(0, (stats?.scannedMachines ?? topMachines.length) - (stats?.totalVulnerableMachines || 0))}
                                    </span>
                                    <span className="risk-split-lbl">Clean</span>
                                </div>
                                <div className="risk-split-divider" />
                                <div className="risk-split-item vuln">
                                    <XCircle size={16} />
                                    <span className="risk-split-num">{stats?.totalVulnerableMachines || 0}</span>
                                    <span className="risk-split-lbl">Affected</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Two-column: Machines + CVE table ────────────── */}
            <div className="cve-content-grid">

                {/* Most Vulnerable Machines */}
                <div className="cve-card">
                    <div className="cve-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="cve-card-title">
                                <Monitor size={15} style={{ color: 'var(--aptiv-primary)' }} />
                                Top Vulnerable Machines
                            </h3>
                            <span className="badge badge-neutral">{topMachines.length}</span>
                        </div>
                        <button 
                            className="btn btn-ghost btn-sm" 
                            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
                            onClick={() => navigate('/admin/vulnerabilities/machines')}
                        >
                            Show All
                        </button>
                    </div>
                    <div className="cve-card-body" style={{ padding: 0 }}>
                        {topMachines.length === 0 ? (
                            <div className="cve-empty">
                                <Monitor size={36} opacity={0.2} />
                                <p>No vulnerable machines found</p>
                            </div>
                        ) : (
                            <table className="cve-table">
                                <thead>
                                    <tr>
                                        <th>Machine</th>
                                        <th>Risk</th>
                                        <th title="Critical / Total">Vulns</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {topMachines.map((machine) => {
                                        const rs   = riskScore(machine.critical_count, machine.vuln_count);
                                        const rl   = riskLabel(rs);
                                        const barW = Math.round((machine.vuln_count / maxVulns) * 100);
                                        return (
                                            <tr key={machine.id}>
                                                <td>
                                                    <div className="machine-hostname">{machine.hostname}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--aptiv-gray-600)', marginTop: 2 }}>
                                                        {machine.os_name || 'Unknown OS'}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={`risk-badge ${rl.cls}`}>{rl.label}</span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        <div className="vuln-counts">
                                                            <span className="critical-count">{machine.critical_count} crit</span>
                                                            <span className="total-count">{machine.vuln_count} total</span>
                                                        </div>
                                                        <div className="vuln-bar-track">
                                                            <div className="vuln-bar-fill" style={{ width: `${barW}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <Link
                                                        to={`/admin/machines/${machine.id}`}
                                                        className="btn btn-ghost btn-sm"
                                                        style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                                                    >
                                                        <ExternalLink size={11} /> View
                                                    </Link>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Most Active CVEs */}
                <div className="cve-card">
                    <div className="cve-card-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 className="cve-card-title">
                                <TrendingUp size={15} style={{ color: 'var(--aptiv-primary)' }} />
                                Most Active CVEs
                            </h3>
                            <button 
                                className="btn btn-ghost btn-sm" 
                                style={{ fontSize: '0.72rem', padding: '4px 10px', marginLeft: 'auto' }}
                                onClick={() => navigate('/admin/vulnerabilities/cves')}
                            >
                                Show All
                            </button>
                        </div>
                        {/* Filter chips */}
                        <div className="cve-filter-chips">
                            {['all', ...SEV_ORDER.filter(s => sevCounts[s] > 0)].map(s => (
                                <button
                                    key={s}
                                    className={`cve-chip ${sevFilter === s ? 'active' : ''}`}
                                    onClick={() => {
                                        setSevFilter(s);
                                        fetchData(true, showAllMachines, showAllCves, s);
                                    }}
                                    style={sevFilter === s && s !== 'all'
                                        ? { background: SEV_COLORS[s] + '22', borderColor: SEV_COLORS[s] + '66', color: SEV_COLORS[s] }
                                        : undefined}
                                >
                                    {s === 'all' ? `All (${totalAffectedCves})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${sevCounts[s]})`}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="cve-card-body" style={{ padding: 0 }}>
                        {filteredCves.length === 0 ? (
                            <div className="cve-empty">
                                <Bug size={36} opacity={0.2} />
                                <p>No CVEs match the selected filter</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="cve-table">
                                    <thead>
                                        <tr>
                                            <th>CVE ID</th>
                                            <th>Severity</th>
                                            <th>Score</th>
                                            <th>CVSS</th>
                                            <th>PCs</th>
                                            <th>Description</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredCves.map((cve) => {
                                            const sev   = cve.severity?.toLowerCase() || 'unknown';
                                            const score = cve.cvss_score ?? 0;
                                            const barW  = Math.round((score / maxScore) * 100);
                                            return (
                                                <tr key={cve.cve_id}>
                                                    <td>
                                                        <a
                                                            href={`https://nvd.nist.gov/vuln/detail/${cve.cve_id}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="cve-id-link"
                                                        >
                                                            {cve.cve_id}
                                                            <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.4 }} />
                                                        </a>
                                                    </td>
                                                    <td>
                                                        <span
                                                            className={`badge ${SEV_BADGE[sev] || 'badge-neutral'}`}
                                                            style={{ textTransform: 'capitalize' }}
                                                        >
                                                            {cve.severity || 'Unknown'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`cvss-score ${sev}`}>
                                                            {score > 0 ? score.toFixed(1) : 'N/A'}
                                                        </span>
                                                    </td>
                                                    {/* CVSS mini bar */}
                                                    <td>
                                                        <div className="cvss-bar-wrap" title={`CVSS ${score.toFixed(1)} / 10`}>
                                                            <div className="cvss-bar-track">
                                                                <div
                                                                    className="cvss-bar-fill"
                                                                    style={{
                                                                        width: `${barW}%`,
                                                                        background: SEV_COLORS[sev] || SEV_COLORS.unknown,
                                                                    }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="affected-count">{cve.affected_machines}</span>
                                                    </td>
                                                    <td className="cve-desc" title={cve.description}>
                                                        {cve.description}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
