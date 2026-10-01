/**
 * 레벨·회차 밸런스 시뮬레이션 (2026-10-01 Jin 재설계). 숫자를 고치면 반드시 다시 돌릴 것.
 *
 *   node -r sucrase/register tools/sim/levels.ts
 *
 * - 승률은 무승부를 빼고 잰다. 타이밍 보너스는 없다(1.0) — 양쪽 다 필살기를 쓴다.
 * - 곤충은 매번 무작위(부위·종류·성장단계·출신지)라 "같은 곤충이 레벨만 다를 때"가 아니라
 *   **실제 부스에서 만날 법한 두 아이**의 승률이다.
 */
import { calculateStats, AGE_STAGES } from '../../lib/insect-stats';
import { rollBattle, resolveBattle, BattleSide } from '../../lib/battle-engine';
import { baseMoveFor, movesFor } from '../../lib/special-moves';
import { SPECIES } from '../../lib/species';
import { ORIGIN_EFFECTS } from '../../lib/origins';
import { ALLOC_STATS, POINTS_PER_LEVELUP, applyAlloc, Alloc } from '../../lib/alloc';
import { addXp, battleXpRate, revisitXpRate } from '../../lib/leveling';
import { BodyPartScores, EnvironmentKey } from '../../lib/types';

const N = Number(process.env.N || 8000);
const ORIGINS = Object.keys(ORIGIN_EFFECTS) as EnvironmentKey[];
const AGES = AGE_STAGES.map((a) => a.key);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const parts = (): BodyPartScores => {
  const r = () => 1 + Math.floor(Math.random() * 5);
  return { head: r(), legs: r(), armor: r(), wings: r(), eyes: r(), instinct: r(), genetics: r() };
};
const LADDER = 3; // 한 게임 = 랭킹 도전 3판

/** n 번째로 온 아이가 그 게임에서 치르는 배틀들의 레벨 · 받은 포인트 수 */
function journeyOnce(visits: number): { levels: number[]; points: number } {
  let level = 1;
  let xp = 0;
  let points = 0;
  let levels: number[] = [];
  for (let v = 1; v <= visits; v++) {
    if (v > 1) {
      const g = addXp(level, xp, revisitXpRate(level));
      points += g.levelsUp * POINTS_PER_LEVELUP;
      level = g.level;
      xp = g.xp;
    }
    levels = [];
    for (let b = 0; b < LADDER; b++) {
      levels.push(level);
      // 이길 확률은 반반으로 본다 (LV3 부터는 지면 경험치 절반)
      const g = addXp(level, xp, battleXpRate(level, Math.random() < 0.5));
      level = g.level;
      xp = g.xp;
    }
  }
  return { levels, points };
}

/** 이기고 지는 게 무작위라 여러 번 굴려서 제일 흔한 경우를 쓴다 */
function journey(visits: number): { levels: number[]; points: number } {
  const seen = new Map<string, { n: number; j: ReturnType<typeof journeyOnce> }>();
  for (let i = 0; i < 400; i++) {
    const j = journeyOnce(visits);
    const key = j.levels.join(',') + '|' + j.points;
    const prev = seen.get(key);
    seen.set(key, { n: (prev?.n ?? 0) + 1, j });
  }
  return Array.from(seen.values()).sort((a, b) => b.n - a.n)[0].j;
}

function randomAlloc(points: number): Alloc {
  const out: Alloc = {};
  for (let i = 0; i < points; i++) {
    const key = pick(ALLOC_STATS).key;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function make(level: number, points: number) {
  const species = pick(SPECIES).label;
  const origin = pick(ORIGINS);
  const stats = applyAlloc(calculateStats(parts(), pick(AGES), undefined, species, origin), randomAlloc(points));
  const side: BattleSide = { stats, level, origin };
  return { side, species };
}

function fight(a: { side: BattleSide; species: string }, b: { side: BattleSide; species: string }, timingA = 1) {
  const rolls = rollBattle(a.side, b.side);
  const keys = (x: typeof a) => movesFor(x.species, x.side.level).map((m) => m.key);
  const extra = {
    a: rolls.a.bonus ? baseMoveFor(a.species).key : null,
    b: rolls.b.bonus ? baseMoveFor(b.species).key : null,
  };
  return resolveBattle(rolls.a, rolls.b, keys(a), keys(b), timingA, undefined, extra).winner;
}

function rate(makeA: () => ReturnType<typeof make>, makeB: () => ReturnType<typeof make>, timingA = 1): string {
  let win = 0;
  let lose = 0;
  for (let i = 0; i < N; i++) {
    const w = fight(makeA(), makeB(), timingA);
    if (w === 'A') win++;
    else if (w === 'B') lose++;
  }
  return ((win / (win + lose)) * 100).toFixed(1) + '%';
}

console.log('── 회차별로 아이가 배틀하는 레벨 (항상 "내 곤충 키우기" 를 골랐을 때)');
for (let v = 1; v <= 8; v++) {
  const j = journey(v);
  console.log(`  ${v}회차: 배틀 레벨 ${j.levels.join(' → ')} · 레벨업 포인트 ${j.points}`);
}

console.log('── 레벨만 다를 때 (포인트 없음) — LV n vs LV1');
for (const l of [2, 3, 4, 5, 6, 7, 8, 10]) {
  console.log(`  LV${l} vs LV1: ${rate(() => make(l, 0), () => make(1, 0))}`);
}
console.log('── 같은 레벨끼리 (50% 근처여야 함)');
for (const l of [1, 3, 6]) console.log(`  LV${l} vs LV${l}: ${rate(() => make(l, 0), () => make(l, 0))}`);

console.log('── 회차 vs 1회차 첫 배틀(LV1) — 핵심 목표: 5회차가 "무조건" 이기면 안 됨');
for (let v = 2; v <= 6; v++) {
  const j = journey(v);
  const hi = () => make(pick(j.levels), j.points);
  console.log(`  ${v}회차 vs 1회차: ${rate(hi, () => make(1, 0))}`);
}
console.log('── 회차 vs 회차 (1회차는 LV1·2·2 중 무작위)');
const one = journey(1);
for (let v = 2; v <= 5; v++) {
  const j = journey(v);
  console.log(`  ${v}회차 vs 1회차(게임 중): ${rate(() => make(pick(j.levels), j.points), () => make(pick(one.levels), 0))}`);
}
console.log('── 다회차끼리');
for (const [x, y] of [[3, 2], [5, 2], [5, 3], [6, 4]]) {
  const jx = journey(x);
  const jy = journey(y);
  console.log(`  ${x}회차 vs ${y}회차: ${rate(() => make(pick(jx.levels), jx.points), () => make(pick(jy.levels), jy.points))}`);
}
console.log('── 실제 랭킹 도전: 1회차 아이가 ⚡버튼을 잘 누르면 (상대는 컴퓨터라 타이밍 보너스 없음)');
{
  const j5 = journey(5);
  for (const [label, t] of [['발동', 1], ['굿', 1.1], ['그레이트', 1.2], ['퍼펙트', 1.35]] as const) {
    console.log(`  1회차(${label}) vs 5회차: ${rate(() => make(pick(one.levels), 0), () => make(pick(j5.levels), j5.points), t)}`);
  }
}
