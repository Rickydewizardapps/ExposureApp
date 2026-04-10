#!/bin/bash

# Configuration
RELAY_URL="relay.apextunnel.top"
DEFAULT_PORT="8080"

# 1. Handle "authtoken" command separately
if [ "$1" == "authtoken" ]; then
    node client.js "$@"
    exit 0
fi

# 2. Argument Validation Block
for arg in "$@"; do
    if [[ "$arg" != --* ]] && [[ "$prev_arg" != "--port" ]] && [[ "$prev_arg" != "--relay" ]] && [[ "$prev_arg" != "--subdomain" ]]; then
        echo -e "\e[31m[Error]\e[0m Unexpected argument: '$arg'"
        echo "Usage: ./apex.sh [--port <port>] [--subdomain <name>]"
        exit 1
    fi
    prev_arg="$arg"
done

# 3. Add default port if missing
if [[ "$*" != *"--port"* ]]; then
    set -- "$@" --port "$DEFAULT_PORT"
fi

echo "🚀 Connecting to Apex Relay: $RELAY_URL"

# 4. Execute Client
node client.js --relay "$RELAY_URL" "$@"
