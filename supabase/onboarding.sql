-- AIKIVO first-workspace onboarding and invitation acceptance.
-- Run after schema.sql. New invitees are attached to the inviter's business.
create schema if not exists private;

create or replace function private.create_aikivo_workspace_for_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 new_business_id uuid;
 requested_name text;
 invite public.business_invitations%rowtype;
 user_display_name text;
begin
 user_display_name:=coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),split_part(coalesce(new.email,''),'@',1));
 select * into invite from public.business_invitations bi
 where lower(bi.email)=lower(coalesce(new.email,'')) and bi.accepted_at is null and bi.expires_at>now()
 order by bi.created_at desc limit 1 for update;

 if invite.id is not null then
  insert into public.business_members(business_id,user_id,member_role,email,display_name)
  values(invite.business_id,new.id,invite.member_role,new.email,user_display_name)
  on conflict(business_id,user_id) do update set email=excluded.email,display_name=excluded.display_name;
  update public.business_invitations set accepted_at=now() where id=invite.id;
  return new;
 end if;

 requested_name:=nullif(left(trim(coalesce(new.raw_user_meta_data->>'business_name','')),120),'');
 insert into public.businesses(name) values(coalesce(requested_name,'My Business')) returning id into new_business_id;
 insert into public.business_members(business_id,user_id,member_role,email,display_name)
 values(new_business_id,new.id,'owner',new.email,user_display_name);
 return new;
end;
$$;
revoke all on function private.create_aikivo_workspace_for_new_user() from public,anon,authenticated;
drop trigger if exists on_aikivo_auth_user_created on auth.users;
create trigger on_aikivo_auth_user_created after insert on auth.users
for each row execute function private.create_aikivo_workspace_for_new_user();
