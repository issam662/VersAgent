import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Calendar, AlertCircle, Plus, Check, Loader2, Edit2, Trash2, Send, MessageSquare } from 'lucide-react';
import type { Task, Subtask, TaskComment } from '../../types';
import './Tasks.css';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

interface TaskModalProps {
    task: Task;
    onClose: () => void;
    onUpdate: () => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ task, onClose, onUpdate }) => {
    const { user } = useAuth();
    const [localTask, setLocalTask] = useState<Task>(task);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    
    // Edit states
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editingTitle, setEditingTitle] = useState(task.title);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editingDescription, setEditingDescription] = useState(task.description || '');
    const [isEditingTeam, setIsEditingTeam] = useState(false);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    
    // Comments state
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [newCommentText, setNewCommentText] = useState('');
    const [isCommentsLoading, setIsCommentsLoading] = useState(false);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    // Subtask inline editing state
    const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
    const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');

    // Subtask details/comments state
    const [expandedSubtaskId, setExpandedSubtaskId] = useState<string | null>(null);
    const [subtaskComments, setSubtaskComments] = useState<Record<string, TaskComment[]>>({});
    const [isSubtaskCommentsLoading, setIsSubtaskCommentsLoading] = useState(false);
    const [newSubtaskCommentText, setNewSubtaskCommentText] = useState('');
    const [isSubmittingSubtaskComment, setIsSubmittingSubtaskComment] = useState(false);

    useEffect(() => {
        const fetchFullTaskAndComments = async () => {
            setIsLoading(true);
            setIsCommentsLoading(true);
            try {
                const response = await api.getTask(task.id);
                setLocalTask(response.task);
                
                const commentsRes = await api.getTaskComments(task.id);
                setComments(commentsRes.comments || []);
            } catch (error) {
                console.error('Failed to fetch full task or comments details', error);
            } finally {
                setIsLoading(false);
                setIsCommentsLoading(false);
            }
        };

        const fetchUsers = async () => {
            try {
                const fetchedUsers = await api.getUsers();
                setAllUsers(fetchedUsers.filter((u: any) => u.username.toLowerCase() !== 'admin'));
            } catch (err) {
                console.error('Failed to fetch users', err);
            }
        };

        fetchFullTaskAndComments();
        fetchUsers();
    }, [task.id]);

    const handleSaveTitle = async () => {
        if (!editingTitle.trim()) return;
        setLocalTask({ ...localTask, title: editingTitle.trim() });
        setIsEditingTitle(false);
        try {
            await api.updateTask(task.id, { title: editingTitle.trim() });
            onUpdate();
        } catch (error) {
            console.error('Failed to update task title', error);
        }
    };

    const handleSaveDescription = async () => {
        setLocalTask({ ...localTask, description: editingDescription });
        setIsEditingDescription(false);
        try {
            await api.updateTask(task.id, { description: editingDescription });
            onUpdate();
        } catch (error) {
            console.error('Failed to update task description', error);
        }
    };

    const toggleAssignedUser = async (userObj: any) => {
        const currentAssigned = localTask.assigned_to || [];
        const isAssigned = currentAssigned.some(u => u.user_id === userObj.id);
        
        let newAssigned;
        if (isAssigned) {
            newAssigned = currentAssigned.filter(u => u.user_id !== userObj.id);
        } else {
            newAssigned = [...currentAssigned, { user_id: userObj.id, full_name: userObj.full_name || userObj.fullName, username: userObj.username, avatar: userObj.avatar }];
        }
        
        setLocalTask({ ...localTask, assigned_to: newAssigned });
        try {
            await api.updateTask(task.id, { assigned_to: newAssigned.map(u => u.user_id) });
            onUpdate();
        } catch (error) {
            console.error('Failed to update assigned team', error);
        }
    };

    const loadSubtaskComments = async (subtaskId: string) => {
        setIsSubtaskCommentsLoading(true);
        try {
            const res = await api.getSubtaskComments(localTask.id, subtaskId);
            setSubtaskComments(prev => ({ ...prev, [subtaskId]: res.comments || [] }));
        } catch (error) {
            console.error('Failed to load subtask comments', error);
        } finally {
            setIsSubtaskCommentsLoading(false);
        }
    };

    const handleSubtaskToggleExpand = (subtaskId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (expandedSubtaskId === subtaskId) {
            setExpandedSubtaskId(null);
        } else {
            setExpandedSubtaskId(subtaskId);
            setNewSubtaskCommentText('');
            loadSubtaskComments(subtaskId);
        }
    };

    const handleAddSubtaskComment = async (subtaskId: string, e: React.FormEvent) => {
        e.preventDefault();
        if (!newSubtaskCommentText.trim()) return;

        setIsSubmittingSubtaskComment(true);
        try {
            await api.addSubtaskComment(localTask.id, subtaskId, newSubtaskCommentText.trim());
            setNewSubtaskCommentText('');
            
            // Reload subtask comments
            await loadSubtaskComments(subtaskId);
            
            // Reload full task details so comments counts update on indicators
            const response = await api.getTask(localTask.id);
            setLocalTask(response.task);
            onUpdate();
        } catch (error) {
            console.error('Failed to add subtask comment', error);
        } finally {
            setIsSubmittingSubtaskComment(false);
        }
    };

    const handleDeleteSubtaskComment = async (subtaskId: string, commentId: string) => {
        if (!window.confirm('Are you sure you want to delete this comment?')) return;
        try {
            await api.deleteTaskComment(localTask.id, commentId);
            
            // Filter out of current state
            setSubtaskComments(prev => ({
                ...prev,
                [subtaskId]: (prev[subtaskId] || []).filter(c => c.id !== commentId)
            }));

            // Reload full task details so comments counts update on indicators
            const response = await api.getTask(localTask.id);
            setLocalTask(response.task);
            onUpdate();
        } catch (error) {
            console.error('Failed to delete subtask comment', error);
        }
    };

    const toggleSubtask = async (subtask: Subtask) => {
        const updatedSubtasks = localTask.subtasks?.map(s => 
            s.id === subtask.id ? { ...s, is_completed: s.is_completed ? 0 : 1 } : s
        ) || [];
        
        const newLocalTask = { ...localTask, subtasks: updatedSubtasks };
        setLocalTask(newLocalTask);

        try {
            await api.updateTask(task.id, { subtasks: updatedSubtasks });
            onUpdate();
        } catch (error) {
            console.error('Failed to update subtask', error);
        }
    };

    const addSubtask = async () => {
        if (!newSubtaskTitle.trim()) return;

        const newSubtask: Subtask = {
            id: Date.now().toString(), // Temp ID
            task_id: task.id,
            title: newSubtaskTitle.trim(),
            is_completed: 0
        };

        const updatedSubtasks = [...(localTask.subtasks || []), newSubtask];
        setLocalTask({ ...localTask, subtasks: updatedSubtasks });
        setNewSubtaskTitle('');

        try {
            await api.updateTask(task.id, { subtasks: updatedSubtasks });
            onUpdate();
        } catch (error) {
            console.error('Failed to add subtask', error);
        }
    };

    const deleteSubtask = async (subtaskId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Avoid triggering checkbox toggle
        const updatedSubtasks = localTask.subtasks?.filter(s => s.id !== subtaskId) || [];
        setLocalTask({ ...localTask, subtasks: updatedSubtasks });

        try {
            await api.updateTask(task.id, { subtasks: updatedSubtasks });
            onUpdate();
        } catch (error) {
            console.error('Failed to delete subtask', error);
        }
    };

    const startEditingSubtask = (subtask: Subtask, e: React.MouseEvent) => {
        e.stopPropagation(); // Avoid triggering checkbox toggle
        setEditingSubtaskId(subtask.id);
        setEditingSubtaskTitle(subtask.title);
    };

    const saveSubtaskTitle = async (subtaskId: string) => {
        if (!editingSubtaskTitle.trim()) return;
        const updatedSubtasks = localTask.subtasks?.map(s => 
            s.id === subtaskId ? { ...s, title: editingSubtaskTitle.trim() } : s
        ) || [];
        setLocalTask({ ...localTask, subtasks: updatedSubtasks });
        setEditingSubtaskId(null);

        try {
            await api.updateTask(task.id, { subtasks: updatedSubtasks });
            onUpdate();
        } catch (error) {
            console.error('Failed to update subtask title', error);
        }
    };

    const updateStatus = async (status: Task['status']) => {
        setLocalTask({ ...localTask, status });
        try {
            await api.updateTask(task.id, { status });
            onUpdate();
        } catch (error) {
            console.error('Failed to update status', error);
        }
    };

    const handleAddComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newCommentText.trim()) return;

        setIsSubmittingComment(true);
        try {
            await api.addTaskComment(task.id, newCommentText.trim());
            setNewCommentText('');
            // Reload comments
            const commentsRes = await api.getTaskComments(task.id);
            setComments(commentsRes.comments || []);
        } catch (error) {
            console.error('Failed to add comment', error);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!window.confirm('Are you sure you want to delete this comment?')) return;
        try {
            await api.deleteTaskComment(task.id, commentId);
            setComments(comments.filter(c => c.id !== commentId));
        } catch (error) {
            console.error('Failed to delete comment', error);
        }
    };

    // Helper functions for avatars
    const getInitials = (name: string) => {
        if (!name) return '?';
        return name
            .split(' ')
            .map(n => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
    };

    const getAvatarColor = (username: string) => {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        const h = Math.abs(hash % 360);
        return `hsl(${h}, 60%, 40%)`;
    };

    const formatRelativeTime = (dateString: string) => {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffMins < 1) return 'just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffHours < 24) return `${diffHours}h ago`;
            if (diffDays < 7) return `${diffDays}d ago`;
            return date.toLocaleDateString();
        } catch {
            return '';
        }
    };

    return ReactDOM.createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="task-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-content">
                    <div className="task-modal-header">
                        <span className={`badge badge-${localTask.importance_level.toLowerCase()}`}>
                            {localTask.importance_level}
                        </span>
                        <div className="flex items-center gap-md">
                            <select
                                className="task-status-select"
                                value={localTask.status}
                                onChange={(e) => updateStatus(e.target.value as any)}
                            >
                                <option value="On Going">On Going</option>
                                <option value="On Hold">On Hold</option>
                                <option value="Closed">Closed</option>
                            </select>
                            <button className="modal-close" onClick={onClose}>
                                <X size={18} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>

                    {isEditingTitle ? (
                        <div className="add-subtask-row" style={{ marginBottom: '12px', padding: '10px 14px' }}>
                            <input
                                type="text"
                                className="add-subtask-input"
                                style={{ fontSize: '1.25rem', fontWeight: 700 }}
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveTitle();
                                    if (e.key === 'Escape') {
                                        setEditingTitle(localTask.title);
                                        setIsEditingTitle(false);
                                    }
                                }}
                                autoFocus
                            />
                            <button onClick={handleSaveTitle} className="add-subtask-btn" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center' }}>
                                <Check size={16} />
                            </button>
                            <button onClick={() => { setEditingTitle(localTask.title); setIsEditingTitle(false); }} className="add-subtask-btn" style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.1)', borderColor: 'rgba(255, 255, 255, 0.2)', color: 'white' }}>
                                <X size={16} />
                            </button>
                        </div>
                    ) : (
                        <h2 
                            style={{ margin: '0 0 12px', fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--aptiv-white)', lineHeight: 1.25, cursor: 'pointer' }}
                            onClick={() => setIsEditingTitle(true)}
                            title="Click to edit title"
                        >
                            {localTask.title} <Edit2 size={14} className="inline opacity-50 ml-2" />
                        </h2>
                    )}

                    <div className="metadata-chips">
                        <div className="metadata-chip">
                            <Calendar size={13} style={{ color: 'var(--aptiv-primary)' }} />
                            <span>Due: {localTask.end_date ? new Date(localTask.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date set'}</span>
                        </div>
                        <div className="metadata-chip">
                            <AlertCircle size={13} style={{ color: 'var(--aptiv-primary)' }} />
                            <span>Priority: {localTask.importance_level}</span>
                        </div>
                    </div>

                    <div className="modal-section-panel">
                        <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
                            <span className="section-label" style={{ marginBottom: 0 }}>Description</span>
                            <button 
                                className="add-subtask-btn"
                                onClick={() => {
                                    if (isEditingDescription) {
                                        handleSaveDescription();
                                    } else {
                                        setEditingDescription(localTask.description || '');
                                        setIsEditingDescription(true);
                                    }
                                }}
                            >
                                {isEditingDescription ? 'Save' : 'Edit Description'}
                            </button>
                        </div>
                        {isEditingDescription ? (
                            <div className="comment-form" style={{ marginTop: '8px' }}>
                                <textarea
                                    className="comment-textarea"
                                    style={{ maxHeight: '200px', minHeight: '80px' }}
                                    value={editingDescription}
                                    onChange={(e) => setEditingDescription(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        ) : (
                            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--aptiv-gray-300)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                                {localTask.description || 'No description provided.'}
                            </p>
                        )}
                    </div>

                    <div className="modal-section-panel">
                        <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
                            <span className="section-label" style={{ marginBottom: 0 }}>Assigned Team</span>
                            <button 
                                className="add-subtask-btn"
                                onClick={() => setIsEditingTeam(!isEditingTeam)}
                            >
                                {isEditingTeam ? 'Done' : 'Edit Team'}
                            </button>
                        </div>
                        <div className="member-selection-list">
                            {isEditingTeam ? (
                                allUsers.map(u => {
                                    const isAssigned = (localTask.assigned_to || []).some(a => a.user_id === u.id);
                                    return (
                                        <div
                                            key={u.id}
                                            className={`member-chip ${isAssigned ? 'active' : ''}`}
                                            onClick={() => toggleAssignedUser(u)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <span className="member-chip-name">{u.fullName || u.full_name || u.username}</span>
                                        </div>
                                    );
                                })
                            ) : (
                                localTask.assigned_to && localTask.assigned_to.length > 0 ? (
                                    localTask.assigned_to.map(userItem => (
                                        <div key={userItem.user_id} className="member-chip active">
                                            <span className="member-chip-name">{userItem.full_name || userItem.username}</span>
                                        </div>
                                    ))
                                ) : (
                                    <span style={{ fontSize: '0.875rem', color: 'var(--aptiv-gray-600)' }}>No team members assigned</span>
                                )
                            )}
                        </div>
                    </div>

                    <div className="modal-section-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <span className="section-label" style={{ marginBottom: 0 }}>Subtasks</span>
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '3px 10px', background: 'rgba(0,0,0,0.25)', borderRadius: '9999px', color: 'var(--aptiv-gray-500)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                {localTask.subtasks?.filter(s => s.is_completed).length ?? 0} / {localTask.subtasks?.length ?? 0} done
                            </span>
                        </div>

                        <div className="subtasks-list">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-6 text-muted gap-sm">
                                    <Loader2 size={18} className="spin text-aptiv-primary" />
                                    <span>Loading subtasks...</span>
                                </div>
                            ) : (
                                <>
                                    {localTask.subtasks?.map(subtask => (
                                        <React.Fragment key={subtask.id}>
                                            <div 
                                                className={`subtask-item ${subtask.is_completed ? 'completed' : ''}`}
                                            >
                                                <div className="flex items-center gap-md flex-1 min-w-0" onClick={() => toggleSubtask(subtask)}>
                                                    <div className={`subtask-checkbox ${subtask.is_completed ? 'checked' : ''}`}>
                                                        {subtask.is_completed ? <Check size={14} strokeWidth={4} className="text-white" /> : null}
                                                    </div>
                                                    
                                                    {editingSubtaskId === subtask.id ? (
                                                        <input
                                                            type="text"
                                                            className="flex-1 text-sm bg-black/40 border border-white/10 rounded px-2 py-1 text-white focus:outline-none focus:border-aptiv-primary"
                                                            value={editingSubtaskTitle}
                                                            onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') saveSubtaskTitle(subtask.id);
                                                                if (e.key === 'Escape') setEditingSubtaskId(null);
                                                            }}
                                                            onBlur={() => saveSubtaskTitle(subtask.id)}
                                                            autoFocus
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <span 
                                                            className="subtask-title truncate cursor-pointer"
                                                            onDoubleClick={(e) => startEditingSubtask(subtask, e)}
                                                        >
                                                            {subtask.title}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-sm">
                                                    <button 
                                                        onClick={(e) => handleSubtaskToggleExpand(subtask.id, e)}
                                                        className={`subtask-comments-indicator-btn ${expandedSubtaskId === subtask.id ? 'active' : ''}`}
                                                        title="Comments & Details"
                                                    >
                                                        <MessageSquare size={13} />
                                                        {(subtask.comments_count || 0) > 0 && (
                                                            <span className="subtask-comments-badge-num">
                                                                {subtask.comments_count}
                                                            </span>
                                                        )}
                                                    </button>

                                                    {editingSubtaskId !== subtask.id && (
                                                        <div className="subtask-actions">
                                                            <button 
                                                                onClick={(e) => startEditingSubtask(subtask, e)}
                                                                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer"
                                                                title="Edit Subtask"
                                                            >
                                                                <Edit2 size={13} />
                                                            </button>
                                                            <button 
                                                                onClick={(e) => deleteSubtask(subtask.id, e)}
                                                                className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-all cursor-pointer"
                                                                title="Delete Subtask"
                                                            >
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {expandedSubtaskId === subtask.id && (
                                                <div className="subtask-details-panel" onClick={(e) => e.stopPropagation()}>
                                                    <div className="subtask-description-section" style={{ marginBottom: '16px' }}>
                                                        <span className="subtask-description-label">Subtask Assigned To</span>
                                                        <div className="member-selection-list">
                                                            {localTask.assigned_to && localTask.assigned_to.length > 0 ? (
                                                                localTask.assigned_to.map(userItem => {
                                                                    const isAssigned = (subtask.assigned_to || []).some(a => a.user_id === userItem.user_id);
                                                                    return (
                                                                        <div
                                                                            key={userItem.user_id}
                                                                            className={`member-chip ${isAssigned ? 'active' : ''}`}
                                                                            style={{ cursor: 'pointer', zoom: 0.9 }}
                                                                            onClick={async () => {
                                                                                const currentAssigned = subtask.assigned_to || [];
                                                                                let newAssigned;
                                                                                if (isAssigned) {
                                                                                    newAssigned = currentAssigned.filter(a => a.user_id !== userItem.user_id);
                                                                                } else {
                                                                                    newAssigned = [...currentAssigned, userItem];
                                                                                }
                                                                                
                                                                                const updatedSubtasks = localTask.subtasks?.map(s => 
                                                                                    s.id === subtask.id ? { ...s, assigned_to: newAssigned } : s
                                                                                ) || [];
                                                                                
                                                                                setLocalTask(prev => ({ ...prev, subtasks: updatedSubtasks }));
                                                                                
                                                                                try {
                                                                                    await api.updateTask(localTask.id, { subtasks: updatedSubtasks });
                                                                                    onUpdate();
                                                                                } catch (error) {
                                                                                    console.error('Failed to update subtask assignment', error);
                                                                                }
                                                                            }}
                                                                        >
                                                                            <span className="member-chip-name">{userItem.full_name || userItem.username}</span>
                                                                        </div>
                                                                    );
                                                                })
                                                            ) : (
                                                                <span style={{ fontSize: '0.8rem', color: 'var(--aptiv-gray-600)' }}>Assign members to the main task first</span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="subtask-description-section">
                                                        <span className="subtask-description-label">Description</span>
                                                        <div className="comment-form" style={{ marginTop: '6px' }}>
                                                            <textarea
                                                                className="comment-textarea"
                                                                style={{ minHeight: '60px' }}
                                                                placeholder="Add a detailed description for this subtask..."
                                                                value={subtask.description || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setLocalTask(prev => ({
                                                                        ...prev,
                                                                        subtasks: prev.subtasks?.map(s => 
                                                                            s.id === subtask.id ? { ...s, description: val } : s
                                                                        )
                                                                    }));
                                                                }}
                                                                onBlur={async () => {
                                                                    try {
                                                                        await api.updateTask(localTask.id, { subtasks: localTask.subtasks });
                                                                        onUpdate();
                                                                    } catch (error) {
                                                                        console.error('Failed to update subtask description', error);
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="subtask-comments-wrapper">
                                                        <div className="subtask-comments-header">
                                                            <span className="subtask-comments-title">Comments</span>
                                                            <span className="subtask-comments-count">
                                                                {(subtaskComments[subtask.id] || []).length}
                                                            </span>
                                                        </div>

                                                        <div className="subtask-comments-list">
                                                            {isSubtaskCommentsLoading ? (
                                                                <div className="flex items-center justify-center py-4 text-muted gap-xs">
                                                                    <Loader2 size={14} className="spin text-aptiv-primary" />
                                                                    <span className="text-xs">Loading comments...</span>
                                                                </div>
                                                            ) : (subtaskComments[subtask.id] || []).length > 0 ? (
                                                                (subtaskComments[subtask.id] || []).map(comment => {
                                                                    const isAuthor = comment.user_id === user?.id;
                                                                    const isAdmin = user?.role === 'SuperAdmin' || user?.role === 'Admin';
                                                                    const showDelete = isAuthor || isAdmin;

                                                                    return (
                                                                        <div key={comment.id} className="subtask-comment-item">
                                                                            <div 
                                                                                className="subtask-comment-avatar"
                                                                                style={{ 
                                                                                    backgroundColor: comment.avatar ? 'transparent' : getAvatarColor(comment.username || 'user') 
                                                                                }}
                                                                            >
                                                                                {comment.avatar ? (
                                                                                    <img src={comment.avatar} alt={comment.full_name || comment.username} />
                                                                                ) : (
                                                                                    getInitials(comment.full_name || comment.username || 'User')
                                                                                )}
                                                                            </div>
                                                                            <div className="subtask-comment-content">
                                                                                <div className="subtask-comment-header">
                                                                                    <span className="subtask-comment-author">{comment.full_name || comment.username}</span>
                                                                                    <div className="subtask-comment-meta">
                                                                                        <span className="subtask-comment-date">{formatRelativeTime(comment.created_at)}</span>
                                                                                        {showDelete && (
                                                                                            <button 
                                                                                                className="subtask-comment-delete-btn"
                                                                                                onClick={() => handleDeleteSubtaskComment(subtask.id, comment.id)}
                                                                                                title="Delete Comment"
                                                                                            >
                                                                                                <Trash2 size={10} />
                                                                                            </button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                <p className="subtask-comment-body">{comment.content}</p>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                            ) : (
                                                                <div className="text-center py-4 text-xs text-muted">
                                                                    No comments yet.
                                                                </div>
                                                            )}
                                                        </div>

                                                        <form onSubmit={(e) => handleAddSubtaskComment(subtask.id, e)} className="subtask-comment-form">
                                                            <textarea
                                                                className="subtask-comment-textarea"
                                                                placeholder="Add a comment to this subtask..."
                                                                value={newSubtaskCommentText}
                                                                onChange={(e) => setNewSubtaskCommentText(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                                        e.preventDefault();
                                                                        handleAddSubtaskComment(subtask.id, e);
                                                                    }
                                                                }}
                                                            />
                                                            <button 
                                                                type="submit" 
                                                                className="subtask-comment-submit-btn"
                                                                disabled={isSubmittingSubtaskComment || !newSubtaskCommentText.trim()}
                                                            >
                                                                {isSubmittingSubtaskComment ? (
                                                                    <Loader2 size={12} className="spin text-white" />
                                                                ) : (
                                                                    <Send size={12} className="text-white" />
                                                                )}
                                                            </button>
                                                        </form>
                                                    </div>
                                                </div>
                                            )}
                                        </React.Fragment>
                                    ))}

                                    <div className="add-subtask-row">
                                        <Plus size={15} style={{ color: 'var(--aptiv-gray-600)', flexShrink: 0 }} />
                                        <input
                                            type="text"
                                            placeholder="Add a subtask..."
                                            className="add-subtask-input"
                                            value={newSubtaskTitle}
                                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                                        />
                                        <button className="add-subtask-btn" onClick={addSubtask} type="button">Add</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="comments-section">
                        <div className="comments-header">
                            <MessageSquare size={15} style={{ color: 'var(--aptiv-primary)' }} />
                            <span className="section-label" style={{ margin: 0, fontSize: '0.6875rem' }}>Comments</span>
                            <span className="comments-count-badge">{comments.length}</span>
                        </div>

                        <div className="comments-list">
                            {isCommentsLoading ? (
                                <div className="flex items-center justify-center py-6 text-muted gap-sm">
                                    <Loader2 size={16} className="spin text-aptiv-primary" />
                                    <span>Loading comments...</span>
                                </div>
                            ) : comments.length > 0 ? (
                                comments.map(comment => {
                                    const isAuthor = comment.user_id === user?.id;
                                    const isAdmin = user?.role === 'SuperAdmin' || user?.role === 'Admin';
                                    const showDelete = isAuthor || isAdmin;

                                    return (
                                        <div key={comment.id} className="comment-item">
                                            <div 
                                                className="comment-avatar"
                                                style={{ 
                                                    backgroundColor: comment.avatar ? 'transparent' : getAvatarColor(comment.username || 'user') 
                                                }}
                                            >
                                                {comment.avatar ? (
                                                    <img src={comment.avatar} alt={comment.full_name || comment.username} />
                                                ) : (
                                                    getInitials(comment.full_name || comment.username || 'User')
                                                )}
                                            </div>
                                            <div className="comment-content">
                                                <div className="comment-header">
                                                    <span className="comment-author">{comment.full_name || comment.username}</span>
                                                    <div className="comment-meta">
                                                        <span className="comment-date">{formatRelativeTime(comment.created_at)}</span>
                                                        {showDelete && (
                                                            <button 
                                                                className="comment-delete-btn"
                                                                onClick={() => handleDeleteComment(comment.id)}
                                                                title="Delete Comment"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="comment-body">{comment.content}</p>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-6 text-sm text-muted">
                                    No comments yet. Start the conversation!
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleAddComment} className="comment-form">
                            <textarea
                                className="comment-textarea"
                                placeholder="Write a comment..."
                                value={newCommentText}
                                onChange={(e) => setNewCommentText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddComment(e);
                                    }
                                }}
                            />
                            <button 
                                type="submit" 
                                className="comment-submit-btn"
                                disabled={isSubmittingComment || !newCommentText.trim()}
                            >
                                {isSubmittingComment ? (
                                    <Loader2 size={14} className="spin text-white" />
                                ) : (
                                    <Send size={14} className="text-white" />
                                )}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default TaskModal;
