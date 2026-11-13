-- AIKIVO multi-tenant starter schema. Review and test before production.
create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  website text,
  default_language text not null default 'English',
  created_at timestamptz not null default now()
);
create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'owner' check(member_role in ('owner','admin','agent','viewer')),
  created_at timestamptz not null default now(),
  primary key (business_id,user_id)
);
create table if not exists public.ai_executives (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  role text not null default 'Customer support',
  greeting text not null,
  language text not null default 'English',
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  executive_id uuid references public.ai_executives(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  executive_id uuid references public.ai_executives(id) on delete set null,
  channel text not null default 'phone' check(channel in ('phone','web','test')),
  status text not null default 'open' check(status in ('open','resolved','escalated')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  speaker text not null check(speaker in ('customer','assistant','human','system')),
  body text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  subject text not null,
  description text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create index if not exists business_members_user_idx on public.business_members(user_id);
create index if not exists executives_business_idx on public.ai_executives(business_id);
create index if not exists knowledge_business_idx on public.knowledge_items(business_id);
create index if not exists conversations_business_idx on public.conversations(business_id);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.ai_executives enable row level security;
alter table public.knowledge_items enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.support_tickets enable row level security;

-- A user can read their own membership row. This avoids recursive membership policies.
create policy "users read own memberships" on public.business_members
for select to authenticated using (user_id = (select auth.uid()));

-- Business data access is granted only when the signed-in user has a membership row.
create policy "members read businesses" on public.businesses
for select to authenticated using (
  exists (select 1 from public.business_members bm where bm.business_id = id and bm.user_id = (select auth.uid()))
);
create policy "members update businesses" on public.businesses
for update to authenticated using (
  exists (select 1 from public.business_members bm where bm.business_id = id and bm.user_id = (select auth.uid()) and bm.member_role in ('owner','admin'))
) with check (
  exists (select 1 from public.business_members bm where bm.business_id = id and bm.user_id = (select auth.uid()) and bm.member_role in ('owner','admin'))
);

create policy "members manage executives" on public.ai_executives
for all to authenticated using (
  exists (select 1 from public.business_members bm where bm.business_id = ai_executives.business_id and bm.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.business_members bm where bm.business_id = ai_executives.business_id and bm.user_id = (select auth.uid()))
);
create policy "members manage knowledge" on public.knowledge_items
for all to authenticated using (
  exists (select 1 from public.business_members bm where bm.business_id = knowledge_items.business_id and bm.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.business_members bm where bm.business_id = knowledge_items.business_id and bm.user_id = (select auth.uid()))
);
create policy "members read conversations" on public.conversations
for select to authenticated using (
  exists (select 1 from public.business_members bm where bm.business_id = conversations.business_id and bm.user_id = (select auth.uid()))
);
create policy "members create conversations" on public.conversations
for insert to authenticated with check (
  exists (select 1 from public.business_members bm where bm.business_id = conversations.business_id and bm.user_id = (select auth.uid()))
);
create policy "members read messages" on public.conversation_messages
for select to authenticated using (
  exists (select 1 from public.conversations c join public.business_members bm on bm.business_id = c.business_id where c.id = conversation_id and bm.user_id = (select auth.uid()))
);
create policy "members create messages" on public.conversation_messages
for insert to authenticated with check (
  exists (select 1 from public.conversations c join public.business_members bm on bm.business_id = c.business_id where c.id = conversation_id and bm.user_id = (select auth.uid()))
);
create policy "members manage tickets" on public.support_tickets
for all to authenticated using (
  exists (select 1 from public.business_members bm where bm.business_id = support_tickets.business_id and bm.user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.business_members bm where bm.business_id = support_tickets.business_id and bm.user_id = (select auth.uid()))
);

-- Trusted server-side onboarding must create a business and its first owner membership.
-- This is intentionally not granted to browser clients in this starter schema.
-- Never trust editable user_metadata for authorization and never expose service_role keys in the browser.

-- Least-privilege Data API access. RLS policies above enforce tenant isolation.
revoke all on table public.businesses, public.business_members, public.ai_executives,
  public.knowledge_items, public.conversations, public.conversation_messages,
  public.support_tickets from anon;
revoke all on table public.businesses, public.business_members, public.ai_executives,
  public.knowledge_items, public.conversations, public.conversation_messages,
  public.support_tickets from authenticated;

grant select, update on table public.businesses to authenticated;
grant select on table public.business_members to authenticated;
grant select, insert, update, delete on table public.ai_executives to authenticated;
grant select, insert, update, delete on table public.knowledge_items to authenticated;
grant select, insert on table public.conversations to authenticated;
grant select, insert on table public.conversation_messages to authenticated;
grant select, insert, update, delete on table public.support_tickets to authenticated;

-- Human handoff workflow additions (safe to re-run).
alter table public.support_tickets add column if not exists priority text not null default 'normal';
alter table public.support_tickets add column if not exists updated_at timestamptz not null default now();
create index if not exists support_tickets_business_status_idx on public.support_tickets(business_id,status,created_at desc);
drop policy if exists "members update conversations" on public.conversations;
create policy "members update conversations" on public.conversations for update to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=conversations.business_id and bm.user_id=(select auth.uid())))
with check (exists (select 1 from public.business_members bm where bm.business_id=conversations.business_id and bm.user_id=(select auth.uid())));
grant update on table public.conversations to authenticated;


-- Workspace role-based permissions.
drop policy if exists "members manage executives" on public.ai_executives;
drop policy if exists "members read executives" on public.ai_executives;
drop policy if exists "admins manage executives" on public.ai_executives;
create policy "members read executives" on public.ai_executives for select to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=ai_executives.business_id and bm.user_id=(select auth.uid())));
create policy "admins manage executives" on public.ai_executives for all to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=ai_executives.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin')))
with check (exists (select 1 from public.business_members bm where bm.business_id=ai_executives.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin')));

drop policy if exists "members manage knowledge" on public.knowledge_items;
drop policy if exists "members read knowledge" on public.knowledge_items;
drop policy if exists "admins manage knowledge" on public.knowledge_items;
create policy "members read knowledge" on public.knowledge_items for select to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=knowledge_items.business_id and bm.user_id=(select auth.uid())));
create policy "admins manage knowledge" on public.knowledge_items for all to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=knowledge_items.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin')))
with check (exists (select 1 from public.business_members bm where bm.business_id=knowledge_items.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin')));

drop policy if exists "members manage tickets" on public.support_tickets;
drop policy if exists "members read tickets" on public.support_tickets;
drop policy if exists "support staff create tickets" on public.support_tickets;
drop policy if exists "support staff update tickets" on public.support_tickets;
drop policy if exists "admins delete tickets" on public.support_tickets;
create policy "members read tickets" on public.support_tickets for select to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=support_tickets.business_id and bm.user_id=(select auth.uid())));
create policy "support staff create tickets" on public.support_tickets for insert to authenticated
with check (exists (select 1 from public.business_members bm where bm.business_id=support_tickets.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin','agent')));
create policy "support staff update tickets" on public.support_tickets for update to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=support_tickets.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin','agent')))
with check (exists (select 1 from public.business_members bm where bm.business_id=support_tickets.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin','agent')));
create policy "admins delete tickets" on public.support_tickets for delete to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=support_tickets.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin')));

drop policy if exists "members create conversations" on public.conversations;
drop policy if exists "support staff create conversations" on public.conversations;
create policy "support staff create conversations" on public.conversations for insert to authenticated
with check (exists (select 1 from public.business_members bm where bm.business_id=conversations.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin','agent')));
drop policy if exists "members update conversations" on public.conversations;
drop policy if exists "support staff update conversations" on public.conversations;
create policy "support staff update conversations" on public.conversations for update to authenticated
using (exists (select 1 from public.business_members bm where bm.business_id=conversations.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin','agent')))
with check (exists (select 1 from public.business_members bm where bm.business_id=conversations.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin','agent')));


-- Team directory and secure invitation support.
alter table public.business_members add column if not exists email text;
alter table public.business_members add column if not exists display_name text;
update public.business_members bm
set email=u.email, display_name=coalesce(nullif(u.raw_user_meta_data->>'full_name',''),split_part(coalesce(u.email,''),'@',1))
from auth.users u where u.id=bm.user_id and (bm.email is null or bm.display_name is null);

create table if not exists public.business_invitations (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 email text not null,
 member_role text not null check(member_role in ('admin','agent','viewer')),
 invited_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '7 days'),
 accepted_at timestamptz
);
create unique index if not exists business_invitations_pending_email_idx
on public.business_invitations(business_id,lower(email)) where accepted_at is null;
alter table public.business_invitations enable row level security;
revoke all on public.business_invitations from anon,authenticated;
grant select,insert,update,delete on public.business_invitations to service_role;

create or replace function private.is_business_admin(target_business_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.business_members bm where bm.business_id=target_business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin')); $$;
create or replace function private.is_business_owner(target_business_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.business_members bm where bm.business_id=target_business_id and bm.user_id=(select auth.uid()) and bm.member_role='owner'); $$;
revoke all on function private.is_business_admin(uuid) from public,anon;
revoke all on function private.is_business_owner(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.is_business_admin(uuid) to authenticated;
grant execute on function private.is_business_owner(uuid) to authenticated;

drop policy if exists "users read own memberships" on public.business_members;
drop policy if exists "users read own or admins read team" on public.business_members;
create policy "users read own or admins read team" on public.business_members for select to authenticated
using(user_id=(select auth.uid()) or private.is_business_admin(business_id));
drop policy if exists "admins update team roles" on public.business_members;
create policy "admins update team roles" on public.business_members for update to authenticated
using(private.is_business_admin(business_id) and user_id<>(select auth.uid()) and member_role<>'owner')
with check(private.is_business_admin(business_id) and user_id<>(select auth.uid()) and member_role<>'owner' and (private.is_business_owner(business_id) or member_role<>'admin'));
drop policy if exists "admins remove team members" on public.business_members;
create policy "admins remove team members" on public.business_members for delete to authenticated
using(private.is_business_admin(business_id) and user_id<>(select auth.uid()) and member_role<>'owner');
grant select on public.business_members to authenticated;
grant update(member_role) on public.business_members to authenticated;
grant delete on public.business_members to authenticated;

drop policy if exists "service role manages invitations" on public.business_invitations;
create policy "service role manages invitations" on public.business_invitations for all to service_role using (true) with check (true);



-- Support ticket ownership / workload management
alter table public.support_tickets add column if not exists assigned_to uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_business_assignee_fkey'
      and conrelid = 'public.support_tickets'::regclass
  ) then
    alter table public.support_tickets
      add constraint support_tickets_business_assignee_fkey
      foreign key (business_id, assigned_to)
      references public.business_members (business_id, user_id)
      on delete set null (assigned_to);
  end if;
end $$;

create index if not exists support_tickets_business_assignee_status_idx
  on public.support_tickets (business_id, assigned_to, status, created_at desc);

create or replace function public.validate_support_ticket_assignee()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_to is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.business_members bm
    where bm.business_id = new.business_id
      and bm.user_id = new.assigned_to
      and bm.member_role in ('owner', 'admin', 'agent')
  ) then
    raise exception 'Assignee must be an owner, admin, or agent in this workspace'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists support_tickets_validate_assignee on public.support_tickets;
create trigger support_tickets_validate_assignee
before insert or update of business_id, assigned_to
on public.support_tickets
for each row execute function public.validate_support_ticket_assignee();


-- Shared team conversation inbox and assignment
alter table public.conversations add column if not exists assigned_to uuid;
do $$
begin
  if not exists(select 1 from pg_constraint where conname='conversations_business_assignee_fkey' and conrelid='public.conversations'::regclass) then
    alter table public.conversations add constraint conversations_business_assignee_fkey
    foreign key (business_id,assigned_to) references public.business_members(business_id,user_id)
    on delete set null (assigned_to);
  end if;
end $$;
create index if not exists conversations_business_assignee_started_idx
  on public.conversations(business_id,assigned_to,started_at desc);
create or replace function public.validate_conversation_assignee()
returns trigger language plpgsql set search_path=''
as $$
begin
 if new.assigned_to is null then return new; end if;
 if not exists(select 1 from public.business_members bm where bm.business_id=new.business_id and bm.user_id=new.assigned_to and bm.member_role in ('owner','admin','agent')) then
  raise exception 'Conversation assignee must be an owner, admin, or agent in this workspace' using errcode='23514';
 end if;
 return new;
end;
$$;
drop trigger if exists conversations_validate_assignee on public.conversations;
create trigger conversations_validate_assignee before insert or update of business_id,assigned_to on public.conversations for each row execute function public.validate_conversation_assignee();
drop policy if exists "members create messages" on public.conversation_messages;
drop policy if exists "support staff create messages" on public.conversation_messages;
create policy "support staff create messages" on public.conversation_messages for insert to authenticated
with check (
 speaker in ('customer','assistant','agent','admin','owner')
 and exists(select 1 from public.conversations c join public.business_members bm on bm.business_id=c.business_id where c.id=conversation_messages.conversation_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin','agent'))
);


-- Efficient chronological loading of shared conversation threads.
create index if not exists conversation_messages_conversation_created_idx on public.conversation_messages(conversation_id,created_at asc);


-- Public website chat widget configuration
alter table public.ai_executives
  add column if not exists widget_key uuid not null default gen_random_uuid(),
  add column if not exists widget_enabled boolean not null default false;
create unique index if not exists ai_executives_widget_key_uidx
  on public.ai_executives(widget_key);

-- Private rate-limit records are only accessed by the server-side Edge Function.
create table if not exists public.widget_rate_limits (
  id uuid primary key default gen_random_uuid(),
  widget_key uuid not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists widget_rate_limits_lookup_idx
  on public.widget_rate_limits(widget_key,ip_hash,created_at desc);
alter table public.widget_rate_limits enable row level security;
revoke all on public.widget_rate_limits from anon,authenticated;
grant all on public.widget_rate_limits to service_role;


-- Business self-serve onboarding state
alter table public.businesses add column if not exists onboarding_completed boolean not null default false;
