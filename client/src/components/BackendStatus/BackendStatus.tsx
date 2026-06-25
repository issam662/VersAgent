import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './BackendStatus.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const HEALTH_URL = `${API_BASE_URL}/health`;

export const BackendStatus: React.FC = () => {
    const [isOnline, setIsOnline] = useState<boolean | null>(null);

    useEffect(() => {
        const checkStatus = async () => {
            try {
                await axios.get(HEALTH_URL, { timeout: 3000 });
                setIsOnline(true);
            } catch {
                setIsOnline(false);
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className={`backend-status ${isOnline === null ? 'checking' : isOnline ? 'online' : 'offline'}`}>
            <div className="status-dot"></div>
            <span className="status-text">
                {isOnline === null ? 'CHECKING' : isOnline ? 'SERVICE: ONLINE' : 'SERVICE: OFFLINE'}
            </span>
        </div>
    );
};
