# The Long Way Round — Verification Report

*Generated directly from `results.jsonl` by `tests/run.js`.*

## What Was Built

- `long-way-round.html`: single-file, zero-dependency, offline-capable HTML/CSS/JS application under the MIT licence (ConsciousNode SoftWorks, Xinu rules). All inline sections are labeled with `INLINE:` comments.
- `<script id="core">`: pure-function 5-stage balanced-ternary addition pipeline with no WebAudio or Canvas dependencies, loaded directly from `long-way-round.html` by `tests/run.js`:
  1. **Tritone**: encodes operands A and B MSB-first as 48 kHz Float32 PCM tones (600 Hz START, 800 Hz `-1`, 1000 Hz `0`, 1200 Hz `+1`, 1500 Hz SEP, 1800 Hz END; 480 samples / 10 ms per symbol) plus seeded white Gaussian noise at configurable SNR (default 10 dB).
  2. **The Ear**: synchronizes on the START tone and decodes the noisy Float32 samples alone via a 6-bin Goertzel filter bank.
  3. **Hanoi**: represents each 9-trit operand as a 9-disc Tower of Hanoi peg configuration reached from all-discs-on-left via legal moves along the shortest path in the Sierpinski state graph, enforced by `hanoiApplyLegalMove`, and read back from the three peg arrays only.
  4. **Billiard-Ball Adder**: dual-rail balanced-ternary full adder synthesized from the 9-row half-adder and 7-row carry-combiner truth tables via Quine-McCluskey minimization with don't-cares, compiled to a parity-aligned Fredkin-Toffoli Interaction Gate netlist (85 IG gates, 469 fixed mirrors, 51 clocked CONST1 balls per trit), laid out by code on Z^2, chained across trits with path-length carry ripple, and simulated with exact integer positions and velocities.
  5. **Glyphs and the Reader (OCR)**: scanline 2x2 supersampled anti-aliased polygon rasterizer with seeded rotation (+/-4 deg), translation jitter (+/-0.8 px), and pixel noise (+/-10 gray levels) into a plain `Uint8Array`, read back solely by a zero-mean NCC template matcher using templates the Reader renders for itself at start-up.
- **Oracle**: plain `BigInt` balanced-ternary arithmetic used solely for checking receipts and tests.

## Test Measurements

| # | Test | Result | Duration (ms) | Measured Output |
|---:|---|---|---:|---|
| 1 | Round trip, per stage | PASS | 152044.7 | 2000 pairs @ 10 dB SNR: tritone 2000/2000, ear 2000/2000, hanoi 2000/2000, billiards 2000/2000, rasterizer 2000/2000, reader 2000/2000 |
| 2 | End to end | PASS | 150795.6 | 2000/2000 matched (extremes & x+(-x): 57/57) |
| 3 | Sabotage controls | PASS | 1541.5 | 6/6 sabotage controls caught and attributed to the sabotaged stage |
| 4 | Isolation | PASS | 1047.7 | 6/6 stages unchanged under poisoned globals |
| 5 | Perturbation | PASS | 179.7 | audio diffs=7920/7920, pixel diffs=3410/4740, seed-5001=1T01111, seed-5002=1T01111, modified-input=1T1TTTT |
| 6 | Noise floor | MEASURED | 9282.1 | -5 dB: 0/250 pairs (0.000% trits); 0 dB: 0/250 pairs (0.000% trits); 5 dB: 0/250 pairs (0.000% trits); 10 dB: 0/250 pairs (0.000% trits); 15 dB: 0/250 pairs (0.000% trits); 20 dB: 0/250 pairs (0.000% trits) |
| 7 | Billiard conservation | PASS | 25415.8 | 200 runs, 2110976 ticks, 26803 collisions; balls conserved=true, energy conserved=true, reproducible=true |
| 8 | Static scan | PASS | 1.2 | answer write sites=1, from Reader=true, integer-only billiard physics=true, external URLs=false, INLINE labels=5 |
| 9 | Real browser | PASS | 2683.2 | console errors=0, answer=+0+0 (expected +0+0), receipt rows=6 |

## Test 3 — Sabotage Attribution Detail

| Sabotage Switch | Expected Stage | Reported Stage | End-to-End Failed | Caught |
|---|---|---|---|---|
| `tritoneSwapMidHigh` | tritone | tritone | true | true |
| `earDetuneBin` | ear | ear | true | true |
| `hanoiIllegalMove` | hanoi | hanoi | true | true |
| `billiardsShiftMirror` | billiards | billiards | true | true |
| `rasterizerSwapGlyphs` | rasterizer | rasterizer | true | true |
| `readerSwapTemplates` | reader | reader | true | true |

## Test 6 — Ear Noise Floor Curve

| SNR (dB) | Pairs Tested | Pair Errors | Pair Error Rate | Trit Errors | Total Trits | Trit Error Rate |
|---:|---:|---:|---:|---:|---:|---:|
| -5 | 250 | 0 | 0 | 0 | 4243 | 0 |
| 0 | 250 | 0 | 0 | 0 | 4243 | 0 |
| 5 | 250 | 0 | 0 | 0 | 4243 | 0 |
| 10 | 250 | 0 | 0 | 0 | 4243 | 0 |
| 15 | 250 | 0 | 0 | 0 | 4243 | 0 |
| 20 | 250 | 0 | 0 | 0 | 4243 | 0 |

## Test 9 — Real Browser Verification Method

- Method: Headless Chromium (156.0.8078.73) launched via chromedriver + Python Selenium loading exact bytes of long-way-round.html as an offline base64 data URI
- Operands clicked via preset: A = `+−0+`, B = `++−`
- Observed `#final-answer`: `+0+0` (expected `+0+0`)
- Console errors: 0 (total console entries: 0)
