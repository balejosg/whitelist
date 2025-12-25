/**
 * OpenPath SPA - Type Definitions
 * Shared types for the frontend dashboard
 */

// =============================================================================
// Domain Types (matching backend)
// =============================================================================

export type RequestStatus = 'pending' | 'approved' | 'rejected';
export type RequestPriority = 'low' | 'normal' | 'high';
export type UserRole = 'admin' | 'teacher' | 'student';
export type MachineStatus = 'online' | 'offline' | 'unknown';

/**
 * Domain unlock request
 */
export interface DomainRequest {
    id: string;
    domain: string;
    reason: string;
    requester_email: string;
    group_id: string;
    priority: RequestPriority;
    status: RequestStatus;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    resolution_note?: string;
}

/**
 * User (safe version without password)
 */
export interface User {
    id: string;
    email: string;
    name: string;
    login?: string; // GitHub login
    avatar_url?: string;
    roles?: UserRole[];
    groups?: string[];
}

/**
 * Classroom
 */
export interface Classroom {
    id: string;
    name: string;
    display_name: string;
    machines: Machine[];
    created_at: string;
    updated_at: string;
}

/**
 * Machine in classroom
 */
export interface Machine {
    hostname: string;
    last_seen: string | null;
    status: MachineStatus;
}

/**
 * Schedule entry
 */
export interface Schedule {
    id: string;
    classroom_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    group_id: string;
    teacher_id: string;
    teacher_name?: string;
    subject: string;
    active: boolean;
}

// =============================================================================
// Auth Types
// =============================================================================

/**
 * Token pair from login
 */
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

/**
 * Stored user info (from JWT)
 */
export interface StoredUser {
    id: string;
    email: string;
    name: string;
    roles: UserRole[];
    groups: string[];
}

/**
 * OAuth callback result
 */
export interface OAuthCallbackResult {
    accessToken?: string;
    tokenType?: string;
    error?: string;
}

// =============================================================================
// State Types
// =============================================================================

/**
 * GitHub API instance interface
 */
export interface GitHubAPIInstance {
    token: string;
    owner: string;
    repo: string;
    branch: string;
    getFile(path: string): Promise<GitHubFile | null>;
    updateFile(path: string, content: string, message: string, sha: string): Promise<boolean>;
    listDirectory(path: string): Promise<string[]>;
}

/**
 * GitHub file response
 */
export interface GitHubFile {
    path: string;
    sha: string;
    content: string;
    encoding: string;
}

/**
 * Group data (whitelist content)
 */
export interface GroupData {
    domains: string[];
    rules?: WhitelistRule[];
    config?: Record<string, unknown>;
}

/**
 * Whitelist rule entry
 */
export interface WhitelistRule {
    domain: string;
    comment?: string;
    addedAt?: string;
    addedBy?: string;
}

/**
 * Application state
 */
export interface AppState {
    github: GitHubAPIInstance | null;
    currentGroup: string | null;
    currentGroupData: GroupData | null;
    currentGroupSha: string | null;
    currentRuleType: 'whitelist' | 'blacklist';
    allGroups: string[];
    currentUser: User | null;
    canEdit: boolean;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Standard API response
 */
export interface APIResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
    message?: string;
}

/**
 * Paginated response
 */
export interface PaginatedAPIResponse<T> extends APIResponse<T[]> {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

/**
 * Requests list response
 */
export interface RequestsResponse extends APIResponse<DomainRequest[]> {
    requests: DomainRequest[];
}

/**
 * Classrooms list response
 */
export interface ClassroomsResponse extends APIResponse<Classroom[]> {
    classrooms: Classroom[];
}

/**
 * Schedules list response
 */
export interface SchedulesResponse extends APIResponse<Schedule[]> {
    schedules: Schedule[];
}

/**
 * Users list response
 */
export interface UsersResponse extends APIResponse<User[]> {
    users: User[];
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * SPA configuration
 */
export interface SPAConfig {
    owner: string;
    repo: string;
    branch: string;
    whitelistPath: string;
}

/**
 * Requests API configuration
 */
export interface RequestsAPIConfig {
    apiUrl: string;
    token?: string;
}

// =============================================================================
// UI Types
// =============================================================================

/**
 * Screen names
 */
export type ScreenName =
    | 'login-screen'
    | 'config-screen'
    | 'dashboard-screen'
    | 'loading-screen';

/**
 * Toast notification type
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info';

/**
 * Toast notification
 */
export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

/**
 * Modal configuration
 */
export interface ModalConfig {
    title: string;
    content: string | HTMLElement;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void | Promise<void>;
    onCancel?: () => void;
}

// =============================================================================
// Push Notifications
// =============================================================================

/**
 * Push subscription for server
 */
export interface PushSubscriptionData {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

/**
 * Push notification payload
 */
export interface PushNotificationPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
}

// =============================================================================
// Global Window Extensions
// =============================================================================

declare global {
    interface Window {
        Auth: AuthAPI;
        OAuth: OAuthAPI;
        RequestsAPI: RequestsAPIInstance;
        Config: ConfigAPI;
        GitHubAPI: new (token: string, owner: string, repo: string, branch: string) => GitHubAPIInstance;
        SchedulesModule?: SchedulesModule;
    }
}

/**
 * Auth API interface
 */
export interface AuthAPI {
    ACCESS_TOKEN_KEY: string;
    REFRESH_TOKEN_KEY: string;
    USER_KEY: string;
    getApiUrl(): string;
    getAccessToken(): string | null;
    getRefreshToken(): string | null;
    getAuthHeaders(): Record<string, string>;
    storeTokens(tokens: AuthTokens): void;
    storeUser(user: User): void;
    getUser(): StoredUser | null;
    clearAuth(): void;
    isAuthenticated(): boolean;
    hasRole(role: UserRole): boolean;
    isAdmin(): boolean;
    isTeacher(): boolean;
    isStudent(): boolean;
    getApprovalGroups(): string[] | 'all';
    getTeacherGroups(): string[];
    getAssignedGroups(): string[];
    login(email: string, password: string): Promise<APIResponse<{ user: User }>>;
    register(email: string, name: string, password: string): Promise<APIResponse<{ user: User }>>;
    refresh(): Promise<APIResponse<AuthTokens>>;
    logout(): Promise<void>;
    getMe(): Promise<APIResponse<{ user: User }>>;
    fetch(url: string, options?: RequestInit): Promise<Response>;
}

/**
 * OAuth API interface
 */
export interface OAuthAPI {
    isLoggedIn(): boolean;
    getToken(): string | null;
    handleCallback(): OAuthCallbackResult | null;
    getUser(): Promise<User>;
    canWrite(owner: string, repo: string): Promise<boolean>;
    logout(): void;
}

/**
 * Requests API instance interface
 */
export interface RequestsAPIInstance {
    apiUrl: string;
    init(url: string, token?: string): void;
    getRequests(status?: RequestStatus): Promise<RequestsResponse>;
    createRequest(data: { domain: string; reason?: string }): Promise<APIResponse<DomainRequest>>;
    approveRequest(id: string, note?: string): Promise<APIResponse<DomainRequest>>;
    rejectRequest(id: string, note?: string): Promise<APIResponse<DomainRequest>>;
    deleteRequest(id: string): Promise<APIResponse<void>>;
}

/**
 * Config API interface
 */
export interface ConfigAPI {
    get(): SPAConfig;
    save(config: SPAConfig): void;
    clear(): void;
}

/**
 * Schedules module interface
 */
export interface SchedulesModule {
    init(classroomId: string): Promise<void>;
    loadSchedules(): Promise<void>;
    render(): void;
}

export { };
