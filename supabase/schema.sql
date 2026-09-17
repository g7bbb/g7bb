-- 곤충 배틀 베타 - Supabase 테이블 설정
-- Supabase 대시보드 접속 후 왼쪽 메뉴의 SQL Editor 에서
-- 이 파일 내용을 전부 복사/붙여넣기 하고 Run 버튼을 누르면 됩니다.
-- 팝업이 뜨면 "Run without RLS"를 선택해주세요 (이유는 README 참고).

create extension if not exists "pgcrypto";

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  login_id text unique not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists insects (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  nickname text not null,
  species text,
  origin text,
  age_stage text,
  body_parts jsonb,
  image_base64 text not null,
  mime_type text not null default 'image/png',
  stats jsonb not null,
  level int not null default 1,
  xp int not null default 0,
  battle_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists battles (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  insect_id uuid not null references insects(id) on delete cascade,
  opponent_insect_id uuid references insects(id) on delete set null,
  environment text not null,
  score numeric not null,
  result text not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 이미 스키마를 예전 버전으로 실행하신 분들을 위한 업데이트(마이그레이션)입니다.
-- 위 create table 구문은 새 프로젝트 기준이라 이미 테이블이 있으면 그대로 유지되고,
-- 새로 추가된 컬럼들만 아래 구문으로 붙여넣어야 합니다. 이미 위 구문을 실행해서
-- insects 테이블에 species/origin/level 등이 없다면 아래를 실행해주세요.
-- (이미 있는 컬럼은 건너뛰기 때문에 여러 번 실행해도 안전합니다.)
alter table insects add column if not exists species text;
alter table insects add column if not exists origin text;
alter table insects add column if not exists age_stage text;
alter table insects add column if not exists body_parts jsonb;
alter table insects add column if not exists level int not null default 1;
alter table insects add column if not exists xp int not null default 0;
alter table insects add column if not exists battle_count int not null default 0;
-- =====================================================================

-- =====================================================================
-- Google/이메일(매직링크) 로그인 도입에 따른 마이그레이션
-- 상품 지급을 위해 "본인 계정으로만 자기 기록을 쓸 수 있게" RLS를 켭니다.
-- players.id는 더 이상 무작위 생성이 아니라, 가입 시 Supabase Auth의
-- auth.users.id 값을 그대로 사용합니다 (앱 코드에서 upsert할 때 지정).
-- =====================================================================
alter table players drop column if exists login_id;
alter table players add column if not exists email text;
alter table players add column if not exists marketing_consent boolean not null default false;

alter table players enable row level security;
alter table insects enable row level security;
alter table battles enable row level security;

drop policy if exists "players_select_own" on players;
drop policy if exists "players_insert_own" on players;
drop policy if exists "players_update_own" on players;
create policy "players_select_own" on players for select using (auth.uid() = id);
create policy "players_insert_own" on players for insert with check (auth.uid() = id);
create policy "players_update_own" on players for update using (auth.uid() = id);

-- insects/battles는 배틀 상대 선택과 랭킹 집계를 위해 전체 읽기는 열어두고,
-- 쓰기(생성/수정)는 본인 player_id 소유 데이터만 가능하게 합니다.
drop policy if exists "insects_select_all" on insects;
drop policy if exists "insects_insert_own" on insects;
drop policy if exists "insects_update_own" on insects;
create policy "insects_select_all" on insects for select using (true);
create policy "insects_insert_own" on insects for insert with check (auth.uid() = player_id);
create policy "insects_update_own" on insects for update using (auth.uid() = player_id);

drop policy if exists "battles_select_all" on battles;
drop policy if exists "battles_insert_own" on battles;
create policy "battles_select_all" on battles for select using (true);
create policy "battles_insert_own" on battles for insert with check (auth.uid() = player_id);

-- 행사 종료 후에는 아래 명령으로 테이블을 비워서 아이들 데이터를 정리해주세요.
-- truncate table battles, insects, players cascade;
