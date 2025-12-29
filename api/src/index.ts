export type { AppRouter } from './trpc/routers/index.js';
export * from './db/schema.js';
// Export non-conflicting types from types/index.ts
// Entity types are already exported from db/schema.js via Drizzle inference
export type {
    // Domain enum types
    RequestStatus,
    RequestPriority,
    UserRole,
    MachineStatus,
    // Entity types not in Drizzle schema
    DomainRequest,
    // JWT types
    RoleInfo,
    JWTPayload,
    DecodedToken,
    // API response types
    APIResponseType,
    PaginatedResponse,
    StatsResponse,
    // DTO types
    CreateRequestDTO,
    UpdateRequestStatusDTO,
    CreateUserDTO,
    LoginDTO,
    LoginResponse,
    CreateClassroomDTO,
    CreateScheduleDTO,
    // Express types
    AuthenticatedRequest,
    RequestWithGroups,
    Middleware,
    AuthMiddleware,
    // Config types
    Config,
} from './types/index.js';
