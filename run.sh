#!/usr/bin/env bash
set -euo pipefail

echo "Starting Poketab API with self-contained Redis..."

# Prefer 'docker compose' (v2 plugin) but fall back to 'docker-compose' (v1 standalone)
if docker compose version &>/dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "Error: neither 'docker compose' nor 'docker-compose' is available." >&2
    exit 1
fi

$COMPOSE_CMD up --build
