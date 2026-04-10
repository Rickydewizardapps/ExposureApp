#!/bin/bash

# Configuration
RELAY_URL="relay.apextunnel.top"
DEFAULT_PORT="8080"

# Check if the first argument is 'authtoken'
if [ "$1" == "authtoken" ]; then
    node client.js "$@"
    exit 0
fi

# If the user didn't provide a --port, we add the default one
if [[ "$*" != *"--port"* ]]; then
    set -- "$@" --port "$DEFAULT_PORT"
fi

echo "🚀 Connecting to Apex Relay: $RELAY_URL"
node client.js --relay "$RELAY_URL" "$@"

