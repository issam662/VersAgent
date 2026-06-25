import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    roles?: string[];
}

export default function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
    const { user, isLoading, isAuthenticated } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="loader"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // Case-insensitive role checking
    if (roles && user) {
        const userRole = (user.role || '').toLowerCase();
        const hasAccess = roles.some(role => role.toLowerCase() === userRole);
        if (!hasAccess) {
            return <Navigate to="/admin" replace />;
        }
    }

    return <>{children}</>;
}
