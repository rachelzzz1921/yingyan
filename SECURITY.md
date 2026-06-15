# Security Policy

## Reporting Security Issues

This is a private repository. Report security, privacy, credential, or compliance concerns directly to the repository owner instead of opening a public issue.

## Sensitive Data Rules

- Do not commit real patient data, hospital data, claim data, API keys, or service-role credentials.
- Use `.env.example` files for configuration examples.
- Keep generated raw model outputs out of Git unless they have been reviewed for sensitive content.
- Treat Supabase service role keys and vector store API keys as production secrets.

## Demo Data

Current prototype cases are intended to be fictional demo data. If any dataset is replaced with real or partner-provided material, add a documented de-identification and access-control review before committing it.
