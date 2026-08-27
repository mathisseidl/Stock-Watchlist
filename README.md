# MATMAX Portfolio — Stock Watchlist

A stock-watching web app inspired by Google Finance. Track stocks on a personal
watchlist with live prices, interactive charts and news, run "what-if"
investment calculations, and connect with friends to share watchlists.

## Features

- **Auth** — email/password accounts (Supabase), each user sees only their own data
- **Watchlist** — add/remove/reorder stocks; live price, sparkline and % change per row, with Day / Week / Month / Year / 5Y / All ranges
- **Stock detail** — live quote, interactive price chart, key stats and company news
- **Analytics** — "what if you'd invested $X on date Y" calculator (free plan: 3/day; Unlimited plan: no limit)
- **Community** — find friends by username, send/accept friend requests, view each other's watchlists
- **Payments** — one-time $3.99 Stripe upgrade unlocks unlimited Analytics

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router) + TypeScript + React
- Tailwind CSS + shadcn/ui
- [Supabase](https://supabase.com/) — Postgres, Auth, Row-Level Security
- [Stripe](https://stripe.com/) — one-time checkout
- Market data: [Finnhub](https://finnhub.io/) (quotes, search, logos, news) + Yahoo Finance (historical candles)
- Charts: [lightweight-charts](https://github.com/tradingview/lightweight-charts)

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
```

### Environment variables

See [`.env.example`](.env.example). You'll need a Finnhub API key, a Supabase
project (URL + anon + service-role keys), and Stripe keys (use test keys for
sandbox). Never commit `.env.local` — it's gitignored.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — lint

## Deployment

Deploy on [Vercel](https://vercel.com/): import the repo, set the same
environment variables in the project settings (keep the service-role and Stripe
secret keys server-only — no `NEXT_PUBLIC_` prefix), and deploy. Supabase is
already cloud-hosted.
