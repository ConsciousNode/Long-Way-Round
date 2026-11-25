// probes-1.js: Kehai's independent audit probes for delivery 1 (2026-11-25). Loads the core from the delivered
// HTML exactly as tests/run.js does, then pokes at what the delivered tests don't.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '../delivery-1/long-way-round.html'), 'utf8');
const src = html.match(/<script\s+id=["']core["'][^>]*>([\s\S]*?)<\/script>/)[1];
function load(patch) {
  let s = src; if (patch) s = patch(s);
  const sb = { console, Math, BigInt, Number, String, Boolean, Array, Object, Map, Set, Error, Int8Array, Uint8Array, Int32Array, Float32Array, Date, isFinite, performance: { now: () => 0 } };
  sb.globalThis = sb; vm.runInNewContext(s, sb); return sb.LongWayCore;
}
const C = load();
const out = {};
// my own balanced-ternary full adder (independent of the delivery's oracle)
const fa = (a, b, c) => { let s = a + b + c, k = 0; if (s > 1) { s -= 3; k = 1; } if (s < -1) { s += 3; k = -1; } return [s, k]; };
const T = [-1, 0, 1];
const cases = []; for (const a of T) for (const b of T) for (const c of T) cases.push([a, b, c]);
// the one-trit slice, driven directly with dual-rail input balls (carry in on inputs 4, 5)
function slice(core, a, b, c, mirrorHT) {
  const L = core.getBilliardLayout();
  const bits = [a === 1 ? 1 : 0, a === -1 ? 1 : 0, b === 1 ? 1 : 0, b === -1 ? 1 : 0, c === 1 ? 1 : 0, c === -1 ? 1 : 0];
  return core.__sim(L, bits, mirrorHT || L.mirrorHT);
}
// expose the private slice simulator by patching one export line (read-only use)
const expose = s => s.replace('runPipeline,\n  };', 'runPipeline,\n    __sim: simulateOneTritBilliards,\n  };');
const X = load(expose);
// A. exhaustive truth table of the one-trit slice
let bad = 0, colls = [];
for (const [a, b, c] of cases) {
  const r = slice(X, a, b, c), [s, k] = fa(a, b, c);
  const got = [r.outBits[0] - r.outBits[1], r.outBits[2] - r.outBits[3]];
  if (got[0] !== s || got[1] !== k || (r.outBits[0] && r.outBits[1]) || (r.outBits[2] && r.outBits[3])) bad++;
  colls.push(r.collisions);
}
out.A_slice_truth_table = { cases: 27, mismatches: bad, collisions_min: Math.min(...colls), collisions_max: Math.max(...colls) };
// B. are collisions load-bearing? balls pass through each other instead of colliding
const noColl = load(s => expose(s).replace('} else {\n          // Exact integer 2-ball', '} else if (false) {\n          // Exact integer 2-ball'));
let changed = 0; for (const [a, b, c] of cases) { const r = slice(noColl, a, b, c), [s, k] = fa(a, b, c); if (r.outBits[0] - r.outBits[1] !== s || r.outBits[2] - r.outBits[3] !== k) changed++; }
out.B_no_collisions = { cases_wrong: changed, of: 27 };
// C. are the CONST1 balls load-bearing? remove them all
const noC1 = load(s => expose(s).replace('const nC1 = layout.const1Injectors.length;', 'const nC1 = 0;'));
changed = 0; for (const [a, b, c] of cases) { const r = slice(noC1, a, b, c), [s, k] = fa(a, b, c); if (r.outBits[0] - r.outBits[1] !== s || r.outBits[2] - r.outBits[3] !== k) changed++; }
out.C_no_const1 = { cases_wrong: changed, of: 27 };
// D. are the mirrors load-bearing? shift each of 60 seeded random mirrors by one step, one at a time
{ const L = X.getBilliardLayout(); const rng = X.makeRng(4242); let broke = 0; const n = 60;
  // rebuild a hash table the same way the delivery does, from the layout's own list
  const ht = list => { let minX = 0, maxX = 0, minY = 0, maxY = 0; for (const m of list) { minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x); minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y); }
    minX -= 4; maxX += 4; minY -= 4; maxY += 4; const sY = maxY - minY + 1, g = new Uint8Array((maxX - minX + 1) * sY); for (const m of list) g[(m.x - minX) * sY + (m.y - minY)] = m.type; return { minX, maxX, minY, maxY, strideY: sY, grid: g }; };
  for (let t = 0; t < n; t++) { const idx = Math.floor(rng() * L.mirrorList.length); const list = L.mirrorList.map((m, i) => i === idx ? { x: m.x + 1, y: m.y, type: m.type } : m);
    const h = ht(list); let wrong = 0; for (const [a, b, c] of cases) { const r = slice(X, a, b, c, h), [s, k] = fa(a, b, c); if (r.outBits[0] - r.outBits[1] !== s || r.outBits[2] - r.outBits[3] !== k) wrong++; } if (wrong) broke++; }
  out.D_random_mirror_shifts = { shifted: n, broke_some_case: broke, of_mirrors: L.mirrorList.length }; }
// E. does the slice depend on call history (module-level scratch state)? run the 27 cases in 5 shuffled orders
{ const rng = X.makeRng(77), ref = cases.map(([a, b, c]) => slice(X, a, b, c).outBits.join('')); let diff = 0;
  for (let rep = 0; rep < 5; rep++) { const order = cases.map((_, i) => i).sort(() => rng() - 0.5); for (const i of order) { const [a, b, c] = cases[i]; if (slice(X, a, b, c).outBits.join('') !== ref[i]) diff++; } }
  out.E_history_dependence = { differing_results: diff }; }
// F. is the ball-count check able to fail? (look at how the end count is produced)
out.F_ball_count_check = { end_count_is_start_variable: /ballCountEnd:\s*n,/.test(src), energy_end_is_start_variable: /energyEnd:\s*initEnergy,/.test(src) };
// G. where does the Ear actually break? extend the noise-floor curve downward
{ const rng = C.makeRng(9090); const pairs = []; for (let i = 0; i < 200; i++) pairs.push([C.Oracle.bigIntToTrits(BigInt(Math.floor(rng() * 19683) - 9841)), C.Oracle.bigIntToTrits(BigInt(Math.floor(rng() * 19683) - 9841))]);
  out.G_noise_floor = []; for (const snr of [-10, -12, -14, -16, -18, -20, -25]) { let pe = 0; pairs.forEach(([a, b], i) => { const e = C.stage2_ear(C.stage1_tritone({ aTrits: a, bTrits: b }, { snrDb: snr, seed: 90000 + i }), {}); if (!C.tritsEqual(e.aTrits, a) || !C.tritsEqual(e.bTrits, b)) pe++; }); out.G_noise_floor.push({ snr_db: snr, pair_errors: pe, of: pairs.length }); } }
// H. end-to-end exhaustive over every pair of 3-trit operands (729 pairs), my own oracle
{ let wrong = 0; const v = []; for (let x = -13; x <= 13; x++) v.push(x);
  for (const x of v) for (const y of v) { const r = C.runPipeline(C.Oracle.bigIntToTrits(BigInt(x)), C.Oracle.bigIntToTrits(BigInt(y)), { seed: 1 + (x + 13) * 27 + (y + 13) });
    if (Number(C.Oracle.tritsToBigInt(r.reader.sumTrits)) !== x + y) wrong++; }
  out.H_all_3trit_pairs = { pairs: 729, wrong }; }
console.log(JSON.stringify(out, null, 1));
