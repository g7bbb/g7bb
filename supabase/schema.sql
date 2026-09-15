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

-- 베타 테스트 기간에는 RLS(행 단위 보안)를 켜지 않은 상태로 둡니다.
-- 즉 anon key만 있으면 누구나 읽고 쓸 수 있어요. 3일짜리 현장 이벤트 베타에는 충분하지만,
-- 이후 정식 운영으로 넘어간다면 RLS 정책을 추가하는 것을 권장합니다.
-- 또한 행사 종료 후에는 아래 명령으로 테이블을 비워서 아이들 데이터를 정리해주세요.
-- truncate table battles, insects, players cascade;
