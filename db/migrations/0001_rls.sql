-- Defence in depth: the app runs every query as the non-superuser role `app_user` with
-- transaction-local settings (app.user_id, app.tenant_id, app.mode). A missed application-level
-- check still returns zero foreign rows. See lib/db/index.ts withCtx().

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin nobypassrls;
  end if;
end $$;
do $$ begin
  execute format('grant app_user to %I', current_user);
exception when others then null;
end $$;

grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
revoke all on _migrations from app_user;

-- Append-only: history tables can never be rewritten by the application role.
revoke update, delete on audit_events, consents from app_user;

create or replace function app_uid() returns text language sql stable as $$ select nullif(current_setting('app.user_id', true), '') $$;
create or replace function app_tid() returns text language sql stable as $$ select nullif(current_setting('app.tenant_id', true), '') $$;
create or replace function app_mode() returns text language sql stable as $$ select coalesce(nullif(current_setting('app.mode', true), ''), 'none') $$;
-- Even a forged tenant context yields nothing unless the user is an active member of that tenant.
create or replace function app_is_member() returns boolean language sql stable as $$
  select app_tid() is not null and exists (
    select 1 from memberships m where m.user_id = app_uid() and m.org_id = app_tid() and m.status = 'active') $$;

-- ───────── observations: private source records ─────────
alter table observations enable row level security;
alter table observations force row level security;
create policy obs_system on observations for all using (app_mode() = 'system') with check (app_mode() = 'system');
create policy obs_user_select on observations for select using (
  app_mode() = 'user' and tenant_id = app_tid() and app_is_member() and (
    author_id = app_uid()
    or (visibility_intent in ('org', 'propose_shared') and state <> 'draft')
  ));
create policy obs_user_insert on observations for insert with check (
  app_mode() = 'user' and tenant_id = app_tid() and app_is_member() and author_id = app_uid() and state = 'draft');
create policy obs_user_update on observations for update
  using (app_mode() = 'user' and tenant_id = app_tid() and app_is_member() and author_id = app_uid())
  with check (tenant_id = app_tid() and author_id = app_uid());
create policy obs_user_delete on observations for delete using (
  app_mode() = 'user' and tenant_id = app_tid() and author_id = app_uid() and state = 'draft');
-- Moderators never see drafts, private or organisation-only records.
create policy obs_moderator_select on observations for select using (
  app_mode() = 'moderator' and visibility_intent = 'propose_shared' and state <> 'draft');
create policy obs_moderator_update on observations for update
  using (app_mode() = 'moderator' and visibility_intent = 'propose_shared' and state <> 'draft')
  with check (visibility_intent = 'propose_shared' and state <> 'draft');

-- ───────── consents (append-only) ─────────
alter table consents enable row level security;
alter table consents force row level security;
create policy consents_system on consents for all using (app_mode() = 'system') with check (app_mode() = 'system');
create policy consents_user_select on consents for select using (app_mode() = 'user' and tenant_id = app_tid() and app_is_member());
create policy consents_user_insert on consents for insert with check (app_mode() = 'user' and tenant_id = app_tid() and app_is_member() and actor_id = app_uid());
create policy consents_moderator_select on consents for select using (app_mode() = 'moderator');

-- ───────── reviews (internal_note is stripped by DTOs; RLS limits rows) ─────────
alter table reviews enable row level security;
alter table reviews force row level security;
create policy reviews_system on reviews for all using (app_mode() = 'system') with check (app_mode() = 'system');
create policy reviews_user_select on reviews for select using (app_mode() = 'user' and tenant_id = app_tid() and app_is_member());
create policy reviews_moderator on reviews for all using (app_mode() = 'moderator') with check (app_mode() = 'moderator' and moderator_id = app_uid());

-- ───────── sandbox / playground runs ─────────
alter table playground_runs enable row level security;
alter table playground_runs force row level security;
create policy runs_system on playground_runs for all using (app_mode() = 'system') with check (app_mode() = 'system');
create policy runs_user on playground_runs for all
  using (app_mode() = 'user' and user_id = app_uid() and (tenant_id is null and app_tid() is null or tenant_id = app_tid() and app_is_member()))
  with check (app_mode() = 'user' and user_id = app_uid() and (tenant_id is null and app_tid() is null or tenant_id = app_tid() and app_is_member()));

-- ───────── invitations ─────────
alter table invitations enable row level security;
alter table invitations force row level security;
create policy inv_system on invitations for all using (app_mode() = 'system') with check (app_mode() = 'system');
create policy inv_user on invitations for all
  using (app_mode() = 'user' and org_id = app_tid() and app_is_member())
  with check (app_mode() = 'user' and org_id = app_tid() and app_is_member());

-- ───────── notifications: readable only by their owner ─────────
alter table notifications enable row level security;
alter table notifications force row level security;
create policy notif_system on notifications for all using (app_mode() = 'system') with check (app_mode() = 'system');
create policy notif_owner on notifications for select using (app_mode() = 'user' and user_id = app_uid());
create policy notif_owner_update on notifications for update using (app_mode() = 'user' and user_id = app_uid()) with check (user_id = app_uid());
create policy notif_insert on notifications for insert with check (app_mode() in ('user', 'moderator'));

-- ───────── search ─────────
create index if not exists search_documents_fts on search_documents using gin (to_tsvector('english', title || ' ' || text));
