# DevPulse — Supabase Setup

## Run order

Execute each file in the Supabase SQL Editor (Dashboard → SQL Editor → New query):

1. `migrations/01_schema.sql` — all tables and indexes
2. `migrations/02_rls.sql` — RLS enable + helper functions + all policies
3. `migrations/03_seed.sql` — products seed + team member seed

## Before running 03_seed.sql

1. Go to **Authentication → Users** in the Supabase Dashboard
2. Create an auth account for each team member using the emails in `03_seed.sql`
3. Copy the UUID Supabase assigned to each user
4. Replace the placeholder UUIDs (`00000000-0000-0000-0000-00000000000X`) in `03_seed.sql`
5. Run the file

You can fetch real UUIDs any time with:

```sql
SELECT id, email FROM auth.users ORDER BY created_at;
```

## Edge Functions (Phase 10)

Scheduled jobs live in `supabase/functions/` — set up in Phase 10.
