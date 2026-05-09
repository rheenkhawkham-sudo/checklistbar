create table public.checklist_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  outlet text not null,
  signed_by text not null,
  open_time text not null default '',
  close_time text not null default '',
  open_tasks jsonb not null default '[]'::jsonb,
  close_tasks jsonb not null default '[]'::jsonb,
  monthly_tasks jsonb not null default '[]'::jsonb,
  total_tasks int not null default 0,
  done_tasks int not null default 0,
  percent int not null default 0,
  created_at timestamptz not null default now()
);

create index checklist_reports_report_date_idx on public.checklist_reports (report_date desc);
create index checklist_reports_created_at_idx on public.checklist_reports (created_at desc);

alter table public.checklist_reports enable row level security;

create policy "Anyone can read reports"
  on public.checklist_reports for select
  using (true);

create policy "Anyone can insert reports"
  on public.checklist_reports for insert
  with check (true);