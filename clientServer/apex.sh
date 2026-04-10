#!/bin/bash

# Configuration
RELAY_IP="37.59.215.255"
DEFAULT_PORT="8080"

# If the user didn't provide a --port, we add the default one
if [[ "$*" != *"--port"* ]]; then
    set -- "$@" --port "$DEFAULT_PORT"
fi

# Run the client with the Relay IP and all arguments
node client.js --relay "$RELAY_IP" "$@"

