# OpenPath Makefile
# Common operations for development and deployment
#
# Usage:
#   make help        # Show all available commands
#   make install     # Install all dependencies
#   make test        # Run all tests
#   make lint        # Run linters

.PHONY: help install install-api install-spa test test-shell test-api test-security lint lint-js lint-shell build docker-build docker-up docker-down clean

# Default target
help:
	@echo "OpenPath Development Commands"
	@echo ""
	@echo "Installation:"
	@echo "  make install          Install all dependencies"
	@echo "  make install-api      Install API dependencies"
	@echo "  make install-spa      Install SPA dependencies (if any)"
	@echo ""
	@echo "Testing:"
	@echo "  make test             Run all tests"
	@echo "  make test-shell       Run shell script tests (BATS)"
	@echo "  make test-api         Run API tests"
	@echo "  make test-security    Run security tests only"
	@echo "  make coverage         Run tests with coverage"
	@echo ""
	@echo "Linting:"
	@echo "  make lint             Run all linters"
	@echo "  make lint-js          Run ESLint on JavaScript"
	@echo "  make lint-shell       Run ShellCheck on shell scripts"
	@echo "  make lint-fix         Fix auto-fixable lint issues"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build     Build Docker image"
	@echo "  make docker-up        Start containers"
	@echo "  make docker-down      Stop containers"
	@echo "  make docker-logs      View container logs"
	@echo ""
	@echo "Linux System:"
	@echo "  make linux-install    Install OpenPath on Linux (requires sudo)"
	@echo "  make linux-uninstall  Uninstall OpenPath from Linux (requires sudo)"
	@echo "  make linux-status     Check OpenPath system status"
	@echo ""
	@echo "Misc:"
	@echo "  make clean            Clean build artifacts and caches"
	@echo "  make dev              Start API in development mode"

# =============================================================================
# Installation
# =============================================================================

install: install-api
	@echo "All dependencies installed"

install-api:
	@echo "Installing API dependencies..."
	cd api && npm ci

install-spa:
	@echo "SPA is static - no dependencies to install"

# =============================================================================
# Testing
# =============================================================================

test: test-shell test-api
	@echo "All tests completed"

test-shell:
	@echo "Running shell script tests..."
	cd tests && bats *.bats

test-api:
	@echo "Running API tests..."
	cd api && npm test

test-security:
	@echo "Running security tests..."
	cd api && npm run test:security

coverage:
	@echo "Running tests with coverage..."
	cd api && npm run coverage

# =============================================================================
# Linting
# =============================================================================

lint: lint-js lint-shell
	@echo "All linting completed"

lint-js:
	@echo "Running ESLint..."
	npx eslint . --ignore-pattern node_modules --ignore-pattern coverage

lint-shell:
	@echo "Running ShellCheck..."
	shellcheck linux/lib/*.sh linux/scripts/**/*.sh || true

lint-fix:
	@echo "Fixing auto-fixable lint issues..."
	npx eslint . --fix --ignore-pattern node_modules --ignore-pattern coverage

# =============================================================================
# Docker
# =============================================================================

docker-build:
	@echo "Building Docker image..."
	cd api && docker build -t openpath-api .

docker-up:
	@echo "Starting containers..."
	cd api && docker compose up -d

docker-down:
	@echo "Stopping containers..."
	cd api && docker compose down

docker-logs:
	@echo "Viewing logs..."
	cd api && docker compose logs -f

# =============================================================================
# Linux System
# =============================================================================

linux-install:
	@echo "Installing OpenPath on Linux..."
	cd linux && sudo ./install.sh

linux-uninstall:
	@echo "Uninstalling OpenPath from Linux..."
	cd linux && sudo ./uninstall.sh

linux-status:
	@echo "Checking OpenPath status..."
	openpath status || echo "OpenPath not installed or not in PATH"

# =============================================================================
# Development
# =============================================================================

dev:
	@echo "Starting API in development mode..."
	cd api && npm run dev

# =============================================================================
# Cleanup
# =============================================================================

clean:
	@echo "Cleaning build artifacts..."
	rm -rf node_modules
	rm -rf api/node_modules
	rm -rf api/coverage
	rm -rf api/logs
	rm -rf spa/node_modules 2>/dev/null || true
	@echo "Clean completed"
