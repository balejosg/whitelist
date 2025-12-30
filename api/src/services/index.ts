/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Services barrel export
 *
 * This module exports all service classes for use by both REST endpoints
 * and tRPC routers, eliminating code duplication.
 */

export * as SetupService from './setup.service.js';
export * as ClassroomService from './classroom.service.js';
export * as HealthReportService from './health-report.service.js';

// Re-export default exports for convenience
export { default as setupService } from './setup.service.js';
export { default as classroomService } from './classroom.service.js';
export { default as healthReportService } from './health-report.service.js';
