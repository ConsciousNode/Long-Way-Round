// probe-hanoi.js: are the Hanoi stage's move counts true shortest paths? BFS over all 3^9 states (Kehai, 2026-11-25)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '../delivery-1/long-way-round.html'), 'utf8');
const src = html.match(/<script\s+id=["']core["'][^>]*>([\s\S]*?)<\/script>/)[1];
const sb = { console, Math, BigInt, Number, String, Boolean, Array, Object, Map, Set, Error, Int8Array, Uint8Array, Int32Array, Float32Array, Date, isFinite, performance: { now: () => 0 } };
sb.globalThis = sb; vm.runInNewContext(src, sb); const C = sb.LongWayCore;
const n = 9, N = 3 ** n, dist = new Int32Array(N).fill(-1);   // state = sum peg[d] * 3^d, disc 0 smallest
const pegOf = (s, d) => Math.floor(s / 3 ** d) % 3;
dist[0] = 0; const q = [0];
for (let h = 0; h < q.length; h++) { const s = q[h];
  const top = [n, n, n]; for (let d = n - 1; d >= 0; d--) top[pegOf(s, d)] = d;      // smallest disc on each peg
  for (let f = 0; f < 3; f++) for (let t = 0; t < 3; t++) { if (f === t || top[f] === n || top[f] > top[t]) continue;
    const ns = s + (t - f) * 3 ** top[f]; if (dist[ns] < 0) { dist[ns] = dist[s] + 1; q.push(ns); } } }
let worse = 0, checked = 0; const rng = C.makeRng(31337);
for (let i = 0; i < 2000; i++) { const v = BigInt(Math.floor(rng() * 19683) - 9841), tr = C.Oracle.bigIntToTrits(v);
  const r = C.hanoiReachPosition(tr, {}); let s = 0; for (let d = 0; d < n; d++) s += ((d < tr.length ? tr[d] : 0) + 1) * 3 ** d;
  checked++; if (r.moveCount !== dist[s]) worse++; }
console.log(JSON.stringify({ states: N, reached_by_bfs: q.length, targets_checked: checked, not_shortest: worse }));
