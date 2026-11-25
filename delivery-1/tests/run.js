#!/usr/bin/env node
'use strict';

// ============================================================================
// The Long Way Round — Node Test Runner (tests/run.js)
// Loads <script id="core"> directly from ../long-way-round.html (never a copy).
// Writes results.jsonl and generates REPORT.md strictly from results.jsonl.
// Zero external npm dependencies. MIT Licence (ConsciousNode SoftWorks).
// ============================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT_DIR, 'long-way-round.html');
const RESULTS_PATH = path.join(ROOT_DIR, 'results.jsonl');
const REPORT_PATH = path.join(ROOT_DIR, 'REPORT.md');

// Extract <script id="core">...</script> directly from long-way-round.html
const htmlSource = fs.readFileSync(HTML_PATH, 'utf8');
const coreMatch = htmlSource.match(/<script\s+id=["']core["'][^>]*>([\s\S]*?)<\/script>/);
if (!coreMatch) {
  throw new Error('Could not find <script id="core"> in ' + HTML_PATH);
}
const coreSource = coreMatch[1];

function loadCoreInSandbox(extraGlobals) {
  const sandbox = Object.assign({
    console,
    Math,
    BigInt,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    Error,
    Int8Array,
    Uint8Array,
    Int32Array,
    Float32Array,
    Date,
    isFinite,
    performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
  }, extraGlobals || {});
  sandbox.globalThis = sandbox;
  vm.runInNewContext(coreSource, sandbox, { filename: 'long-way-round.html#core' });
  return sandbox.LongWayCore;
}

const Core = loadCoreInSandbox();

// Seeded 9-trit operand generator (range [-9841, +9841])
function generatePairs(count, seed, includeExtremes) {
  const rng = Core.makeRng(seed);
  const pairs = [];
  if (includeExtremes) {
    const MAX9 = Core.Oracle.bigIntToTrits(9841n);
    const MIN9 = Core.Oracle.bigIntToTrits(-9841n);
    const ZERO = [0];
    pairs.push([MAX9, MAX9]);
    pairs.push([MIN9, MIN9]);
    pairs.push([MAX9, MIN9]);
    pairs.push([MIN9, MAX9]);
    pairs.push([MAX9, ZERO]);
    pairs.push([MIN9, ZERO]);
    pairs.push([ZERO, ZERO]);
    // 50 x + (-x) cancellation pairs
    for (let i = 0; i < 50; i++) {
      const v = BigInt(Math.floor(rng() * 19683) - 9841);
      pairs.push([Core.Oracle.bigIntToTrits(v), Core.Oracle.bigIntToTrits(-v)]);
    }
  }
  while (pairs.length < count) {
    const a = BigInt(Math.floor(rng() * 19683) - 9841);
    const b = BigInt(Math.floor(rng() * 19683) - 9841);
    pairs.push([Core.Oracle.bigIntToTrits(a), Core.Oracle.bigIntToTrits(b)]);
  }
  return pairs;
}

const results = [];
function record(entry) {
  results.push(entry);
  console.log(`[Test ${entry.test}] ${entry.name}: ${entry.pass === null ? 'MEASURED' : (entry.pass ? 'PASS' : 'FAIL')} (${entry.duration_ms.toFixed(1)} ms)`);
}

// Warm up billiard layout once and measure synthesis/layout time
const layoutT0 = Number(process.hrtime.bigint()) / 1e6;
const bbcLayout = Core.getBilliardLayout();
const layoutMs = Number(process.hrtime.bigint()) / 1e6 - layoutT0;
console.log(`Core loaded from long-way-round.html. Billiard layout built in ${layoutMs.toFixed(1)} ms (${bbcLayout.gateCount} IG gates, ${bbcLayout.mirrorList.length} mirrors, ${bbcLayout.const1Injectors.length} CONST1 balls, outT=${bbcLayout.outT}).`);

// ============================================================================
// Test 1: Round trip, per stage (2,000 seeded operand pairs)
// ============================================================================
(function test1_roundTripPerStage() {
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  const pairs = generatePairs(2000, 1001, false);
  const counts = {
    tritone: 0,
    ear: 0,
    hanoi: 0,
    billiards: 0,
    rasterizer: 0,
    reader: 0,
  };
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    const sum = Core.Oracle.add(a, b);
    const seed = 10000 + i;

    // Stage 1 (Tritone) checked via clean Ear
    const audio = Core.stage1_tritone({ aTrits: a, bTrits: b }, { snrDb: 10, seed });
    const ear = Core.stage2_ear(audio, {});
    const audioOk = Core.tritsEqual(ear.aTrits, a) && Core.tritsEqual(ear.bTrits, b);
    if (audioOk) { counts.tritone++; counts.ear++; }

    // Stage 3 (Hanoi) independently fed {a, b}
    const hanoi = Core.stage3_hanoi({ aTrits: a, bTrits: b }, {});
    if (hanoi.legal && Core.tritsEqual(hanoi.aTrits, a) && Core.tritsEqual(hanoi.bTrits, b)) {
      counts.hanoi++;
    }

    // Stage 4 (Billiards) independently fed {a, b}
    const bbc = Core.stage4_billiards({ aTrits: a, bTrits: b }, {});
    if (bbc.ballCountConserved && bbc.energyConserved && Core.tritsEqual(bbc.sumTrits, sum)) {
      counts.billiards++;
    }

    // Stage 5 (Rasterizer + Reader) independently fed oracle sum
    const img = Core.stage5_rasterize(sum, { seed });
    const reader = Core.stage5_read(img, {});
    if (Core.tritsEqual(reader.sumTrits, sum)) {
      counts.rasterizer++;
      counts.reader++;
    }
  }
  const pass = Object.values(counts).every(c => c === pairs.length);
  record({
    test: 1,
    name: 'Round trip, per stage',
    pass,
    pairs: pairs.length,
    snr_db: 10,
    stage_matches: counts,
    duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
  });
})();

// ============================================================================
// Test 2: End to end (2,000 seeded pairs including extremes, 0+0, x+(-x))
// ============================================================================
(function test2_endToEnd() {
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  const pairs = generatePairs(2000, 2002, true);
  let matched = 0;
  let extremesMatched = 0;
  const failures = [];
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    const exp = Core.Oracle.add(a, b);
    const run = Core.runPipeline(a, b, { snrDb: 10, seed: 20000 + i });
    const ok = run.hanoi.legal &&
      run.bbc.ballCountConserved &&
      run.bbc.energyConserved &&
      Core.tritsEqual(run.reader.sumTrits, exp);
    if (ok) {
      matched++;
      if (i < 57) extremesMatched++;
    } else if (failures.length < 5) {
      failures.push({ idx: i, a: Core.tritsToString(a), b: Core.tritsToString(b), exp: Core.tritsToString(exp), got: run.reader.asciiText });
    }
  }
  record({
    test: 2,
    name: 'End to end',
    pass: matched === pairs.length,
    pairs: pairs.length,
    matched,
    extremes_and_cancellations_tested: 57,
    extremes_and_cancellations_matched: extremesMatched,
    failures,
    duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
  });
})();

// ============================================================================
// Test 3: Sabotage controls (each switch must cause failure & identify stage)
// ============================================================================
(function test3_sabotage() {
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  // Probe pairs that exercise -1, 0, +1 across operands and sums
  const probePairs = [
    [Core.stringToTrits('10T10T'), Core.stringToTrits('1T01T0')],
    [Core.stringToTrits('111000TTT'), Core.stringToTrits('10T10T10T')],
    [Core.stringToTrits('1000'), Core.stringToTrits('1')],
    [Core.stringToTrits('T10'), Core.stringToTrits('1T0')],
    [Core.stringToTrits('111111111'), Core.stringToTrits('111111111')],
  ];

  const cases = [
    { key: 'tritoneSwapMidHigh', expectedStage: 'tritone' },
    { key: 'earDetuneBin',       expectedStage: 'ear' },
    { key: 'hanoiIllegalMove',   expectedStage: 'hanoi' },
    { key: 'billiardsShiftMirror', expectedStage: 'billiards' },
    { key: 'rasterizerSwapGlyphs', expectedStage: 'rasterizer' },
    { key: 'readerSwapTemplates',  expectedStage: 'reader' },
  ];

  const details = [];
  let allCaught = true;

  for (const c of cases) {
    const sab = { [c.key]: true };
    let e2eFailed = false;
    let firstDisagreedStage = null;

    for (let i = 0; i < probePairs.length; i++) {
      const [a, b] = probePairs[i];
      const exp = Core.Oracle.add(a, b);
      const run = Core.runPipeline(a, b, { snrDb: 10, seed: 30000 + i, sabotage: sab });

      // Check each stage independently against oracle (just like receipts)
      const cleanEarOnAudio = Core.stage2_ear(run.audio, {});
      const s1Ok = Core.tritsEqual(cleanEarOnAudio.aTrits, a) && Core.tritsEqual(cleanEarOnAudio.bTrits, b);
      const s2Ok = Core.tritsEqual(run.ear.aTrits, a) && Core.tritsEqual(run.ear.bTrits, b);
      const s3Ok = run.hanoi.legal && Core.tritsEqual(run.hanoi.aTrits, a) && Core.tritsEqual(run.hanoi.bTrits, b);
      const s4Ok = run.bbc.ballCountConserved && run.bbc.energyConserved && Core.tritsEqual(run.bbc.sumTrits, exp);
      const cleanReadOnImg = Core.stage5_read(run.img, {});
      const s5aOk = Core.tritsEqual(cleanReadOnImg.sumTrits, exp);
      const s5bOk = Core.tritsEqual(run.reader.sumTrits, exp);

      if (!Core.tritsEqual(run.reader.sumTrits, exp) || !run.hanoi.legal) {
        e2eFailed = true;
      }
      if (!firstDisagreedStage) {
        if (!s1Ok) firstDisagreedStage = 'tritone';
        else if (!s2Ok) firstDisagreedStage = 'ear';
        else if (!s3Ok) firstDisagreedStage = 'hanoi';
        else if (!s4Ok) firstDisagreedStage = 'billiards';
        else if (!s5aOk) firstDisagreedStage = 'rasterizer';
        else if (!s5bOk) firstDisagreedStage = 'reader';
      }
    }

    const caught = e2eFailed && firstDisagreedStage === c.expectedStage;
    if (!caught) allCaught = false;
    details.push({
      sabotage: c.key,
      expected_stage: c.expectedStage,
      reported_stage: firstDisagreedStage,
      e2e_failed: e2eFailed,
      caught,
    });
  }

  record({
    test: 3,
    name: 'Sabotage controls',
    pass: allCaught,
    controls: details,
    duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
  });
})();

// ============================================================================
// Test 4: Isolation (poison forbidden globals A, B, sum, oracle, DOM)
// ============================================================================
(function test4_isolation() {
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  const a = Core.stringToTrits('1T011T01');
  const b = Core.stringToTrits('T110T01T');
  const seed = 40404;

  // Baseline clean outputs
  const baseAudio = Core.stage1_tritone({ aTrits: a, bTrits: b }, { snrDb: 10, seed });
  const baseEar = Core.stage2_ear(baseAudio, {});
  const baseHanoi = Core.stage3_hanoi({ aTrits: baseEar.aTrits, bTrits: baseEar.bTrits }, {});
  const baseBbc = Core.stage4_billiards({ aTrits: baseHanoi.aTrits, bTrits: baseHanoi.bTrits }, {});
  const baseImg = Core.stage5_rasterize(baseBbc.sumTrits, { seed });
  const baseRead = Core.stage5_read(baseImg, {});

  // Load core in a hostile sandbox where A, B, sum, oracle, document, window are poisoned!
  const poison = {
    A: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    B: [-1, -1, -1, -1, -1, -1, -1, -1, -1],
    aTrits: [-1, -1, -1],
    bTrits: [1, 1, 1],
    sumTrits: [1, 0, -1],
    SUM: 999999n,
    answer: 'POISON',
    document: { getElementById: () => { throw new Error('Forbidden DOM access'); } },
    window: { A: 'GARBAGE', B: 'GARBAGE' },
  };
  const isoCore = loadCoreInSandbox(poison);

  // Run each stage in isolation using ONLY the serialized medium from the previous stage
  const isoAudio = isoCore.stage1_tritone({ aTrits: a.slice(), bTrits: b.slice() }, { snrDb: 10, seed });
  const audioSame = isoAudio.samples.length === baseAudio.samples.length &&
    isoAudio.samples.every((v, i) => v === baseAudio.samples[i]);

  const isoEar = isoCore.stage2_ear({ sampleRate: baseAudio.sampleRate, samples: new Float32Array(baseAudio.samples) }, {});
  const earSame = Core.tritsEqual(isoEar.aTrits, baseEar.aTrits) && Core.tritsEqual(isoEar.bTrits, baseEar.bTrits);

  const isoHanoi = isoCore.stage3_hanoi({ aTrits: baseEar.aTrits.slice(), bTrits: baseEar.bTrits.slice() }, {});
  const hanoiSame = isoHanoi.legal && Core.tritsEqual(isoHanoi.aTrits, baseHanoi.aTrits) && Core.tritsEqual(isoHanoi.bTrits, baseHanoi.bTrits);

  const isoBbc = isoCore.stage4_billiards({ aTrits: baseHanoi.aTrits.slice(), bTrits: baseHanoi.bTrits.slice() }, {});
  const bbcSame = Core.tritsEqual(isoBbc.sumTrits, baseBbc.sumTrits);

  const isoImg = isoCore.stage5_rasterize(baseBbc.sumTrits.slice(), { seed });
  const imgSame = isoImg.pixels.length === baseImg.pixels.length &&
    isoImg.pixels.every((v, i) => v === baseImg.pixels[i]);

  const isoRead = isoCore.stage5_read({ width: baseImg.width, height: baseImg.height, pixels: new Uint8Array(baseImg.pixels) }, {});
  const readSame = Core.tritsEqual(isoRead.sumTrits, baseRead.sumTrits) && isoRead.displayText === baseRead.displayText;

  const stages = { tritone: audioSame, ear: earSame, hanoi: hanoiSame, billiards: bbcSame, rasterizer: imgSame, reader: readSame };
  record({
    test: 4,
    name: 'Isolation',
    pass: Object.values(stages).every(Boolean),
    stages_unchanged: stages,
    duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
  });
})();

// ============================================================================
// Test 5: Perturbation (seed changes media not answer; input changes answer)
// ============================================================================
(function test5_perturbation() {
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  const a1 = Core.stringToTrits('10T11T0');
  const b1 = Core.stringToTrits('T101T1');
  const a2 = Core.stringToTrits('10T11T1'); // +1 change in LSB

  const r1 = Core.runPipeline(a1, b1, { snrDb: 10, seed: 5001 });
  const r2 = Core.runPipeline(a1, b1, { snrDb: 10, seed: 5002 });
  const r3 = Core.runPipeline(a2, b1, { snrDb: 10, seed: 5001 });

  let audioDiffCount = 0;
  for (let i = 0; i < r1.audio.samples.length; i++) {
    if (r1.audio.samples[i] !== r2.audio.samples[i]) audioDiffCount++;
  }
  let pixelDiffCount = 0;
  for (let i = 0; i < r1.img.pixels.length; i++) {
    if (r1.img.pixels[i] !== r2.img.pixels[i]) pixelDiffCount++;
  }
  const sameAnswerOnSeedChange = Core.tritsEqual(r1.reader.sumTrits, r2.reader.sumTrits);
  const diffAnswerOnInputChange = !Core.tritsEqual(r1.reader.sumTrits, r3.reader.sumTrits);

  record({
    test: 5,
    name: 'Perturbation',
    pass: audioDiffCount > 0 && pixelDiffCount > 0 && sameAnswerOnSeedChange && diffAnswerOnInputChange,
    audio_samples_changed: audioDiffCount,
    audio_samples_total: r1.audio.samples.length,
    pixels_changed: pixelDiffCount,
    pixels_total: r1.img.pixels.length,
    answer_seed_5001: r1.reader.asciiText,
    answer_seed_5002: r2.reader.asciiText,
    answer_modified_input: r3.reader.asciiText,
    duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
  });
})();

// ============================================================================
// Test 6: Noise floor (Ear error rate vs SNR -5 to 20 dB, step 5; no pass bar)
// ============================================================================
(function test6_noiseFloor() {
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  const snrs = [-5, 0, 5, 10, 15, 20];
  const pairsPerSnr = 250;
  const pairs = generatePairs(pairsPerSnr, 6006, false);
  const curve = [];

  for (const snrDb of snrs) {
    let pairErrors = 0;
    let tritErrors = 0;
    let totalTrits = 0;
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i];
      const audio = Core.stage1_tritone({ aTrits: a, bTrits: b }, { snrDb, seed: 60000 + snrDb * 1000 + i });
      const ear = Core.stage2_ear(audio, {});
      const okA = Core.tritsEqual(ear.aTrits, a);
      const okB = Core.tritsEqual(ear.bTrits, b);
      if (!okA || !okB) pairErrors++;

      const lenA = Math.max(a.length, ear.aTrits.length);
      for (let k = 0; k < lenA; k++) {
        totalTrits++;
        if ((a[k] || 0) !== (ear.aTrits[k] || 0)) tritErrors++;
      }
      const lenB = Math.max(b.length, ear.bTrits.length);
      for (let k = 0; k < lenB; k++) {
        totalTrits++;
        if ((b[k] || 0) !== (ear.bTrits[k] || 0)) tritErrors++;
      }
    }
    curve.push({
      snr_db: snrDb,
      pairs_tested: pairsPerSnr,
      pair_errors: pairErrors,
      pair_error_rate: Number((pairErrors / pairsPerSnr).toFixed(6)),
      trit_errors: tritErrors,
      total_trits: totalTrits,
      trit_error_rate: Number((tritErrors / totalTrits).toFixed(6)),
    });
  }

  record({
    test: 6,
    name: 'Noise floor',
    pass: null, // No pass bar; just the measured curve
    curve,
    duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
  });
})();

// ============================================================================
// Test 7: Billiard conservation & bit-for-bit reproducibility
// ============================================================================
(function test7_billiardConservation() {
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  const pairs = generatePairs(200, 7007, true);
  let allBallsConserved = true;
  let allEnergyConserved = true;
  let allReproducible = true;
  let totalTicksAll = 0;
  let totalCollisionsAll = 0;

  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    const r1 = Core.stage4_billiards({ aTrits: a, bTrits: b }, { recordTrace: i === 0 });
    const r2 = Core.stage4_billiards({ aTrits: a, bTrits: b }, { recordTrace: i === 0 });

    if (!r1.ballCountConserved || r1.ballCountStart !== r1.ballCountEnd) allBallsConserved = false;
    if (!r1.energyConserved || r1.energyStart !== r1.energyEnd) allEnergyConserved = false;
    totalTicksAll += r1.totalTicks;
    totalCollisionsAll += r1.totalCollisions;

    const sameMeta = Core.tritsEqual(r1.sumTrits, r2.sumTrits) &&
      r1.totalTicks === r2.totalTicks &&
      r1.totalCollisions === r2.totalCollisions &&
      r1.ballCountStart === r2.ballCountStart &&
      r1.energyStart === r2.energyStart;
    if (!sameMeta) allReproducible = false;

    if (i === 0 && r1.sampleTrace && r2.sampleTrace) {
      if (r1.sampleTrace.length !== r2.sampleTrace.length) allReproducible = false;
      else {
        for (let f = 0; f < r1.sampleTrace.length; f++) {
          const c1 = r1.sampleTrace[f].coords;
          const c2 = r2.sampleTrace[f].coords;
          if (c1.length !== c2.length || !c1.every((v, idx) => v === c2[idx])) {
            allReproducible = false; break;
          }
        }
      }
    }
  }

  record({
    test: 7,
    name: 'Billiard conservation',
    pass: allBallsConserved && allEnergyConserved && allReproducible,
    runs: pairs.length,
    ball_count_conserved: allBallsConserved,
    energy_conserved: allEnergyConserved,
    bit_for_bit_reproducible: allReproducible,
    total_ticks_simulated: totalTicksAll,
    total_collisions: totalCollisionsAll,
    layout_ig_gates: bbcLayout.gateCount,
    layout_mirrors: bbcLayout.mirrorList.length,
    layout_const1_balls: bbcLayout.const1Injectors.length,
    duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
  });
})();

// ============================================================================
// Test 8: Static scan (single answer write from Reader, zero floats in physics,
//         zero external network refs, inline labels)
// ============================================================================
(function test8_staticScan() {
  const t0 = Number(process.hrtime.bigint()) / 1e6;

  // Find all references to 'final-answer' in <script> blocks
  const scriptBlocks = [];
  const sRe = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = sRe.exec(htmlSource)) !== null) scriptBlocks.push(m[1]);
  const allJs = scriptBlocks.join('\n');

  const lines = allJs.split('\n');
  const answerLines = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('final-answer')) {
      answerLines.push(lines[i].trim());
    }
  }

  const singleWrite = answerLines.length === 1;
  const fromReaderOnly = singleWrite && /getElementById\(['"]final-answer['"]\)\.textContent\s*=\s*run\.reader\.displayText\s*;/.test(answerLines[0]);

  // Verify no float literals or Math.* floating ops inside simulateOneTritBilliards
  const simMatch = coreSource.match(/function simulateOneTritBilliards[\s\S]*?^  \}/m);
  const simBody = simMatch ? simMatch[0] : '';
  const hasFloatLiteral = /\d+\.\d+/.test(simBody);
  const hasFloatArray = /Float(32|64)Array/.test(simBody);
  const hasMathFloat = /Math\.(sin|cos|sqrt|pow|floor|ceil|round|random)/.test(simBody);
  const billiardPhysicsIntegerOnly = simBody.length > 0 && !hasFloatLiteral && !hasFloatArray && !hasMathFloat;

  // Verify zero external network URLs (<script src=...>, <link href=...>, http://, https://)
  const hasExternalUrl = /https?:\/\//i.test(htmlSource);
  const inlineLabelCount = (htmlSource.match(/INLINE:/g) || []).length;

  record({
    test: 8,
    name: 'Static scan',
    pass: singleWrite && fromReaderOnly && billiardPhysicsIntegerOnly && !hasExternalUrl && inlineLabelCount >= 4,
    answer_write_sites: answerLines.length,
    answer_write_code: answerLines,
    from_reader_return_value: fromReaderOnly,
    billiard_physics_integer_only: billiardPhysicsIntegerOnly,
    external_urls_found: hasExternalUrl,
    inline_labels_found: inlineLabelCount,
    duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
  });
})();

// ============================================================================
// Test 9: Real browser (Chromium + chromedriver via Python Selenium)
// ============================================================================
(function test9_realBrowser() {
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  const pyScript = `
import base64, json, sys, time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By

html_path = sys.argv[1]
b64 = base64.b64encode(open(html_path, 'rb').read()).decode('ascii')

opts = Options()
opts.binary_location = '/usr/bin/chromium'
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--disable-gpu')
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

service = Service('/usr/bin/chromedriver')
driver = webdriver.Chrome(service=service, options=opts)
try:
    driver.get('data:text/html;charset=utf-8;base64,' + b64)
    driver.find_element(By.ID, 'preset-sample').click()
    a_text = driver.find_element(By.ID, 'disp-a').text
    b_text = driver.find_element(By.ID, 'disp-b').text
    driver.find_element(By.ID, 'go-btn').click()
    answer = ''
    for _ in range(100):
        answer = driver.find_element(By.ID, 'final-answer').text.strip()
        if answer and answer != '\\u2014' and answer != '-':
            break
        time.sleep(0.05)
    status = driver.find_element(By.ID, 'answer-status').text.strip()
    note = driver.find_element(By.ID, 'answer-note').text.strip()
    receipt_rows = len(driver.find_elements(By.CSS_SELECTOR, '#receipts-body tr'))
    logs = driver.get_log('browser')
    severe = [l for l in logs if l.get('level') == 'SEVERE']
    caps = driver.capabilities
    print(json.dumps({
        'browser_name': caps.get('browserName'),
        'browser_version': caps.get('browserVersion'),
        'a_text': a_text,
        'b_text': b_text,
        'final_answer': answer,
        'status': status,
        'note': note,
        'receipt_rows': receipt_rows,
        'console_total': len(logs),
        'console_errors': len(severe),
        'console_error_messages': [l.get('message') for l in severe],
    }))
finally:
    driver.quit()
`;
  const proc = spawnSync('python3', ['-c', pyScript, HTML_PATH], { encoding: 'utf8', timeout: 60000 });
  if (proc.status !== 0) {
    record({
      test: 9,
      name: 'Real browser',
      pass: false,
      method: 'Headless Chromium via Python Selenium 4 + chromedriver (base64 data URI of long-way-round.html)',
      error: (proc.stderr || proc.stdout || 'Unknown error').trim(),
      duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
    });
    return;
  }
  const data = JSON.parse(proc.stdout.trim());
  const expectedAnswer = '+0+0';
  const pass = data.console_errors === 0 &&
    data.final_answer === expectedAnswer &&
    data.receipt_rows === 6 &&
    data.status === 'All stages agreed with oracle';

  record({
    test: 9,
    name: 'Real browser',
    pass,
    method: 'Headless Chromium (' + data.browser_version + ') launched via chromedriver + Python Selenium loading exact bytes of long-way-round.html as an offline base64 data URI',
    expected_answer: expectedAnswer,
    observed: data,
    duration_ms: Number(process.hrtime.bigint()) / 1e6 - t0,
  });
})();

// ============================================================================
// Write results.jsonl
// ============================================================================
const jsonlContent = results.map(r => JSON.stringify(r)).join('\n') + '\n';
fs.writeFileSync(RESULTS_PATH, jsonlContent, 'utf8');

// ============================================================================
// Generate REPORT.md strictly from results.jsonl (never typed by hand)
// ============================================================================
const parsedLines = fs.readFileSync(RESULTS_PATH, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const byNum = Object.fromEntries(parsedLines.map(r => [r.test, r]));

const md = [];
md.push('# The Long Way Round — Verification Report');
md.push('');
md.push('*Generated directly from `results.jsonl` by `tests/run.js`.*');
md.push('');
md.push('## What Was Built');
md.push('');
md.push('- `long-way-round.html`: single-file, zero-dependency, offline-capable HTML/CSS/JS application under the MIT licence (ConsciousNode SoftWorks, Xinu rules). All inline sections are labeled with `INLINE:` comments.');
md.push('- `<script id="core">`: pure-function 5-stage balanced-ternary addition pipeline with no WebAudio or Canvas dependencies, loaded directly from `long-way-round.html` by `tests/run.js`:');
md.push('  1. **Tritone**: encodes operands A and B MSB-first as 48 kHz Float32 PCM tones (600 Hz START, 800 Hz `-1`, 1000 Hz `0`, 1200 Hz `+1`, 1500 Hz SEP, 1800 Hz END; 480 samples / 10 ms per symbol) plus seeded white Gaussian noise at configurable SNR (default 10 dB).');
md.push('  2. **The Ear**: synchronizes on the START tone and decodes the noisy Float32 samples alone via a 6-bin Goertzel filter bank.');
md.push('  3. **Hanoi**: represents each 9-trit operand as a 9-disc Tower of Hanoi peg configuration reached from all-discs-on-left via legal moves along the shortest path in the Sierpinski state graph, enforced by `hanoiApplyLegalMove`, and read back from the three peg arrays only.');
md.push(`  4. **Billiard-Ball Adder**: dual-rail balanced-ternary full adder synthesized from the 9-row half-adder and 7-row carry-combiner truth tables via Quine-McCluskey minimization with don't-cares, compiled to a parity-aligned Fredkin-Toffoli Interaction Gate netlist (${byNum[7].layout_ig_gates} IG gates, ${byNum[7].layout_mirrors} fixed mirrors, ${byNum[7].layout_const1_balls} clocked CONST1 balls per trit), laid out by code on Z^2, chained across trits with path-length carry ripple, and simulated with exact integer positions and velocities.`);
md.push('  5. **Glyphs and the Reader (OCR)**: scanline 2x2 supersampled anti-aliased polygon rasterizer with seeded rotation (+/-4 deg), translation jitter (+/-0.8 px), and pixel noise (+/-10 gray levels) into a plain `Uint8Array`, read back solely by a zero-mean NCC template matcher using templates the Reader renders for itself at start-up.');
md.push('- **Oracle**: plain `BigInt` balanced-ternary arithmetic used solely for checking receipts and tests.');
md.push('');
md.push('## Test Measurements');
md.push('');
md.push('| # | Test | Result | Duration (ms) | Measured Output |');
md.push('|---:|---|---|---:|---|');
for (const r of parsedLines) {
  const status = r.pass === null ? 'MEASURED' : (r.pass ? 'PASS' : 'FAIL');
  let detail = '';
  if (r.test === 1) {
    const m = r.stage_matches;
    detail = `${r.pairs} pairs @ ${r.snr_db} dB SNR: tritone ${m.tritone}/${r.pairs}, ear ${m.ear}/${r.pairs}, hanoi ${m.hanoi}/${r.pairs}, billiards ${m.billiards}/${r.pairs}, rasterizer ${m.rasterizer}/${r.pairs}, reader ${m.reader}/${r.pairs}`;
  } else if (r.test === 2) {
    detail = `${r.matched}/${r.pairs} matched (extremes & x+(-x): ${r.extremes_and_cancellations_matched}/${r.extremes_and_cancellations_tested})`;
  } else if (r.test === 3) {
    const caught = r.controls.filter(c => c.caught).length;
    detail = `${caught}/${r.controls.length} sabotage controls caught and attributed to the sabotaged stage`;
  } else if (r.test === 4) {
    const okCount = Object.values(r.stages_unchanged).filter(Boolean).length;
    detail = `${okCount}/6 stages unchanged under poisoned globals`;
  } else if (r.test === 5) {
    detail = `audio diffs=${r.audio_samples_changed}/${r.audio_samples_total}, pixel diffs=${r.pixels_changed}/${r.pixels_total}, seed-5001=${r.answer_seed_5001}, seed-5002=${r.answer_seed_5002}, modified-input=${r.answer_modified_input}`;
  } else if (r.test === 6) {
    detail = r.curve.map(pt => `${pt.snr_db} dB: ${pt.pair_errors}/${pt.pairs_tested} pairs (${(pt.trit_error_rate * 100).toFixed(3)}% trits)`).join('; ');
  } else if (r.test === 7) {
    detail = `${r.runs} runs, ${r.total_ticks_simulated} ticks, ${r.total_collisions} collisions; balls conserved=${r.ball_count_conserved}, energy conserved=${r.energy_conserved}, reproducible=${r.bit_for_bit_reproducible}`;
  } else if (r.test === 8) {
    detail = `answer write sites=${r.answer_write_sites}, from Reader=${r.from_reader_return_value}, integer-only billiard physics=${r.billiard_physics_integer_only}, external URLs=${r.external_urls_found}, INLINE labels=${r.inline_labels_found}`;
  } else if (r.test === 9) {
    detail = r.observed
      ? `console errors=${r.observed.console_errors}, answer=${r.observed.final_answer} (expected ${r.expected_answer}), receipt rows=${r.observed.receipt_rows}`
      : `error: ${r.error}`;
  }
  md.push(`| ${r.test} | ${r.name} | ${status} | ${r.duration_ms.toFixed(1)} | ${detail} |`);
}

md.push('');
md.push('## Test 3 — Sabotage Attribution Detail');
md.push('');
md.push('| Sabotage Switch | Expected Stage | Reported Stage | End-to-End Failed | Caught |');
md.push('|---|---|---|---|---|');
for (const c of byNum[3].controls) {
  md.push(`| \`${c.sabotage}\` | ${c.expected_stage} | ${c.reported_stage} | ${c.e2e_failed} | ${c.caught} |`);
}

md.push('');
md.push('## Test 6 — Ear Noise Floor Curve');
md.push('');
md.push('| SNR (dB) | Pairs Tested | Pair Errors | Pair Error Rate | Trit Errors | Total Trits | Trit Error Rate |');
md.push('|---:|---:|---:|---:|---:|---:|---:|');
for (const pt of byNum[6].curve) {
  md.push(`| ${pt.snr_db} | ${pt.pairs_tested} | ${pt.pair_errors} | ${pt.pair_error_rate} | ${pt.trit_errors} | ${pt.total_trits} | ${pt.trit_error_rate} |`);
}

md.push('');
md.push('## Test 9 — Real Browser Verification Method');
md.push('');
md.push(`- Method: ${byNum[9].method}`);
if (byNum[9].observed) {
  md.push(`- Operands clicked via preset: A = \`${byNum[9].observed.a_text}\`, B = \`${byNum[9].observed.b_text}\``);
  md.push(`- Observed \`#final-answer\`: \`${byNum[9].observed.final_answer}\` (expected \`${byNum[9].expected_answer}\`)`);
  md.push(`- Console errors: ${byNum[9].observed.console_errors} (total console entries: ${byNum[9].observed.console_total})`);
}
md.push('');

fs.writeFileSync(REPORT_PATH, md.join('\n'), 'utf8');
console.log('Wrote results.jsonl and generated REPORT.md.');

const anyFail = parsedLines.some(r => r.pass === false);
process.exit(anyFail ? 1 : 0);
