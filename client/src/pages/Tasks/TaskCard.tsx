import React from 'react';
import { Calendar, CheckCircle2, MoreVertical, Trash2, RotateCcw } from 'lucide-react';
import type { Task } from '../../types';
import './Tasks.css';

interface TaskCardProps {
    task: Task;
    onClick: () => void;
    onDelete: () => void;
    onRestore: () => void;
    isDeleted?: boolean;
    variant?: 'grid' | 'list';
}

const AVATAR_PALETTE = [
    '#1d6fa4', '#7c3aed', '#0e7a6c', '#b45309',
    '#be185d', '#1d4ed8', '#15803d', '#a16207',
];

const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const TaskCard: React.FC<TaskCardProps> = ({
    task,
    onClick,
    onDelete,
    onRestore,
    isDeleted = false,
    variant = 'grid',
}) => {
    const [showMenu, setShowMenu] = React.useState(false);
    const menuRef = React.useRef<HTMLDivElement>(null);

    const progress = task.total_subtasks
        ? Math.round(((task.completed_subtasks ?? 0) / task.total_subtasks) * 100)
        : 0;

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return null;
        return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    const getDueDateClass = (dateStr: string | null): string => {
        if (!dateStr) return '';
        const due = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.ceil((due.getTime() - now.getTime()) / 86400000);
        if (diffDays < 0) return 'overdue';
        if (diffDays <= 3) return 'due-soon';
        return '';
    };

    const statusDotClass: Record<string, string> = {
        'On Going': 'ongoing',
        'On Hold': 'onhold',
        'Closed': 'closed',
    };

    React.useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        if (showMenu) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMenu]);

    const formattedDate = formatDate(task.end_date ?? null);
    const dueDateClass = getDueDateClass(task.end_date ?? null);

    return (
        <div
            className={`task-card importance-${task.importance_level.toLowerCase()} ${variant === 'list' ? 'list-variant' : ''} ${isDeleted ? 'task-card-deleted' : ''}`}
            style={{ zIndex: showMenu ? 50 : 1 }}
            onClick={onClick}
        >
            {/* ── Header ── */}
            <div className="task-card-header">
                <div className="task-card-badges">
                    <span className={`badge badge-${task.importance_level.toLowerCase()}`}>
                        {task.importance_level}
                    </span>
                    <span className="flex items-center gap-xs">
                        <span className={`status-dot ${statusDotClass[task.status] ?? ''}`} />
                        <span className="text-xs" style={{ color: 'var(--aptiv-gray-500)', fontSize: '0.7rem', fontWeight: 600 }}>
                            {task.status}
                        </span>
                    </span>
                </div>

                <div className="task-card-menu-wrap" ref={menuRef}>
                    <button
                        className="task-card-menu-btn"
                        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                        title="Options"
                    >
                        <MoreVertical size={15} />
                    </button>

                    {showMenu && (
                        <div className="task-card-dropdown" onClick={e => { e.preventDefault(); e.stopPropagation(); }} style={{ zIndex: 100 }}>
                            {isDeleted ? (
                                <button
                                    type="button"
                                    className="task-dropdown-item task-dropdown-item--restore"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); onRestore(); }}
                                >
                                    <RotateCcw size={14} />
                                    Restore Task
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="task-dropdown-item task-dropdown-item--delete"
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); onDelete(); }}
                                >
                                    <Trash2 size={14} />
                                    Move to Trash
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Title & Description ── */}
            <div className="task-card-title">{task.title}</div>

            {task.description && (
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--aptiv-gray-500)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {task.description}
                </p>
            )}

            {/* ── Progress ── */}
            <div className="task-progress-section">
                <div className="task-progress-text">
                    <span>Progress</span>
                    <span>{progress}%</span>
                </div>
                <div className="task-progress-container">
                    <div className="task-progress-bar" style={{ width: `${progress}%` }} />
                </div>
            </div>

            {/* ── Footer ── */}
            <div className="task-card-footer">
                {/* Avatar stack */}
                <div className="avatar-stack">
                    {task.assigned_to?.slice(0, 3).map((u) => {
                        const initials = (u.full_name || u.username)
                            .split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                        return (
                            <div
                                key={u.user_id}
                                className="avatar-stack-item"
                                style={{ background: getAvatarColor(u.username) }}
                                title={u.full_name || u.username}
                            >
                                {initials}
                            </div>
                        );
                    })}
                    {(task.assigned_to?.length ?? 0) > 3 && (
                        <div className="avatar-more">+{task.assigned_to!.length - 3}</div>
                    )}
                </div>

                <div className="task-card-meta">
                    <div className={`task-meta-item ${dueDateClass}`}>
                        <CheckCircle2 size={13} style={{ color: progress === 100 ? 'var(--status-success)' : undefined }} />
                        <span>{task.completed_subtasks}/{task.total_subtasks}</span>
                    </div>
                    {formattedDate && (
                        <div className={`task-meta-item ${dueDateClass}`}>
                            <Calendar size={13} />
                            <span>{formattedDate}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TaskCard;
