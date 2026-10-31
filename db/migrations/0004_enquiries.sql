-- Demo requests and event registrations: follow-up status, cancellation and waitlist.
alter table leads add column if not exists status text not null default 'new';
alter table leads add column if not exists handled_by text;
alter table leads add column if not exists updated_at timestamptz not null default now();
alter table leads drop constraint if exists leads_status_check;
alter table leads add constraint leads_status_check check (status in ('new', 'contacted', 'closed'));

alter table event_registrations add column if not exists status text not null default 'registered';
alter table event_registrations add column if not exists cancelled_at timestamptz;
alter table event_registrations drop constraint if exists event_registrations_status_check;
alter table event_registrations add constraint event_registrations_status_check check (status in ('registered', 'waitlisted', 'cancelled'));

-- Contact details of real people: only server code that already passed authorize() may touch them.
alter table leads enable row level security;
alter table leads force row level security;
drop policy if exists leads_system on leads;
create policy leads_system on leads for all using (app_mode() = 'system') with check (app_mode() = 'system');

alter table event_registrations enable row level security;
alter table event_registrations force row level security;
drop policy if exists event_registrations_system on event_registrations;
create policy event_registrations_system on event_registrations for all using (app_mode() = 'system') with check (app_mode() = 'system');
