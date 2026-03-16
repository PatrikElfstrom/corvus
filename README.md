<div align="center">
  <img height="300" src="public/corvus.svg" alt="Corvus" >
  <h1 >Corvus</h1>
</div>

Corvus is a self-hosted service that automatically syncs commits and contributions from repositories on GitHub, GitLab, Bitbucket, Gitea, Forgejo, and local filesystem and serves a contribution calendar that you can embed on your favorite websites.

The calendar is rendered server-side to SVG using [D3](https://d3js.org/) and [Observable Plot](https://observablehq.com/plot/).

![Example calendar](public/example.svg)

## Get started

1. Run Corvus with Docker Compose
2. Configure integrations in `data/integrations.yaml`
3. Configure optional display settings and themes in `data/config.yaml`
4. Access your contribution calendar at `http://localhost:3000/year.svg`

Self-host using docker compose:

```yaml
services:
  app:
    image: ghcr.io/patrikelfstrom/corvus:latest
    ports:
      - "3000:3000"
    volumes:
      - data:/app/data
    restart: unless-stopped

volumes:
  data:
```

or run with plain Docker:

```bash
docker run --rm -p 3000:3000 -v corvus-data:/app/data ghcr.io/patrikelfstrom/corvus:latest
```

## Config

### Integrations

Integrations are configured in `data/integrations.yaml`.
You can add multiple integrations with different providers and filters.

Example minimal config:

```yaml
integrations:
  - id: my-github-integration
    provider: github
    auth:
      username: octocat
      token: ghp_xxx
```

Additional options and filters are available:

| Option                       | Type    | Required    | Description                                                                           |
| ---------------------------- | ------- | ----------- | ------------------------------------------------------------------------------------- |
| `id`                         | string  | Yes         | Unique identifier for the integration                                                 |
| `provider`                   | string  | Yes         | Provider type: `github`, `gitlab`, `bitbucket`, `gitea`, `forgejo`, or `filepath`     |
| `enabled`                    | boolean | No          | `Default: true` Enable or disable the integration                                     |
| `auth.username`              | string  | Conditional | Username for authentication. Used for author matching (required for remote providers) |
| `auth.token`                 | string  | Conditional | API token for authentication (required for remote providers)                          |
| `source.base_url`            | string  | Conditional | Custom API endpoint (required for `forgejo`, optional for others)                     |
| `source.path`                | string  | Conditional | Local filesystem path (required for `filepath`)                                       |
| `source.depth`               | number  | No          | `Default: 1` Directory depth to scan (used with `filepath`).                          |
| `filters.author_include`     | array   | Conditional | Include commits from specific authors (required for `filepath`)                       |
| `filters.repository_exclude` | array   | No          | Exclude repositories by name                                                          |

#### Example config with multiple integrations:

```yaml
integrations:
  - id: github-main
    provider: github
    auth:
      username: octocat
      token: ghp_xxx
    filters:
      author_include:
        - octocat
        - octo@example.com
      repository_exclude:
        - experimental

  - id: gitea-personal
    provider: gitea
    source:
      base_url: http://localhost:3123
    auth:
      username: yorkshire
      token: a942xxx
    filters:
      author_include:
        - yorkshire
        - yorkshire@example.com
      repository_exclude:
        - experimental

  - id: local-work
    provider: filepath
    source:
      path: /Users/example/projects
      depth: 2
    filters:
      author_include:
        - your.name@example.com
      repository_exclude:
        - archive
```

#### Required API scopes:

| Provider  | Required scopes                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| GitHub    | `repo`                                                                                                       |
| GitLab    | `read_api`                                                                                                   |
| Bitbucket | `read:pullrequest:bitbucket`, `read:workspace:bitbucket`, `read:user:bitbucket`, `read:repository:bitbucket` |
| Gitea     | `read:repository`, `read:user`                                                                               |
| Forgejo   | `read:repository`, `read:user`                                                                               |

### Settings

```yaml
settings:
  title: true
  week_start: sunday
  theme: corvus
  dark_mode: auto
```

| Setting      | Possible values                                                              | Default  | Description                                         |
| ------------ | ---------------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| `title`      | `true`, `false`                                                              | `true`   | Show summary title above the calendar               |
| `week_start` | `sunday`, `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday` | `sunday` | Day to start the week on                            |
| `theme`      | `corvus`, `github`, or custom theme name                                     | `corvus` | Set a theme or a custom theme                       |
| `dark_mode`  | `auto`, `light`, `dark`                                                      | `auto`   | Follow system color scheme or force light/dark mode |

The `title`, `theme`, and `week_start` settings can also be overridden per request with query parameters, for example `/year.svg?week_start=monday&theme=github&title=false&dark_mode=dark`.

#### Custom themes

You can also create custom themes under the `themes` property in `data/config.yaml`:

```yaml
themes:
  fuchsia:
    light:
      - "#eff2f5"
      - "#fbb4b9"
      - "#f768a1"
      - "#c51b8a"
      - "#7a0177"
    dark:
      - "#151b23"
      - "#7a0177"
      - "#c51b8a"
      - "#f768a1"
      - "#fbb4b9"
```

Custom themes are available in addition to the built-in themes and can still be overridden with the `theme` query parameter, for example `/year.svg?theme=fuchsia`.

#### Dark mode

Corvus supports dark mode and the calendar will automatically switch between light and dark themes using CSS `prefers-color-scheme` inside the generated SVG. This allows embedded SVGs to follow the surrounding page's color scheme.

You can control dark mode with the `dark_mode` query parameter. Use `auto` to follow `prefers-color-scheme`, `true` to force dark mode, or `false` to force light mode. For example: `/year.svg?dark_mode=true`.

## Environment defaults

- `SYNC_CRON=0 0 * * *` (daily)
- `PORT=3000`
- `DB_PATH=data`
- `CONFIG_PATH=data`
- `LOG_FILE_PATH=data/app.log`
- `LOG_LEVEL=error`
- `HOST=0.0.0.0`

## CLI

Corvus includes a CLI for manual sync inside the container.

Usage: `corvus sync [INTEGRATION...] [--partial]`

- `corvus sync` triggers all enabled integrations asynchronously and returns immediately.
- Passing one or more integration IDs only syncs those integrations.
- Passing `--partial` only fetches commits since the last successful sync.

For progress and final results, check `data/app.log` (or container logs).

## Dev

### Build and run

```bash
bun install
bunx lefthook install
bun run dev
```

### Add a provider

1. Create `src/providers/<provider>/manifest.ts` with provider options schema and normalization.
2. Implement provider adapter/types/client/fetch logic in the same provider directory.
3. Export the manifest in `src/providers/index.ts`.
4. Add manifest and flow tests.
