# OpenPath Dashboard
A Node.js/TypeScript dashboard service for managing the OpenPath DNS system.

## Overview
The Dashboard provides a web-based portal for administrators to manage classrooms, machines, and DNS whitelist policies. It integrates with the core OpenPath API and database to provide a user-friendly interface for system management.

## Features
- **Classroom Management**: Create and configure classrooms and machine groups.
- **Machine Registration**: Manage the list of machines authorized to use the DNS system.
- **Whitelist Configuration**: Define and update DNS whitelist policies for different groups.
- **Monitoring**: Basic health checks and system status overview.

## Quick Start
### Prerequisites
- Node.js >= 20
- Running PostgreSQL instance (configured in `.env`)

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build
```bash
npm run build
npm start
```

## Architecture
- **Framework**: Express.js
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Session-based with bcrypt password hashing
- **Integration**: Communicates with the core `@openpath/api` workspace.

## Testing
The dashboard includes both unit and integration tests using the Node.js test runner.
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Configuration
Configuration is handled via environment variables (see root `.env` or `api/.env.example`).
Key variables:
- `DATABASE_URL`: PostgreSQL connection string.
- `PORT`: Port the dashboard service runs on (default: 3001).
- `SESSION_SECRET`: Secret for session signing.

## License
AGPL-3.0-or-later
