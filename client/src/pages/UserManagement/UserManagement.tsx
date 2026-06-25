import { useState, useEffect } from 'react';
import {
    Users,
    Plus,
    Edit,
    Trash2,
    Shield,
    X,
    Key,
    Lock,
    Unlock,
    RefreshCw
} from 'lucide-react';
import api from '../../services/api';
import type { User } from '../../types';
import { formatDate } from '../../utils/formatters';
import './UserManagement.css';

export default function UserManagement() {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        fullName: '',
        title: '',
        email: '',
        role: 'Admin' as string
    });

    // Delete Modal State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const data = await api.getUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = () => {
        setSelectedUser(null);
        setFormData({
            username: '',
            password: '',
            fullName: '',
            title: '',
            email: '',
            role: 'Admin'
        });
        setShowModal(true);
    };

    const handleEdit = (user: User) => {
        setSelectedUser(user);
        setFormData({
            username: user.username,
            password: '',
            fullName: (user as any).fullName || (user as any).full_name || '',
            title: (user as any).title || '',
            email: user.email || '',
            role: user.role
        });
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (selectedUser) {
                const updateData: any = {
                    role: formData.role,
                    email: formData.email,
                    fullName: formData.fullName,
                    title: formData.title
                };
                if (formData.password) {
                    updateData.password = formData.password;
                }
                await api.updateUser(selectedUser.id, updateData);
            } else {
                await api.createUser({
                    username: formData.username,
                    password: formData.password,
                    email: formData.email,
                    role: formData.role,
                    fullName: formData.fullName,
                    title: formData.title
                } as any);
            }
            setShowModal(false);
            fetchUsers();
        } catch (error) {
            console.error('Failed to save user:', error);
            alert('Failed to save user. Please try again.');
        }
    };

    const handleDeleteClick = (user: User) => {
        setUserToDelete(user);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!userToDelete) return;
        try {
            await api.deleteUser(userToDelete.id);
            setShowDeleteModal(false);
            setUserToDelete(null);
            fetchUsers();
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert('Failed to delete user');
        }
    };

    const handleToggleActive = async (user: User) => {
        try {
            await api.updateUser(user.id, { isActive: !user.isActive });
            fetchUsers();
        } catch (error) {
            console.error('Failed to toggle user status:', error);
        }
    };

    const handleResetPassword = (user: User) => {
        setSelectedUser(user);
        setNewPassword('');
        setShowPasswordModal(true);
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser || newPassword.length < 8) {
            alert('Password must be at least 8 characters');
            return;
        }
        try {
            await api.resetUserPassword(selectedUser.id, newPassword);
            setShowPasswordModal(false);
            alert('Password reset successfully!');
        } catch (error) {
            console.error('Failed to reset password:', error);
            alert('Failed to reset password. Please try again.');
        }
    };

    const getRoleBadge = (role: string) => {
        const badges: Record<string, { class: string; icon: React.ReactNode }> = {
            SuperAdmin: { class: 'badge-danger', icon: <Shield size={12} /> },
            Admin: { class: 'badge-warning', icon: <Key size={12} /> },
            Viewer: { class: 'badge-info', icon: null }
        };
        const badge = badges[role] || badges.Viewer;
        return (
            <span className={`badge ${badge.class}`}>
                {badge.icon} {role}
            </span>
        );
    };

    const getStatusBadge = (isActive: boolean | undefined) => {
        if (isActive === false) {
            return <span className="badge badge-danger"><Lock size={12} /> Locked</span>;
        }
        return <span className="badge badge-success"><Unlock size={12} /> Active</span>;
    };

    return (
        <div className="user-management-page">
            <div className="page-header">
                <div>
                    <h1 className="page-title">User Management</h1>
                    <p className="page-subtitle">Manage admin users and their permissions</p>
                </div>
                <button className="btn btn-primary" onClick={handleCreate}>
                    <Plus size={18} />
                    Add User
                </button>
            </div>

            {/* Users Table */}
            <div className="users-container">
                {isLoading ? (
                    <div className="loading-state">
                        <div className="loader"></div>
                    </div>
                ) : users.length === 0 ? (
                    <div className="empty-state">
                        <Users size={48} />
                        <p>No users found</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Title</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Last Active</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id} className={user.isActive === false ? 'inactive-row' : ''}>
                                        <td>
                                            <div className="user-cell">
                                                <div className="user-avatar">
                                                    {user.avatar ? (
                                                        <img src={user.avatar} alt={user.username} className="user-avatar-image-small" />
                                                    ) : (
                                                        user.username.charAt(0).toUpperCase()
                                                    )}
                                                </div>
                                                <div className="user-info-cell">
                                                    <span className="user-fullname">
                                                        {(user as any).fullName || (user as any).full_name || user.username}
                                                    </span>
                                                    <span className="user-username">@{user.username}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{(user as any).title || '-'}</td>
                                        <td>{getRoleBadge(user.role)}</td>
                                        <td>{getStatusBadge(user.isActive)}</td>
                                        <td>{user.lastLogin ? formatDate(user.lastLogin) : 'Never'}</td>
                                        <td>
                                            <div className="table-actions">
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleEdit(user)}
                                                    title="Edit User"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleResetPassword(user)}
                                                    title="Reset Password"
                                                >
                                                    <RefreshCw size={16} />
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => handleToggleActive(user)}
                                                    title={user.isActive === false ? 'Enable User' : 'Disable User'}
                                                    disabled={user.role === 'SuperAdmin'}
                                                >
                                                    {user.isActive === false ? <Unlock size={16} /> : <Lock size={16} />}
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm text-danger"
                                                    onClick={() => handleDeleteClick(user)}
                                                    disabled={user.role === 'SuperAdmin'}
                                                    title="Delete User"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{selectedUser ? 'Edit User' : 'Create User'}</h2>
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="input-label">Username *</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formData.username}
                                            onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                                            required
                                            disabled={!!selectedUser}
                                            placeholder="Enter username"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="input-label">
                                            Password {selectedUser ? '(leave blank to keep)' : '*'}
                                        </label>
                                        <input
                                            type="password"
                                            className="input"
                                            value={formData.password}
                                            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                            required={!selectedUser}
                                            placeholder="Enter password"
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="input-label">Full Name</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                                            placeholder="e.g. Hamzaoui, Issam"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="input-label">Title</label>
                                        <input
                                            type="text"
                                            className="input"
                                            value={formData.title}
                                            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                            placeholder="e.g. IT Technician"
                                        />
                                    </div>
                                </div>
                                <div className="form-row">
                                    <div className="form-group">
                                        <label className="input-label">Email</label>
                                        <input
                                            type="email"
                                            className="input"
                                            value={formData.email}
                                            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                            placeholder="user@aptiv.com"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="input-label">Role</label>
                                        <select
                                            className="input"
                                            value={formData.role}
                                            onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                                        >
                                            <option value="Viewer">Viewer</option>
                                            <option value="Admin">Admin</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {selectedUser ? 'Update' : 'Create'} User
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showPasswordModal && selectedUser && (
                <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
                    <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Reset Password</h2>
                            <button className="btn btn-ghost" onClick={() => setShowPasswordModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handlePasswordSubmit}>
                            <div className="modal-body">
                                <p className="text-muted mb-md">
                                    Reset password for <strong>{selectedUser.username}</strong>
                                </p>
                                <div className="form-group">
                                    <label className="input-label">New Password *</label>
                                    <input
                                        type="password"
                                        className="input"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        minLength={8}
                                        placeholder="Minimum 8 characters"
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-danger">
                                    <RefreshCw size={16} />
                                    Reset Password
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && userToDelete && (
                <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
                    <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Confirm Deletion</h2>
                            <button className="btn btn-ghost" onClick={() => setShowDeleteModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>Are you sure you want to delete user <strong>{userToDelete.username}</strong>?</p>
                            <p className="text-danger text-sm mt-sm">This action cannot be undone.</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={confirmDelete}>Delete User</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
