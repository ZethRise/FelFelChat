# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| `master` (current Rust backend) | Yes |
| `legacy` (old TypeScript backend) | No |

Only `master` receives security fixes.

## How to report a vulnerability

Do **not** open a public GitHub issue for a security problem.

Report it privately with GitHub Security Advisories:

https://github.com/ZethRise/FelFelChat/security/advisories/new

Include:

- What is affected (auth, uploads, backups, admin, sockets, and so on)
- Steps to reproduce
- Impact (who can exploit it, what they can do)
- A patch or workaround if you have one

We will confirm the report, fix it on `master`, and credit you if you want that.

## Please do not

- Publish exploit details before a fix is out
- Access other people's data on a live server
- Run load tests or scans against a production instance you do not own

## What we treat as security issues

- Auth bypass, JWT or cookie flaws
- Path traversal or unsafe file serving
- CSRF gaps on state-changing routes
- Unsigned or unverified backup restore
- Privilege escalation (non-admin reaching `/admin` or admin APIs)
- Secret leakage in logs or responses

## Operators

If you run FelFelChat:

- Set strong `JWT_SECRET` and `BACKUP_SIGNING_KEY`
- Use HTTPS and set `APP_ORIGIN` to that HTTPS origin
- Rotate `JWT_SECRET` after a suspected leak (this signs out every session)
- Do not restore a backup unless the `.meta.json` HMAC check passes
- See `docs/OPERATIONS.md` for rotation and incident steps
