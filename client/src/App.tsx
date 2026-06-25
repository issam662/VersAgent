import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/AdminLayout';
import './index.css';

// Lazy loaded pages
const PublicDashboard = lazy(() => import('./pages/PublicDashboard'));
const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Machines = lazy(() => import('./pages/Machines'));
const MachineDetails = lazy(() => import('./pages/MachineDetails'));
const EditMachine = lazy(() => import('./pages/MachineDetails/EditMachine'));
const Printers = lazy(() => import('./pages/Printers'));
const PrinterDetails = lazy(() => import('./pages/Printers/PrinterDetails'));
const Incidents = lazy(() => import('./pages/Incidents'));
const ComplianceRules = lazy(() => import('./pages/ComplianceRules'));
const NewsManagement = lazy(() => import('./pages/NewsManagement'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const BackupManagement = lazy(() => import('./pages/BackupManagement'));
const Scanner = lazy(() => import('./pages/Scanner/Scanner'));
const InfoPageManager = lazy(() => import('./pages/InfoPageManager'));
const Settings = lazy(() => import('./pages/Settings'));
const Vulnerabilities = lazy(() => import('./pages/Vulnerabilities/Vulnerabilities'));
const VulnerableMachines = lazy(() => import('./pages/Vulnerabilities/VulnerableMachines'));
const CveList = lazy(() => import('./pages/Vulnerabilities/CveList'));
const FacilityLayout = lazy(() => import('./pages/FacilityLayout'));
const Tasks = lazy(() => import('./pages/Tasks/Tasks'));

// Global loading fallback for lazy-loaded routes
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="loader"></div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
        <ThemeProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<PublicDashboard />} />
              <Route path="/login" element={<Login />} />

              {/* Admin Routes */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<AdminDashboard />} />
                <Route path="machines" element={<Machines />} />
                <Route path="machines/:id" element={<MachineDetails />} />
                <Route path="machines/:id/edit" element={<EditMachine />} />
                <Route path="printers" element={<Printers />} />
                <Route path="printers/new" element={<PrinterDetails />} />
                <Route path="printers/:id/edit" element={<PrinterDetails />} />
                <Route path="rules" element={<ComplianceRules />} />
                <Route path="incidents" element={<Incidents />} />
                <Route path="news" element={<NewsManagement />} />
                <Route
                  path="users"
                  element={
                    <ProtectedRoute roles={['SuperAdmin']}>
                      <UserManagement />
                    </ProtectedRoute>
                  }
                />
                <Route path="audit" element={<AuditLogs />} />
                <Route path="settings" element={
                  <ProtectedRoute roles={['SuperAdmin', 'Admin']}>
                    <Settings />
                  </ProtectedRoute>
                } />
                <Route
                  path="backup"
                  element={
                    <ProtectedRoute roles={['SuperAdmin', 'Admin']}>
                      <BackupManagement />
                    </ProtectedRoute>
                  }
                />
                <Route path="scanner" element={<Scanner />} />
                <Route path="info-page" element={
                  <ProtectedRoute roles={['SuperAdmin', 'Admin']}>
                    <InfoPageManager />
                  </ProtectedRoute>
                } />
                <Route path="vulnerabilities" element={<Vulnerabilities />} />
                <Route path="vulnerabilities/machines" element={<VulnerableMachines />} />
                <Route path="vulnerabilities/cves" element={<CveList />} />
                <Route path="facility-layout" element={<FacilityLayout />} />
                <Route path="tasks" element={<Tasks />} />
              </Route>

              {/* Catch all - redirect to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ThemeProvider>
      </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
