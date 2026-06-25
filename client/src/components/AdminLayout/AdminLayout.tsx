import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
    LayoutDashboard,
    Monitor,
    Printer,
    ShieldCheck,
    AlertTriangle,
    Newspaper,
    Users,
    FileText,
    Database,
    Settings as SettingsIcon,
    LogOut,
    X,
    Key,
    User,
    Shield,
    Radar,
    Bug,
    Map,
    CheckSquare,
    Menu,
    Mail
} from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Plasma } from '../Plasma/Plasma';
import { AvatarUpload } from '../AvatarUpload';
import { BackendStatus } from '../BackendStatus/BackendStatus';
import ChatWidget from '../ChatWidget/ChatWidget';
import { NotificationBell } from '../NotificationBell/NotificationBell';
import { useTheme } from '../../context/ThemeContext';
import './AdminLayout.css';
import { Play, Pause } from 'lucide-react';

interface NavItem {
    path: string;
    icon: React.ComponentType<{ size?: number }>;
    label: string;
    end?: boolean;
    roles?: string[];
}

const navSections: { label: string; items: NavItem[] }[] = [
    {
        label: 'Overview',
        items: [
            { path: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
        ],
    },
    {
        label: 'Monitoring',
        items: [
            { path: '/admin/machines', icon: Monitor, label: 'Machines' },
            { path: '/admin/printers', icon: Printer, label: 'Printers' },
            { path: '/admin/scanner', icon: Radar, label: 'Net Scanner' },
            { path: '/admin/vulnerabilities', icon: Bug, label: 'CVE Scanner' },
            { path: '/admin/facility-layout', icon: Map, label: 'Facility Layout' },
        ],
    },
    {
        label: 'Management',
        items: [
            { path: '/admin/incidents', icon: AlertTriangle, label: 'Incidents' },
            { path: '/admin/rules', icon: ShieldCheck, label: 'Compliance Rules' },
            { path: '/admin/tasks', icon: CheckSquare, label: 'Tasks' },
            { path: '/admin/news', icon: Newspaper, label: 'News Ticker' },
            { path: '/admin/info-page', icon: FileText, label: 'Agent Info Page', roles: ['SuperAdmin', 'Admin'] },
        ],
    },
    {
        label: 'System',
        items: [
            { path: '/admin/users', icon: Users, label: 'Users', roles: ['SuperAdmin'] },
            { path: '/admin/audit', icon: FileText, label: 'System Logs' },
            { path: '/admin/settings', icon: SettingsIcon, label: 'System Settings', roles: ['SuperAdmin', 'Admin'] },
            { path: '/admin/backup', icon: Database, label: 'Backups' },
        ],
    },
];

export default function AdminLayout() {
    const { user, logout, updateUserData } = useAuth();
    const { isAnimationPaused, toggleAnimation } = useTheme();
    const navigate = useNavigate();
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showAvatarEditor, setShowAvatarEditor] = useState(false);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({
        fullName: '',
        title: '',
        email: '',
        emailNotifications: false
    });
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 768) {
                setIsSidebarOpen(true);
            } else {
                setIsSidebarOpen(false);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const filteredNavSections = navSections.map(section => ({
        ...section,
        items: section.items.filter(item => {
            if (!item.roles) return true;
            const userRole = (user?.role || '').toLowerCase();
            return item.roles.some((role: string) => role.toLowerCase() === userRole);
        }),
    })).filter(section => section.items.length > 0);

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (passwords.new.length < 8) {
            setPasswordError('New password must be at least 8 characters');
            return;
        }
        if (passwords.new !== passwords.confirm) {
            setPasswordError('Passwords do not match');
            return;
        }

        try {
            await api.changePassword(passwords.current, passwords.new);
            setPasswordSuccess('Password changed successfully!');
            setPasswords({ current: '', new: '', confirm: '' });
            setTimeout(() => {
                setShowPasswordModal(false);
                setPasswordSuccess('');
            }, 2000);
        } catch (error: any) {
            setPasswordError(error.response?.data?.error || 'Failed to change password');
        }
    };

    const handleEditProfileInit = () => {
        setProfileForm({
            fullName: user?.fullName || user?.full_name || '',
            title: user?.title || '',
            email: user?.email || '',
            emailNotifications: user?.emailNotifications ?? (user?.email_notifications ? true : false)
        });
        setProfileError('');
        setProfileSuccess('');
        setIsEditingProfile(true);
    };

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileError('');
        setProfileSuccess('');

        try {
            const updatedUser = await api.updateProfile(profileForm);
            updateUserData(updatedUser);
            setProfileSuccess('Profile updated successfully!');
            setTimeout(() => {
                setIsEditingProfile(false);
                setProfileSuccess('');
            }, 1500);
        } catch (error: any) {
            setProfileError(error.response?.data?.error || 'Failed to update profile');
        }
    };

    const getRoleBadgeClass = (role: string) => {
        const r = role?.toLowerCase();
        if (r === 'superadmin') return 'badge-danger';
        if (r === 'admin') return 'badge-warning';
        return 'badge-info';
    };

    return (
        <div className={`admin-layout ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'} ${isAnimationPaused ? 'admin-layout-paused' : ''}`}>
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && window.innerWidth <= 768 && (
                <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
            )}
            
            {/* Mobile Header */}
            <div className="mobile-header">
                <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}>
                    <Menu size={24} />
                </button>
                <div className="sidebar-logo">
                    <div className="logo-container">
                        <img src="/versigent-shield.png" alt="VersAgent" className="logo-image" />
                        <span className="sidebar-logo-text" style={{ fontSize: '1.5rem' }}>ersAgent</span>
                    </div>
                </div>
                <div style={{ width: 24 }}></div> {/* Spacer for flex balance */}
            </div>
            {/* Sidebar */}
            <aside className="admin-sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="logo-container">
                            <img src="/versigent-shield.png" alt="VersAgent" className="logo-image" />
                            <span className="sidebar-logo-text">ersAgent</span>
                        </div>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    {filteredNavSections.map((section) => (
                        <div key={section.label}>
                            <div className="nav-section-label">{section.label}</div>
                            {section.items.map((item) => (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    end={item.end}
                                    onClick={() => {
                                        if (window.innerWidth <= 768) setIsSidebarOpen(false);
                                    }}
                                    className={({ isActive }) =>
                                        `nav-link ${isActive ? 'active' : ''}`
                                    }
                                >
                                    <item.icon size={18} />
                                    <span className="nav-label">{item.label}</span>
                                </NavLink>
                            ))}
                        </div>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <Link to="/" className="dashboard-link-btn" title="View Public Dashboard">
                        <LayoutDashboard size={18} />
                        <span>View Dashboard</span>
                    </Link>

                    <div className="footer-user-row">
                        <div
                            className="user-info clickable"
                            onClick={() => setShowProfileModal(true)}
                            title="Click to view profile"
                        >
                            <div className="user-avatar">
                                {user?.avatar ? (
                                    <img src={user.avatar} alt="Avatar" className="user-avatar-image" />
                                ) : (
                                    (user?.fullName || user?.full_name || user?.username)?.charAt(0).toUpperCase()
                                )}
                            </div>
                            <div className="user-details">
                                <span className="user-name">{user?.fullName || user?.full_name || user?.username}</span>
                                <span className="user-role">{user?.title || user?.role}</span>
                            </div>
                        </div>
                        <button className="logout-btn-small" onClick={handleLogout} title="Logout">
                            <LogOut size={18} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                <div className="admin-bg-plasma">
                    <Plasma
                        color="#f5b041"
                        speed={0.8}
                        scale={0.7}
                        opacity={0.4}
                        mouseInteractive={false}
                        isPaused={isAnimationPaused}
                    />
                </div>
                <div className="admin-status-container" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <NotificationBell />
                    <BackendStatus />
                </div>
                <div className="admin-content">
                    <Outlet />
                </div>

                {/* Animation Toggle */}
                <button
                    className="animation-toggle-btn"
                    onClick={toggleAnimation}
                    title={isAnimationPaused ? "Resume Background Animation" : "Pause Background Animation (Better Performance)"}
                >
                    {isAnimationPaused ? <Play size={20} /> : <Pause size={20} />}
                </button>
                <ChatWidget />
            </main>

            {/* Profile Modal */}
            {showProfileModal && (
                <div className="modal-overlay" onClick={() => { setShowProfileModal(false); setShowAvatarEditor(false); }}>
                    <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>My Profile</h2>
                            <button className="btn btn-ghost" onClick={() => { setShowProfileModal(false); setShowAvatarEditor(false); }}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            {showAvatarEditor ? (
                                <AvatarUpload
                                    currentAvatar={user?.avatar || undefined}
                                    fallbackLetter={(user?.fullName || user?.full_name || user?.username)?.charAt(0).toUpperCase()}
                                    onSave={async (imageData) => {
                                        try {
                                            const updatedUser = await api.updateProfile({ avatar: imageData });
                                            updateUserData(updatedUser);
                                            setShowAvatarEditor(false);
                                        } catch (error) {
                                            console.error('Failed to update avatar:', error);
                                            alert('Failed to save avatar. Please try again.');
                                        }
                                    }}
                                    onCancel={() => setShowAvatarEditor(false)}
                                />
                            ) : (
                                <>
                                    <div className="profile-header">
                                        <div
                                            className="profile-avatar-large clickable"
                                            onClick={() => setShowAvatarEditor(true)}
                                            title="Click to change avatar"
                                        >
                                            {user?.avatar ? (
                                                <img src={user.avatar} alt="Avatar" className="avatar-image" />
                                            ) : (
                                                (user?.fullName || user?.full_name || user?.username)?.charAt(0).toUpperCase()
                                            )}
                                        </div>
                                        <div className="profile-info">
                                            <h3>{user?.fullName || user?.full_name || user?.username}</h3>
                                            <p className="text-muted">@{user?.username}</p>
                                        </div>
                                    </div>

                                    <div className="profile-details">
                                        <div className="detail-row">
                                            <User size={16} />
                                            <span className="detail-label">Title:</span>
                                            <span>{user?.title || 'Not set'}</span>
                                        </div>
                                        <div className="detail-row">
                                            <Mail size={16} />
                                            <span className="detail-label">Email:</span>
                                            <span>{user?.email || 'Not set'}</span>
                                        </div>
                                        <div className="detail-row">
                                            <Shield size={16} />
                                            <span className="detail-label">Role:</span>
                                            <span className={`badge ${getRoleBadgeClass(user?.role || '')}`}>
                                                {user?.role}
                                            </span>
                                        </div>
                                    </div>

                                    {isEditingProfile ? (
                                        <form onSubmit={handleProfileSubmit} className="mt-4">
                                            {profileError && <div className="alert alert-danger">{profileError}</div>}
                                            {profileSuccess && <div className="alert alert-success">{profileSuccess}</div>}
                                            
                                            <div className="form-group">
                                                <label>Full Name</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={profileForm.fullName}
                                                    onChange={e => setProfileForm({...profileForm, fullName: e.target.value})}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Title</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={profileForm.title}
                                                    onChange={e => setProfileForm({...profileForm, title: e.target.value})}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Email Address</label>
                                                <input
                                                    type="email"
                                                    className="form-control"
                                                    value={profileForm.email}
                                                    onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                                                />
                                            </div>
                                            <div className="toggle-switch-wrapper">
                                                <label className="toggle-switch">
                                                    <input
                                                        type="checkbox"
                                                        id="emailNotifications"
                                                        checked={!!profileForm.emailNotifications}
                                                        onChange={e => setProfileForm({...profileForm, emailNotifications: e.target.checked})}
                                                    />
                                                    <span className="toggle-slider"></span>
                                                </label>
                                                <div className="toggle-label" onClick={() => setProfileForm({...profileForm, emailNotifications: !profileForm.emailNotifications})}>
                                                    <span>Receive Email Notifications</span>
                                                    <span className="toggle-label-desc">Get notified when high priority alerts occur</span>
                                                </div>
                                            </div>

                                            <div className="modal-actions" style={{ marginTop: '20px' }}>
                                                <button type="button" className="btn btn-secondary" onClick={() => setIsEditingProfile(false)}>Cancel</button>
                                                <button type="submit" className="btn btn-primary">Save Changes</button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="profile-actions">
                                            <button
                                                className="btn btn-secondary btn-block"
                                                onClick={handleEditProfileInit}
                                                style={{ marginBottom: '10px' }}
                                            >
                                                <User size={16} />
                                                Edit Profile
                                            </button>
                                            <button
                                                className="btn btn-primary btn-block"
                                                onClick={() => {
                                                    setShowProfileModal(false);
                                                    setShowAvatarEditor(false);
                                                    setShowPasswordModal(true);
                                                }}
                                            >
                                                <Key size={16} />
                                                Change Password
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div >
            )
            }

            {/* Password Change Modal */}
            {
                showPasswordModal && (
                    <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
                        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h2>Change Password</h2>
                                <button className="btn btn-ghost" onClick={() => setShowPasswordModal(false)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handlePasswordChange}>
                                <div className="modal-body">
                                    {passwordError && (
                                        <div className="alert alert-danger">{passwordError}</div>
                                    )}
                                    {passwordSuccess && (
                                        <div className="alert alert-success">{passwordSuccess}</div>
                                    )}
                                    <div className="form-group">
                                        <label className="input-label">Current Password</label>
                                        <input
                                            type="password"
                                            className="input"
                                            value={passwords.current}
                                            onChange={(e) => setPasswords(p => ({ ...p, current: e.target.value }))}
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="input-label">New Password</label>
                                        <input
                                            type="password"
                                            className="input"
                                            value={passwords.new}
                                            onChange={(e) => setPasswords(p => ({ ...p, new: e.target.value }))}
                                            required
                                            minLength={8}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="input-label">Confirm New Password</label>
                                        <input
                                            type="password"
                                            className="input"
                                            value={passwords.confirm}
                                            onChange={(e) => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary">
                                        <Key size={16} />
                                        Update Password
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
