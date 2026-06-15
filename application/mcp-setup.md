# Agent Stack Setup — Claude Code & Codex

MCP servers + autonomy config to bring Claude Code and Codex up to "Cursor-level"
for a full-stack (Supabase + Vercel) hackathon project.

**Chosen servers (8):** Context7 · Supabase · Vercel · Playwright · GitHub · Figma · Stripe · Firecrawl

> 8 is above the recommended 3–5 sweet spot, so don't run them all at once — see
> **§5 Run per phase**. Each server adds ~500–1,000 tokens of context per tool.

---

## 1. Prerequisites

- **Node.js 18+** (`node -v`). Needed for the `npx`-based servers and both CLIs.
- Grab these tokens/keys once:

| Service | What to get | Where |
|---|---|---|
| Supabase | Personal Access Token (or use OAuth login) | Dashboard → Account → Access Tokens |
| GitHub | Fine-grained PAT, scoped to your repo(s) | Settings → Developer settings → Personal access tokens |
| Vercel | nothing — uses OAuth (browser login) | — |
| Figma | Personal Access Token | Settings → Account → Personal access tokens |
| Stripe | **TEST-mode** secret key `sk_test_…` | Dashboard (Test mode) → Developers → API keys |
| Firecrawl | API key `fc-…` (free tier) | firecrawl.dev/app/api-keys |
| Context7 | optional API key for higher limits | context7.com (not required) |
| Playwright | nothing | — |

Export the env-var–based ones in your shell profile (`~/.zshrc` / `~/.bashrc`):

```bash
export SUPABASE_PAT="sbp_..."
export GITHUB_PAT="github_pat_..."
export STRIPE_TEST_KEY="sk_test_..."
export FIRECRAWL_API_KEY="fc-..."
export FIGMA_PAT="figd_..."
```

---

## 2. Claude Code

### 2a. Let it act autonomously

Create `.claude/settings.json` in the repo root so it doesn't ask permission every step:

```json
{
  "permissions": {
    "allow": ["Bash", "Read", "Edit", "Write", "WebFetch", "WebSearch", "mcp__*"]
  },
  "enableAllProjectMcpServers": true
}
```

### 2b. Add the MCP servers

One-liners (run in the repo). For the HTTP servers, Claude Code expands `$VAR`
from your shell, so secrets stay out of the config:

```bash
# Context7 — up-to-date library docs (stdio, no key needed)
claude mcp add --transport stdio context7 -- npx -y @upstash/context7-mcp

# Supabase — read-write, ALL projects (no project_ref / no read_only)
claude mcp add --transport http supabase https://mcp.supabase.com/mcp \
  --header "Authorization: Bearer $SUPABASE_PAT"

# Vercel — OAuth (you'll authenticate via /mcp after adding)
claude mcp add --transport http vercel https://mcp.vercel.com

# Playwright — browser + E2E (stdio, local, no key)
claude mcp add --transport stdio playwright -- npx -y @playwright/mcp@latest

# GitHub — issues/PRs as tools (the npm @modelcontextprotocol/server-github is deprecated; use the remote)
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer $GITHUB_PAT"

# Figma — design-to-code (community Framelink server; see §6 for the official Figma option)
claude mcp add --transport stdio figma --env FIGMA_API_KEY=$FIGMA_PAT \
  -- npx -y figma-developer-mcp --stdio

# Stripe — payments (TEST key only!)
claude mcp add --transport http stripe https://mcp.stripe.com \
  --header "Authorization: Bearer $STRIPE_TEST_KEY"

# Firecrawl — web scraping / live data for your agent
claude mcp add --transport stdio firecrawl --env FIRECRAWL_API_KEY=$FIRECRAWL_API_KEY \
  -- npx -y firecrawl-mcp
```

Then start `claude`, run `/mcp` to authenticate Vercel (OAuth) and confirm everything
shows **connected**.

### 2c. Or commit a `.mcp.json` (shareable, env-var expansion)

Drop this at the repo root instead of the commands above — `${VAR}` is expanded from
your shell so no secrets are committed:

```json
{
  "mcpServers": {
    "context7":   { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] },
    "supabase":   { "type": "http", "url": "https://mcp.supabase.com/mcp",
                    "headers": { "Authorization": "Bearer ${SUPABASE_PAT}" } },
    "vercel":     { "type": "http", "url": "https://mcp.vercel.com" },
    "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@latest"] },
    "github":     { "type": "http", "url": "https://api.githubcopilot.com/mcp/",
                    "headers": { "Authorization": "Bearer ${GITHUB_PAT}" } },
    "figma":      { "command": "npx", "args": ["-y", "figma-developer-mcp", "--stdio"],
                    "env": { "FIGMA_API_KEY": "${FIGMA_PAT}" } },
    "stripe":     { "type": "http", "url": "https://mcp.stripe.com",
                    "headers": { "Authorization": "Bearer ${STRIPE_TEST_KEY}" } },
    "firecrawl":  { "command": "npx", "args": ["-y", "firecrawl-mcp"],
                    "env": { "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}" } }
  }
}
```

---

## 3. Codex

Codex stores everything in `~/.codex/config.toml` (user-level, **not** committed —
good place for stdio keys). It supports both stdio and remote HTTP + OAuth.

```toml
# ~/.codex/config.toml

# --- autonomy: act inside the repo without nagging ---
approval_policy = "on-request"     # "never" for fully unattended runs
sandbox_mode    = "workspace-write"

[sandbox_workspace_write]
network_access = true              # allow installs / API calls

# --- MCP servers ---
# HTTP servers read a NAMED env var from your shell (bearer_token_env_var) — export them (§1).
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.supabase]
url = "https://mcp.supabase.com/mcp"
bearer_token_env_var = "SUPABASE_PAT"

[mcp_servers.vercel]
url = "https://mcp.vercel.com"
# OAuth: run `codex mcp login vercel` once after saving this file

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]

[mcp_servers.github]
url = "https://api.githubcopilot.com/mcp/"
bearer_token_env_var = "GITHUB_PAT"

[mcp_servers.stripe]
url = "https://mcp.stripe.com"
bearer_token_env_var = "STRIPE_TEST_KEY"

# stdio servers: Codex passes env values literally — put your key here (file is private to ~/.codex)
[mcp_servers.figma]
command = "npx"
args = ["-y", "figma-developer-mcp", "--stdio"]
env = { FIGMA_API_KEY = "figd_YOUR_TOKEN" }

[mcp_servers.firecrawl]
command = "npx"
args = ["-y", "firecrawl-mcp"]
env = { FIRECRAWL_API_KEY = "fc_YOUR_KEY" }
```

Then: `codex mcp login vercel`, start a session, and run `/mcp` to verify connections.
(Prefer the interactive route? `codex mcp add <name>` walks you through each one.)

---

## 4. GitHub: you have both paths

You chose to keep both. Use whichever fits the moment:

- **Shell (`git` / `gh`)** — already built into both agents once you've run `gh auth login`.
  Best for commits, branches, pushes, opening PRs. Zero token overhead. Default to this.
- **GitHub MCP** (configured above) — use when you want the agent to *reason over*
  issues/PRs as structured tools (triage, cross-referencing, bulk PR review).

---

## 5. Run per phase (token budget)

Don't keep all 8 hot. Suggested rotation:

| Always on | Toggle on for the relevant phase |
|---|---|
| Context7, Supabase, Playwright | Vercel (when deploying) · GitHub MCP (issue/PR work) · Figma (building UI from designs) · Stripe (payments work) · Firecrawl (the web-data part of your agent) |

- **Codex:** add `enabled = false` to any `[mcp_servers.x]` block to park it.
- **Claude Code:** toggle servers per project via `/mcp`, or omit them from `.mcp.json`.

Keeping ~3–4 active at a time keeps your context lean.

---

## 6. Notes & safety

- **Supabase is dev/test only.** Supabase explicitly says its MCP server is for
  development, never production data — you've got read-write across *all* projects here,
  so point it at a throwaway/hackathon project, not anything with real user data.
- **Stripe: TEST keys only** (`sk_test_…`). Never give an autonomous agent a live key.
- **Keep tokens in env vars**, not committed files. The `.mcp.json` uses `${VAR}`
  expansion; the Codex stdio keys live in user-level `~/.codex/config.toml` (not in the repo).
- **Figma — official alternative:** the community `figma-developer-mcp` (above) needs only
  a PAT and runs headless. If you'd rather use Figma's official server, enable it in the
  Figma desktop app (Preferences → Dev Mode MCP Server) and point the client at the local
  URL it shows (typically `http://127.0.0.1:3845/mcp`). Requires the desktop app + a Dev seat.
- **Playwright** may download browser binaries on first run (`npx playwright install`).
- **Pin versions** if a server breaks — the Supabase server is pre-1.0 and can have
  breaking changes between releases.

---

## 7. Pairs with your instruction files

This doc handles tools + permissions. Keep your `CLAUDE.md` / `AGENTS.md` (the persistent
"system prompt": stack, commands, conventions, definition-of-done) in the repo root
alongside this — together they're what gets each agent to full-stack-autonomous.
