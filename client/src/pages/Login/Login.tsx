import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Lock, User, AlertCircle, Loader2 } from 'lucide-react';
import './Login.css';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    // Redirect if already logged in
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/admin');
        }
    }, [isAuthenticated, navigate]);


    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            await login(username, password);
            navigate('/admin');
        } catch (err: any) {
            console.error('Login submission failed:', err);
            let errMsg = 'Login failed. Please try again.';
            if (err && typeof err === 'object') {
                if (err.response?.data?.error?.message && typeof err.response.data.error.message === 'string') {
                    errMsg = err.response.data.error.message;
                } else if (err.response?.data?.error && typeof err.response.data.error === 'string') {
                    errMsg = err.response.data.error;
                } else if (err.response?.data?.message && typeof err.response.data.message === 'string') {
                    errMsg = err.response.data.message;
                } else if (err.message && typeof err.message === 'string') {
                    errMsg = err.message;
                }
            } else if (typeof err === 'string') {
                errMsg = err;
            }
            setError(errMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-container">
                <div className="login-header">
                    <div className="login-logo">
                        <span className="logo-text">VersAgent</span>
                        <span className="logo-subtitle">PC Inventory Dashboard</span>
                    </div>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <h2 className="login-title">Admin Login</h2>

                    {error && (
                        <div className="login-error">
                            <AlertCircle size={18} />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="input-group">
                        <label className="input-label" htmlFor="username">Username</label>
                        <div className="input-with-icon">
                            <User size={18} className="input-icon" />
                            <input
                                id="username"
                                type="text"
                                className="input"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                autoComplete="username"
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label className="input-label" htmlFor="password">Password</label>
                        <div className="input-with-icon">
                            <Lock size={18} className="input-icon" />
                            <input
                                id="password"
                                type="password"
                                className="input"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-lg w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 size={20} className="spin" />
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <div className="login-footer">
                    <a href="/" className="login-link">← Back to Public Dashboard</a>
                </div>
            </div>
        </div>
    );
}
