/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET || uuidv4(),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
}));

// Archivos estáticos
app.use(express.static(path.join(__dirname, '..', 'public')));

// Middleware de autenticación
function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
}

// ============== Rutas de Auth ==============

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.validateUser(username, password);
    if (user) {
        req.session.user = user;
        res.json({ success: true, user: { username: user.username } });
    } else {
        res.status(401).json({ error: 'Credenciales inválidas' });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: { username: req.session.user.username } });
    } else {
        res.json({ authenticated: false });
    }
});

app.post('/api/auth/change-password', requireAuth, (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    db.changePassword(req.session.user.id, newPassword);
    res.json({ success: true });
});

// ============== Rutas de Stats ==============

app.get('/api/stats', requireAuth, (req, res) => {
    res.json(db.getStats());
});

// ============== Rutas de Sistema ==============

app.get('/api/system/status', requireAuth, (req, res) => {
    res.json(db.getSystemStatus());
});

app.post('/api/system/toggle', requireAuth, (req, res) => {
    const { enable } = req.body;
    const status = db.toggleSystemStatus(enable);
    res.json({ success: true, ...status });
});

// ============== Rutas de Groups ==============

app.get('/api/groups', requireAuth, (req, res) => {
    res.json(db.getAllGroups());
});

app.post('/api/groups', requireAuth, (req, res) => {
    const { name, displayName } = req.body;
    if (!name || !displayName) {
        return res.status(400).json({ error: 'Nombre requerido' });
    }
    // Sanitizar nombre para URL
    const safeName = name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    try {
        const id = db.createGroup(safeName, displayName);
        db.exportGroupToFile(id);
        res.json({ success: true, id, name: safeName });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ error: 'Ya existe un grupo con ese nombre' });
        }
        throw err;
    }
});

app.get('/api/groups/:id', requireAuth, (req, res) => {
    const group = db.getGroupById(req.params.id);
    if (!group) {
        return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    res.json(group);
});

app.put('/api/groups/:id', requireAuth, (req, res) => {
    const { displayName, enabled } = req.body;
    db.updateGroup(req.params.id, displayName, enabled);
    db.exportGroupToFile(req.params.id);
    res.json({ success: true });
});

app.delete('/api/groups/:id', requireAuth, (req, res) => {
    db.deleteGroup(req.params.id);
    res.json({ success: true });
});

// ============== Rutas de Rules ==============

app.get('/api/groups/:groupId/rules', requireAuth, (req, res) => {
    const { type } = req.query;
    res.json(db.getRulesByGroup(req.params.groupId, type));
});

app.post('/api/groups/:groupId/rules', requireAuth, (req, res) => {
    const { type, value, comment } = req.body;
    if (!type || !value) {
        return res.status(400).json({ error: 'Tipo y valor requeridos' });
    }
    const result = db.createRule(req.params.groupId, type, value, comment);
    if (result.success) {
        db.exportGroupToFile(req.params.groupId);
        res.json({ success: true, id: result.id });
    } else {
        res.status(400).json({ error: result.error });
    }
});

app.post('/api/groups/:groupId/rules/bulk', requireAuth, (req, res) => {
    const { type, values } = req.body;
    if (!type || !values || !Array.isArray(values)) {
        return res.status(400).json({ error: 'Tipo y valores requeridos' });
    }
    const count = db.bulkCreateRules(req.params.groupId, type, values);
    db.exportGroupToFile(req.params.groupId);
    res.json({ success: true, count });
});

app.delete('/api/rules/:id', requireAuth, (req, res) => {
    // Obtener grupo antes de borrar para re-exportar
    const rule = require('./db').db?.prepare?.('SELECT group_id FROM rules WHERE id = ?').get(req.params.id);
    db.deleteRule(req.params.id);
    if (rule) {
        db.exportGroupToFile(rule.group_id);
    }
    res.json({ success: true });
});

// ============== Export público (para clientes dnsmasq) ==============

app.get('/export/:name.txt', (req, res) => {
    const group = db.getGroupByName(req.params.name);
    if (!group) {
        return res.status(404).send('Grupo no encontrado');
    }
    const filePath = db.exportGroupToFile(group.id);
    res.type('text/plain').sendFile(filePath);
});

// ============== Fallback SPA ==============

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor solo si no estamos en modo test
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🛡️  OpenPath corriendo en http://localhost:${PORT}`);
        console.log(`📁  Exportaciones en: ${db.EXPORT_DIR}`);

        // Exportar todos los grupos al iniciar
        db.exportAllGroups();
    });
}

// Exportar para testing
module.exports = app;
