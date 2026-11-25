# The Long Way Round: a balanced-ternary adder that takes every detour

ConsciousNode SoftWorks. Xinu rules: one HTML file, zero dependencies, no network, works offline, MIT licence.
Inline everything, and label every inline (a comment naming where it came from).

This is a joke with a straight face. The task is to add two balanced-ternary integers, which takes one line of code.
Instead, the sum must travel through five physical-ish media, each a real, honest instrument. Every stage may read
only its own medium, never the numbers that made it. The joke only works if nothing is faked.

## What to build
1. `long-way-round.html`: the app.
   - Two keypads take operands A and B, up to 9 trits each. Keys are −, 0 and + (shown as T, 0, 1 is fine).
   - One button, **Go the long way**.
   - Each stage is shown live as it runs: the audio waveform and spectrum, the Hanoi pegs, the billiard table, the
     drawn glyphs and the OCR's reading of them.
   - A **receipts** panel lists each stage's input medium, its output, how long it took, and whether it agreed with
     the oracle.
2. `tests/run.js`: a Node test runner. It loads the core from the HTML file itself (from a
   `<script id="core">` block) and must not use a copy. It writes `results.jsonl` and `REPORT.md`. Node has no
   WebAudio and no canvas, so the core must run without either (below).
3. `REPORT.md`, generated from `results.jsonl` by a script. Never type it by hand.

## The stages
Every stage is a pure function from its input medium to its output medium.
1. **Tritone (sound).** Encode A and B, one after the other, as audio: one tone per trit (low = −1, middle = 0,
   high = +1), with a start tone and a separator, in Float32 samples at 48 kHz. Generate the samples in plain JS;
   WebAudio is only for playback. Add seeded white noise at an SNR the user can set (default 10 dB).
2. **The Ear.** A Goertzel filter bank reads the noisy samples alone and recovers the trit strings. It has no access
   to A, B or stage 1's internals.
3. **Hanoi.** Each operand becomes a Tower of Hanoi position, one disc per trit: disc i's peg holds trit i (−1, 0, +1
   are pegs left, middle, right).
   - The position must be *reached*, not written: start with every disc on the left peg and play legal moves only,
     along the shortest path in the Sierpiński state graph. A move checker refuses any illegal move.
   - A reader recovers the trits from the three peg arrays only.
4. **Billiard balls: the addition.** The sum is computed by a billiard-ball computer (after Fredkin and Toffoli,
   1982).
   - Hard spheres on an integer lattice, with fixed walls as mirrors, and deterministic, exact physics: integer
     positions and velocities, no floats in the physics.
   - Each trit is dual-rail: two ball positions per trit, one for + and one for −, neither ball for 0.
   - The adder is a netlist of collision gates (interaction gates plus mirrors), placed and timed on the lattice.
     The gate netlist is generated from the balanced-ternary full adder's truth table by a documented method, then
     laid out by code. Laying it out by hand-coded special cases per input is forbidden.
   - Balls are injected for A and B, the table runs, and the sum is read from which exit ports balls leave by. The
     result is the only thing the table gives the next stage.
   - Ripple the carries: per-trit adders chained, with timing set by path lengths.
5. **Glyphs and the Reader (OCR).** The sum is drawn as balanced-ternary glyphs into a plain pixel array by a small
   JS rasterizer (polygons, anti-aliasing, seeded jitter, rotation, noise). The Reader recognizes them by template
   matching against templates it renders for itself at start-up. **The number shown as the answer is the Reader's
   output and nothing else.**

The **oracle**: plain BigInt balanced-ternary arithmetic, used only to check each stage, never to feed one.

## Forbidden
- Any stage reading A, B, the sum, or another stage's internals: only its own input medium.
- The answer display reading anything but the Reader's output.
- Precomputed outputs, lookup tables keyed on inputs, or branching on the oracle's answer.
- Billiard-ball layouts hard-coded per input, or "balls" whose exit port is decided by anything other than
  collisions.
- Floats in the billiard physics.
- Checks that pass because a stage copied its input through a side channel (a global, a closure, the DOM).

## Tests (numbered; each writes a line to results.jsonl)
1. **Round trip, per stage:** for 2,000 seeded operand pairs, every stage's output matches the oracle's view of
   that stage.
2. **End to end:** 2,000 seeded pairs, including the extremes (±9,841, the 9-trit limit), 0 + 0, and x + (−x).
3. **Sabotage controls that must be caught.** Each has a switch, and with it on, test 2 must fail and report which
   stage disagreed:
   - Tritone: swap the middle and high tones;
   - Ear: detune one Goertzel bin;
   - Hanoi: allow one illegal move;
   - Billiards: move one mirror one lattice step;
   - Rasterizer: swap two glyphs;
   - Reader: swap two templates.
4. **Isolation:** run each stage with its forbidden inputs replaced by garbage (A, B and globals poisoned). The
   results must not change.
5. **Perturbation:** changing the noise or jitter seed changes the intermediate media (different samples, pixels)
   but not the answer. Changing a real input changes the answer.
6. **Noise floor:** measure the Ear's error rate against SNR (−5 to 20 dB, step 5) and report it as measured. No
   pass bar; just the curve.
7. **Billiard conservation:** ball count and total energy are conserved on every run, and runs are bit-for-bit
   reproducible.
8. **Static scan:** the answer element is written in one place only, from the Reader's return value.
9. **Real browser:** the page loads with 0 console errors and runs one pair end to end. Say how you tested this.

## Report
What was built, and how each claim was verified. Don't describe anything as working unless a test exercises it.
Don't predict, summarize or rank results anywhere in code, docs or the UI; report the measurements.

If a requirement can't be met, or conflicts with another, say so in REPORT.md and leave it failing. Never change
accessors, I/O, consoles, test harnesses, or the checking scripts to make a check pass.

Have fun with it. It's allowed to be beautiful.
