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
