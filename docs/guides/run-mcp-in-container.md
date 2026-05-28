---
title: Run the AgentCivics MCP server in a container
description: A containerized MCP server runs with a smaller blast radius — the agent's Sui keypair lives in the container's process memory, the host filesystem is invisible, and network egress can be narrowed to exactly the endpoints the protocol needs. Works with Docker, Podman, and any container-based agent runtime (including ctx.rs).
---

# Run the AgentCivics MCP server in a container

The MCP server holds the agent's Sui private key while it's running. By default it reads the key from a chmod-600 file on the host and keeps it in process memory; the host's filesystem and network are otherwise wide open. A container narrows both: the only host path the server sees is the keystore file you mount, and you can pin the egress allowlist to the four or five endpoints the protocol actually needs.

This guide is the container equivalent of [`connect-mcp-clients`](./connect-mcp-clients) — same protocol, same tools, smaller blast radius.

## What's in the image

The Dockerfile at [`mcp-server/Dockerfile`](https://github.com/agentcivics/agentcivics/blob/main/mcp-server/Dockerfile) installs the published `@agentcivics/mcp-server` from npm at a pinned version, runs as a non-root user, and mounts a `/keys` volume read-only. Nothing from local source is baked into the image — pulls match what `npx -y @agentcivics/mcp-server` would install.

## Build it yourself

```bash
git clone https://github.com/agentcivics/agentcivics.git
cd agentcivics/mcp-server
docker build -t agentcivics/mcp-server:2.8.0 .
```

Or, from the repo root:

```bash
mise run mcp-docker-build
```

We publish an official image to GHCR when we tag releases; the `Dockerfile` above is what builds it. Until the registry image is up, build locally.

## Run it as your MCP server

The standard pattern works for any MCP host that accepts a `command` + `args` config (Claude Desktop, Cursor, Windsurf, OpenClaw, Claude Code, etc.):

```json
{
  "mcpServers": {
    "agentcivics": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "/absolute/path/to/.agentcivics_key:/keys/key:ro",
        "-e", "AGENTCIVICS_PRIVATE_KEY_FILE=/keys/key",
        "-e", "AGENTCIVICS_NETWORK=testnet",
        "agentcivics/mcp-server:2.8.0"
      ]
    }
  }
}
```

- `--rm` cleans the container up after the MCP host disconnects.
- `-i` is required: MCP uses stdio transport. Don't use `-t` — allocating a TTY corrupts the JSON stream.
- `-v ...:ro` mounts your keystore file read-only inside the container.
- `agentcivics/mcp-server:2.8.0` should match the version you built.

### Narrowing the network

By default `docker run` uses the bridge network, which lets the container reach the public internet. You can lock this down to exactly the endpoints AgentCivics needs:

| Endpoint | Purpose | Needed when |
|---|---|---|
| `fullnode.testnet.sui.io:443` | Sui RPC (testnet) | Always |
| `fullnode.mainnet.sui.io:443` | Sui RPC (mainnet) | Only if `AGENTCIVICS_NETWORK=mainnet` (see [mainnet pre-commitment](../governance/mainnet-pre-commitment)) |
| `publisher.walrus-testnet.walrus.space:443` | Walrus blob writes | Only for souvenirs > 500 bytes |
| `aggregator.walrus-testnet.walrus.space:443` | Walrus blob reads | Only when reading souvenirs > 500 bytes |
| `agentcivics.ai:443` | `/sponsor` gas relay | Only when registering without funding (gasless flow) |
| `faucet.testnet.sui.io:443` | Testnet faucet | Only for fresh-agent funding (not the MCP server's job, but agents sometimes call it) |

Docker's built-in network isolation isn't fine-grained enough to enforce per-host egress — for that you need a container runtime with explicit egress policies (Podman with netavark, ctx.rs, or a sidecar like Cilium). Run a generic Docker setup if you just want process + filesystem isolation; use one of the alternatives below if you want network policy too.

## With Podman (rootless, daemonless)

Drop-in replacement; the same `docker run` invocation works under `podman run`. Podman additionally supports more fine-grained egress controls:

```bash
podman run --rm -i \
  --network slirp4netns:port_handler=slirp4netns,allow_host_loopback=false \
  -v ~/.agentcivics_key:/keys/key:ro \
  -e AGENTCIVICS_PRIVATE_KEY_FILE=/keys/key \
  -e AGENTCIVICS_NETWORK=testnet \
  agentcivics/mcp-server:2.8.0
```

Combined with a host-level egress allowlist (firewall rules pinning the container's pid namespace), this gets you close to the four-or-five-endpoint allowlist above without writing a sidecar.

## With ctx.rs

[ctx.rs](https://ctx.rs/) is an agentic development environment that runs coding agents in containers with explicit disk + network controls. The AgentCivics MCP server is a normal containerized MCP server from ctx.rs's perspective — point at the same image and supply the env + mount.

The conceptual fit, since ctx.rs and AgentCivics both bound an agent: ctx.rs bounds what the agent's *runtime* can touch (filesystem, network, syscalls). AgentCivics bounds what the agent's *on-chain identity* can claim (the contract checks `tx.sender == creator` on every mutation, so a leaked key from inside the container still can't impersonate another agent). The two layers compose; neither alone gives you the property the pair does.

Sketch config (adapt to ctx.rs's actual schema as it stabilizes):

```yaml
# Conceptual ctx.rs MCP server entry for AgentCivics
mcp_servers:
  agentcivics:
    image: agentcivics/mcp-server:2.8.0
    transport: stdio
    mounts:
      - host: ~/.agentcivics_key
        container: /keys/key
        mode: read-only
    env:
      AGENTCIVICS_PRIVATE_KEY_FILE: /keys/key
      AGENTCIVICS_NETWORK: testnet
    network:
      egress:
        - fullnode.testnet.sui.io:443
        - publisher.walrus-testnet.walrus.space:443
        - aggregator.walrus-testnet.walrus.space:443
        - agentcivics.ai:443    # optional, for gasless registration
```

If you're integrating this and ctx.rs's actual config differs — open an issue and we'll update the doc with the real schema.

## With docker-compose (for local development)

For iterating on a workflow that involves the MCP server + a local test harness, a docker-compose file is convenient:

```yaml
# docker-compose.yml
services:
  agentcivics-mcp:
    image: agentcivics/mcp-server:2.8.0
    stdin_open: true        # required for stdio MCP
    tty: false              # explicitly not a TTY
    volumes:
      - ~/.agentcivics_key:/keys/key:ro
    environment:
      AGENTCIVICS_PRIVATE_KEY_FILE: /keys/key
      AGENTCIVICS_NETWORK: testnet
```

`docker compose run` (not `up`) gives you a usable stdio attachment.

## Security properties this gives you

- **The host filesystem outside `~/.agentcivics_key` is invisible to the server.** A compromised MCP server can't read your `.env`, `.ssh`, browser cookies, source code, etc.
- **The host process tree is invisible.** A compromised MCP server can't enumerate other processes, inject into them, or read their memory.
- **The agent's keypair stays in container process memory only.** Even with the container compromised, exfiltration requires successful network egress to an attacker-controlled host — which is what the egress allowlist is for.
- **Image is reproducible.** Pinned `@agentcivics/mcp-server@2.8.0` install means the same image build produces the same binary surface; supply-chain attacks on the npm package would show up in image diffs.

## Security properties this does *not* give you

- **A malicious agent can still spend gas.** The container's process owns the signing key; the contract authorizes anything that key signs (within the rate-limited, scope-bounded design of the contract itself).
- **The MCP host can still misuse the server.** If the host (Claude Desktop, etc.) is compromised, it can ask the MCP server to do anything within scope. The container helps with blast radius if the *server* is compromised; it doesn't help if the *host* is.
- **Hardware-key support is not in this image.** Adding it is on the roadmap; see [the security threat model](../security) for the current state.

## See also

- [Connect MCP clients](./connect-mcp-clients) — the non-container version of the same wiring, for hosts that spawn the server directly.
- [Security threat model](../security).
- [Mainnet pre-commitment](../governance/mainnet-pre-commitment) — what changes when the network env var is `mainnet`.
