# SQL checks

These run the real schema against a throwaway Postgres and assert the parts
that cannot be seen from the app: row-level security, the completion trigger,
and the `circle_activity` function.

`00_supabase_stubs.sql` recreates the little of Supabase the schema depends on
(`auth.users`, `auth.uid()`, the `authenticated` role). `01_policies_test.sql`
does the work and raises on the first wrong answer.

```bash
# any empty Postgres 13+ database will do
export PSQL="psql -v ON_ERROR_STOP=1 -q -d postgres://…"

$PSQL -f supabase/tests/00_supabase_stubs.sql
$PSQL -f supabase/schema.sql
$PSQL -f supabase/migrations/002_profiles_and_circles.sql
$PSQL -f supabase/migrations/003_shareable_profiles.sql
$PSQL -f supabase/migrations/004_avatars_and_group_privacy.sql
$PSQL -f supabase/tests/01_policies_test.sql
# -> NOTICE:  ALL SQL BEHAVIOUR CHECKS PASSED
```

Run every migration in order before the test file — it exercises columns and
functions (avatar photos, `is_public`, ask-to-join circles) that only exist
once 003 and 004 have run. Skipping either one fails with a plain
`column ... does not exist` instead of a real assertion.

Do **not** run `01_policies_test.sql` against your live project: it inserts
test accounts into `auth.users`.
