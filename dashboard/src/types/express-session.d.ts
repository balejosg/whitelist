import 'express-session';
import { User } from '../db';

declare module 'express-session' {
    interface SessionData {
        user?: User;
    }
}
