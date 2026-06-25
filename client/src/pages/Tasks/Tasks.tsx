import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, LayoutGrid, Loader2, ClipboardList, Trash2, List } from 'lucide-react';
import type { Task } from '../../types';
import api from '../../services/api';
import TaskCard from './TaskCard';
import TaskModal from './TaskModal';
import CreateTaskModal from './CreateTaskModal';
import './Tasks.css';

type StatusFilter = 'active' | 'On Going' | 'On Hold' | 'Closed' | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'active',    label: 'Active' },
    { value: 'On Going',  label: 'Ongoing' },
    { value: 'On Hold',   label: 'On Hold' },
    { value: 'Closed',    label: 'Closed' },
    { value: 'all',       label: 'All' },
];

const Tasks: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'my' | 'team'>('team');
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [showDeleted, setShowDeleted] = useState(false);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
    const [searchParams, setSearchParams] = useSearchParams();

    const fetchTasks = async () => {
        setIsLoading(true);
        try {
            const response = await api.getTasks({ filter: activeTab, showDeleted });
            setTasks(response.tasks);
        } catch (error) {
            console.error('Failed to fetch tasks', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchTasks(); }, [activeTab, showDeleted]);

    useEffect(() => {
        const taskId = searchParams.get('taskId');
        if (taskId) {
            api.getTask(taskId).then(res => {
                if (res.task) setSelectedTask(res.task);
                searchParams.delete('taskId');
                setSearchParams(searchParams);
            }).catch(err => console.error('Failed to fetch specific task', err));
        }
    }, [searchParams, setSearchParams]);

    const filteredTasks = tasks.filter(task => {
        const matchesSearch =
            task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            task.description?.toLowerCase().includes(searchTerm.toLowerCase());

        let matchesStatus = true;
        if (statusFilter === 'active') {
            matchesStatus = task.status === 'On Going' || task.status === 'On Hold';
        } else if (statusFilter !== 'all') {
            matchesStatus = task.status === statusFilter;
        }

        return matchesSearch && matchesStatus;
    });

    const handleDeleteTask = async (id: string) => {
        if (!window.confirm('Move this task to the trash?')) return;
        try {
            await api.deleteTask(id);
            fetchTasks();
        } catch (error) {
            console.error('Failed to delete task', error);
        }
    };

    const handleRestoreTask = async (id: string) => {
        try {
            await api.restoreTask(id);
            fetchTasks();
        } catch (error) {
            console.error('Failed to restore task', error);
        }
    };

    return (
        <div className="tasks-page">
            {/* ── Header ── */}
            <header className="tasks-header">
                <div className="tasks-title">
                    <h1>Task Management</h1>
                    <p>Organize and track your team's workflow</p>
                </div>

                <div className="flex gap-md items-center flex-wrap">
                    <div className="tasks-tabs">
                        <button
                            className={`task-tab-btn ${activeTab === 'team' ? 'active' : ''}`}
                            onClick={() => setActiveTab('team')}
                        >
                            Team Tasks
                        </button>
                        <button
                            className={`task-tab-btn ${activeTab === 'my' ? 'active' : ''}`}
                            onClick={() => setActiveTab('my')}
                        >
                            My Tasks
                        </button>
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <Plus size={16} />
                        <span>New Task</span>
                    </button>
                </div>
            </header>

            {/* ── Toolbar ── */}
            <div className="tasks-toolbar">
                <div className="search-box">
                    <Search size={16} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Search tasks..."
                        className="search-input"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="toolbar-actions">
                    {/* Segmented status filter */}
                    <div className="status-filter-group">
                        {STATUS_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                className={`status-filter-btn ${statusFilter === opt.value ? 'active' : ''}`}
                                onClick={() => setStatusFilter(opt.value)}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Trash toggle */}
                    <button
                        className={`btn btn-sm ${showDeleted ? 'btn-danger-soft' : 'btn-secondary'}`}
                        onClick={() => setShowDeleted(!showDeleted)}
                        title={showDeleted ? 'Hide deleted tasks' : 'Show deleted tasks'}
                    >
                        <Trash2 size={15} />
                    </button>

                    {/* View mode toggle */}
                    <button
                        className={`btn btn-secondary btn-sm ${viewMode === 'list' ? 'active-filter' : ''}`}
                        onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                        title={viewMode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
                    >
                        {viewMode === 'grid' ? <List size={15} /> : <LayoutGrid size={15} />}
                    </button>
                </div>
            </div>

            {/* ── Trash Banner ── */}
            {showDeleted && (
                <div className="tasks-trash-banner">
                    <Trash2 size={15} />
                    <span>Showing deleted tasks — restore them to bring them back</span>
                </div>
            )}

            {/* ── Content ── */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <Loader2 size={44} className="spin text-primary mb-4" />
                    <p className="text-muted text-sm">Loading your workspace...</p>
                </div>
            ) : filteredTasks.length > 0 ? (
                <div className={viewMode === 'grid' ? 'tasks-grid' : 'tasks-list-view'}>
                    {filteredTasks.map(task => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onClick={() => !showDeleted && setSelectedTask(task)}
                            onDelete={() => handleDeleteTask(task.id)}
                            onRestore={() => handleRestoreTask(task.id)}
                            isDeleted={showDeleted}
                            variant={viewMode}
                        />
                    ))}
                </div>
            ) : (
                <div className="tasks-empty">
                    <ClipboardList size={60} className="tasks-empty-icon" />
                    <h3 className="text-xl font-semibold">
                        {showDeleted ? 'No deleted tasks' : 'No tasks found'}
                    </h3>
                    <p className="text-muted text-sm">
                        {showDeleted
                            ? 'The trash is empty.'
                            : 'Try adjusting your filters or create a new task to get started.'}
                    </p>
                </div>
            )}

            {selectedTask && (
                <TaskModal
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                    onUpdate={fetchTasks}
                />
            )}

            {showCreateModal && (
                <CreateTaskModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={fetchTasks}
                />
            )}
        </div>
    );
};

export default Tasks;
