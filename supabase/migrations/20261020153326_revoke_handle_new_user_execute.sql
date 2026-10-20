/*
# Revoke EXECUTE on handle_new_user trigger function

The `handle_new_user()` function is a SECURITY DEFINER trigger that runs
automatically when a new user signs up (via the `on_auth_user_created`
trigger on `auth.users`). It should NOT be callable directly by any
role via the REST API (`/rest/v1/rpc/handle_new_user`).

## Changes

1. Revoke EXECUTE from `anon` and `authenticated` roles.
2. Grant EXECUTE only to `postgres` (the trigger runs as the table owner).
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
