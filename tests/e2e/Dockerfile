# Dockerfile for Linux E2E Tests
# Provides a clean Ubuntu environment with full control over DNS/port 53

FROM ubuntu:22.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages
RUN apt-get update && apt-get install -y \
    # DNS and networking
    dnsmasq \
    iptables \
    ipset \
    dnsutils \
    conntrack \
    curl \
    wget \
    # System utilities
    libcap2-bin \
    sudo \
    # Firefox for extension tests
    firefox \
    # Python for native messaging host
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Create working directory
WORKDIR /whitelist

# Copy entire project
COPY . .

# Make scripts executable
RUN chmod +x install.sh uninstall.sh scripts/*.sh tests/e2e/*.sh lib/*.sh || true

# Default command runs the E2E tests
CMD ["/whitelist/tests/e2e/docker-e2e-runner.sh"]
