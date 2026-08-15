# Contributing to FelFelChat

Thanks for helping. This repo is a self-hosted chat app: a **Rust** backend and a **Next.js** UI.

Repository: https://github.com/ZethRise/FelFelChat

## Before you start

You need:

- Node.js 20+
- Rust 1.94+ (`rustc`, `cargo`)
- MongoDB 8+
- npm

Fork the repo, then:

```bash
git clone https://github.com/YOUR_USER/FelFelChat.git
cd FelFelChat
git remote add upstream https://github.com/ZethRise/FelFelChat.git
cp .env.example .env
# set JWT_SECRET, BACKUP_SIGNING_KEY, APP_ORIGIN, DATABASE_URL
npm install
```

Start MongoDB, then:

```bash
npm run db:seed
npm run dev
```

The app listens on `http://127.0.0.1:3000`.

API only:

```bash
npm run dev:api
```

## How to send a change

1. Create a branch from `master`.
2. Make a small, focused change.
3. Test it.
4. Open a pull request against `master`.

Do not open a PR against `legacy`. That branch is the old TypeScript backend.

### Checks before you open the PR

```bash
cargo build
npx next build
npm run lint
```

If you change an API route, hit it with `curl` (or the UI) and confirm status codes and JSON keys still match.

### Commit messages

Use a short sentence that says **why**, not only **what**.

Good: `Fix socket auth so the login cookie is read on handshake.`

## Where code lives

| Path | Role |
| --- | --- |
| `src/` | Rust backend (HTTP, Socket.IO, MongoDB, auth) |
| `app/` | Next.js pages |
| `components/` | React UI |
| `lib/` | Client helpers (crypto, i18n, socket) |
| `docs/OPERATIONS.md` | Ops runbook |

Keep the public HTTP and Socket.IO contract stable unless the PR says it is a breaking change. The UI depends on the same paths, cookie name (`token`), and JSON keys.

## Rules

- Do not commit `.env`, secrets, uploads, backups, or `target/`.
- Do not add unused files or drive-by refactors.
- Match the style of the files you edit.
- For UI work, check the changed page in the browser. One screenshot is not enough.

## Security reports

Do not file a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree your work is licensed under the MIT License. See [LICENSE](LICENSE).
