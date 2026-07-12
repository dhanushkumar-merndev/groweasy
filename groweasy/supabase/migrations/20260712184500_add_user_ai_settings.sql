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

alter table if exists user_ai_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_ai_settings'
      and policyname = 'Users manage own AI settings'
  ) then
    create policy "Users manage own AI settings" on user_ai_settings
      using (auth.uid()::text = user_id)
      with check (auth.uid()::text = user_id);
  end if;
end $$;
