# MATMAX Portfolio — Stock Watchlist

A stock-watching web app inspired by Google Finance. Track stocks on a personal
watchlist with live prices, interactive charts and news, run "what-if"
investment calculations, and connect with friends to share watchlists.

## Features

- **Auth** — email/password accounts (Supabase), each user sees only their own data
- **Watchlist** — add/remove/reorder stocks; live price, sparkline and % change per row, with Day / Week / Month / Year / 5Y / All ranges
- **Stock detail** — live quote, interactive price chart, key stats and company news
- **Forecast** (Pro) — Monte Carlo simulation over Geometric Brownian Motion with fat-tailed shocks and a stationary block bootstrap, giving best / likely / worst outcomes for a date you pick. Everyone can run the S&P 500 sample; Pro forecasts any stock
- **News briefings** (Pro) — a six-line AI summary of the last 24 hours on any watchlist stock, with its sources listed underneath
- **Alerts** — the three biggest things on your watchlist right now, earnings first, then the largest move of the day
- **Lookback** — "what if you'd invested $X on date Y" calculator (free plan: 3/day; Pro: no limit)
- **Community** — find friends by username, send/accept friend requests, view each other's watchlists
- **Payments** — $4.99/month Stripe subscription, with an auto-pay switch that sets `cancel_at_period_end`, so you can cancel right up to the day before the next charge and keep the days you've paid for

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router) + TypeScript + React
- Tailwind CSS + shadcn/ui
- [Supabase](https://supabase.com/) — Postgres, Auth, Row-Level Security
- [Stripe](https://stripe.com/) — monthly subscription checkout
- AI news briefings: [Claude](https://www.anthropic.com/) via `@anthropic-ai/sdk` (optional; falls back to a built-in composer)
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
sandbox). `ANTHROPIC_API_KEY` is optional — set it to have Claude write the
news briefings instead of the built-in composer. Never commit `.env.local` — it's
gitignored.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — lint

## Deployment

Deploy on [Vercel](https://vercel.com/): import the repo, set the same
environment variables in the project settings (keep the service-role and Stripe
secret keys server-only — no `NEXT_PUBLIC_` prefix), and deploy. Supabase is
already cloud-hosted.

## External services

These are the third-party websites this project relies on to work:

- **[GitHub](https://github.com/)** — hosts the source code repository.
- **[Vercel](https://vercel.com/)** — builds and hosts the live website.
- **[Supabase](https://supabase.com/)** — provides the database, user accounts/login, and per-user data security.
- **[Stripe](https://stripe.com/)** — processes the $4.99/month subscription for the Pro plan.
- **[Anthropic](https://www.anthropic.com/)** — writes the Pro news briefings, when an API key is configured.
- **[Finnhub](https://finnhub.io/)** — supplies live stock quotes, ticker search, company logos, and news.
- **[Yahoo Finance](https://finance.yahoo.com/)** — supplies the historical price data used to draw the charts.
