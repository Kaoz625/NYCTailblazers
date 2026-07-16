-- NYC Tailblazers — Dog Run petition signatures
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table if not exists public.signatures (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  zip        text,
  comment    text,
  created_at timestamptz not null default now()
);

alter table public.signatures enable row level security;

-- Let the public website (anon key) INSERT signatures, but not read/edit/delete them.
-- You read signatures in the Supabase dashboard (Table editor) or via the service_role key.
drop policy if exists "anon can sign" on public.signatures;
create policy "anon can sign"
  on public.signatures
  for insert
  to anon
  with check (true);

-- Optional: a public live count that does NOT expose anyone's details.
create or replace function public.signature_count()
returns bigint
language sql
security definer
set search_path = public
as $$ select count(*) from public.signatures $$;

grant execute on function public.signature_count() to anon;
