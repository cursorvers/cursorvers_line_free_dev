-- Convenience copy of the Supabase migration to align the line_members table.
-- See supabase/migrations/20251105071000_align_line_members.sql for details.
-- Keeping this under database/migrations allows operators to run the same SQL
-- manually from the docs/SUPABASE_MIGRATION_SQL.md flow if needed.

begin;

alter table if exists line_members
  rename column line_user_id to user_hash;

alter table if exists line_members
  rename column registered_at to first_opt_in_at;

alter table if exists line_members
  rename column last_active_at to last_opt_in_at;

alter table if exists line_members
  alter column first_opt_in_at type timestamptz using first_opt_in_at::timestamptz,
  alter column first_opt_in_at set not null;

alter table if exists line_members
  alter column last_opt_in_at type timestamptz using last_opt_in_at::timestamptz;

alter table if exists line_members
  alter column consent_guardrail set default false,
  alter column consent_guardrail set not null;

alter table if exists line_members
  alter column metadata set default '{}'::jsonb,
  alter column metadata set not null;

alter table if exists line_members
  alter column cta_tags type text[] using coalesce(cta_tags, '{}'::text[]),
  alter column cta_tags set default '{}'::text[],
  alter column cta_tags set not null;

alter table if exists line_members
  add column if not exists status text not null default 'lead',
  add column if not exists guardrail_sent_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists line_members
  drop column if exists is_blocked;

do $$
declare
  constraint_name text;
begin
  select conname
    into constraint_name
    from pg_constraint
   where conrelid = 'public.line_members'::regclass
     and contype = 'p';

  if constraint_name is not null then
    execute format('alter table line_members drop constraint %I;', constraint_name);
  end if;
end $$;

alter table if exists line_members
  add constraint line_members_pkey primary key (user_hash);

commit;

