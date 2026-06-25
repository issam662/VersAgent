// API Types for PC Inventory Dashboard

export interface User {
    id: string;
    username: string;
    email?: string;
    emailNotifications?: boolean;
    email_notifications?: boolean | number;
    fullName?: string;
    full_name?: string;
    title?: string;
    role: 'SuperAdmin' | 'Admin' | 'Viewer';
    isActive?: boolean;
    avatar?: string | null;
    is_active?: boolean | number;
    lastLogin?: string | null;
    last_login?: string | null;
    createdAt?: string;
    created_at?: string;
    updatedAt?: string;
}

export interface AuthResponse {
    token: string;
    user: User;
}

export interface ScanResult {
    id: string;
    ip: string;
    hostname: string | null;
    mac_address: string | null;
    open_ports: number[];
    vulnerabilities: string[];
    scanned_at: string;
}

export interface Machine {
    id: string;
    hostname: string;
    serial_number?: string | null;
    macAddress?: string;
    ipAddress?: string | null;
    vlanId?: string;
    cpu?: string;
    ramGb?: number;
    diskGb?: number;
    lastKnownIp?: string | null;
    operatingSystem?: string | null;
    osVersion?: string | null;
    agentVersion?: string | null;
    category: string;
    location?: string | null;
    department?: string | null;
    family?: string | null;
    assignedUser?: string | null;
    notes?: string | null;
    description?: string | null;
    tags?: string[];
    isManaged?: boolean;
    is_managed?: boolean;
    is_archived?: boolean;
    currentUser?: string | null;
    current_user?: string | null;
    isOnline: boolean;
    status: 'online' | 'offline' | 'detected' | 'unknown';
    offlineReason?: 'intervention' | 'temporary' | null;
    lastSeenType?: 'Heartbeat' | 'Scan' | 'Ping' | null;
    lastSeen?: string | null;
    last_seen?: string | null;
    lastHeartbeat?: string | null;
    last_heartbeat?: string | null;
    lastInventory?: string | null;
    lastScan?: ScanResult | null;
    switch_name?: string | null;
    switch_ip?: string | null;
    switch_port?: string | null;
    switch_platform?: string | null;
    vlan_id?: string | null;
    createdAt?: string;
    created_at?: string;
    updatedAt?: string;
    updated_at?: string;
}

export interface MachineFilters {
    search?: string;
    category?: string;
    status?: string;
    os?: string;
    isManaged?: boolean;
    page?: number;
    limit?: number;
}

export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface InstalledApp {
    id: number;
    machineId: number;
    name: string;
    version: string;
    vendor: string | null;
    installDate: string | null;
}

export interface Incident {
    id: string;
    title: string;
    description: string | null;
    priority: 'P1' | 'P2' | 'P3' | 'P4';
    severity?: string;
    status: string;
    assignedTo?: string | null;
    assigned_to?: string | null;
    createdBy?: string | null;
    created_by?: string | null;
    createdAt: string;
    created_at?: string;
    updatedAt?: string;
    updated_at?: string;
    resolvedAt?: string | null;
    resolved_at?: string | null;
    machine_hostname?: string | null;
    assigned_to_name?: string | null;
}

export interface ComplianceRule {
    id: string;
    name: string;
    description: string | null;
    type: string;
    condition: string;
    severity: string;
    isActive: boolean;
    is_active?: boolean;
    versionOperator?: string;
    versionValue?: string;
    violationCount?: number;
    createdAt?: string;
    created_at?: string;
    updatedAt?: string;
    updated_at?: string;
}

export interface NewsItem {
    id: string;
    title: string;
    content: string | null;
    imageUrl?: string | null;
    image_url?: string | null;
    link?: string | null;
    priority: number;
    isActive: boolean;
    is_active?: boolean;
    expiresAt?: string | null;
    expires_at?: string | null;
    createdBy?: string | null;
    created_by?: string | null;
    createdAt?: string;
    created_at?: string;
    updatedAt?: string;
    updated_at?: string;
}

export interface AuditLog {
    id: number;
    userId: number;
    username?: string;
    action: string;
    resourceType: string | null;
    resourceId: number | null;
    resource?: string;
    details: Record<string, any> | null;
    ipAddress: string | null;
    createdAt: string;
    user?: User;
}

export interface PublicStats {
    totalOnline: number;
    shopfloorOnline: number;
    userOnline: number;
    othersOnline: number;
    offlineCount: number;
    interventionCount: number;
    temporaryCount: number;
    openIncidents: number;
    inProgressIncidents: number;
    closedIncidents: number;
}

export interface DashboardStats {
    totalMachines: number;
    onlineMachines: number;
    offlineMachines: number;
    interventionMachines: number;
    temporaryMachines: number;
    managedMachines: number;
    unmanagedMachines: number;
    openIncidents: number;
    criticalIncidents: number;
    complianceViolations: number;
}

export interface Backup {
    id: string;
    filename: string;
    size: number;
    type: 'manual' | 'automatic';
    createdBy: string | null;
    createdAt: string;
}

export interface Printer {
    id: string;
    ip_address: string;
    category: string;
    department?: string | null;
    mac_address?: string | null;
    serial_number?: string | null;
    hostname?: string | null;
    model?: string | null;
    queue_name?: string | null;
    station_name?: string | null;
    line?: string | null;
    comment?: string | null;
    custom_website_url?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface ShareUsage {
    name: string;
    totalBytes?: number;
    freeBytes?: number;
    usedBytes?: number;
    usedPercent?: number;
    sharePath?: string;
    ok: boolean;
    error?: string;
}

export type TaskImportance = 'Low' | 'Medium' | 'High' | 'Critical';
export type TaskStatus = 'On Going' | 'On Hold' | 'Closed';

export interface Subtask {
    id: string;
    task_id: string;
    title: string;
    is_completed: boolean | number;
    description?: string | null;
    comments_count?: number;
    created_at?: string;
    assigned_to?: TaskAssignment[];
}

export interface TaskAssignment {
    user_id: string;
    full_name: string;
    avatar?: string | null;
    username: string;
}

export interface Task {
    id: string;
    title: string;
    description: string | null;
    importance_level: TaskImportance;
    status: TaskStatus;
    start_date: string | null;
    end_date: string | null;
    created_by: string | null;
    creator_name?: string;
    created_at: string;
    updated_at: string;
    total_subtasks?: number;
    completed_subtasks?: number;
    subtasks?: Subtask[];
    assigned_to?: TaskAssignment[];
}

export interface TaskComment {
    id: string;
    task_id: string;
    subtask_id?: string | null;
    user_id: string;
    content: string;
    created_at: string;
    full_name?: string;
    username?: string;
    avatar?: string | null;
}

