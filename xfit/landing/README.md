# Tailor-X Landing Page

Marketing site + waitlist signup for Tailor-X. Built with Next.js 14 (App Router) + Tailwind.

## Local dev

```bash
cp .env.local.example .env.local
npm install
npm run dev   # http://localhost:3002
```

## Environment

| Var | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://tailorx-pose-api-production.up.railway.app` | FastAPI backend (waitlist endpoints) |
| `NEXT_PUBLIC_ADMIN_URL` | `https://tailorx-admin-production.up.railway.app` | Admin dashboard sign-in link |
| `NEXT_PUBLIC_SITE_URL`  | `https://tailorxfit.com` | Public canonical URL (for OG metadata) |

## Backend endpoints used

- `POST /v1/waitlist` — email + optional name/company/role/useCase. Returns `{ success, alreadyJoined }`. Rate-limited per IP (10/hr).
- `GET /v1/waitlist/stats` — public count for social proof.

## Deploy (Railway)

Create a new Railway service rooted at `xfit/landing`. Nixpacks auto-detects Node 20 via `nixpacks.toml`. Set the env vars above. The `start` command honours `$PORT`.
