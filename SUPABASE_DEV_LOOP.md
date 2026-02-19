# Supabase Dev Loop (Renpay)

## Goal
- Keep app features and Supabase schema in sync.
- For every DB-related feature, always provide SQL migration steps for manual paste in Supabase SQL Editor.

## Current Known RLS Policies (from production export)

### `files`
- `Service role has full access to files` (`ALL`)
- `Users can view own order files` (`SELECT` via `orders.user_id = auth.uid()`)

### `order_items`
- `Service role has full access to order_items` (`ALL`)
- `Users can create own order items` (`INSERT` with `EXISTS` on parent order ownership)
- `Users can view own order items` (`SELECT` with same ownership check)

### `orders`
- `Service role has full access to orders` (`ALL`)
- `Users can create own orders` (`INSERT` with `auth.uid() = user_id`)
- `Users can delete own orders` (`DELETE` with `auth.uid() = user_id`)
- `Users can update own orders` (`UPDATE` with `auth.uid() = user_id`)
- `Users can view own orders` (`SELECT` with `auth.uid() = user_id`)

### `payments`
- `Service role has full access to payments` (`ALL`)
- `Users can create own payments` (`INSERT` with `auth.uid() = user_id`)
- `Users can view own payments` (`SELECT` with `auth.uid() = user_id`)

### `users`
- `Service role has full access to users` (`ALL`)
- `Users can update own profile` (`UPDATE` with `auth.uid() = id`)
- `Users can view own profile` (`SELECT`, currently `qual = true`)

## Required Workflow For Any DB-Related Feature
1. Define feature data contract first (new column/table/index/constraint/policy).
2. Generate SQL migration script with:
   - `BEGIN; ... COMMIT;`
   - idempotent checks where possible (`IF NOT EXISTS` / conditional `DO $$`)
   - rollback notes (`DROP` statements) if needed.
3. Share exact SQL block for Supabase SQL Editor.
4. Update API code to match new schema.
5. Add runtime fallback for old rows if migration not applied yet.
6. Verify RLS impact for `anon`, `authenticated`, and `service_role`.
7. Include a short post-migration verify query block.

## Standard Migration Template
```sql
BEGIN;

-- 1) Schema changes
-- ALTER TABLE ...
-- CREATE TABLE ...
-- CREATE INDEX ...

-- 2) Backfill if needed
-- UPDATE ...

-- 3) Constraints
-- ALTER TABLE ... ADD CONSTRAINT ...

-- 4) RLS/policies
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ...

COMMIT;
```

## Standard Verify Template
```sql
-- Columns
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- Policies
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Important Notes
- Policy `Users can view own profile` on `users` is currently broad (`qual = true`). Treat this as a review item when touching user privacy/security.
- This file is the default DB synchronization loop for future development in this repo.
