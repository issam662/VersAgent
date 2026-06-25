import { useState, useEffect } from 'react';
import { Monitor, AlertTriangle, ShieldAlert, WifiOff, ArrowUpRight, Bug } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import './AdminDashboard.css';

interface DashboardStats {
    machines: {
        total: number;
        online: number;
        offline: number;
        intervention: number;
        temporary: number;
        unmanaged: number;
    };
    incidents: {
        open: number;
        inProgress: number;
        resolved: number;
    };
    compliance: {
        rate: number;
        trend: number;
    };
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [vulnStats, setVulnStats] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const [statsData, vulnData] = await Promise.all([
                    api.getDashboardStats(),
                    api.getVulnerabilityStats()
                ]);
                setStats(statsData as unknown as DashboardStats);
                setVulnStats(vulnData.stats);
            } catch (error) {
                console.error('Failed to fetch dashboard stats:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, []);

    if (isLoading) {
        return (
            <div className="dashboard-loading">
                <div className="loader"></div>
            </div>
        );
    }

    const onlinePercentage = stats?.machines.total
        ? Math.round(((stats.machines.online) / stats.machines.total) * 100)
        : 0;

    const complianceRate = stats?.compliance.rate ?? 0;
    let complianceStatus: 'success' | 'warning' | 'danger' = 'success';
    if (complianceRate < 10) {
        complianceStatus = 'danger';
    } else if (complianceRate < 50) {
        complianceStatus = 'warning';
    } else {
        complianceStatus = 'success';
    }

    return (
        <div className="admin-dashboard">
            <div className="page-header">
                <div className="page-header-left">
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Overview of your PC inventory and compliance status</p>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="dashboard-stats">
                <div className="stat-card-lg">
                    <div className="stat-card-header">
                        <div className="stat-icon-wrapper stat-icon-primary">
                            <Monitor size={24} />
                        </div>
                        <Link to="/admin/machines" className="stat-card-link">
                            View All <ArrowUpRight size={16} />
                        </Link>
                    </div>
                    <div className="stat-card-body">
                        <div className="stat-big-number">{stats?.machines.total || 0}</div>
                        <div className="stat-big-label">Total Machines</div>
                    </div>
                    <div className="stat-card-footer">
                        <div className="stat-mini">
                            <span className="stat-mini-value text-success">{stats?.machines.online || 0}</span>
                            <span className="stat-mini-label">Online</span>
                        </div>
                        <div className="stat-mini">
                            <span className="stat-mini-value text-danger">{stats?.machines.offline || 0}</span>
                            <span className="stat-mini-label">Offline</span>
                        </div>
                        <div className="stat-mini">
                            <span className="stat-mini-value" style={{ color: '#f97316' }}>{stats?.machines.intervention || 0}</span>
                            <span className="stat-mini-label">Intervention</span>
                        </div>
                        <div className="stat-mini">
                            <span className="stat-mini-value" style={{ color: '#9ca3af' }}>{stats?.machines.temporary || 0}</span>
                            <span className="stat-mini-label">Temp. Offline</span>
                        </div>
                    </div>
                </div>

                <div className="stat-card-lg stat-card-warning">
                    <div className="stat-card-header">
                        <div className="stat-icon-wrapper stat-icon-warning">
                            <AlertTriangle size={24} />
                        </div>
                        <Link to="/admin/incidents" className="stat-card-link">
                            View All <ArrowUpRight size={16} />
                        </Link>
                    </div>
                    <div className="stat-card-body">
                        <div className="stat-big-number">{stats?.incidents.open || 0}</div>
                        <div className="stat-big-label">Open Incidents</div>
                    </div>
                    <div className="stat-card-footer">
                        <div className="stat-mini">
                            <span className="stat-mini-value text-danger">{0}</span>
                            <span className="stat-mini-label">Critical</span>
                        </div>
                    </div>
                </div>

                <div className={`stat-card-lg stat-card-${complianceStatus}`}>
                    <div className="stat-card-header">
                        <div className={`stat-icon-wrapper stat-icon-${complianceStatus}`}>
                            <ShieldAlert size={24} />
                        </div>
                        <Link to="/admin/rules" className="stat-card-link">
                            View All <ArrowUpRight size={16} />
                        </Link>
                    </div>
                    <div className="stat-card-body">
                        <div className="stat-big-number" style={{ color: `var(--status-${complianceStatus})` }}>
                            {complianceRate}%
                        </div>
                        <div className="stat-big-label">Compliance Rate</div>
                    </div>
                </div>

                <div className="stat-card-lg stat-card-info">
                    <div className="stat-card-header">
                        <div className="stat-icon-wrapper stat-icon-info">
                            <WifiOff size={24} />
                        </div>
                    </div>
                    <div className="stat-card-body">
                        <div className="stat-big-number">{onlinePercentage}%</div>
                        <div className="stat-big-label">Online Rate</div>
                    </div>
                    <div className="stat-progress">
                        <div
                            className="stat-progress-bar"
                            style={{ width: `${onlinePercentage}%` }}
                        ></div>
                    </div>
                </div>

                <div className="stat-card-lg stat-card-danger">
                    <div className="stat-card-header">
                        <div className="stat-icon-wrapper stat-icon-danger">
                            <Bug size={24} />
                        </div>
                        <Link to="/admin/vulnerabilities" className="stat-card-link">
                            View All <ArrowUpRight size={16} />
                        </Link>
                    </div>
                    <div className="stat-card-body">
                        <div className="stat-big-number">{vulnStats?.totalVulnerableMachines || 0}</div>
                        <div className="stat-big-label">Vulnerable PCs</div>
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="dashboard-section">
                <div className="section-header">
                    <h2 className="section-title">Quick Actions</h2>
                </div>
                <div className="quick-actions">
                    <Link to="/admin/machines" className="action-card">
                        <div className="action-card-icon"><Monitor size={22} /></div>
                        <span>View All Machines</span>
                    </Link>
                    <Link to="/admin/incidents" className="action-card">
                        <div className="action-card-icon"><AlertTriangle size={22} /></div>
                        <span>Manage Incidents</span>
                    </Link>
                    <Link to="/admin/rules" className="action-card">
                        <div className="action-card-icon"><ShieldAlert size={22} /></div>
                        <span>Compliance Rules</span>
                    </Link>
                    <Link to="/admin/vulnerabilities" className="action-card">
                        <div className="action-card-icon"><Bug size={22} /></div>
                        <span>CVE Scanner</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
