import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    ArrowLeft,
    Monitor,
    RefreshCw,
    Wifi,
    WifiOff,
    Edit,
    Trash2,
    Package,
    ShieldCheck,
    AlertTriangle,
    Clock,
    HardDrive,
    Cpu,
    MemoryStick,
    Bug,
    ChevronDown,
    ChevronRight,
    Download,
    Search
} from 'lucide-react';
import api from '../../services/api';
import type { Machine } from '../../types';
import { formatDate, formatOnlyDate, formatDepartment } from '../../utils/formatters';
import './MachineDetails.css';

type TabType = 'overview' | 'applications' | 'compliance' | 'incidents' | 'security' | 'vulnerabilities';

export default function MachineDetails() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [machine, setMachine] = useState<Machine | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [apps, setApps] = useState<any[]>([]);
    const [compliance, setCompliance] = useState<any[]>([]);
    const [vulnerabilities, setVulnerabilities] = useState<any[]>([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isScanning, setIsScanning] = useState(false);
    const [expandedVulnGroups, setExpandedVulnGroups] = useState<Record<string, boolean>>({});
    
    // Block PC feature state
    const [isActive, setIsActive] = useState(true);
    const [isTogglingBlock, setIsTogglingBlock] = useState(false);
    const [appSearchTerm, setAppSearchTerm] = useState('');

    const groupedVulnerabilities = Object.values(vulnerabilities.reduce((acc: any, v: any) => {
        const key = `${v.app_name}::${v.app_version}`;
        if (!acc[key]) {
            acc[key] = {
                app_name: v.app_name,
                app_version: v.app_version,
                cves: [],
                highest_score: 0,
                highest_severity: 'LOW',
            };
        }
        acc[key].cves.push(v);
        if ((v.cvss_score || 0) > acc[key].highest_score) {
            acc[key].highest_score = v.cvss_score || 0;
            acc[key].highest_severity = v.severity || 'UNKNOWN';
        }
        return acc;
    }, {})).sort((a: any, b: any) => b.highest_score - a.highest_score);

    const toggleVulnGroup = (key: string) => {
        setExpandedVulnGroups(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleExportVulnerabilities = () => {
        if (!vulnerabilities || vulnerabilities.length === 0) return;

        const getSeverityStyles = (sev: string) => {
            const s = (sev || '').toLowerCase();
            if (s.includes('critical')) return { bg: 'rgba(255, 61, 0, 0.15)', text: '#ff3d00', border: 'rgba(255, 61, 0, 0.3)' };
            if (s.includes('high')) return { bg: 'rgba(255, 140, 0, 0.15)', text: '#ff8c00', border: 'rgba(255, 140, 0, 0.3)' };
            if (s.includes('medium')) return { bg: 'rgba(255, 171, 0, 0.15)', text: '#ffab00', border: 'rgba(255, 171, 0, 0.3)' };
            if (s.includes('low')) return { bg: 'rgba(0, 200, 83, 0.15)', text: '#00c853', border: 'rgba(0, 200, 83, 0.3)' };
            return { bg: '#2a3b59', text: '#aabedd', border: '#3b4e6d' };
        };

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Security Audit - ${machine?.hostname}</title>
                <style>
                    body { 
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                        background: linear-gradient(135deg, #0d1521 0%, #162235 100%); 
                        color: #ffffff; 
                        padding: 40px; 
                        min-height: 100vh;
                        margin: 0;
                    }
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        background: linear-gradient(145deg, #1e2d46 0%, #162235 100%);
                        border: 1px solid #2a3b59;
                        border-radius: 12px;
                        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
                        overflow: hidden;
                    }
                    .header {
                        padding: 30px;
                        border-bottom: 1px solid #2a3b59;
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                    }
                    .title { font-size: 24px; font-weight: 600; color: #ffffff; margin: 0 0 8px 0; }
                    .subtitle { font-size: 14px; color: #7e95b7; }
                    .accent-text { color: #d47a26; }
                    table { border-collapse: collapse; width: 100%; text-align: left; }
                    th { 
                        background: #1e2d46; 
                        color: #aabedd; 
                        padding: 16px 20px; 
                        font-size: 12px; 
                        text-transform: uppercase; 
                        letter-spacing: 0.05em; 
                        border-bottom: 1px solid #2a3b59;
                    }
                    td { 
                        padding: 16px 20px; 
                        border-bottom: 1px solid #2a3b59; 
                        font-size: 14px;
                        vertical-align: top;
                    }
                    tr:hover td { background: #1e2d46; }
                    .cve-link { color: #d47a26; text-decoration: none; font-weight: 600; font-family: 'JetBrains Mono', monospace; transition: color 0.2s; }
                    .cve-link:hover { color: #ea9341; text-decoration: underline; }
                    .badge { 
                        display: inline-block; 
                        padding: 4px 12px; 
                        border-radius: 9999px; 
                        font-size: 12px; 
                        font-weight: 600; 
                        border: 1px solid transparent; 
                        text-transform: uppercase;
                    }
                    .footer {
                        padding: 20px;
                        text-align: center;
                        font-size: 12px;
                        color: #576d91;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div>
                            <h1 class="title">Security Vulnerability Audit</h1>
                            <div class="subtitle">Target Machine: <span class="accent-text" style="font-weight: 600;">${machine?.hostname}</span> (${machine?.ipAddress || machine?.lastKnownIp || 'N/A'})</div>
                        </div>
                        <div style="text-align: right;">
                            <div class="title" style="font-size: 20px; color: #ff3d00;">${vulnerabilities.length} Risks</div>
                            <div class="subtitle">Generated: ${new Date().toLocaleString('en-GB')}</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>CVE Reference</th>
                                <th>Target Application</th>
                                <th>Severity</th>
                                <th>CVSS</th>
                                <th>Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vulnerabilities.map(v => {
                                const styles = getSeverityStyles(v.severity);
                                return `
                                    <tr>
                                        <td style="width: 150px;">
                                            <a href="https://nvd.nist.gov/vuln/detail/${v.cve_id}" class="cve-link" target="_blank">
                                                ${v.cve_id}
                                            </a>
                                        </td>
                                        <td style="width: 200px;">
                                            <div style="font-weight: 600; color: #ffffff;">${v.app_name}</div>
                                            <div style="font-size: 12px; color: #7e95b7; margin-top: 4px;">v${v.app_version}</div>
                                        </td>
                                        <td style="width: 120px;">
                                            <div class="badge" style="background-color: ${styles.bg}; color: ${styles.text}; border-color: ${styles.border};">
                                                ${v.severity || 'UNKNOWN'}
                                            </div>
                                        </td>
                                        <td style="width: 80px; font-weight: 700; color: #aabedd;">
                                            ${v.cvss_score || 'N/A'}
                                        </td>
                                        <td style="color: #aabedd; font-size: 13px; line-height: 1.5;">
                                            ${v.description || 'No description provided.'}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                    <div class="footer">
                        VersAgent Security Infrastructure &copy; ${new Date().getFullYear()}
                    </div>
                </div>
            </body>
            </html>
        `;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Security_Audit_${machine?.hostname}_${new Date().toISOString().split('T')[0]}.html`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    useEffect(() => {
        fetchMachine();
    }, [id]);

    useEffect(() => {
        if (machine && activeTab === 'applications') {
            fetchApps();
        } else if (machine && activeTab === 'compliance') {
            fetchCompliance();
        } else if (machine && activeTab === 'vulnerabilities') {
            fetchVulnerabilities();
        }
    }, [activeTab, machine]);

    const fetchMachine = async () => {
        if (!id) return;
        setIsLoading(true);
        try {
            const data = await api.getMachine(id);
            setMachine(data);
            setIsActive((data as any).active !== undefined ? (data as any).active : true);
        } catch (error) {
            console.error('Failed to fetch machine:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchApps = async () => {
        if (!id) return;
        try {
            const data = await api.getMachineApps(id);
            setApps(data.apps || []);
        } catch (error) {
            console.error('Failed to fetch apps:', error);
        }
    };

    const fetchCompliance = async () => {
        if (!id) return;
        try {
            const data = await api.getMachineCompliance(id);
            setCompliance(data.violations || []);
        } catch (error) {
            console.error('Failed to fetch compliance:', error);
        }
    };

    const fetchVulnerabilities = async () => {
        if (!id) return;
        try {
            const data = await api.getMachineVulnerabilities(id);
            setVulnerabilities(data);
        } catch (error) {
            console.error('Failed to fetch vulnerabilities:', error);
        }
    };

    const handleRefresh = async () => {
        if (!id) return;
        setIsRefreshing(true);
        try {
            await api.refreshMachine(id);
            await fetchMachine();
        } catch (error) {
            console.error('Failed to refresh machine:', error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const handleDelete = async () => {
        if (!id || !confirm('Are you sure you want to delete this machine?')) return;
        try {
            await api.deleteMachine(id);
            navigate('/admin/machines');
        } catch (error) {
            console.error('Failed to delete machine:', error);
        }
    };

    const handleToggleBlock = async () => {
        if (!id) return;
        
        const willBlock = isActive;
        let reason = '';
        if (willBlock) {
            const result = prompt('WARNING: This will instantly lock this PC with a red screen and restrict all user input. \n\nEnter a custom message to display on the physical screen (optional):', 'This PC is currently blocked. Please contact the IT department.');
            if (result === null) return; // User cancelled
            reason = result;
        } else {
            if (!confirm('Are you sure you want to unlock this machine and restore access?')) return;
        }

        setIsTogglingBlock(true);
        try {
            await api.setMachineBlockStatus(id, !willBlock, reason);
            setIsActive(!willBlock);
        } catch (error) {
            console.error('Failed to toggle block status:', error);
            alert('Failed to change block status.');
        } finally {
            setIsTogglingBlock(false);
        }
    };

    if (isLoading) {
        return (
            <div className="machine-details-loading">
                <div className="loader"></div>
            </div>
        );
    }

    if (!machine) {
        return (
            <div className="machine-not-found">
                <Monitor size={48} />
                <h2>Machine Not Found</h2>
                <p>The machine you're looking for doesn't exist.</p>
                <Link to="/admin/machines" className="btn btn-primary">
                    Back to Machines
                </Link>
            </div>
        );
    }

    return (
        <div className="machine-details">
            {/* Header */}
            <div className="details-header">
                <div className="header-left">
                    <button className="btn btn-ghost" onClick={() => navigate(-1)}>
                        <ArrowLeft size={20} />
                    </button>
                    <div className="machine-title">
                        <h1>{machine.hostname}</h1>
                        <span className={`status-badge status-${machine.status}`}>
                            {machine.status === 'online' ? <Wifi size={14} /> : <WifiOff size={14} />}
                            {machine.status}
                        </span>
                    </div>
                </div>
                <div className="header-actions">

                    {(machine.isManaged === true || machine.is_managed === true || (machine as any).is_managed === 1) && (
                        isActive ? (
                            <button 
                                className="btn btn-danger" 
                                onClick={handleToggleBlock} 
                                disabled={isTogglingBlock}
                            >
                                🛑 {isTogglingBlock ? 'Blocking...' : 'Block PC'}
                            </button>
                        ) : (
                            <button 
                                className="btn btn-success" 
                                onClick={handleToggleBlock} 
                                disabled={isTogglingBlock}
                                style={{ backgroundColor: '#22c55e', color: 'white' }}
                            >
                                🔓 {isTogglingBlock ? 'Unlocking...' : 'Unlock PC'}
                            </button>
                        )
                    )}
                    <button
                        className="btn btn-secondary"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                    >
                        <RefreshCw size={18} className={isRefreshing ? 'spin' : ''} />
                        Refresh
                    </button>
                    <Link to={`/admin/machines/${id}/edit`} className="btn btn-secondary">
                        <Edit size={18} />
                        Edit
                    </Link>
                    <button className="btn btn-danger" onClick={handleDelete}>
                        <Trash2 size={18} />
                        Delete
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="details-tabs">
                <button
                    className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setActiveTab('overview')}
                >
                    <Monitor size={18} />
                    Overview
                </button>
                <button
                    className={`tab ${activeTab === 'applications' ? 'active' : ''}`}
                    onClick={() => setActiveTab('applications')}
                >
                    <Package size={18} />
                    Applications
                </button>
                <button
                    className={`tab ${activeTab === 'compliance' ? 'active' : ''}`}
                    onClick={() => setActiveTab('compliance')}
                >
                    <ShieldCheck size={18} />
                    Compliance
                </button>
                <button
                    className={`tab ${activeTab === 'incidents' ? 'active' : ''}`}
                    onClick={() => setActiveTab('incidents')}
                >
                    <AlertTriangle size={18} />
                    Incidents
                </button>
                <button
                    className={`tab ${activeTab === 'security' ? 'active' : ''}`}
                    onClick={() => setActiveTab('security')}
                >
                    <ShieldCheck size={18} />
                    Security
                </button>
                <button
                    className={`tab ${activeTab === 'vulnerabilities' ? 'active' : ''}`}
                    onClick={() => setActiveTab('vulnerabilities')}
                >
                    <Bug size={18} />
                    Software Vulnerabilities
                </button>
            </div>

            {/* Tab Content */}
            <div className="details-content">
                {activeTab === 'security' && (
                    <div className="security-view">
                        <div className="card mb-lg">
                            <div className="card-header flex justify-between items-center">
                                <h3>Network Vulnerability Scan</h3>
                                <button
                                    className="btn btn-primary btn-sm"
                                    disabled={!machine.ipAddress || isScanning}
                                    title={!machine.ipAddress ? 'IP Address required to scan' : 'Start Scan'}
                                    onClick={async () => {
                                        if (!machine.ipAddress) return;
                                        if (!confirm(`Start vulnerability scan for ${machine.ipAddress}?`)) return;
                                        setIsScanning(true);
                                        try {
                                            // Artificial delay to ensure UX feedback is visible
                                            await new Promise(r => setTimeout(r, 500));

                                            const result = await api.scanNetwork(machine.ipAddress);
                                            console.log('Scan result:', result);

                                            if (result.found === false) {
                                                alert('Scan complete. Host unreachable.');
                                            }
                                            await fetchMachine();
                                        } catch (e) {
                                            console.error(e);
                                            alert('Failed to scan machine');
                                        } finally {
                                            setIsScanning(false);
                                        }
                                    }}
                                >
                                    <Monitor size={16} className={isScanning ? 'spin' : ''} />
                                    {isScanning ? 'Scanning...' : 'Scan Now'}
                                </button>
                            </div>

                            {!machine.lastScan ? (
                                <div className="p-md text-center text-muted">
                                    <p>No scan data available for this machine.</p>
                                    <p className="text-sm">Click "Scan Now" to check for vulnerabilities.</p>
                                </div>
                            ) : (
                                <div className="scan-results p-md">
                                    <div className="flex gap-md mb-md text-sm text-gray-500">
                                        <span>Last Scanned: {formatDate(machine.lastScan.scanned_at)}</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-md">
                                        <div>
                                            <h4 className="text-sm font-bold uppercase text-gray-500 mb-sm">Open Ports</h4>
                                            <div className="flex flex-wrap gap-xs">
                                                {machine.lastScan.open_ports?.length > 0 ? (
                                                    machine.lastScan.open_ports.map((p: any) => (
                                                        <span key={p} className="badge badge-neutral">{p}</span>
                                                    ))
                                                ) : <span className="text-sm text-muted">No open ports detected</span>}
                                            </div>
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold uppercase text-gray-500 mb-sm">Vulnerabilities</h4>
                                            {machine.lastScan.vulnerabilities?.length > 0 ? (
                                                <div className="flex flex-col gap-xs">
                                                    {machine.lastScan.vulnerabilities.map((v: any, i: number) => (
                                                        <div key={i} className="flex items-center gap-xs text-danger text-sm">
                                                            <AlertTriangle size={14} /> {v}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : <span className="text-sm text-success flex items-center gap-xs"><ShieldCheck size={14} /> No obvious risks</span>}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {activeTab === 'overview' && (
                    <div className="overview-grid">
                        <div className="info-card">
                            <h3>System Information</h3>
                            <div className="info-rows">
                                <div className="info-row">
                                    <span className="info-label">Serial Number</span>
                                    <span className="info-value">{machine.serial_number || 'N/A'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Hostname</span>
                                    <span className="info-value">{machine.hostname}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">MAC Address</span>
                                    <span className="info-value font-mono">{machine.macAddress}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">IP Address</span>
                                    <span className="info-value font-mono">{machine.lastKnownIp || machine.ipAddress || 'N/A'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Operating System</span>
                                    <span className="info-value">{machine.operatingSystem || 'Unknown'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Current User</span>
                                    <span className="info-value">{machine.currentUser || machine.current_user || 'Unknown'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Category</span>
                                    <span className={`badge badge-${machine.category === 'shopfloor' || machine.category === 'Shopfloor' ? 'info' : machine.category === 'Unassigned' ? 'neutral' : 'warning'}`}>
                                        {machine.category || 'Unassigned'}
                                    </span>
                                </div>
                                {(machine.category === 'User' || machine.category === 'Shopfloor' || machine.category === 'Kiosk') && machine.location && (
                                    <div className="info-row">
                                        <span className="info-label">Location</span>
                                        <span className="info-value">{machine.location}</span>
                                    </div>
                                )}
                                {machine.category === 'User' && machine.department && (
                                    <div className="info-row">
                                        <span className="info-label">Department</span>
                                        <span className="info-value">{formatDepartment(machine.department)}</span>
                                    </div>
                                )}
                                {machine.category === 'Shopfloor' && machine.family && (
                                    <div className="info-row">
                                        <span className="info-label">Family</span>
                                        <span className="info-value">{machine.family}</span>
                                    </div>
                                )}
                                <div className="info-row">
                                    <span className="info-label">Managed</span>
                                    <span className={`badge ${machine.isManaged ? 'badge-success' : 'badge-neutral'}`}>
                                        {machine.isManaged ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="info-card">
                            <h3>Network Topology</h3>
                            <div className="info-rows">
                                <div className="info-row">
                                    <span className="info-label">Switch Name</span>
                                    <span className="info-value">{machine.switch_name || 'N/A'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Switch Port</span>
                                    <span className="info-value font-mono">{machine.switch_port || 'N/A'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Switch IP</span>
                                    <span className="info-value font-mono">{machine.switch_ip || 'N/A'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Platform</span>
                                    <span className="info-value text-sm">{machine.switch_platform || 'N/A'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">VLAN ID</span>
                                    <span className="info-value">{machine.vlan_id || 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="info-card">
                            <h3>Hardware Details</h3>
                            <div className="info-rows">
                                <div className="info-row">
                                    <span className="info-label"><Cpu size={16} /> CPU</span>
                                    <span className="info-value">{machine.cpu || 'Unknown'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label"><MemoryStick size={16} /> RAM</span>
                                    <span className="info-value">{machine.ramGb ? `${machine.ramGb} GB` : 'Unknown'}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label"><HardDrive size={16} /> Disk</span>
                                    <span className="info-value">{machine.diskGb ? `${machine.diskGb} GB` : 'Unknown'}</span>
                                </div>
                            </div>
                        </div>

                        <div className="info-card">
                            <h3>Status & Timestamps</h3>
                            <div className="info-rows">
                                <div className="info-row">
                                    <span className="info-label"><Clock size={16} /> Last Heartbeat</span>
                                    <span className="info-value">
                                        {formatDate(machine.lastHeartbeat)}
                                    </span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Created</span>
                                    <span className="info-value">
                                        {formatDate(machine.createdAt)}
                                    </span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Updated</span>
                                    <span className="info-value">
                                        {formatDate(machine.updatedAt)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {machine.notes && (
                            <div className="info-card full-width">
                                <h3>Notes</h3>
                                <p className="notes-content">{machine.notes}</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'applications' && (() => {
                    const filteredApps = apps.filter(app => 
                        app.name.toLowerCase().includes(appSearchTerm.toLowerCase()) ||
                        (app.publisher && app.publisher.toLowerCase().includes(appSearchTerm.toLowerCase())) ||
                        (app.version && app.version.toLowerCase().includes(appSearchTerm.toLowerCase()))
                    );

                    return (
                    <div className="apps-list">
                        <div className="apps-toolbar">
                            <div className="search-box">
                                <Search size={18} className="search-icon" />
                                <input
                                    type="text"
                                    className="input search-input"
                                    placeholder="Search applications by name, publisher or version..."
                                    value={appSearchTerm}
                                    onChange={(e) => setAppSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>

                        {apps.length === 0 ? (
                            <div className="empty-state">
                                <Package size={48} />
                                <p>No applications data available</p>
                            </div>
                        ) : filteredApps.length === 0 ? (
                            <div className="empty-state">
                                <Search size={48} />
                                <p>No applications match your search</p>
                            </div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Application Name</th>
                                        <th>Version</th>
                                        <th>Publisher</th>
                                        <th>Install Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredApps.map((app, index) => {
                                        return (
                                            <tr key={index}>
                                                <td>{app.name}</td>
                                                <td>{app.version}</td>
                                                <td>{app.publisher || '-'}</td>
                                                <td>{formatOnlyDate(app.installDate)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                    );
                })()}

                {activeTab === 'compliance' && (
                    <div className="compliance-list">
                        {compliance.length === 0 ? (
                            <div className="empty-state success">
                                <ShieldCheck size={48} />
                                <p>No compliance violations</p>
                            </div>
                        ) : (
                            <div className="violations-list">
                                {compliance.map((violation, index) => (
                                    <div key={index} className="violation-card">
                                        <div className="violation-header">
                                            <span className={`badge badge-${violation.severity}`}>
                                                {violation.severity}
                                            </span>
                                            <span className="violation-rule">{violation.ruleName}</span>
                                        </div>
                                        <p className="violation-description">{violation.description}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'vulnerabilities' && (
                    <div className="vulnerabilities-list">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">Detected Vulnerabilities</h3>
                            {vulnerabilities.length > 0 && (
                                <div className="flex gap-2">
                                    <button 
                                        className="btn btn-primary btn-sm" 
                                        onClick={handleExportVulnerabilities}
                                        style={{ backgroundColor: '#d47a26', borderColor: '#d47a26', color: '#ffffff' }}
                                    >
                                        <Download size={16} /> Download Report (.html)
                                    </button>
                                </div>
                            )}
                        </div>
                        {vulnerabilities.length === 0 ? (
                            <div className="empty-state success">
                                <ShieldCheck size={48} />
                                <p>No known software vulnerabilities</p>
                            </div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}></th>
                                        <th>Application</th>
                                        <th>Vulnerabilities</th>
                                        <th>Max Severity</th>
                                        <th>Max Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(groupedVulnerabilities as any[]).map((group, index) => {
                                        const groupKey = `${group.app_name}::${group.app_version}`;
                                        const isExpanded = expandedVulnGroups[groupKey];
                                        return (
                                            <React.Fragment key={index}>
                                                <tr className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => toggleVulnGroup(groupKey)}>
                                                    <td className="w-10">
                                                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                                    </td>
                                                    <td>
                                                        <div className="font-medium truncate" style={{ maxWidth: '300px' }} title={group.app_name}>{group.app_name}</div>
                                                        <div className="text-xs text-muted">Version: {group.app_version}</div>
                                                    </td>
                                                    <td>
                                                        <span className="badge badge-info">{group.cves.length} CVEs</span>
                                                    </td>
                                                    <td>
                                                        <span className={`badge badge-${group.highest_severity?.toLowerCase() === 'critical' ? 'danger'
                                                            : group.highest_severity?.toLowerCase() === 'high' ? 'warning'
                                                                : group.highest_severity?.toLowerCase() === 'medium' ? 'warning'
                                                                    : 'info'
                                                            }`}>
                                                            {group.highest_severity}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="flex items-center gap-xs">
                                                            <div className="w-16 bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                                                                <div className={`h-1.5 rounded-full ${group.highest_score >= 9.0 ? 'bg-red-500'
                                                                    : group.highest_score >= 7.0 ? 'bg-orange-500'
                                                                        : group.highest_score >= 4.0 ? 'bg-yellow-500'
                                                                            : 'bg-green-500'
                                                                    }`} style={{ width: `${(group.highest_score / 10) * 100}%` }}></div>
                                                            </div>
                                                            <span className="text-xs font-mono">{group.highest_score.toFixed(1)}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && group.cves.map((v: any, vIndex: number) => (
                                                    <tr key={`${index}-${vIndex}`} className="bg-gray-50/50 dark:bg-gray-900/50">
                                                        <td></td>
                                                        <td colSpan={4}>
                                                            <div className="flex flex-col gap-2 py-2">
                                                                <div className="flex items-center gap-3">
                                                                    <a href={`https://nvd.nist.gov/vuln/detail/${v.cve_id}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline font-mono font-bold">
                                                                        {v.cve_id}
                                                                    </a>
                                                                    <span className={`badge badge-${v.severity?.toLowerCase() === 'critical' ? 'danger'
                                                                        : v.severity?.toLowerCase() === 'high' ? 'warning'
                                                                            : v.severity?.toLowerCase() === 'medium' ? 'warning'
                                                                                : 'info'
                                                                        }`}>
                                                                        {v.severity || 'UNKNOWN'} ({v.cvss_score?.toFixed(1) || 'N/A'})
                                                                    </span>
                                                                    <span className="text-xs text-muted ml-auto mr-4">
                                                                        Published: {formatOnlyDate(v.published_date)}
                                                                    </span>
                                                                </div>
                                                                {v.description && (
                                                                    <p className="text-sm text-gray-700 dark:text-gray-300 pr-4 mt-1">
                                                                        {v.description}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === 'incidents' && (
                    <div className="incidents-list">
                        <div className="empty-state">
                            <AlertTriangle size={48} />
                            <p>No incidents linked to this machine</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
