# ADR 0001: Use dnsmasq for DNS Filtering

## Status

Accepted

## Context

OpenPath needs a DNS-based filtering mechanism to enforce whitelist policies on Linux systems. The system must:

1. Intercept all DNS queries from client applications
2. Allow resolution of whitelisted domains
3. Block (return NXDOMAIN) for non-whitelisted domains
4. Be transparent to applications
5. Support periodic updates without service interruption

Several options were considered:

- **Custom DNS proxy**: Full control but high development cost
- **iptables/nftables only**: Limited to IP-based blocking, no domain awareness
- **Pi-hole**: Full-featured but heavy for single-machine use
- **dnsmasq**: Lightweight, widely available, well-documented

## Decision

We will use **dnsmasq** as the DNS filtering engine for Linux clients.

## Rationale

1. **Ubiquity**: Pre-installed or easily available on all major Linux distributions
2. **Lightweight**: Minimal resource footprint (~1MB RAM)
3. **Simple configuration**: Text-based `/etc/dnsmasq.d/` drop-in files
4. **Hot reload**: Supports `SIGHUP` for configuration updates
5. **Proven reliability**: Battle-tested in production for decades
6. **Sinkhole support**: Native `address=/domain/` directive blocks domains

## Consequences

### Positive

- Simple installation process
- No additional dependencies
- Easy to debug with standard tools (`dig`, `nslookup`)
- Systemd integration for service management

### Negative

- Requires root/sudo for configuration
- Uses port 53, may conflict with systemd-resolved
- Limited logging compared to specialized solutions

### Mitigation

- Disable systemd-resolved stub listener during installation
- Provide uninstall script to restore original DNS configuration
