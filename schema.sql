-- Run this in Supabase Dashboard → SQL Editor → New Query

-- ── Projects ──────────────────────────────────────────────────
create table projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  description text default '',
  color       text default '#1a73e8',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── Tasks (Gantt) ─────────────────────────────────────────────
create table tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade not null,
  parent_id   uuid references tasks(id) on delete set null,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  duration    int default 1,
  progress    int default 0 check (progress >= 0 and progress <= 100),
  is_milestone boolean default false,
  collapsed   boolean default false,
  sort_order  int default 0,
  notes       text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table task_dependencies (
  task_id      uuid references tasks(id) on delete cascade,
  depends_on   uuid references tasks(id) on delete cascade,
  primary key (task_id, depends_on)
);

create table task_assignees (
  task_id  uuid references tasks(id) on delete cascade,
  user_id  uuid references auth.users(id) on delete cascade,
  primary key (task_id, user_id)
);

-- ── Project access (sharing) ──────────────────────────────────
create table project_access (
  project_id uuid references projects(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  role       text check (role in ('viewer','editor','admin')) default 'viewer',
  added_at   timestamptz default now(),
  primary key (project_id, user_id)
);

-- ── Budget / Research Accounting ──────────────────────────────
create table grants (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade not null,
  name          text not null,
  grant_code    text not null,
  funding_agency text default '',
  total_budget  numeric(12,2) default 0,
  start_date    date,
  end_date      date,
  indirect_rate numeric(5,2) default 0,  -- F&A % e.g. 52.5
  created_at    timestamptz default now()
);

create table budget_categories (
  id         uuid primary key default gen_random_uuid(),
  grant_id   uuid references grants(id) on delete cascade not null,
  name       text not null,                -- Personnel, Equipment, Travel, Supplies, Other
  budgeted   numeric(12,2) default 0,
  period     text default 'Year 1'        -- Year 1, Year 2, Year 3, etc.
);

create table expenses (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete cascade not null,
  grant_id        uuid references grants(id) on delete set null,
  category_id     uuid references budget_categories(id) on delete set null,
  description     text not null,
  vendor          text default '',
  amount          numeric(12,2) not null,
  expense_date    date not null,
  is_irb_related  boolean default false,
  is_indirect     boolean default false,
  indirect_amount numeric(12,2) default 0,  -- calculated F&A
  receipt_url     text default '',
  budget_period   text default 'Year 1',
  notes           text default '',
  submitted_by    uuid references auth.users(id),
  created_at      timestamptz default now()
);

-- ── Row Level Security ────────────────────────────────────────
alter table projects          enable row level security;
alter table tasks             enable row level security;
alter table task_dependencies enable row level security;
alter table task_assignees    enable row level security;
alter table project_access    enable row level security;
alter table grants            enable row level security;
alter table budget_categories enable row level security;
alter table expenses          enable row level security;

-- Projects: owner sees all; collaborators see shared
create policy "owner access" on projects
  for all using (owner_id = auth.uid());

create policy "collaborator access" on projects
  for select using (
    id in (select project_id from project_access where user_id = auth.uid())
  );

-- Tasks: anyone with project access
create policy "task access" on tasks
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union
      select project_id from project_access where user_id = auth.uid()
    )
  );

-- Same pattern for everything else
create policy "dep access" on task_dependencies
  for all using (
    task_id in (select id from tasks where project_id in (
      select id from projects where owner_id = auth.uid()
      union select project_id from project_access where user_id = auth.uid()
    ))
  );

create policy "grant access" on grants
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union select project_id from project_access where user_id = auth.uid()
    )
  );

create policy "category access" on budget_categories
  for all using (
    grant_id in (select id from grants where project_id in (
      select id from projects where owner_id = auth.uid()
      union select project_id from project_access where user_id = auth.uid()
    ))
  );

create policy "expense access" on expenses
  for all using (
    project_id in (
      select id from projects where owner_id = auth.uid()
      union select project_id from project_access where user_id = auth.uid()
    )
  );

-- ── Indexes ───────────────────────────────────────────────────
create index on tasks(project_id);
create index on tasks(parent_id);
create index on expenses(project_id);
create index on expenses(grant_id);
create index on grants(project_id);
