/*
# Fix: revoke PUBLIC EXECUTE on handle_new_user trigger function

Postgres grants EXECUTE on functions to PUBLIC by default. The previous
revoke only removed grants from `anon` and `authenticated` roles, but
PUBLIC still covers them. This revokes from PUBLIC and re-grants only
to `postgres`.
*/

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
