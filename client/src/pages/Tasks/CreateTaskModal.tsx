import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, ListTodo, Plus } from 'lucide-react';
import type { User, TaskImportance } from '../../types';
import api from '../../services/api';
import './Tasks.css';

interface CreateTaskModalProps {
    onClose: () => void;
    onCreated: () => void;
}

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ onClose, onCreated }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [importance, setImportance] = useState<TaskImportance>('Medium');
    const [endDate, setEndDate] = useState('');
    const [subtasks, setSubtasks] = useState<{ title: string; is_completed: boolean }[]>([]);
    const [newSubtask, setNewSubtask] = useState('');
    const [users, setUsers] = useState<User[]>([]);
    const [assignedTo, setAssignedTo] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const fetchedUsers = await api.getUsers();
                setUsers(fetchedUsers.filter(u => u.username.toLowerCase() !== 'admin'));
            } catch (err) {
                console.error('Failed to fetch users', err);
            }
        };
        fetchUsers();
    }, []);

    const addSubtask = () => {
        if (!newSubtask.trim()) return;
        setSubtasks([...subtasks, { title: newSubtask, is_completed: false }]);
        setNewSubtask('');
    };

    const removeSubtask = (index: number) => setSubtasks(subtasks.filter((_, i) => i !== index));

    const toggleUser = (userId: string) => {
        setAssignedTo(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        setIsSaving(true);
        try {
            await api.createTask({
                title,
                description,
                importance_level: importance,
                end_date: endDate || null,
                assigned_to: assignedTo,
                subtasks,
            });
            onCreated();
            onClose();
        } catch (err) {
            console.error('Failed to create task', err);
        } finally {
            setIsSaving(false);
        }
    };

    return ReactDOM.createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="task-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
                <form className="modal-content" onSubmit={handleSubmit}>
                    {/* Header */}
                    <div className="task-modal-header">
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--aptiv-white)' }}>
                                Create New Task
                            </h2>
                            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--aptiv-gray-500)' }}>
                                Fill in the details below to add a new task
                            </p>
                        </div>
                        <button type="button" className="modal-close" onClick={onClose}>
                            <X size={18} strokeWidth={2.5} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {/* Title */}
                        <div className="modal-section-panel">
                            <span className="section-label">Task Title *</span>
                            <input
                                type="text"
                                className="task-form-input"
                                placeholder="What needs to be done?"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        {/* Description */}
                        <div className="modal-section-panel">
                            <span className="section-label">Description</span>
                            <textarea
                                className="task-form-input"
                                rows={3}
                                placeholder="Add more details about this task..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>

                        {/* Priority + Due Date */}
                        <div className="modal-form-grid">
                            <div className="modal-section-panel">
                                <span className="section-label">Priority</span>
                                <select
                                    className="task-form-input"
                                    value={importance}
                                    onChange={(e) => setImportance(e.target.value as TaskImportance)}
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Critical">Critical</option>
                                </select>
                            </div>
                            <div className="modal-section-panel">
                                <span className="section-label">Due Date</span>
                                <input
                                    type="date"
                                    className="task-form-input"
                                    style={{ colorScheme: 'dark' }}
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Assign Team */}
                        <div className="modal-section-panel">
                            <span className="section-label">Assign Team Members</span>
                            <div className="member-selection-list">
                                {users.map(u => (
                                    <div
                                        key={u.id}
                                        className={`member-chip ${assignedTo.includes(u.id) ? 'active' : ''}`}
                                        onClick={() => toggleUser(u.id)}
                                        title={u.fullName || u.username}
                                    >
                                        <span className="member-chip-name">{u.fullName || u.username}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Subtasks */}
                        <div className="modal-section-panel">
                            <span className="section-label">Subtasks</span>

                            <div className="add-subtask-row">
                                <Plus size={16} style={{ color: 'var(--aptiv-gray-600)', flexShrink: 0 }} />
                                <input
                                    type="text"
                                    placeholder="Add a subtask and press Enter..."
                                    className="add-subtask-input"
                                    value={newSubtask}
                                    onChange={(e) => setNewSubtask(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSubtask())}
                                />
                                <button type="button" className="add-subtask-btn" onClick={addSubtask}>Add</button>
                            </div>

                            {subtasks.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                                    {subtasks.map((s, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)',
                                                borderRadius: '8px', padding: '8px 12px', fontSize: '0.875rem',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <ListTodo size={14} style={{ color: 'var(--aptiv-primary)', flexShrink: 0 }} />
                                                <span style={{ color: 'var(--aptiv-gray-200)' }}>{s.title}</span>
                                            </div>
                                            <button
                                                type="button"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--aptiv-gray-600)', padding: '2px', borderRadius: '4px', transition: 'color 150ms', display: 'flex' }}
                                                onClick={() => removeSubtask(i)}
                                                onMouseOver={e => (e.currentTarget.style.color = 'var(--status-danger)')}
                                                onMouseOut={e => (e.currentTarget.style.color = 'var(--aptiv-gray-600)')}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ minWidth: '130px' }}>
                            {isSaving ? 'Creating...' : 'Create Task'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default CreateTaskModal;
