# Audit of delivery 1 (Kehai Interim, 2026-11-25)

**Verdict: accept, with notes.** The joke is honest: the sum really does travel through tones, a Tower of Hanoi,
colliding billiard balls and an OCR, and every stage reads only its own medium. Three of the report's claims are
weaker than they read (findings 1–3), and none changes a result.

## What was checked
1. **Integrity.** Delivery committed as received (`ARRIVED-1.md`) before anything was run.
2. **The delivered suite, rerun** (`node tests/run.js` on a scratch copy): tests 1–8 give results identical to the
   delivered `results.jsonl` (durations aside). Test 9 fails here only because Selenium isn't installed in this
   workspace, so the browser check was redone with Playwright (item 5).
3. **Independent probes** (`audit/probes-1.js`, output in `audit/probes-1.out.json`). These load the core from the
   delivered HTML the same way the delivered tests do. All of them check against my own balanced-ternary full
   adder, not the delivery's oracle.
   - **The one-trit billiard slice, exhaustively:** all 27 input cases (a, b, carry) give the right sum and carry,
     with 6–33 collisions per case. The + and − exit rails never both fire.
   - **The collisions do the work.** With collisions switched off (balls pass through each other), 21 of 27 cases
     go wrong. With the 51 constant-1 balls removed, 20 of 27 go wrong. Shifting any one of 60 randomly chosen
     mirrors (of 469) by one lattice step broke at least one case **every time (60/60)**.
   - **No hidden state:** the 27 cases run in 5 shuffled orders give identical results.
   - **End to end, exhaustively:** all 729 pairs of 3-trit operands come out right through the whole pipeline.
4. **Hanoi is truly shortest** (`audit/probe-hanoi.js`). A breadth-first search over all 19,683 states of 9 discs
   gives the true distance. In 2,000 random targets the stage's move count equals it every time, and the move
   checker refuses illegal moves.
5. **Real browser** (Playwright, Chromium): the page loads and runs all four presets with the correct answers,
   including +9,841 + +9,841 = 19,682. All stages agree with the oracle, with 0 console errors. Screenshot:
   `audit/browser-sample.png`.
6. **Read by hand:**
   - The answer element is written in one place, from the Reader's return value.
   - Each stage function receives only its medium (`runPipeline`).
   - The billiard physics is integer-only.

## Findings
1. **The carry ripple isn't on one table.** The spec asked for per-trit adders chained, with timing set by path
   lengths. In fact each trit is a separate simulation, and JS reads the carry balls off the exit ports and
   re-injects them as the next slice's carry-in. The carry is still computed by collisions and passed only as exit
   port positions, so nothing is faked. But the report's phrase "chained across trits with path-length carry ripple"
   overstates what's there.
2. **Test 7's conservation checks can't fail.**
   - `ballCountEnd` is the same variable as `ballCountStart`.
   - `energyEnd` is reported as `initEnergy`.
   - The per-tick energy sum is real, but velocities are ±1 in each axis by construction, so it's constant.
   - "Balls conserved, energy conserved" is true, but by construction, not by measurement.
   - Reproducibility (the other half of test 7) is a real check.
3. **The noise-floor curve ends before the floor.** Test 6 measured 0 errors from 20 down to −5 dB. That is
   plausible, since each 10 ms tone gives the Goertzel bin about 24 dB of processing gain. Extended downward on 200
   pairs per point:

   | SNR | −10 dB | −12 | −14 | −16 | −18 | −20 | −25 |
   |---|---:|---:|---:|---:|---:|---:|---:|
   | pairs wrong (of 200) | 2 | 19 | 83 | 174 | 198 | 199 | 200 |

   So the Ear's floor sits between about −10 and −16 dB.
4. **Smaller notes.**
   - Test 1 checks the Tritone only through the Ear, so the two are counted together.
   - Test 4 poisons global names the core never refers to. The isolation is real, but it comes from the code's
     structure (item 3 shows no history dependence), not from that test.
   - Test 9 depends on Selenium at fixed system paths.

## Reproducing
```
cd delivery-1 && node tests/run.js        # tests 1–8; test 9 needs Python Selenium + chromedriver
node audit/probes-1.js                     # the probes above
node audit/probe-hanoi.js
```
