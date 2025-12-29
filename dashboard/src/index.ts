/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 */

import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import * as db from './db.js';
import type { User } from './db.js';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extend Express Session to include User
import 'express-session';
declare module 'express-session' {
    interface SessionData {
        user?: User;
    }
}

const app = express();
const PORT = process.env.PORT ?? 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: (process.env.SESSION_SECRET) ?? uuidv4(),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Authentication middleware
function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
}

// Async route wrapper
function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}

// ============== Auth Routes ==============

app.post('/api/auth/login', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body as Record<string, unknown>;
    if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Invalid request' });
        return;
    }

    const user = await db.validateUser(username, password);
    if (user) {
        req.session.user = {
            id: user.id,
            username: user.username,
            passwordHash: ''
        };
        res.json({ success: true, user: { username: user.username } });
    } else {
        res.status(401).json({ error: 'Credenciales inválidas' });
    }
}));

app.post('/api/auth/logout', (req: Request, res: Response): void => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            res.status(500).json({ error: 'Error logging out' });
        } else {
            res.json({ success: true });
        }
    });
});

app.get('/api/auth/check', (req: Request, res: Response): void => {
    if (req.session.user) {
        res.json({ authenticated: true, user: { username: req.session.user.username } });
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/api/auth/change-password', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { newPassword } = req.body as Record<string, unknown>;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        return;
    }
    if (req.session.user?.id) {
        await db.changePassword(req.session.user.id, newPassword);
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
}));

// ============== Stats Routes ==============

app.get('/api/stats', requireAuth, asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const stats = await db.getStats();
    res.json(stats);
}));

// ============== System Routes ==============

app.get('/api/system/status', requireAuth, asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const status = await db.getSystemStatus();
    res.json(status);
}));

app.post('/api/system/toggle', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { enable } = req.body as Record<string, unknown>;
    const status = await db.toggleSystemStatus(!!enable);
    res.json({ success: true, ...status });
}));

// ============== Groups Routes ==============

app.get('/api/groups', requireAuth, asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const groups = await db.getAllGroups();
    res.json(groups);
}));

app.post('/api/groups', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, displayName } = req.body as Record<string, unknown>;
    if (!name || !displayName || typeof name !== 'string' || typeof displayName !== 'string') {
        res.status(400).json({ error: 'Nombre requerido' });
        return;
    }
    // Sanitize name for URL
    const safeName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    try {
        const id = await db.createGroup(safeName, displayName);
        await db.exportGroupToFile(id);
        res.json({ success: true, id, name: safeName });
    } catch (err: unknown) {
        if (err instanceof Error && err.message === 'UNIQUE_CONSTRAINT_VIOLATION') {
            res.status(400).json({ error: 'Ya existe un grupo con ese nombre' });
            return;
        }
        throw err;
    }
}));

app.get('/api/groups/:id', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const group = await db.getGroupById(req.params.id);
    if (!group) {
        res.status(404).json({ error: 'Grupo no encontrado' });
        return;
    }
    res.json(group);
}));

app.put('/api/groups/:id', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { displayName, enabled } = req.body as Record<string, unknown>;
    if (typeof displayName !== 'string') {
        res.status(400).json({ error: 'Invalid details' });
        return;
    }
    await db.updateGroup(req.params.id, displayName, !!enabled);
    await db.exportGroupToFile(req.params.id);
    res.json({ success: true });
}));

app.delete('/api/groups/:id', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await db.deleteGroup(req.params.id);
    res.json({ success: true });
}));

// ============== Rules Routes ==============

app.get('/api/groups/:groupId/rules', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { type } = req.query;
    const rules = await db.getRulesByGroup(req.params.groupId, (type as db.Rule['type'] | undefined) ?? null);
    res.json(rules);
}));

app.post('/api/groups/:groupId/rules', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { type, value, comment } = req.body as Record<string, unknown>;
    if (!type || !value || typeof type !== 'string' || typeof value !== 'string') {
        res.status(400).json({ error: 'Tipo y valor requeridos' });
        return;
    }
    const result = await db.createRule(req.params.groupId, type as db.Rule['type'], value, comment as string | null);
    if (result.success) {
        await db.exportGroupToFile(req.params.groupId);
        res.json({ success: true, id: result.id });
    } else {
        res.status(400).json({ error: result.error });
    }
}));

app.post('/api/groups/:groupId/rules/bulk', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { type, values } = req.body as Record<string, unknown>;
    if (!type || !values || !Array.isArray(values)) {
        res.status(400).json({ error: 'Tipo y valores requeridos' });
        return;
    }
    const count = await db.bulkCreateRules(req.params.groupId, type as db.Rule['type'], values as string[]);
    await db.exportGroupToFile(req.params.groupId);
    res.json({ success: true, count });
}));

app.delete('/api/rules/:id', requireAuth, asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await db.deleteRule(req.params.id);
    res.json({ success: true });
}));

// ============== Public Export (for dnsmasq clients) ==============

app.get('/export/:name.txt', asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const group = await db.getGroupByName(req.params.name);
    if (!group) {
        res.status(404).send('Grupo no encontrado');
        return;
    }
    const filePath = await db.exportGroupToFile(group.id);
    if (!filePath) {
        res.status(500).send('Error exportando grupo');
        return;
    }
    res.type('text/plain').sendFile(filePath);
}));

// ============== SPA Fallback ==============

app.get('*', (_req: Request, res: Response): void => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Error handler
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Startup
async function startServer(): Promise<void> {
    // Ensure default admin exists
    await db.ensureDefaultAdmin();

    if (process.env.NODE_ENV !== 'test') {
        app.listen(PORT, () => {
            console.log(`🛡️  OpenPath corriendo en http://localhost:${PORT.toString()}`);
            console.log(`📁  Exportaciones en: ${db.EXPORT_DIR}`);

            // Export all groups on startup
            void db.exportAllGroups();
        });
    }
}

void startServer();

export default app;
