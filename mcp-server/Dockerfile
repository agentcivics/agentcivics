# AgentCivics MCP Server — containerized
#
# Why a container: the MCP server holds the agent's Sui private key in its
# process memory while running. A container isolates that key + the
# server's filesystem + network reachability from the host. The key file
# is bind-mounted read-only from the host; nothing else from the host
# filesystem is visible to the container.
#
# Build: docker build -t agentcivics/mcp-server:2.8.0 .
# Run:   docker run --rm -i \
#          -v ~/.agentcivics_key:/keys/key:ro \
#          -e AGENTCIVICS_PRIVATE_KEY_FILE=/keys/key \
#          -e AGENTCIVICS_NETWORK=testnet \
#          agentcivics/mcp-server:2.8.0
#
# The -i (interactive) flag is required because the MCP protocol uses
# stdio transport — the MCP host (Claude Desktop, Cursor, etc.) writes
# JSON-RPC to stdin and reads from stdout. Don't use -t; allocating a
# TTY corrupts the JSON stream.
#
# See docs/guides/run-mcp-in-container.md for the full integration
# guide, including ctx.rs config templates and per-host wiring.

FROM node:20-alpine

# Install the published mcp-server from npm. Pinning a specific version
# is intentional — the bundled deployments.json that resolves on-chain
# IDs is pinned at publish time, so a "latest" tag would drift relative
# to the contract the user expects. Re-build this image after every
# mcp-server npm publish.
ARG MCP_SERVER_VERSION=2.8.0
RUN npm install --omit=dev -g @agentcivics/mcp-server@${MCP_SERVER_VERSION}

# Non-root user. The node:*-alpine images ship with an existing `node`
# user at UID/GID 1000 — use it rather than creating a duplicate
# (creating a duplicate-UID user fails the build). The keys mount is
# read-only so the container can't write the agent's private key back
# to disk anywhere except its own tmpfs, which is wiped on exit.
RUN mkdir -p /keys && chown -R node:node /keys

USER node

# Default to testnet — the canonical chain. Override with -e at run time
# if pointing at a different network.
ENV AGENTCIVICS_NETWORK=testnet

# Keys mount point. The container expects AGENTCIVICS_PRIVATE_KEY_FILE
# to point inside this directory; the host bind-mounts the real keystore
# file with :ro.
VOLUME ["/keys"]

# Healthcheck would normally hit a /health endpoint; this server is
# stdio-transport only. The image's healthiness is its ability to
# start; runtime failures surface to the MCP host as protocol errors.
# Intentionally no HEALTHCHECK directive.

ENTRYPOINT ["agentcivics-mcp"]
