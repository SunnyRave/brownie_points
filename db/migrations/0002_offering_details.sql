-- Product detail fields from the azentio.ai catalogue (label, tagline, status, how-it-works, outcomes).
alter table offerings add column if not exists label text not null default '';
alter table offerings add column if not exists tagline text not null default '';
alter table offerings add column if not exists status text not null default 'Prototype';
alter table offerings add column if not exists steps jsonb not null default '[]'::jsonb;
alter table offerings add column if not exists outcomes jsonb not null default '[]'::jsonb;
alter table offerings add column if not exists sort_order integer not null default 0;
