/**
 * 배틀 밸런스 시뮬레이션. 숫자를 고치면 이걸 돌려서 승률이 무너지지 않았는지 볼 것.
 *
 *   node -r sucrase/register tools/sim/balance.ts
 *
 * - 승률은 **무승부를 빼고** 잰다. (무승부를 패배로 세면 멀쩡한데도 44~48% 로 나와 헷갈린다)
 * - 양쪽 다 LV1, 둘 다 자기 필살기를 쓰고("한 번 더!" 포함), 타이밍 보너스는 없다(1.0).
 * - 레벨·회차 밸런스는 tools/sim/levels.ts
 */
import { calculateStats, AGE_STAGES } from '../../lib/insect-stats';
import { rollBattle, resolveBattle, BattleSide } from '../../lib/battle-engine';
import { baseMoveFor, movesFor } from '../../lib/special-moves';
import { SPECIES } from '../../lib/species';
import { ORIGIN_EFFECTS } from '../../lib/origins';
import { AgeStageKey, BodyPartScores, EnvironmentKey } from '../../lib/types';

const N = Number(process.env.N || 6000);
const ORIGINS = Object.keys(ORIGIN_EFFECTS) as EnvironmentKey[];
const AGES = AGE_STAGES.map((a) => a.key);
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const parts = (fill?: number): BodyPartScores => {
  const r = () => fill ?? 1 + Math.floor(Math.random() * 5);
  return { head: r(), legs: r(), armor: r(), wings: r(), eyes: r(), instinct: r(), genetics: r() };
};

interface Spec {
  parts?: BodyPartScores | (() => BodyPartScores);
  species?: string;
  age?: AgeStageKey;
  origin?: EnvironmentKey;
}

function make(spec: Spec) {
  const p = typeof spec.parts === 'function' ? spec.parts() : spec.parts ?? parts();
  const species = spec.species ?? pick(SPECIES).label;
  const age = spec.age ?? pick(AGES);
  const origin = spec.origin ?? pick(ORIGINS);
  const side: BattleSide = { stats: calculateStats(p, age, undefined, species, origin), level: 1, origin };
  return { side, species, moves: movesFor(species, 1).map((m) => m.key) };
}

function rate(a: Spec, b: Spec): string {
  let win = 0;
  let lose = 0;
  for (let i = 0; i < N; i++) {
    const A = make(a);
    const B = make(b);
    const rolls = rollBattle(A.side, B.side);
    // "필살기 한 번 더!" (lib/leveling.ts) 가 걸리면 기본기를 한 번 더 쓴다
    const extra = {
      a: rolls.a.bonus ? baseMoveFor(A.species).key : null,
      b: rolls.b.bonus ? baseMoveFor(B.species).key : null,
    };
    const r = resolveBattle(rolls.a, rolls.b, A.moves, B.moves, 1, undefined, extra);
    if (r.winner === 'A') win++;
    else if (r.winner === 'B') lose++;
  }
  return ((win / (win + lose)) * 100).toFixed(1) + '%';
}

const rnd: Spec = {};
console.log('── 부위 점수');
console.log('전부5 vs 전부1 :', rate({ parts: parts(5) }, { parts: parts(1) }));
console.log('전부5 vs 전부3 :', rate({ parts: parts(5) }, { parts: parts(3) }));
console.log('전부5 vs 아무나:', rate({ parts: parts(5) }, rnd));
console.log('전부1 vs 아무나:', rate({ parts: parts(1) }, rnd));
console.log('전부3 vs 아무나:', rate({ parts: parts(3) }, rnd));
for (const key of ['head', 'legs', 'armor', 'wings', 'eyes', 'instinct', 'genetics'] as const) {
  const hi = () => ({ ...parts(), [key]: 5 });
  const lo = () => ({ ...parts(), [key]: 1 });
  console.log(`  ${key.padEnd(8)} 5점 vs 1점:`, rate({ parts: hi }, { parts: lo }));
}
console.log('── 출신지 (vs 아무나)');
for (const o of ORIGINS) console.log(' ', o.padEnd(8), rate({ origin: o }, rnd));
console.log('── 상성: 이기는 쪽 vs 지는 쪽 (나머지 무작위)');
console.log('  물근처 vs 기온상승:', rate({ origin: 'water' }, { origin: 'heat' }));
console.log('  고지대 vs 저지대  :', rate({ origin: 'highland' }, { origin: 'lowland' }));
console.log('── 성장단계 (vs 아무나)');
for (const a of AGES) console.log(' ', a.padEnd(8), rate({ age: a }, rnd));
console.log('── 곤충 종류 (vs 아무나)');
for (const s of SPECIES) console.log(' ', s.label.padEnd(6), rate({ species: s.label }, rnd));

// ── 레벨업 포인트: 3포인트를 한 곳에 몰아준 곤충 vs 똑같은 곤충(포인트 없음) ──
// 어디에 몰아줘도 비슷해야 한다 (한 곳만 압도적이면 다들 거기에만 몰아준다).
import { ALLOC_STATS, applyAlloc } from '../../lib/alloc';
console.log('── 레벨업 포인트 3개 몰아주기 (vs 같은 곤충, 포인트 없음)');
for (const { key, label } of ALLOC_STATS) {
  let win = 0;
  let lose = 0;
  for (let i = 0; i < N; i++) {
    const p = parts();
    const species = pick(SPECIES).label;
    const age = pick(AGES);
    const origin = pick(ORIGINS);
    const base = calculateStats(p, age, undefined, species, origin);
    const moves = movesFor(species, 1).map((m) => m.key);
    const A: BattleSide = { stats: applyAlloc(base, { [key]: 3 }), level: 1, origin };
    const B: BattleSide = { stats: base, level: 1, origin };
    const r = resolveBattle(...(Object.values(rollBattle(A, B)) as [any, any]), moves, moves, 1);
    if (r.winner === 'A') win++;
    else if (r.winner === 'B') lose++;
  }
  console.log(`  ${label.padEnd(4)} +3: ${((win / (win + lose)) * 100).toFixed(1)}%`);
}

// ── 특별 진화: 진화한 곤충 vs 똑같은 곤충(진화 없음) ── 2026-10-01 발톱 추가
import { MUTATIONS, defaultMutations } from '../../lib/mutations';
console.log('── 특별 진화 (그 줄만 제일 많이 vs 정상)');
for (const option of MUTATIONS) {
  let win = 0;
  let lose = 0;
  for (let i = 0; i < N; i++) {
    const p = parts();
    const species = pick(SPECIES).label;
    const age = pick(AGES);
    const origin = pick(ORIGINS);
    const normal = defaultMutations(species);
    const evolved = { ...normal, [option.key]: option.choices[option.choices.length - 1].value };
    if (evolved[option.key] === normal[option.key]) continue; // 이미 최대가 정상인 종 (예: 나비 날개)
    const moves = movesFor(species, 1).map((m) => m.key);
    const A: BattleSide = { stats: calculateStats(p, age, evolved, species, origin), level: 1, origin };
    const B: BattleSide = { stats: calculateStats(p, age, normal, species, origin), level: 1, origin };
    const r = resolveBattle(...(Object.values(rollBattle(A, B)) as [any, any]), moves, moves, 1);
    if (r.winner === 'A') win++;
    else if (r.winner === 'B') lose++;
  }
  console.log(`  ${option.label.padEnd(8)} ${option.choices[option.choices.length - 1].label}: ${((win / (win + lose)) * 100).toFixed(1)}%`);
}
