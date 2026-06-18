# AGENTS.md

## Project Overview

鹰眼 is a medical insurance audit agent prototype for hackathon/demo work. The repository contains product documents, prompt assets, a runnable Node.js prototype, a prompt evaluation harness, and YHF gate checks for regression safety.

Primary goals:

- Produce evidence-grounded audit findings with source anchors, policy references, and reasoning traces.
- Prefer low false positives over aggressive detection.
- Keep policy text and medical claims grounded in repository knowledge bases or verified public sources.

## Repository Map

- `README.md` - human entry point and reading path.
- `docs/` - product, architecture, policy, roadmap, and pitch documents.
- `prompts/` - prompt engineering assets and iteration instructions.
- `prototype/` - runnable web prototype and deterministic audit engine.
- `prototype/app/` - Node.js HTTP server, API routes, KB clients, and static UI.
- `prototype/data/` - demo cases, rule definitions, expected findings, and KB JSON.
- `eval/` - prompt evaluation harness and real model regression results.
- `yhf/` - YHF gate framework for engine/rule/prompt/shadow checks.
- `scripts/` - operational scripts such as KB ingestion.
- `supabase/` - local database config and migrations.
- `assets/` - brand assets and design documentation.

## Setup Commands

Use Node.js 18 or newer.

```bash
cd prototype/app
npm ci
node server.js
```

Open `http://localhost:3700` for the prototype and `http://localhost:3700/dashboard.html` for the dashboard.

## Common Commands

```bash
# Build runtime rule JSON from YAML
cd prototype/app
npm run build:rules

# Run the prototype
cd prototype/app
npm start

# Run YHF gate from the repository root
bash yhf/run.sh
bash yhf/run.sh --strict

# 看板前端跨脚本依赖（语法 + dash-bridges 契约）
node scripts/verify-dashboard-frontend.js

# Run prompt evaluations after configuring eval/.env
cd eval
bash run_baseline.sh
bash run_v7.sh
```

## Environment Variables

Never commit real secrets. Use examples as templates:

- `prototype/app/.env.example`
- `eval/.env.example`

Important optional keys include `MINIMAX_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, and `STEPFUN_API_KEY`.

## Safety Rules

- Do not commit `.env`, generated raw model outputs, local Supabase temp state, or `node_modules`.
- Do not invent policy clauses or clinical guideline text. Use KB entries, cited documents, or explicitly mark items as unverified.
- Preserve the zero false positive red line for clean cases unless the user explicitly changes the evaluation policy.
- Keep `rules.yaml` as the human-readable source of truth for rules and rebuild `rules.json` when rule definitions change.
- Treat `prototype/data/review_feedback.json` and `prototype/data/rule_states.json` as runtime/local state, not source code.

## Development Guidance

- Keep prototype changes dependency-light. Runtime serving is intentionally plain Node.js and static frontend code.
- Prefer small, auditable changes in rule logic, KB content, and harness behavior.
- When changing audit behavior, run `bash yhf/run.sh --strict` from the repository root.
- When editing prompt assets, document the motivating failure mode and rerun the relevant `eval/` harness if keys are available.
- When editing TSX/React code under future app directories, follow the local framework conventions before adding new abstractions.

## Pull Request Expectations

Each PR should include:

- What changed and why.
- How it was verified.
- Whether audit findings, rule behavior, prompt behavior, or KB content changed.
- Any remaining manual policy/clinical verification needed.
