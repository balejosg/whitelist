import 'express-session';
import { User } from '../db.js';

declare module 'express-session' {
    interface SessionData {
        user?: User;
    }
}
