import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Radar, RefreshCw, AlertTriangle, CheckCircle, Server, Trash2, Plus, Monitor, Download } from 'lucide-react';
import api from '../../services/api';
import './Scanner.css';

interface ScanResult {
    id: string;
    ip: string;
    hostname: string | null;
    mac_address: string | null;
    open_ports: number[];
    vulnerabilities: string[];
    is_registered: boolean;
    machine_id?: string;
    scanned_at: string;
}

export default function Scanner() {
    const [cidr, setCidr] = useState('192.168.1.0/24');
    const [isScanning, setIsScanning] = useState(false);
    const [progress, setProgress] = useState({ percent: 0, currentIp: '', scannedCount: 0 });
    const [results, setResults] = useState<ScanResult[]>([]);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        fetchResults();
        // Poll for results and status every 2 seconds
        const interval = setInterval(async () => {
            fetchResults();
            const status = await api.getScanStatus();
            setIsScanning(status.isRunning);
            setProgress({
                percent: status.progress,
                currentIp: status.currentIp,
                scannedCount: status.scannedCount
            });
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    const fetchResults = async () => {
        try {
            const data = await api.getScanResults();
            setResults(data);
        } catch (err) {
            console.error('Failed to fetch scan results:', err);
        }
    };

    const handleScan = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsScanning(true);
        setError('');
        setSuccessMsg('');
        try {
            await api.scanNetwork(cidr);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to start scan');
            setIsScanning(false);
        }
    };

    const handleStop = async () => {
        try {
            await api.stopScan();
        } catch (err) {
            console.error('Failed to stop scan:', err);
        }
    };

    const handleClear = async () => {
        if (!window.confirm('Are you sure you want to clear all scan results?')) return;
        try {
            await api.clearScanResults();
            fetchResults();
            setSuccessMsg('Scan results cleared.');
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err) {
            console.error('Failed to clear results:', err);
        }
    };

    const handleAddMachine = async (result: ScanResult) => {
        try {
            await api.createMachine({
                hostname: result.hostname || `Device-${result.ip}`,
                ipAddress: result.ip,
                macAddress: result.mac_address || undefined,
                category: 'Unassigned'
            });
            setSuccessMsg(`Added ${result.ip} to inventory.`);
            setTimeout(() => setSuccessMsg(''), 3000);
            fetchResults(); // Refresh to update is_registered status
        } catch (err: any) {
            const errorMsg = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to add machine';
            setError(errorMsg);
            setTimeout(() => setError(''), 5000);
        }
    };

    const handleExportResults = () => {
        if (results.length === 0) return;

        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>Network Security Scan - ${cidr}</title>
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
                        max-width: 1400px;
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
                    .risk-badge { 
                        display: inline-block; 
                        padding: 4px 12px; 
                        border-radius: 9999px; 
                        font-size: 12px; 
                        font-weight: 600; 
                        border: 1px solid transparent; 
                        text-transform: uppercase;
                    }
                    .risk-high { background-color: rgba(255, 61, 0, 0.15); color: #ff3d00; border-color: rgba(255, 61, 0, 0.3); }
                    .risk-none { background-color: rgba(0, 200, 83, 0.15); color: #00c853; border-color: rgba(0, 200, 83, 0.3); }
                    .port-badge { background: #2a3b59; color: #aabedd; padding: 2px 8px; border-radius: 4px; margin-right: 4px; display: inline-block; margin-bottom: 4px; font-size: 12px; }
                    .status-managed { color: #00c853; font-weight: 700; }
                    .status-unregistered { color: #ffab00; font-weight: 700; }
                    .footer { padding: 20px; text-align: center; font-size: 12px; color: #576d91; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div>
                            <h1 class="title">Network Security Scan Audit</h1>
                            <div class="subtitle">Target Network: <span class="accent-text" style="font-weight: 600;">${cidr}</span></div>
                        </div>
                        <div style="text-align: right;">
                            <div class="title" style="font-size: 20px; color: #aabedd;">${results.length} Devices</div>
                            <div class="subtitle">Generated: ${new Date().toLocaleString('en-GB')}</div>
                        </div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>IP Address</th>
                                <th>MAC Address / Hostname</th>
                                <th>Services (Ports)</th>
                                <th>Security Findings</th>
                                <th>Inventory Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${results.map(r => `
                                <tr>
                                    <td style="font-weight: 700; color: #d47a26;">${r.ip}</td>
                                    <td>
                                        <div style="font-weight: 600; color: #ffffff;">${r.hostname || 'Unknown Host'}</div>
                                        <div style="font-size: 12px; color: #7e95b7; font-family: 'JetBrains Mono', monospace; margin-top: 4px;">${r.mac_address || 'N/A'}</div>
                                    </td>
                                    <td>
                                        ${r.open_ports.length > 0 
                                            ? r.open_ports.map(p => `<span class="port-badge">${p}</span>`).join('') 
                                            : '<span style="color: #576d91;">None detected</span>'}
                                    </td>
                                    <td>
                                        ${r.vulnerabilities.length > 0 
                                            ? `<div class="risk-badge risk-high">${r.vulnerabilities.length} RISKS DETECTED</div><br>
                                               <div style="margin-top: 8px;">
                                                   ${r.vulnerabilities.map(v => {
                                                       const cveMatch = v.match(/CVE-\d+-\d+/);
                                                       if (cveMatch) {
                                                           const textWithoutCve = v.replace(cveMatch[0], '').trim();
                                                           return `<div style="margin-bottom: 4px;"><a href="https://nvd.nist.gov/vuln/detail/${cveMatch[0]}" class="cve-link" target="_blank">${cveMatch[0]}</a> <span style="color: #aabedd; font-size: 13px;">${textWithoutCve}</span></div>`;
                                                       }
                                                       return `<div style="color: #ff3d00; font-size: 13px; margin-bottom: 4px;">${v}</div>`;
                                                   }).join('')}
                                               </div>` 
                                            : '<div class="risk-badge risk-none">CLEAN / NO RISKS</div>'}
                                    </td>
                                    <td>
                                        <span class="${r.is_registered ? 'status-managed' : 'status-unregistered'}">
                                            ${r.is_registered ? 'MANAGED' : 'UNREGISTERED'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
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
        link.setAttribute('download', `Network_Audit_${new Date().toISOString().split('T')[0]}.html`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="scanner-page">
            <div className="scanner-header">
                <div>
                    <h1 className="page-title flex items-center gap-3">
                        <Radar size={28} style={{ color: 'var(--aptiv-primary)' }} />
                        Network Vulnerability Scanner
                    </h1>
                    <p className="page-subtitle">Discover devices and detect security risks on your network</p>
                </div>
                {results.length > 0 && !isScanning && (
                    <div className="flex gap-sm items-center">
                        <div className="flex gap-2 mr-4 border-r pr-4 border-gray-700">
                            <button 
                                className="btn btn-primary btn-sm" 
                                onClick={handleExportResults}
                                style={{ backgroundColor: '#d47a26', borderColor: '#d47a26', color: '#ffffff' }}
                            >
                                <Download size={16} /> Download Report (.html)
                            </button>
                        </div>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={async () => {
                                if (confirm('Add all unregistered devices to inventory?')) {
                                    try {
                                        const res = await api.registerAllScanned();
                                        setSuccessMsg(res.message);
                                        fetchResults();
                                        setTimeout(() => setSuccessMsg(''), 3000);
                                    } catch (err: any) {
                                        setError(err.response?.data?.message || 'Failed to add machines');
                                    }
                                }
                            }}
                        >
                            <Plus size={16} /> Add All to Inventory
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={handleClear}>
                            <Trash2 size={16} /> Clear Results
                        </button>
                    </div>
                )}
            </div>

            {/* Scan Control Panel */}
            <div className="scanner-card">
                <form onSubmit={handleScan} className="scanner-input-group">
                    <div className="scanner-input-wrapper">
                        <label className="scanner-label">Target Network (CIDR)</label>
                        <input
                            type="text"
                            className="scanner-glass-input"
                            value={cidr}
                            onChange={(e) => setCidr(e.target.value)}
                            placeholder="e.g. 192.168.1.0/24"
                            required
                            disabled={isScanning}
                        />
                    </div>
                    {isScanning ? (
                        <button
                            type="button"
                            className="btn btn-danger h-[46px]"
                            onClick={handleStop}
                        >
                            <AlertTriangle size={20} />
                            Stop Scan
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="btn btn-success h-[46px]"
                        >
                            <Radar size={20} className="radar-btn-icon" />
                            Start Scan
                        </button>
                    )}
                </form>

                {/* Progress Bar */}
                {isScanning && (
                    <div className="scanner-progress-container">
                        <div className="scanner-progress-header">
                            <span>Scanning: <span className="text-white font-mono">{progress.currentIp || 'Initializing...'}</span></span>
                            <span style={{ color: 'var(--aptiv-primary)', fontWeight: 600 }}>{progress.percent}%</span>
                        </div>
                        <div className="scanner-progress-bar">
                            <div
                                className="scanner-progress-fill"
                                style={{ width: `${progress.percent}%` }}
                            ></div>
                        </div>
                        <div className="text-xs text-gray-400 mt-2 text-center">
                            Found <span className="text-white font-bold">{progress.scannedCount}</span> devices so far...
                        </div>
                    </div>
                )}

                {error && <div className="alert alert-danger mt-md">{error}</div>}
                {successMsg && <div className="alert alert-success mt-md">{successMsg}</div>}
            </div>

            {/* Results Table */}
            <div className="scanner-card">
                <div className="scanner-card-header">
                    <h2 className="scanner-card-title">Recent Scan Results</h2>
                    <button className="btn btn-ghost btn-sm" onClick={fetchResults}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                </div>

                <div className="scanner-table-wrapper">
                    <table className="scanner-table">
                        <thead>
                            <tr>
                                <th>Device</th>
                                <th>MAC Address</th>
                                <th>Open Ports</th>
                                <th>Vulnerabilities</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="text-center py-xl text-gray-400 border-none">
                                        No scan results yet. Start a scan to find devices.
                                    </td>
                                </tr>
                            ) : (
                                results.map((result) => (
                                    <tr key={result.id} className={!result.is_registered ? 'unregistered' : ''}>
                                        <td>
                                            <div className="flex items-center gap-sm">
                                                <Server size={18} className={!result.is_registered ? 'text-danger' : 'text-gray-400'} />
                                                <div>
                                                    <div className="font-bold flex items-center gap-xs text-white">
                                                        {result.is_registered && result.machine_id ? (
                                                            <Link to={`/admin/machines/${result.machine_id}`} className="hover:underline" style={{ color: 'var(--aptiv-primary)' }}>
                                                                {result.ip}
                                                            </Link>
                                                        ) : (
                                                            <span>{result.ip}</span>
                                                        )}
                                                        {!result.is_registered && (
                                                            <span className="badge badge-danger text-[10px] px-1 py-0 h-auto">Unregistered</span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-gray-400 mt-1">{result.hostname || 'Unknown Host'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="font-mono text-sm text-gray-300">{result.mac_address || 'Unknown'}</td>
                                        <td>
                                            <div className="flex flex-wrap gap-xs">
                                                {result.open_ports.length > 0 ? (
                                                    result.open_ports.map(port => (
                                                        <span key={port} className="scanner-port-badge">
                                                            {port}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className="text-gray-500 text-sm">None detected</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            {result.vulnerabilities.length > 0 ? (
                                                <div className="flex flex-col gap-xs">
                                                    {result.vulnerabilities.map((vuln, i) => (
                                                        <div key={i} className="flex items-center gap-xs text-danger text-sm font-medium">
                                                            <AlertTriangle size={14} className="flex-shrink-0" />
                                                            {vuln}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-xs text-success text-sm font-medium">
                                                    <CheckCircle size={14} className="flex-shrink-0" />
                                                    No obvious risks
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            {!result.is_registered ? (
                                                <button
                                                    className="btn btn-sm btn-outline-primary"
                                                    onClick={() => handleAddMachine(result)}
                                                    title="Add to Inventory"
                                                >
                                                    <Plus size={16} /> Add
                                                </button>
                                            ) : (
                                                <span className="text-success text-sm flex items-center gap-xs font-semibold">
                                                    <Monitor size={16} /> Managed
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
