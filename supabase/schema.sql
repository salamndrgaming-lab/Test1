-- NewsScope — Supabase schema. Run in the Supabase SQL editor once you create
-- a project. Profiles + the per-user stores that currently live in localStorage.

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  membership text not null default 'free'
    check (membership in ('free','trialing','pro','past_due','canceled')),
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

-- Free-form preference blob (theme, settings, etc.)
create table if not exists preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists bookmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  article jsonb not null,
  kind text not null default 'bookmark' check (kind in ('bookmark','read_later')),
  created_at timestamptz not null default now()
);

create table if not exists history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  article jsonb not null,
  read_at timestamptz not null default now()
);

create table if not exists follows (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  topic text not null,
  created_at timestamptz not null default now(),
  unique (user_id, topic)
);

create table if not exists alerts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  rule jsonb not null,
  created_at timestamptz not null default now()
);

-- Row-level security: each user sees only their own rows.
alter table profiles    enable row level security;
alter table preferences enable row level security;
alter table bookmarks   enable row level security;
alter table history     enable row level security;
alter table follows     enable row level security;
alter table alerts      enable row level security;

create policy "own profile"     on profiles    for all using (auth.uid() = id)      with check (auth.uid() = id);
create policy "own preferences" on preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own bookmarks"   on bookmarks   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own history"     on history     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own follows"     on follows     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own alerts"      on alerts      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a profile row on signup.
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
