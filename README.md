# wpdev

CLI tool for spinning up isolated WordPress development environments. Each site runs in its own set of Docker containers with full local file access.

Built with [Bun](https://bun.sh), [Ink](https://github.com/vadimdemedes/ink), and [Pastel](https://github.com/vadimdemedes/pastel).

> This is the TypeScript rewrite of [wpdev-shell](https://github.com/Synistic/wpdev-shell).

## Features

- One command to create a full WordPress environment
- Multiple sites running simultaneously on different ports
- Direct file editing — WordPress files live on your host filesystem
- WP-CLI access without entering containers
- Mailpit for catching outgoing emails
- Interactive terminal UI with step indicators

## Requirements

- [Bun](https://bun.sh) runtime
- Docker and Docker Compose

## Installation

```bash
git clone https://github.com/Synistic/wpdev.git
cd wpdev
bun install
```

## Usage

```bash
# Create a new site
bun run dev create

# List all sites
bun run dev list

# Start/stop a site
bun run dev start <name>
bun run dev stop <name>

# Run WP-CLI commands
bun run dev wp <name> plugin list

# Open a shell in the container
bun run dev shell <name>

# View logs
bun run dev logs <name>

# Delete a site
bun run dev delete <name>
```

## Architecture

Each environment spins up 4 containers:

| Container | Purpose |
|-----------|---------|
| WordPress | PHP-FPM with WP-CLI |
| Nginx | Web server |
| MySQL | Database |
| Mailpit | Email catching |

Site files are stored at `~/wpdev/sites/<name>/html/` and can be edited directly with any editor.

## Stack

- **Runtime:** Bun
- **CLI Framework:** Pastel (Ink-based)
- **Config:** Zod schemas + YAML
- **Linting:** Biome

## License

MIT
