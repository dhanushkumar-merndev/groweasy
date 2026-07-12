create extension if not exists pgcrypto;

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  columns_config jsonb not null,
  formatting_rules jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  template_id uuid references templates(id),
  file_name text not null,
  import_name text not null,
  status text not null,
  prompt_version text,
  model_used text,
  total_sheets int default 0,
  total_rows int default 0,
  good_count int default 0,
  missing_count int default 0,
  skipped_count int default 0,
  fixed_missing_count int default 0,
  final_saved_count int default 0,
  blank_rows_removed int default 0,
  duplicate_count int default 0,
  ai_changed_count int default 0,
  missing_by_field jsonb default '{}'::jsonb,
  sheet_summary jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists import_sheets (
  id uuid primary key default gen_random_uuid(),
  import_id uuid references imports(id) on delete cascade,
  sheet_name text not null,
  sheet_index int not null,
  total_rows int default 0,
  good_count int default 0,
  missing_count int default 0,
  skipped_count int default 0,
  created_at timestamptz default now()
);

create table if not exists saved_rows (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  import_id uuid references imports(id) on delete cascade,
  sheet_id uuid references import_sheets(id) on delete set null,
  sheet_name text not null,
  sheet_index int not null,
  row_index int not null,
  cleaned_data jsonb not null,
  ai_changes jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists history_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  import_id uuid references imports(id) on delete cascade,
  action text not null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists analytics_views (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  import_id uuid references imports(id) on delete cascade,
  name text not null,
  chart_type text not null,
  config jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists user_ai_settings (
  user_id text primary key,
  provider text not null default 'groq',
  model text not null default 'openai/gpt-oss-120b',
  encrypted_api_key text,
  use_user_api_key boolean not null default false,
  detailed_review_enabled boolean not null default true,
  batch_size int,
  request_batch_size int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_templates_user_id on templates(user_id);
create index if not exists idx_imports_user_id on imports(user_id);
create index if not exists idx_imports_template_id on imports(template_id);
create index if not exists idx_saved_rows_user_id on saved_rows(user_id);
create index if not exists idx_saved_rows_import_id on saved_rows(import_id);
create index if not exists idx_saved_rows_sheet_name on saved_rows(sheet_name);
create index if not exists idx_saved_rows_cleaned_data_gin on saved_rows using gin(cleaned_data);
create index if not exists idx_history_logs_import_id on history_logs(import_id);

alter table if exists "user" enable row level security;
alter table if exists session enable row level security;
alter table if exists account enable row level security;
alter table if exists verification enable row level security;
alter table templates enable row level security;
alter table imports enable row level security;
alter table import_sheets enable row level security;
alter table saved_rows enable row level security;
alter table history_logs enable row level security;
alter table analytics_views enable row level security;
alter table user_ai_settings enable row level security;

create policy "Users manage own templates" on templates
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  row_ids jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_campaigns_user_id on campaigns(user_id);

alter table campaigns enable row level security;

create policy "Users manage own campaigns" on campaigns
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users manage own imports" on imports
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users read own sheets" on import_sheets
  using (
    exists (
      select 1 from imports
      where imports.id = import_sheets.import_id
      and imports.user_id = auth.uid()::text
    )
  );

create policy "Users insert own sheets" on import_sheets
  for insert
  with check (
    exists (
      select 1 from imports
      where imports.id = import_sheets.import_id
      and imports.user_id = auth.uid()::text
    )
  );

create policy "Users update own sheets" on import_sheets
  for update
  using (
    exists (
      select 1 from imports
      where imports.id = import_sheets.import_id
      and imports.user_id = auth.uid()::text
    )
  )
  with check (
    exists (
      select 1 from imports
      where imports.id = import_sheets.import_id
      and imports.user_id = auth.uid()::text
    )
  );

create policy "Users delete own sheets" on import_sheets
  for delete
  using (
    exists (
      select 1 from imports
      where imports.id = import_sheets.import_id
      and imports.user_id = auth.uid()::text
    )
  );

create policy "Users manage own saved rows" on saved_rows
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users manage own history" on history_logs
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users manage own analytics views" on analytics_views
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

create policy "Users manage own AI settings" on user_ai_settings
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);
