/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 */

import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as db from './db';
import { User } from './db';

// Extend Express Session to include User
import './types/express-session';

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
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
}));

// Archivos estáticos
// Assuming public is at ../public relative to src/ (which becomes ../../public from dist/ ???)
// Legacy index.js was in server/ and used path.join(__dirname, '..', 'public')
// src/index.ts is in src/, dist/index.js will be in dist/.
// If running tsx src/index.ts, __dirname is src/. public is ../public.
// If running dist/index.js, __dirname is dist/. public is ../public.
// So '..' works for both if public is at root/public.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Middleware de autenticación
function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
}

// ============== Rutas de Auth ==============

app.post('/api/auth/login', (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Invalid request' });
        return;
    }

    const user = db.validateUser(username, password);
    if (user) {
        req.session.user = { ...user, password_hash: '' }; // Don't store hash in session, just minimal info. 
        // Wait, db.validateUser returns {id, username}, not full user. 
        // User interface in db.ts has password_hash.
        // req.session.user expects User. 
        // We probably should relax SessionData.user or fetch full user.
        // Let's coerce it for now as validateUser returns partial.
        // Actually, let's fix validateUser return type or session type.
        // The legacy code put `user` from validateUser into session.
        // validateUser returned {id, username} in legacy.
        // My src/db.ts validateUser returns {id, username}.
        // But my SessionData type expects User (which includes password_hash).
        // I should update SessionData in types or db.ts to be Pick<User, 'id' | 'username'> or similar.
        // For strictness, let's just use what's returned.
        // I will trust the type system will complain and I'll fix it.
        // Re-checking db.ts: validateUser returns { id: number; username: string } | null.
        // User interface: { id: number; username: string; password_hash: string; ... }
        // So I need to align them.

        // Let's use 'as any' for now to match legacy behavior or fix interface.
        // Better: Update SessionData to be loose or specific.
        // I'll update it later if needed. For now casting.
        const sessionUser = req.session.user ?? {};
        req.session.user = { ...sessionUser, ...user } as User;

        res.json({ success: true, user: { username: user.username } });
    } else {
        res.status(401).json({ error: 'Credenciales inválidas' });
    }
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            res.status(500).json({ error: 'Error logging out' });
        } else {
            res.json({ success: true });
        }
    });
});

app.get('/api/auth/check', (req: Request, res: Response) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: { username: req.session.user.username } });
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/api/auth/change-password', requireAuth, (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        return;
    }
    if (req.session.user?.id) {
        db.changePassword(req.session.user.id, newPassword);
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
});

// ============== Rutas de Stats ==============

app.get('/api/stats', requireAuth, (_req: Request, res: Response) => {
    res.json(db.getStats());
});

// ============== Rutas de Sistema ==============

app.get('/api/system/status', requireAuth, (_req: Request, res: Response) => {
    res.json(db.getSystemStatus());
});

app.post('/api/system/toggle', requireAuth, (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { enable } = req.body;
    const status = db.toggleSystemStatus(!!enable);
    res.json({ success: true, ...status });
});

// ============== Rutas de Groups ==============

app.get('/api/groups', requireAuth, (_req: Request, res: Response) => {
    res.json(db.getAllGroups());
});

app.post('/api/groups', requireAuth, (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { name, displayName } = req.body;
    if (!name || !displayName || typeof name !== 'string' || typeof displayName !== 'string') {
        res.status(400).json({ error: 'Nombre requerido' });
        return;
    }
    // Sanitizar nombre para URL
    const safeName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    try {
        const id = db.createGroup(safeName, displayName);
        db.exportGroupToFile(id);
        res.json({ success: true, id, name: safeName });
    } catch (err: unknown) {
        if (err instanceof Error && err.message === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(400).json({ error: 'Ya existe un grupo con ese nombre' });
            return;
        }
        throw err;
    }
});

app.get('/api/groups/:id', requireAuth, (req: Request, res: Response) => {
    const group = db.getGroupById(req.params.id);
    if (!group) {
        res.status(404).json({ error: 'Grupo no encontrado' });
        return;
    }
    res.json(group);
});

app.put('/api/groups/:id', requireAuth, (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { displayName, enabled } = req.body;
    if (typeof displayName !== 'string') {
        res.status(400).json({ error: 'Invalid details' });
        return;
    }
    db.updateGroup(req.params.id, displayName, !!enabled);
    db.exportGroupToFile(req.params.id);
    res.json({ success: true });
});

app.delete('/api/groups/:id', requireAuth, (req: Request, res: Response) => {
    db.deleteGroup(req.params.id);
    res.json({ success: true });
});

// ============== Rutas de Rules ==============

app.get('/api/groups/:groupId/rules', requireAuth, (req: Request, res: Response) => {
    const { type } = req.query;
    res.json(db.getRulesByGroup(req.params.groupId, (type as db.Rule['type'] | undefined) ?? null));
});

app.post('/api/groups/:groupId/rules', requireAuth, (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { type, value, comment } = req.body;
    if (!type || !value || typeof type !== 'string' || typeof value !== 'string') {
        res.status(400).json({ error: 'Tipo y valor requeridos' });
        return;
    }
    const result = db.createRule(req.params.groupId, type as db.Rule['type'], value, comment as string | null);
    if (result.success) {
        db.exportGroupToFile(req.params.groupId);
        res.json({ success: true, id: result.id });
    } else {
        res.status(400).json({ error: result.error });
    }
});

app.post('/api/groups/:groupId/rules/bulk', requireAuth, (req: Request, res: Response) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { type, values } = req.body;
    if (!type || !values || !Array.isArray(values)) {
        res.status(400).json({ error: 'Tipo y valores requeridos' });
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const count = db.bulkCreateRules(req.params.groupId, type, values);
    db.exportGroupToFile(req.params.groupId);
    res.json({ success: true, count });
});

app.delete('/api/rules/:id', requireAuth, (req: Request, res: Response) => {
    // Obtener grupo antes de borrar para re-exportar
    const dbInstance = db.getDbInstance();
    const rule = dbInstance.rules.find(r => r.id === parseInt(req.params.id));

    db.deleteRule(req.params.id);

    if (rule) {
        db.exportGroupToFile(rule.group_id);
    }
    res.json({ success: true });
});

// ============== Export público (para clientes dnsmasq) ==============

app.get('/export/:name.txt', (req: Request, res: Response) => {
    const group = db.getGroupByName(req.params.name);
    if (!group) {
        res.status(404).send('Grupo no encontrado');
        return;
    }
    const filePath = db.exportGroupToFile(group.id);
    if (!filePath) {
        res.status(500).send('Error exportando grupo');
        return;
    }
    res.type('text/plain').sendFile(filePath);
});

// ============== Fallback SPA ==============

app.get('/{*splat}', (_req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Manejo de errores
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor solo si no estamos en modo test (detectado por module parent en JS, pero en TS/ESM es diferente)
// En ESM usamos import.meta.url === pathToFileURL(process.argv[1]).href
// Pero aqui estamos compilando. Vamos a usar una variable de entorno o comprobar si es ejecutado directamente.
// Una forma común en TS-Node/TSX es verificar require.main === module si usamos CommonJS, pero tsconfig es NodeNext.
// En NodeNext (ESM), require.main no existe.
// Para simplificar, exportamos app y en package.json iniciamos con un archivo separado o aqui mismo.
// Vamos a asumir que si process.env.NODE_ENV !== 'test', escuchamos.
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`🛡️  OpenPath corriendo en http://localhost:${PORT.toString()}`);
        console.log(`📁  Exportaciones en: ${db.EXPORT_DIR}`);

        // Exportar todos los grupos al iniciar
        db.exportAllGroups();
    });
}

export default app;
