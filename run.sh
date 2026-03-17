#!/usr/bin/env bash
set -euo pipefail

echo "Starting Poketab API with self-contained Redis..."

if docker compose version &>/dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "Error: neither 'docker compose' nor 'docker-compose' is available." >&2
    exit 1
fi

if [ -z "${REDIS_PASSWORD:-}" ]; then
    read -rsp "Enter Redis password: " REDIS_PASSWORD
    echo
fi

if [ -z "$REDIS_PASSWORD" ]; then
    echo "Error: REDIS_PASSWORD cannot be empty." >&2
    exit 1
fi

export REDIS_PASSWORD

$COMPOSE_CMD up --build
