import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCircle, AlertTriangle, Info, X } from 'lucide-react';
import api from '../../services/api';
import './NotificationBell.css';

export const NotificationBell: React.FC = () => {
    const [unreadCount, setUnreadCount] = useState(0);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const fetchUnreadCount = async () => {
        try {
            const countData = await api.getUnreadAlertsCount();
            setUnreadCount(countData.count);
        } catch (error) {
            console.error('Failed to fetch unread count:', error);
        }
    };

    const fetchInitialAlerts = async () => {
        try {
            const alertsData = await api.getAlerts(15, 0);
            setAlerts(alertsData.alerts);
            setHasMore(alertsData.alerts.length === 15);
        } catch (error) {
            console.error('Failed to fetch initial alerts:', error);
        }
    };

    const loadMoreAlerts = async () => {
        try {
            const alertsData = await api.getAlerts(15, alerts.length);
            setAlerts(prev => [...prev, ...alertsData.alerts]);
            setHasMore(alertsData.alerts.length === 15);
        } catch (error) {
            console.error('Failed to load more alerts:', error);
        }
    };

    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchInitialAlerts();
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const handleNotificationClick = async (alert: any) => {
        if (!alert.is_read) {
            try {
                await api.markAlertRead(alert.id);
                // Functional update to avoid dependencies issues if alerts change quickly
                setAlerts(prevAlerts => prevAlerts.map(a => a.id === alert.id ? { ...a, is_read: 1 } : a));
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (error) {
                console.error('Failed to mark alert as read', error);
            }
        }
        
        let linkToNav = alert.link;
        
        // Fallback for older task assignment notifications that have a null link
        if (!linkToNav && alert.alert_type === 'task_assignment') {
            linkToNav = '/admin/tasks';
        }

        // Always close the dropdown when clicking a notification
        setIsOpen(false);

        if (linkToNav) {
            if (linkToNav.startsWith('/tasks/')) {
                const taskId = linkToNav.split('/tasks/')[1];
                linkToNav = `/admin/tasks?taskId=${taskId}`;
            }
            navigate(linkToNav);
        }
    };

    const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.markAlertRead(id);
            setAlerts(alerts.map(a => a.id === id ? { ...a, is_read: 1 } : a));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark alert as read', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await api.markAllAlertsRead();
            setAlerts(alerts.map(a => ({ ...a, is_read: 1 })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read', error);
        }
    };

    const getIconForAlert = (severity: string, type: string) => {
        if (type === 'task_deadline') return <CheckCircle className="alert-icon text-warning" size={16} />;
        if (severity === 'critical' || severity === 'error') return <AlertTriangle className="alert-icon text-danger" size={16} />;
        if (severity === 'warning') return <AlertTriangle className="alert-icon text-warning" size={16} />;
        return <Info className="alert-icon text-info" size={16} />;
    };

    const toggleDropdown = () => setIsOpen(!isOpen);

    return (
        <div className="notification-bell-container" ref={dropdownRef}>
            <button className="notification-bell-btn" onClick={toggleDropdown} title="Notifications">
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Notifications</h3>
                        <div className="notification-actions">
                            {unreadCount > 0 && (
                                <button className="btn-mark-all" onClick={handleMarkAllAsRead}>
                                    <Check size={14} /> Mark all read
                                </button>
                            )}
                            <button className="btn-close-dropdown" onClick={() => setIsOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                    
                    <div className="notification-list">
                        {alerts.length === 0 ? (
                            <div className="notification-empty">
                                <Bell size={32} className="text-muted" />
                                <p>No notifications yet</p>
                            </div>
                        ) : (
                            alerts.map(alert => (
                                <div key={alert.id} className={`notification-item ${alert.is_read ? 'read' : 'unread'} ${alert.link || alert.alert_type === 'task_assignment' || !alert.is_read ? 'clickable' : ''}`} onClick={() => handleNotificationClick(alert)}>
                                    <div className="notification-item-icon">
                                        {getIconForAlert(alert.severity, alert.alert_type)}
                                    </div>
                                    <div className="notification-item-content">
                                        <div className="notification-item-title">{alert.title}</div>
                                        <div className="notification-item-message">{alert.message}</div>
                                        <div className="notification-item-time">
                                            {new Date(alert.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                    {!alert.is_read && (
                                        <button 
                                            className="notification-item-read-btn" 
                                            onClick={(e) => handleMarkAsRead(alert.id, e)}
                                            title="Mark as read"
                                        >
                                            <span className="read-dot"></span>
                                        </button>
                                    )}
                                </div>
                            ))
                        )}
                        {hasMore && (
                            <div className="notification-load-more">
                                <button className="btn-load-more" onClick={loadMoreAlerts}>
                                    Show More
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
