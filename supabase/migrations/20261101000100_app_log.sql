-- Client error reports, so crashes on people's phones are visible to us.
--
--   app_log             error reports; admins can read them, nobody else can.
--   log_client_error()  the only way in: trims every field, throttles floods
--                       (per account and overall) and drops reports older than
--                       30 days, as the Privacy notice promises.

create table public.app_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete cascade,
  level text not null check (level in ('error', 'warn')),
  message text not null check (char_length(message) between 1 and 500),
  stack text check (char_length(stack) <= 4000),
  url text check (char_length(url) <= 300),
  app_version text check (char_length(app_version) <= 40),
  user_agent text check (char_length(user_agent) <= 300)
);

comment on table public.app_log is 'Client error reports (web/src/logger.js), kept 30 days. Written only through log_client_error().';

create index app_log_created_idx on public.app_log (created_at desc);
create index app_log_user_idx on public.app_log (user_id, created_at desc) where user_id is not null;

alter table public.app_log enable row level security;

create policy "admins read error reports"
  on public.app_log for select
  to authenticated
  using (public.is_admin());

create or replace function public.log_client_error(
  p_level text,
  p_message text,
  p_stack text default null,
  p_url text default null,
  p_app_version text default null,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text := left(btrim(coalesce(p_message, '')), 500);
begin
  delete from public.app_log where created_at < now() - interval '30 days';

  if v_message = '' then
    return false;
  end if;
  -- Floods (a crash loop, or someone scripting it) are dropped, not stored.
  if (select count(*) from public.app_log where created_at > now() - interval '1 minute') >= 120 then
    return false;
  end if;
  if auth.uid() is not null and (
    select count(*) from public.app_log
    where user_id = auth.uid() and created_at > now() - interval '1 minute'
  ) >= 10 then
    return false;
  end if;

  insert into public.app_log (user_id, level, message, stack, url, app_version, user_agent)
  values (
    auth.uid(),
    case when p_level = 'warn' then 'warn' else 'error' end,
    v_message,
    nullif(left(p_stack, 4000), ''),
    nullif(left(p_url, 300), ''),
    nullif(left(p_app_version, 40), ''),
    nullif(left(p_user_agent, 300), '')
  );
  return true;
end;
$$;

revoke all on table public.app_log from anon, authenticated;
grant select on table public.app_log to authenticated;
revoke all on function public.log_client_error(text, text, text, text, text, text) from public;
grant execute on function public.log_client_error(text, text, text, text, text, text) to anon, authenticated;
