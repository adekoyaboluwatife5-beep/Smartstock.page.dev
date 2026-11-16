# SmartStock — Supabase migration branch

This branch contains an in-progress migration from AppDeploy's hosted auth/data APIs to Supabase.

## Current architecture
- React + Vite frontend.
- Supabase Auth passwordless email sign-in (magic link).
- Supabase Postgres tables protected by Row Level Security.
- Product and sales reads/writes use Supabase directly.
- Sale recording calls the `record_sale` Postgres function so stock deduction and sale insertion happen in one transaction.

## Supabase setup
1. In the Supabase SQL Editor, run `supabase/migrations/0001_initial_schema.sql`.
2. Then run `supabase/migrations/0002_atomic_sale_function.sql`.
3. In Supabase Dashboard → Authentication → URL Configuration, set the Site URL to the deployed frontend URL and add that URL to Redirect URLs. During local development also allow `http://localhost:5173/**`.
4. Configure these frontend build environment variables in the deployment platform:
   - `VITE_SUPABASE_URL`: `https://YOUR_PROJECT_REF.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: Supabase Publishable key (or legacy anon public key).
5. Never put a Supabase secret/service-role key in frontend code or a `VITE_*` variable.

## Local development
1. Copy `.env.example` to `.env.local`.
2. Fill in the two public Supabase values above.
3. Run `npm install`, then `npm run dev`.
4. Run `npm run build` before deployment.

## Important status
- This is a migration branch, not a production deployment.
- The AppDeploy live app is intentionally unchanged.
- Confirm the SQL migrations have been run in the target Supabase project.
- Confirm the Supabase Auth redirect allowlist and frontend environment variables before testing sign-in.
- End-to-end sign-in, tenant isolation, product CRUD, and concurrent sales still require verification.
- Payments, staff invitations, and Cloudflare custom-domain deployment are not part of this migration yet.
