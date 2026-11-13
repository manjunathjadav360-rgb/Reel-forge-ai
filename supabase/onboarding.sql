-- AIKIVO first-workspace onboarding.
-- Run only AFTER schema.sql has been reviewed and applied to the intended Supabase project.
-- The business name is display data only; no authorization role is read from user metadata.

create schema if not exists private;

create or replace function private.create_aikivo_workspace_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_business_id uuid;
  requested_name text;
begin
  requested_name := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'business_name', '')), 120), '');

  insert into public.businesses (name)
  values (coalesce(requested_name, 'My Business'))
  returning id into new_business_id;

  insert into public.business_members (business_id, user_id, member_role)
  values (new_business_id, new.id, 'owner');

  return new;
end;
$$;

-- Trigger functions are not exposed as a client API.
revoke all on function private.create_aikivo_workspace_for_new_user() from public;
revoke all on function private.create_aikivo_workspace_for_new_user() from anon;
revoke all on function private.create_aikivo_workspace_for_new_user() from authenticated;

drop trigger if exists on_aikivo_auth_user_created on auth.users;

create trigger on_aikivo_auth_user_created
after insert on auth.users
for each row
execute function private.create_aikivo_workspace_for_new_user();
