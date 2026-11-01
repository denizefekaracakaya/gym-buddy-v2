-- Gym Buddy: public.user_data hardening (Android beta).
-- The table already existed (created from supabase-schema.sql in July 2026):
--   id uuid PK -> auth.users, profile/logs/water_data jsonb, created_at, updated_at.
-- Existing rows are kept; this migration only tightens access and validation.

-- 1) Shape: the app always writes JSON objects.
update public.user_data set profile = '{}'::jsonb where profile is null or jsonb_typeof(profile) <> 'object';
update public.user_data set logs = '{}'::jsonb where logs is null or jsonb_typeof(logs) <> 'object';
update public.user_data set water_data = '{}'::jsonb where water_data is null or jsonb_typeof(water_data) <> 'object';

alter table public.user_data
    alter column profile set not null,
    alter column logs set not null,
    alter column water_data set not null,
    alter column created_at set not null,
    alter column updated_at set not null;

alter table public.user_data
    add constraint user_data_profile_object check (jsonb_typeof(profile) = 'object'),
    add constraint user_data_logs_object check (jsonb_typeof(logs) = 'object'),
    add constraint user_data_water_object check (jsonb_typeof(water_data) = 'object'),
    -- keep a single user's row well below Postgres/HTTP limits (abuse guard)
    add constraint user_data_size_limit check (
        octet_length(profile::text) + octet_length(logs::text) + octet_length(water_data::text) < 1000000
    );

-- 2) Privileges: anonymous (logged-out) clients get nothing; logged-in users
--    only row-level CRUD (no TRUNCATE/TRIGGER/REFERENCES).
revoke all on table public.user_data from anon;
revoke all on table public.user_data from authenticated;
grant select, insert, update, delete on table public.user_data to authenticated;

-- 3) RLS policies: owner only, authenticated role only.
alter table public.user_data enable row level security;
drop policy if exists "Kullanıcılar kendi verilerini okuyabilir" on public.user_data;
drop policy if exists "Kullanıcılar kendi verilerini ekleyebilir" on public.user_data;
drop policy if exists "Kullanıcılar kendi verilerini güncelleyebilir" on public.user_data;

create policy user_data_select_own on public.user_data
    for select to authenticated using ((select auth.uid()) = id);
create policy user_data_insert_own on public.user_data
    for insert to authenticated with check ((select auth.uid()) = id);
create policy user_data_update_own on public.user_data
    for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy user_data_delete_own on public.user_data
    for delete to authenticated using ((select auth.uid()) = id);

-- 4) updated_at maintained by the database.
create or replace function public.set_updated_at() returns trigger
    language plpgsql set search_path = '' as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists user_data_set_updated_at on public.user_data;
create trigger user_data_set_updated_at before update on public.user_data
    for each row execute function public.set_updated_at();
