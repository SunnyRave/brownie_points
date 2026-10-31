-- Collaboration features (§06 CLI-08/09, support tickets, attachments), employee team spaces (§05),
-- quality feedback (§10) and the optional P2 federated model-learning programme (§11).
-- Every table gets RLS. Tables the app only touches after authorize() admit the 'system' mode alone.

alter table shared_insights add column if not exists evidence_quality text;

create table if not exists contribution_feedback (
  id text primary key,
  shared_insight_id text not null references shared_insights(id),
  user_id text not null references users(id),
  rating text not null check (rating in ('useful', 'needs_evidence')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists contribution_feedback_user on contribution_feedback (shared_insight_id, user_id);

create table if not exists comments (
  id text primary key,
  shared_insight_id text not null references shared_insights(id),
  author_id text not null references users(id),
  author_tenant_id text,
  author_kind text not null check (author_kind in ('client', 'employee')),
  body text not null,
  status text not null default 'visible' check (status in ('visible', 'held', 'hidden', 'removed')),
  sensitive_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists comments_parent on comments (shared_insight_id);

create table if not exists comment_reports (
  id text primary key,
  comment_id text not null references comments(id),
  reporter_id text not null,
  reason text not null check (reason in ('misleading', 'confidential', 'inappropriate', 'other')),
  details text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  decision text,
  decided_by text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists bookmarks (
  id text primary key,
  user_id text not null references users(id),
  tenant_id text,
  source_type text not null,
  source_id text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists bookmarks_user_source on bookmarks (user_id, source_type, source_id);

create table if not exists saved_searches (
  id text primary key,
  user_id text not null references users(id),
  tenant_id text,
  name text not null,
  query text not null default '',
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists theme_subscriptions (
  id text primary key,
  user_id text not null references users(id),
  theme_id text not null references themes(id),
  created_at timestamptz not null default now()
);
create unique index if not exists theme_subscriptions_user_theme on theme_subscriptions (user_id, theme_id);

create table if not exists support_tickets (
  id text primary key,
  tenant_id text not null references organisations(id),
  created_by text not null references users(id),
  subject text not null,
  category text not null check (category in ('access', 'product_question', 'sandbox', 'contribution', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_client', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_ticket_messages (
  id text primary key,
  ticket_id text not null references support_tickets(id),
  tenant_id text not null,
  author_id text not null,
  author_side text not null check (author_side in ('client', 'azentio')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists observation_attachments (
  id text primary key,
  observation_id text not null references observations(id),
  tenant_id text not null,
  uploaded_by text not null,
  filename text not null,
  content_type text not null,
  size_bytes integer not null,
  sha256 text not null,
  storage_key text not null,
  created_at timestamptz not null default now()
);

create table if not exists team_spaces (
  id text primary key,
  name text not null,
  challenge text not null,
  status text not null default 'forming' check (status in ('forming', 'building', 'submitted', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists team_space_members (
  space_id text not null references team_spaces(id),
  user_id text not null references users(id),
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table if not exists team_space_posts (
  id text primary key,
  space_id text not null references team_spaces(id),
  author_id text not null,
  kind text not null default 'update' check (kind in ('update', 'note', 'link')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists fl_participants (
  id text primary key,
  org_id text not null unique references organisations(id),
  status text not null check (status in ('enrolled', 'withdrawn')),
  consented_by text not null,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  key_id text not null
);

create table if not exists fl_rounds (
  id text primary key,
  round_no integer not null,
  model_version text not null,
  base_model_version text,
  aggregation_method text not null,
  config jsonb not null default '{}'::jsonb,
  participants jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  status text not null check (status in ('completed', 'aborted')),
  started_by text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists fl_models (
  id text primary key,
  version text not null unique,
  round_id text,
  parent_version text,
  weights jsonb not null,
  feature_schema jsonb not null,
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'candidate' check (status in ('candidate', 'approved', 'rejected', 'deployed', 'rolled_back')),
  decided_by text,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on
  contribution_feedback, comments, comment_reports, bookmarks, saved_searches, theme_subscriptions,
  support_tickets, support_ticket_messages, observation_attachments, team_spaces, team_space_members,
  team_space_posts, fl_participants, fl_rounds, fl_models
to app_user;

-- Round lineage is append-only for the application role.
revoke update, delete on fl_rounds from app_user;

-- ───────── system-only tables (service code calls authorize() first) ─────────
do $$
declare t text;
begin
  foreach t in array array['comments', 'comment_reports', 'team_spaces', 'team_space_members', 'team_space_posts', 'fl_participants', 'fl_rounds', 'fl_models'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I on %I for all using (app_mode() = ''system'') with check (app_mode() = ''system'')', t || '_system', t);
  end loop;
end $$;

-- ───────── per-user tables: readable/writable only by their owner ─────────
do $$
declare t text;
begin
  foreach t in array array['contribution_feedback', 'bookmarks', 'saved_searches', 'theme_subscriptions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy %I on %I for all using (app_mode() = ''system'') with check (app_mode() = ''system'')', t || '_system', t);
    execute format('create policy %I on %I for all using (app_mode() = ''user'' and user_id = app_uid()) with check (app_mode() = ''user'' and user_id = app_uid())', t || '_owner', t);
  end loop;
end $$;

-- ───────── tenant-scoped support tickets ─────────
alter table support_tickets enable row level security;
alter table support_tickets force row level security;
create policy support_tickets_system on support_tickets for all using (app_mode() = 'system') with check (app_mode() = 'system');
create policy support_tickets_tenant on support_tickets for all
  using (app_mode() = 'user' and tenant_id = app_tid() and app_is_member())
  with check (app_mode() = 'user' and tenant_id = app_tid() and app_is_member());

alter table support_ticket_messages enable row level security;
alter table support_ticket_messages force row level security;
create policy support_msgs_system on support_ticket_messages for all using (app_mode() = 'system') with check (app_mode() = 'system');
create policy support_msgs_tenant on support_ticket_messages for all
  using (app_mode() = 'user' and tenant_id = app_tid() and app_is_member())
  with check (app_mode() = 'user' and tenant_id = app_tid() and app_is_member() and author_side = 'client' and author_id = app_uid());

-- ───────── attachments inherit the parent observation's visibility ─────────
-- The subquery runs under the observations RLS policies, so an attachment is visible exactly when its record is.
alter table observation_attachments enable row level security;
alter table observation_attachments force row level security;
create policy attachments_system on observation_attachments for all using (app_mode() = 'system') with check (app_mode() = 'system');
create policy attachments_user_select on observation_attachments for select using (
  app_mode() = 'user' and tenant_id = app_tid() and app_is_member()
  and exists (select 1 from observations o where o.id = observation_id));
create policy attachments_user_insert on observation_attachments for insert with check (
  app_mode() = 'user' and tenant_id = app_tid() and app_is_member() and uploaded_by = app_uid()
  and exists (select 1 from observations o where o.id = observation_id and o.author_id = app_uid()));
create policy attachments_user_delete on observation_attachments for delete using (
  app_mode() = 'user' and tenant_id = app_tid() and app_is_member() and uploaded_by = app_uid()
  and exists (select 1 from observations o where o.id = observation_id and o.author_id = app_uid() and o.state in ('draft', 'returned')));
-- Moderators see attachments only for records RLS already lets them see (submitted, proposed for sharing).
create policy attachments_moderator_select on observation_attachments for select using (
  app_mode() = 'moderator' and exists (select 1 from observations o where o.id = observation_id));
