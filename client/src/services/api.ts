import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import type { AuthResponse, User, Machine, MachineFilters, PaginatedResponse, Incident, ComplianceRule, NewsItem, AuditLog, PublicStats, DashboardStats, Backup, Printer, ShareUsage, Task, TaskComment } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

class ApiService {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Add auth token to requests
        this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
            const token = localStorage.getItem('token');
            if (token && config.headers) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        });

        // Handle 401 responses
        this.client.interceptors.response.use(
            (response: AxiosResponse) => response,
            (error) => {
                const isLoginRequest = error.config?.url ? error.config.url.includes('auth/login') : false;
                if (error.response?.status === 401 && !isLoginRequest) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    const isLoginPage = window.location.pathname.replace(/\/$/, '') === '/login';
                    if (!isLoginPage) {
                        window.location.href = '/login';
                    }
                }
                return Promise.reject(error);
            }
        );
    }

    // Auth
    async login(username: string, password: string): Promise<AuthResponse> {
        const response = await this.client.post<AuthResponse>('/auth/login', { username, password });
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        return response.data;
    }

    async logout(): Promise<void> {
        try {
            await this.client.post('/auth/logout');
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        }
    }

    async getSession(): Promise<User> {
        const response = await this.client.get<User>('/auth/session');
        return response.data;
    }

    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
        await this.client.post('/auth/change-password', { currentPassword, newPassword });
    }

    async updateProfile(data: { fullName?: string; title?: string; avatar?: string | null; email?: string; emailNotifications?: boolean }): Promise<User> {
        const response = await this.client.patch<{ user: User }>('/auth/profile', data);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        return response.data.user;
    }

    // Machines
    async getMachines(filters?: MachineFilters): Promise<PaginatedResponse<Machine>> {
        const response = await this.client.get<any>('/machines', { params: filters });
        // Backend returns { machines, pagination }, transform to { data, pagination }
        const { machines, pagination } = response.data;
        return {
            data: machines || [],
            pagination: {
                page: pagination?.page || 1,
                limit: pagination?.limit || 50,
                total: pagination?.total || 0,
                totalPages: Math.ceil((pagination?.total || 0) / (pagination?.limit || 50)) || 1
            }
        };
    }

    async getMachine(id: number | string): Promise<Machine> {
        const response = await this.client.get<any>(`/machines/${id}`);
        return response.data;
    }

    async createMachine(data: Partial<Machine>): Promise<Machine> {
        const response = await this.client.post<Machine>('/machines', data);
        return response.data;
    }

    async updateMachine(id: number | string, data: Partial<Machine>): Promise<Machine> {
        const response = await this.client.put<Machine>(`/machines/${id}`, data);
        return response.data;
    }

    async setMachineBlockStatus(id: number | string, active: boolean, reason?: string): Promise<{ message: string }> {
        const response = await this.client.put<{ message: string }>(`/machines/${id}/block`, { active, reason });
        return response.data;
    }

    async deleteMachine(id: number | string): Promise<void> {
        await this.client.delete(`/machines/${id}`);
    }

    async refreshMachine(id: number | string): Promise<void> {
        await this.client.post(`/machines/${id}/refresh`);
    }

    async getMachineApps(id: number | string): Promise<{ apps: any[] }> {
        const response = await this.client.get(`/machines/${id}/apps`);
        return response.data;
    }

    async getMachineCompliance(id: number | string): Promise<{ violations: any[] }> {
        const response = await this.client.get<any>(`/machines/${id}/compliance`);
        const violations = response.data.violations || [];
        return {
            violations: violations.map((v: any) => ({
                id: v.id,
                ruleId: v.rule_id,
                ruleName: v.rule_name,
                severity: v.severity,
                description: v.details || v.rule_description, // Details contain the actual violation message
                status: v.status,
                lastChecked: v.last_checked
            }))
        };
    }

    async setOfflineReason(id: string | number, reason: 'intervention' | 'temporary' | null): Promise<{ message: string; reason: string | null }> {
        const response = await this.client.patch<{ message: string; reason: string | null }>(`/machines/${id}/offline-reason`, { reason });
        return response.data;
    }



    // Printers
    async getPrinters(): Promise<Printer[]> {
        const response = await this.client.get<Printer[]>('/printers');
        return response.data;
    }

    async getPrinter(id: string): Promise<Printer> {
        const response = await this.client.get<Printer>(`/printers/${id}`);
        return response.data;
    }

    async createPrinter(data: Partial<Printer>): Promise<Printer> {
        const response = await this.client.post<Printer>('/printers', data);
        return response.data;
    }

    async updatePrinter(id: string, data: Partial<Printer>): Promise<Printer> {
        const response = await this.client.put<Printer>(`/printers/${id}`, data);
        return response.data;
    }

    async updatePrinterCategory(id: string, category: string): Promise<void> {
        await this.client.put(`/printers/${id}/category`, { category });
    }

    async updatePrinterDepartment(id: string, department: string): Promise<void> {
        await this.client.put(`/printers/${id}/department`, { department });
    }

    async deletePrinter(id: string): Promise<void> {
        await this.client.delete(`/printers/${id}`);
    }

    async getPrinterStatus(id: string): Promise<{ online: boolean }> {
        const response = await this.client.get<{ online: boolean }>(`/printers/${id}/status`);
        return response.data;
    }

    // Incidents
    async getIncidents(params?: { status?: string; severity?: string; page?: number; limit?: number }): Promise<PaginatedResponse<Incident>> {
        const response = await this.client.get<any>('/incidents', { params });
        // Backend returns { incidents, total, counts }, transform to { data, pagination }
        const { incidents, total } = response.data;
        return {
            data: incidents || [],
            pagination: {
                page: params?.page || 1,
                limit: params?.limit || 50,
                total: total || 0,
                totalPages: Math.ceil((total || 0) / (params?.limit || 50)) || 1
            }
        };
    }

    async getIncident(id: number): Promise<Incident> {
        const response = await this.client.get<Incident>(`/incidents/${id}`);
        return response.data;
    }

    async createIncident(data: Partial<Incident>): Promise<Incident> {
        const response = await this.client.post<Incident>('/incidents', data);
        return response.data;
    }

    async updateIncident(id: number | string, data: Partial<Incident>): Promise<Incident> {
        const response = await this.client.put<Incident>(`/incidents/${id}`, data);
        return response.data;
    }

    async deleteIncident(id: number | string): Promise<void> {
        await this.client.delete(`/incidents/${id}`);
    }

    // Compliance Rules
    async getRules(): Promise<ComplianceRule[]> {
        const response = await this.client.get<any>('/rules');
        const rules = response.data.rules || [];
        // Transform backend snake_case to frontend camelCase
        return rules.map((rule: any) => ({
            id: rule.id,
            name: rule.name,
            description: rule.description,
            type: rule.rule_type || rule.type || 'software_required',
            condition: rule.app_name || rule.condition || '',
            severity: rule.severity || 'medium',
            isActive: rule.is_active === 1 || rule.is_active === true || rule.isActive === true,
            versionOperator: rule.version_operator || undefined,
            versionValue: rule.version_value || undefined,
            violationCount: rule.violation_count || 0,
            createdAt: rule.created_at || rule.createdAt,
            updatedAt: rule.updated_at || rule.updatedAt
        }));
    }

    async getRuleViolations(ruleId: string): Promise<any[]> {
        const response = await this.client.get<any>(`/rules/${ruleId}/violations`);
        return response.data.machines || [];
    }

    async getRule(id: number | string): Promise<ComplianceRule> {
        const response = await this.client.get<any>(`/rules/${id}`);
        const rule = response.data.rule || response.data;
        return {
            id: rule.id,
            name: rule.name,
            description: rule.description,
            type: rule.rule_type || rule.type || 'software_required',
            condition: rule.app_name || rule.condition || '',
            severity: rule.severity || 'medium',
            isActive: rule.is_active === 1 || rule.is_active === true || rule.isActive === true,
            versionOperator: rule.version_operator || undefined,
            versionValue: rule.version_value || undefined,
            createdAt: rule.created_at || rule.createdAt,
            updatedAt: rule.updated_at || rule.updatedAt
        };
    }

    async createRule(data: Partial<ComplianceRule>): Promise<ComplianceRule> {
        // Transform frontend camelCase to backend snake_case
        const backendData: any = {
            name: data.name,
            ruleType: data.type,
            appName: data.condition,
            severity: data.severity,
            description: data.description,
            isActive: data.isActive
        };
        if (data.versionOperator) backendData.versionOperator = data.versionOperator;
        if (data.versionValue) backendData.versionValue = data.versionValue;
        const response = await this.client.post<ComplianceRule>('/rules', backendData);
        return response.data;
    }

    async updateRule(id: number | string, data: Partial<ComplianceRule>): Promise<ComplianceRule> {
        // Transform frontend camelCase to backend snake_case
        const backendData: any = {};
        if (data.name !== undefined) backendData.name = data.name;
        if (data.type !== undefined) backendData.ruleType = data.type;
        if (data.condition !== undefined) backendData.appName = data.condition;
        if (data.severity !== undefined) backendData.severity = data.severity;
        if (data.description !== undefined) backendData.description = data.description;
        if (data.isActive !== undefined) backendData.isActive = data.isActive;
        if (data.versionOperator !== undefined) backendData.versionOperator = data.versionOperator;
        if (data.versionValue !== undefined) backendData.versionValue = data.versionValue;
        const response = await this.client.put<ComplianceRule>(`/rules/${id}`, backendData);
        return response.data;
    }

    async deleteRule(id: number | string): Promise<void> {
        await this.client.delete(`/rules/${id}`);
    }

    // News
    async getNews(): Promise<NewsItem[]> {
        const response = await this.client.get<any>('/news');
        const newsItems = response.data.newsItems || response.data.news || response.data || [];
        return this.transformNewsItems(newsItems);
    }

    async createNews(data: Partial<NewsItem>): Promise<NewsItem> {
        // Transform frontend camelCase to backend snake_case
        const backendData: any = {
            title: data.title,
            content: data.content,
            isActive: data.isActive,
            sortOrder: data.priority,
            expiresAt: data.expiresAt
        };
        if ((data as any).imageUrl) {
            backendData.imageUrl = (data as any).imageUrl;
        }
        if (data.link !== undefined) {
            backendData.link = data.link;
        }
        const response = await this.client.post<NewsItem>('/news', backendData);
        return response.data;
    }

    async createNewsWithFile(formData: FormData): Promise<NewsItem> {
        const response = await this.client.post<NewsItem>('/news', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    }

    async updateNews(id: number | string, data: Partial<NewsItem>): Promise<NewsItem> {
        // Transform frontend camelCase to backend snake_case
        const backendData: any = {};
        if (data.title !== undefined) backendData.title = data.title;
        if (data.content !== undefined) backendData.content = data.content;
        if (data.isActive !== undefined) backendData.isActive = data.isActive;
        if (data.priority !== undefined) backendData.sortOrder = data.priority;
        if (data.expiresAt !== undefined) backendData.expiresAt = data.expiresAt;
        if ((data as any).imageUrl !== undefined) backendData.imageUrl = (data as any).imageUrl;
        if (data.link !== undefined) backendData.link = data.link;
        const response = await this.client.put<NewsItem>(`/news/${id}`, backendData);
        return response.data;
    }

    async updateNewsWithFile(id: number | string, formData: FormData): Promise<NewsItem> {
        const response = await this.client.put<NewsItem>(`/news/${id}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    }

    async deleteNews(id: number | string): Promise<void> {
        await this.client.delete(`/news/${id}`);
    }

    // Users (Admin only)
    async getUsers(): Promise<User[]> {
        const response = await this.client.get<any>('/users');
        const users = response.data.users || response.data || [];
        // Transform backend snake_case to frontend camelCase
        return users.map((user: any) => ({
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            fullName: user.full_name || user.fullName,
            title: user.title,
            avatar: user.avatar,
            isActive: user.is_active === 1 || user.is_active === true || user.isActive === true,
            createdAt: user.created_at || user.createdAt,
            updatedAt: user.updated_at || user.updatedAt,
            lastLogin: user.last_login || user.lastLogin
        }));
    }

    async createUser(data: { username: string; password: string; role: string }): Promise<User> {
        const response = await this.client.post<User>('/users', data);
        return response.data;
    }

    async updateUser(id: number | string, data: Partial<User & { password?: string }>): Promise<User> {
        const response = await this.client.put<User>(`/users/${id}`, data);
        return response.data;
    }

    async deleteUser(id: number | string): Promise<void> {
        await this.client.delete(`/users/${id}`);
    }

    async resetUserPassword(id: number | string, newPassword: string): Promise<void> {
        await this.client.post(`/users/${id}/reset-password`, { newPassword });
    }

    // Audit Logs
    async getAuditLogs(params?: { page?: number; limit?: number; username?: string; startDate?: string; endDate?: string }): Promise<PaginatedResponse<AuditLog>> {
        const response = await this.client.get<any>('/audit', { params });
        const { logs, pagination } = response.data;
        // Transform backend fields to frontend format
        const transformedLogs = (logs || response.data || []).map((log: any) => ({
            ...log,
            createdAt: log.timestamp || log.created_at || log.createdAt,
            ipAddress: log.ip_address || log.ipAddress,
            username: log.full_name || log.username || 'System',
            fullName: log.full_name,
            details: (log.old_value || log.new_value) ? {
                previous: log.old_value ? (typeof log.old_value === 'string' ? JSON.parse(log.old_value) : log.old_value) : null,
                updated: log.new_value ? (typeof log.new_value === 'string' ? JSON.parse(log.new_value) : log.new_value) : null
            } : null
        }));
        return {
            data: transformedLogs,
            pagination: pagination || {
                page: params?.page || 1,
                limit: params?.limit || 50,
                total: 0,
                totalPages: 1
            }
        };
    }

    async getPublicStats(): Promise<PublicStats> {
        const response = await this.client.get<any>('/public/stats');
        const data = response.data;
        // Transform backend nested format to frontend flat format
        return {
            totalOnline: data.pcs?.online?.total || 0,
            shopfloorOnline: data.pcs?.online?.shopfloor || 0,
            userOnline: data.pcs?.online?.user || 0,
            othersOnline: data.pcs?.online?.others || 0,
            offlineCount: data.pcs?.offline || 0,
            interventionCount: data.pcs?.intervention || 0,
            temporaryCount: data.pcs?.temporary || 0,
            openIncidents: data.incidents?.open || 0,
            inProgressIncidents: data.incidents?.inProgress || 0,
            closedIncidents: data.incidents?.closed || 0
        };
    }

    async getPublicCharts(): Promise<{
        incidentsByMonth: { label: string; count: number }[];
        totalMachines: number;
    }> {
        const response = await this.client.get<any>('/public/charts');
        return response.data;
    }

    async getPublicShareUsage(): Promise<ShareUsage[]> {
        const response = await this.client.get<ShareUsage[]>('/public/share-usage');
        return response.data;
    }

    async getPublicNews(): Promise<NewsItem[]> {
        const response = await this.client.get<any>('/public/news');
        const newsItems = response.data.newsItems || response.data.news || response.data || [];
        return this.transformNewsItems(newsItems);
    }

    private transformNewsItems(newsItems: any[]): NewsItem[] {
        const BACKEND_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3002/api').replace('/api', '');
        return newsItems.map((item: any) => {
            let imageUrl = item.image_path || item.imageUrl;
            if (imageUrl && imageUrl.startsWith('/uploads/')) {
                imageUrl = `${BACKEND_URL}${imageUrl}`;
            }
            return {
                id: item.id,
                title: item.title,
                content: item.content,
                imageUrl,
                link: item.link || null,
                priority: item.sort_order || item.priority || 0,
                isActive: item.is_active === 1 || item.is_active === true || item.isActive === true,
                expiresAt: item.expires_at || item.expiresAt,
                createdBy: item.created_by || item.createdBy,
                createdAt: item.created_at || item.createdAt,
                updatedAt: item.updated_at || item.updatedAt
            };
        });
    }

    // Dashboard Stats
    async getDashboardStats(): Promise<DashboardStats> {
        const response = await this.client.get<DashboardStats>('/dashboard/stats');
        return response.data;
    }

    // Network Scanner
    async scanNetwork(cidr: string): Promise<{ message: string; found?: boolean; result?: any }> {
        const response = await this.client.post('/scanner', { cidr });
        return response.data;
    }

    async getScanResults(): Promise<any[]> {
        const response = await this.client.get<{ results: any[] }>('/scanner');
        return response.data.results;
    }

    async getScanStatus(): Promise<{ isRunning: boolean; progress: number; currentIp: string; scannedCount: number }> {
        const response = await this.client.get('/scanner/status');
        return response.data;
    }

    async stopScan(): Promise<void> {
        await this.client.post('/scanner/stop');
    }

    async clearScanResults(): Promise<void> {
        await this.client.delete('/scanner');
    }

    async pingUnmanaged(): Promise<{ message: string; reachable: number; total: number }> {
        const response = await this.client.post('/scanner/ping-unmanaged');
        return response.data;
    }

    async registerAllScanned(): Promise<{ message: string }> {
        const response = await this.client.post('/scanner/register-all');
        return response.data;
    }



    // Settings
    async getPublicSetting(key: string): Promise<{ setting: { value: string } | null }> {
        const response = await this.client.get<{ setting: { value: string } | null }>(`/public/settings?key=${key}`);
        return response.data;
    }

    async getSettings(key?: string): Promise<any> {
        const response = await this.client.get('/settings', { params: { key } });
        return response.data;
    }

    async updateSetting(key: string, value: any): Promise<void> {
        await this.client.put(`/settings/${key}`, { value });
    }

    // Backups
    async getBackups(): Promise<Backup[]> {
        const response = await this.client.get<any>('/backup');
        const backups = response.data.backups || [];
        return backups.map((backup: any) => ({
            id: backup.id,
            filename: backup.filename,
            size: backup.file_size,
            type: backup.backup_type || 'manual',
            createdBy: backup.created_by,
            createdAt: backup.created_at
        }));
    }

    async createBackup(): Promise<Backup> {
        const response = await this.client.post<any>('/backup');
        const backup = response.data;
        // The create endpoint returns { id, filename, size, message } but not full db record
        // We might want to construct the Backup object or refresh the list.
        // For now, return what we can and let caller refresh or assume values.
        return {
            id: backup.id,
            filename: backup.filename,
            size: backup.size,
            type: 'manual',
            createdBy: null, // response doesn't have it, but it's current user
            createdAt: new Date().toISOString()
        };
    }

    async deleteBackup(id: string | number): Promise<void> {
        await this.client.delete(`/backup/${id}`);
    }

    getBackupDownloadUrl(id: string | number): string {
        const baseUrl = API_BASE_URL.endsWith('/api') ? API_BASE_URL : `${API_BASE_URL}/api`;
        // We need to pass token since it's a direct link, or handle auth via cookies/headers in a different way.
        // Actually, the download endpoint requires auth header. A simple link won't work with Bearer token.
        // We can implement a download method that uses blob/file-saver, or use a query param token if supported (not currently).
        // Let's stick to the method `downloadBackup` using axios and blob.
        return `${baseUrl}/backup/${id}/download`;
    }

    async downloadBackup(id: string | number, filename: string): Promise<void> {
        const response = await this.client.get(`/backup/${id}/download`, {
            responseType: 'blob'
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    }

    // Vulnerabilities
    async getVulnerabilityStats(allMachines = false, allCves = false, severity = 'all'): Promise<any> {
        const params = new URLSearchParams();
        if (allMachines) params.append('allMachines', 'true');
        if (allCves) params.append('allCves', 'true');
        if (severity && severity !== 'all') params.append('severity', severity);
        params.append('_t', Date.now().toString()); // Bust cache
        const qs = params.toString();
        const response = await this.client.get(`/vulnerabilities/stats${qs ? '?' + qs : ''}`);
        return response.data;
    }

    async getMachineVulnerabilities(id: string | number): Promise<any[]> {
        const response = await this.client.get(`/vulnerabilities/machine/${id}`);
        return response.data;
    }

    async getCveAffectedMachines(cveId: string): Promise<any[]> {
        const response = await this.client.get(`/vulnerabilities/cve/${cveId}/machines`);
        return response.data;
    }

    async syncVulnerabilities(): Promise<{ message: string; status?: any }> {
        const response = await this.client.post('/vulnerabilities/sync');
        return response.data;
    }

    async exportVulnerabilities(): Promise<Blob> {
        const response = await this.client.get('/vulnerabilities/export', { responseType: 'blob' });
        return response.data;
    }

    // Facility Layout
    async getLayoutFloors(): Promise<{ floors: any[] }> {
        const response = await this.client.get('/layout/floors');
        return response.data;
    }

    async getFloorDevices(floorId: string): Promise<{ devices: any[] }> {
        const response = await this.client.get(`/layout/floors/${floorId}/devices`);
        return response.data;
    }

    async createLayoutDevice(data: {
        floorId: string;
        deviceType: string;
        name?: string;
        ipAddress?: string;
        parentRackId?: string;
        printerId?: string;
        switchName?: string;
        posX?: number;
        posY?: number;
        status?: string;
    }): Promise<any> {
        const response = await this.client.post('/layout/devices', data);
        return response.data;
    }

    async updateLayoutDevice(id: string, data: {
        name?: string | null;
        ipAddress?: string | null;
        parentRackId?: string | null;
        switchName?: string | null;
        status?: string;
        posX?: number;
        posY?: number;
    }): Promise<any> {
        const response = await this.client.put(`/layout/devices/${id}`, data);
        return response.data;
    }

    async updateDevicePosition(id: string, posX: number, posY: number): Promise<any> {
        const response = await this.client.put(`/layout/devices/${id}/position`, { posX, posY });
        return response.data;
    }

    async deleteLayoutDevice(id: string): Promise<void> {
        await this.client.delete(`/layout/devices/${id}`);
    }

    async getUnplacedPrinters(): Promise<{ printers: any[] }> {
        const response = await this.client.get('/layout/unplaced-printers');
        return response.data;
    }

    async pingDevice(id: string): Promise<{ id: string; status: string }> {
        const response = await this.client.post(`/layout/devices/${id}/ping`);
        return response.data;
    }

    async pingFloorDevices(floorId: string): Promise<{ results: { id: string; status: string }[] }> {
        const response = await this.client.post(`/layout/floors/${floorId}/ping`);
        return response.data;
    }

    // AI Chat
    async chatStream(message: string, history: { role: string; content: string }[] = [], onChunk: (chunk: string) => void): Promise<void> {
        const token = localStorage.getItem('token');
        // Normalize URL because sometimes API_BASE_URL includes /api and sometimes it doesn't
        const fetchUrl = API_BASE_URL.includes('/api') ? `${API_BASE_URL}/ai/chat` : `${API_BASE_URL}/api/ai/chat`;
        
        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ message, history })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');
        
        const decoder = new TextDecoder('utf-8');
        let done = false;
        
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.content) onChunk(data.content);
                        } catch (e) {
                            // ignore parse error for incomplete chunks
                        }
                    }
                }
            }
        }
    }

    async chatStreamWithStatus(
        message: string,
        history: { role: string; content: string }[] = [],
        onChunk: (chunk: string) => void,
        onStatus: (status: string) => void
    ): Promise<void> {
        const token = localStorage.getItem('token');
        const fetchUrl = API_BASE_URL.includes('/api') ? `${API_BASE_URL}/ai/chat` : `${API_BASE_URL}/api/ai/chat`;
        
        const response = await fetch(fetchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ message, history })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No readable stream');
        
        const decoder = new TextDecoder('utf-8');
        let done = false;
        let buffer = '';
        
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // keep incomplete line in buffer
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.status) onStatus(data.status);
                            if (data.content) onChunk(data.content);
                        } catch (e) {
                            // ignore parse error for incomplete chunks
                        }
                    }
                }
            }
        }
    }

    async chat(message: string, history: { role: string; content: string }[] = []): Promise<{ message: { role: string; content: string } }> {
        const response = await this.client.post('/ai/chat', { message, history });
        return response.data;
    }

    async getAiStatus(): Promise<{ online: boolean; model: string; modelAvailable: boolean; error?: string }> {
        const response = await this.client.get('/ai/status');
        return response.data;
    }

    // Tasks
    async getTasks(filters?: { filter?: string, status?: string, importance?: string, showDeleted?: boolean }): Promise<{ tasks: Task[] }> {
        const response = await this.client.get<{ tasks: Task[] }>('/tasks', { params: filters });
        return response.data;
    }

    async getTask(id: string): Promise<{ task: Task }> {
        const response = await this.client.get<{ task: Task }>(`/tasks/${id}`);
        return response.data;
    }

    async createTask(data: any): Promise<{ id: string, message: string }> {
        const response = await this.client.post<{ id: string, message: string }>('/tasks', data);
        return response.data;
    }

    async updateTask(id: string, data: any): Promise<{ message: string }> {
        const response = await this.client.put<{ message: string }>(`/tasks/${id}`, data);
        return response.data;
    }

    async deleteTask(id: string): Promise<{ message: string }> {
        const response = await this.client.delete<{ message: string }>(`/tasks/${id}`);
        return response.data;
    }

    async restoreTask(id: string): Promise<{ message: string }> {
        const response = await this.client.patch<{ message: string }>(`/tasks/${id}/restore`);
        return response.data;
    }

    // Task Comments
    async getTaskComments(taskId: string): Promise<{ comments: TaskComment[] }> {
        const response = await this.client.get<{ comments: TaskComment[] }>(`/tasks/${taskId}/comments`);
        return response.data;
    }

    async addTaskComment(taskId: string, content: string): Promise<{ message: string, id: string }> {
        const response = await this.client.post<{ message: string, id: string }>(`/tasks/${taskId}/comments`, { content });
        return response.data;
    }

    async deleteTaskComment(taskId: string, commentId: string): Promise<{ message: string }> {
        const response = await this.client.delete<{ message: string }>(`/tasks/${taskId}/comments/${commentId}`);
        return response.data;
    }

    async getSubtaskComments(taskId: string, subtaskId: string): Promise<{ comments: TaskComment[] }> {
        const response = await this.client.get<{ comments: TaskComment[] }>(`/tasks/${taskId}/subtasks/${subtaskId}/comments`);
        return response.data;
    }

    async addSubtaskComment(taskId: string, subtaskId: string, content: string): Promise<{ message: string, id: string }> {
        const response = await this.client.post<{ message: string, id: string }>(`/tasks/${taskId}/subtasks/${subtaskId}/comments`, { content });
        return response.data;
    }

    // Alerts / Notifications
    async getAlerts(limit: number = 20, offset: number = 0): Promise<{ alerts: any[] }> {
        const response = await this.client.get('/alerts', { params: { limit, offset } });
        return response.data;
    }

    async getUnreadAlertsCount(): Promise<{ count: number }> {
        const response = await this.client.get('/alerts/unread-count');
        return response.data;
    }

    async markAlertRead(id: string): Promise<{ message: string }> {
        const response = await this.client.put(`/alerts/${id}/read`);
        return response.data;
    }

    async markAllAlertsRead(): Promise<{ message: string }> {
        const response = await this.client.put('/alerts/read-all');
        return response.data;
    }
}

export const api = new ApiService();
export default api;
