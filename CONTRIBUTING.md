# Contributing

## Development Flow

1. Create a focused branch for each change.
2. Keep rule, KB, prompt, and UI changes separate when practical.
3. Update docs or examples when commands, environment variables, or audit behavior change.
4. Open a pull request with the verification commands you ran.

## Local Verification

```bash
cd prototype/app
npm ci
npm run build:rules

cd ../..
bash yhf/run.sh --strict
```

Prompt evaluations require model API keys and may be run selectively from `eval/`.

## Audit Rule and KB Changes

- Keep `prototype/data/rules/rules.yaml` as the source of truth.
- Rebuild `prototype/data/rules/rules.json` after rule edits.
- Include source evidence for policy or clinical KB changes.
- Do not promote an unverified source into a final audit finding without marking its verification status.

## Secrets

Never commit real `.env` files, API keys, Supabase service role keys, raw patient data, or local generated model outputs.
