/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * Drizzle ORM Schema Definition
 * This is the source of truth for database types and migrations.
 */

import {
    pgTable,
    varchar,
    text,
    timestamp,
    integer,
    time,
    uuid,
    unique,
} from 'drizzle-orm/pg-core';

// =============================================================================
// Users Table
// =============================================================================

export const users = pgTable('users', {
    id: varchar('id', { length: 50 }).primaryKey(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// Roles Table
// =============================================================================

export const roles = pgTable('roles', {
    id: varchar('id', { length: 50 }).primaryKey(),
    userId: varchar('user_id', { length: 50 })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(), // 'admin' | 'teacher' | 'student'
    groups: text('groups').array(),
    createdBy: varchar('created_by', { length: 50 }).references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
    unique('roles_user_id_key').on(table.userId),
]);

// =============================================================================
// Requests Table
// =============================================================================

export const requests = pgTable('requests', {
    id: varchar('id', { length: 50 }).primaryKey(),
    domain: varchar('domain', { length: 255 }).notNull(),
    reason: text('reason'),
    requesterEmail: varchar('requester_email', { length: 255 }),
    groupId: varchar('group_id', { length: 100 }).notNull(),
    priority: varchar('priority', { length: 20 }).default('normal'),
    status: varchar('status', { length: 20 }).default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: varchar('resolved_by', { length: 255 }),
    resolutionNote: text('resolution_note'),
});

// =============================================================================
// Classrooms Table
// =============================================================================

export const classrooms = pgTable('classrooms', {
    id: varchar('id', { length: 50 }).primaryKey(),
    name: varchar('name', { length: 100 }).unique().notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    defaultGroupId: varchar('default_group_id', { length: 100 }),
    activeGroupId: varchar('active_group_id', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// Machines Table
// =============================================================================

export const machines = pgTable('machines', {
    id: varchar('id', { length: 50 }).primaryKey(),
    hostname: varchar('hostname', { length: 255 }).unique().notNull(),
    classroomId: varchar('classroom_id', { length: 50 }).references(
        () => classrooms.id,
        { onDelete: 'cascade' }
    ),
    version: varchar('version', { length: 50 }).default('unknown'),
    lastSeen: timestamp('last_seen', { withTimezone: true }).defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// Schedules Table
// =============================================================================

export const schedules = pgTable('schedules', {
    id: uuid('id').primaryKey().defaultRandom(),
    classroomId: varchar('classroom_id', { length: 50 })
        .notNull()
        .references(() => classrooms.id, { onDelete: 'cascade' }),
    teacherId: varchar('teacher_id', { length: 50 })
        .notNull()
        .references(() => users.id),
    groupId: varchar('group_id', { length: 100 }).notNull(),
    dayOfWeek: integer('day_of_week').notNull(), // 1-5 (Mon-Fri)
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
    recurrence: varchar('recurrence', { length: 20 }).default('weekly'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// Tokens Table (Refresh Token Blacklist)
// =============================================================================

export const tokens = pgTable('tokens', {
    id: varchar('id', { length: 50 }).primaryKey(),
    userId: varchar('user_id', { length: 50 })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// Settings Table
// =============================================================================

export const settings = pgTable('settings', {
    key: varchar('key', { length: 100 }).primaryKey(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// Push Subscriptions Table
// =============================================================================

export const pushSubscriptions = pgTable('push_subscriptions', {
    id: varchar('id', { length: 50 }).primaryKey(),
    userId: varchar('user_id', { length: 50 })
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    groupIds: text('group_ids').array().notNull(),
    endpoint: text('endpoint').unique().notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// Health Reports Table
// =============================================================================

export const healthReports = pgTable('health_reports', {
    id: uuid('id').primaryKey().defaultRandom(),
    hostname: varchar('hostname', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    dnsmasqRunning: integer('dnsmasq_running'), // 1=true, 0=false, null=unknown
    dnsResolving: integer('dns_resolving'),     // 1=true, 0=false, null=unknown
    failCount: integer('fail_count').default(0),
    actions: text('actions'),
    version: varchar('version', { length: 50 }),
    reportedAt: timestamp('reported_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// Type Inference Helpers
// =============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;

export type Classroom = typeof classrooms.$inferSelect;
export type NewClassroom = typeof classrooms.$inferInsert;

export type Machine = typeof machines.$inferSelect;
export type NewMachine = typeof machines.$inferInsert;

export type Schedule = typeof schedules.$inferSelect;
export type NewSchedule = typeof schedules.$inferInsert;

export type Token = typeof tokens.$inferSelect;
export type NewToken = typeof tokens.$inferInsert;

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;

export type HealthReport = typeof healthReports.$inferSelect;
export type NewHealthReport = typeof healthReports.$inferInsert;

