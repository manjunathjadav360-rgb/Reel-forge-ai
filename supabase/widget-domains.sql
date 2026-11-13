-- Exact HTTPS hostnames allowed to embed each AIKIVO website widget.
create table if not exists public.widget_domains (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 executive_id uuid not null references public.ai_executives(id) on delete cascade,
 domain text not null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 verification_token text not null default encode(gen_random_bytes(24),'hex'),
 verified_at timestamptz,
 constraint widget_domains_domain_format check (
   length(domain) between 3 and 253
   and domain = lower(domain)
   and domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
   and domain !~ '^[0-9.]+$'
 )
);
create unique index if not exists widget_domains_executive_domain_uidx on public.widget_domains(executive_id,domain);
create index if not exists widget_domains_business_id_idx on public.widget_domains(business_id);
alter table public.widget_domains enable row level security;
revoke all on table public.widget_domains from anon, authenticated;
grant select,insert,delete on table public.widget_domains to authenticated;
drop policy if exists "Admins read widget domains" on public.widget_domains;
create policy "Admins read widget domains" on public.widget_domains for select to authenticated
using (exists(select 1 from public.business_members bm where bm.business_id=widget_domains.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin')));
drop policy if exists "Admins add widget domains" on public.widget_domains;
create policy "Admins add widget domains" on public.widget_domains for insert to authenticated
with check (
 created_by=(select auth.uid())
 and exists(select 1 from public.business_members bm where bm.business_id=widget_domains.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin'))
 and exists(select 1 from public.ai_executives ae where ae.id=widget_domains.executive_id and ae.business_id=widget_domains.business_id)
);
drop policy if exists "Admins remove widget domains" on public.widget_domains;
create policy "Admins remove widget domains" on public.widget_domains for delete to authenticated
using (exists(select 1 from public.business_members bm where bm.business_id=widget_domains.business_id and bm.user_id=(select auth.uid()) and bm.member_role in ('owner','admin')));
