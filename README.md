# Lumina

SMM panel (haitiviral-based) — Kreyòl first. New repo seeded from `douggue/haitiviral` branch `preview/foundations`. The original **haitiviral** repo is untouched.

SMM panel for Haiti (followers, likes, views, live viewers, comments), paid with MonCash, NatCash and bank transfer, Kreyòl first + French.

Status: foundations copied; next is services engine, PerfectPanel connector, hybrid Lumina product work.

Stack: Next.js 15, TypeScript, Tailwind CSS 4, PostgreSQL + Prisma, Better Auth (2FA, Google), next-intl. Setup and deployment: [docs/DEPLOY.md](docs/DEPLOY.md); operations: [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Run locally

```bash
cp .env.example .env    # fill DATABASE_URL, BETTER_AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET
npm install
npm run db:deploy && npm run db:seed
npm run dev             # http://localhost:3000/ht
TEST_DATABASE_URL=postgresql://…/lumina_test npm test
```

The end-to-end tests in `e2e/` still describe the old games store and are rewritten with the services engine (step 2).

- Plan and decisions: [docs/PLAN.md](docs/PLAN.md)
- Next backlog: [docs/NEXT.md](docs/NEXT.md)
- Mockup: [docs/mockup/](docs/mockup/)
- Risk-analysis prototype: [tools/](tools/)

Hosting: Vercel for testing, its own VPS / droplet in production. API keys only in the hosting environment variables, never in the code.
