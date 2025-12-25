# ADR 0002: JSON File Storage Over Database

## Status

Accepted

## Context

The OpenPath API needs persistent storage for:

- User accounts and credentials
- Domain approval requests
- Classroom configurations
- Push notification subscriptions

Options considered:

1. **SQLite**: Embedded SQL database
2. **PostgreSQL/MySQL**: Full relational database
3. **Redis**: In-memory key-value store
4. **JSON files**: Simple file-based storage

## Decision

We will use **JSON files** as the primary storage mechanism.

## Rationale

1. **Zero dependencies**: No database server to install or configure
2. **Portability**: Files can be easily backed up, moved, or inspected
3. **Simplicity**: Human-readable format aids debugging
4. **Git integration**: Configuration can be version-controlled
5. **Low write volume**: The expected data volume is small (< 10K operations/day)

### Data Characteristics

| Entity | Expected Volume | Write Frequency |
|--------|-----------------|-----------------|
| Users | < 100 | Rare |
| Requests | < 1000 | ~10/hour |
| Classrooms | < 50 | Rare |
| Subscriptions | < 100 | Rare |

## File Structure

```
data/
├── users.json          # User credentials and roles
├── requests.json       # Domain approval requests
├── classrooms.json     # Classroom definitions
├── schedules.json      # Reservation schedules
└── push-subscriptions.json
```

## Consequences

### Positive

- No database setup required
- Easy to debug by viewing files directly
- Trivial backup/restore process
- No connection pooling or ORM complexity

### Negative

- No ACID transactions (mitigated by atomic writes)
- Limited query capabilities
- Not suitable for high-concurrency scenarios
- Must implement our own data integrity checks

### Mitigation

- Use atomic file operations (`fs.writeFileSync` with temp file + rename)
- Implement file locking for concurrent access
- Add data validation layer
- Consider migration path to SQLite if scale increases
