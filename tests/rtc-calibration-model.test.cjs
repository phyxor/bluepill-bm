// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

const { test } = require("node:test");
const assert = require("node:assert/strict");
const model = require("../docs/assets/js/rtc-calibration-model.js");
const near = (actual, expected, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test("the perfect default and conventional 512 Hz reference need no correction", () => {
  for (const input of [{}, { divider: 32768, frequencyHz: 512 }]) {
    const result = model.calculate(input);
    assert.deepEqual(result.errors, []);
    for (const stage of [result.measured, result.operating]) {
      assert.equal(stage.ppm, 0);
      assert.equal(stage.roundedPpm, 0);
      assert.equal(stage.calibration, 0);
      assert.equal(stage.secondsPerMonth, 0);
      assert.equal(stage.residualSecondsPerMonth, 0);
      assert.equal(stage.status, "in-range");
    }
  }
  assert.equal(model.calculate().referenceHz, 511.96875);
  assert.equal(model.calculate().reload, 32765);
  assert.equal(model.calculate({ divider: 32768, frequencyHz: 512 }).reload, 32767);
});

test("a nominal crystal with the AN2604 divider is corrected exactly by CAL 64", () => {
  const result = model.calculate({ frequencyHz: 512 });
  assert.equal(result.crystalHz, 32768);
  near(result.measured.ppm, 61.0388817677);
  assert.equal(result.measured.calibration, 64);
  assert.equal(result.measured.residualPpm, 0);
  assert.equal(result.measured.residualSecondsPerMonth, 0);
});

test("AN2604 printed-reference mode reproduces the worked frequency example", () => {
  const result = model.calculate({ method: "table", frequencyHz: 511.982 });
  assert.deepEqual(result.errors, []);
  assert.equal(result.referenceHz, 511.968);
  near(result.measured.ppm, 27.3454590912);
  assert.equal(result.measured.roundedPpm, 27);
  assert.equal(result.measured.calibration, 28);
  near(result.measured.residualPpm, 0.6425782318);
  near(result.measured.secondsPerMonth, 70.8794299643);
  near(result.measured.residualSecondsPerMonth, 1.6655627768);
});

test("the exact reference is not silently replaced by the note's rounded reference", () => {
  const result = model.calculate({ frequencyHz: 511.982 });
  near(result.measured.ppm, 25.8804858696);
  assert.equal(result.measured.calibration, 27);
  assert.equal(result.measured.roundedPpm, 26);
});

test("table compensation matches the manual's ppm and 30-day rounding", () => {
  for (const [calibration, roundedPpm, roundedSeconds] of [
    [0, 0, 0], [1, 1, 2], [10, 10, 25], [11, 10, 27], [64, 61, 158], [127, 121, 314],
  ]) {
    const frequencyHz = 511.968 * (1 + calibration / (2 ** 20));
    const stage = model.calculate({ method: "table", frequencyHz }).measured;
    assert.equal(stage.calibration, calibration);
    assert.equal(stage.roundedPpm, roundedPpm);
    assert.equal(Math.round(stage.secondsPerMonth), roundedSeconds);
  }
});

test("the temperature example produces a minus-nine-ppm shift and CAL 19", () => {
  const result = model.calculate({ method: "table", frequencyHz: 511.982, operatingTemperature: 40 });
  assert.equal(result.temperatureShiftPpm, -9);
  assert.equal(result.measured.calibration, 28);
  near(result.operating.ppm, 18.3454590912);
  assert.equal(result.operating.roundedPpm, 18);
  assert.equal(result.operating.calibration, 19);
});

test("temperature correction does not double-count the measurement temperature", () => {
  const sameTemperature = model.calculate({ frequencyHz: 512, measuredTemperature: 40, operatingTemperature: 40 });
  assert.equal(sameTemperature.temperatureShiftPpm, 0);
  assert.deepEqual(sameTemperature.measured, sameTemperature.operating);
  const warming = model.calculate({ measuredTemperature: 0, operatingTemperature: 25 });
  assert.equal(warming.temperatureShiftPpm, 25);
  const symmetric = model.calculate({ measuredTemperature: 10, operatingTemperature: 40 });
  assert.equal(symmetric.temperatureShiftPpm, 0);
  const flat = model.calculate({ curvature: 0, operatingTemperature: 85 });
  assert.equal(flat.temperatureShiftPpm, 0);
  const customTurnover = model.calculate({ turnoverTemperature: 20, operatingTemperature: 40 });
  assert.equal(customTurnover.temperatureShiftPpm, -15);
});

test("all 128 calibration values cancel their matching exact input rates", () => {
  for (const divider of [32766, 32768]) {
    for (let calibration = 0; calibration <= 127; ++calibration) {
      const frequencyHz = divider / (1 - calibration / (2 ** 20)) / 64;
      const result = model.calculate({ divider, frequencyHz });
      assert.deepEqual(result.errors, []);
      assert.equal(result.measured.calibration, calibration);
      near(result.measured.residualPpm, 0);
      assert.equal(result.measured.status, "in-range");
    }
  }
});

test("exact-mode quantization minimizes the remaining drift", () => {
  for (let ppm = 0.1; ppm < 121; ppm += 0.37) {
    const result = model.calculate({ frequencyHz: model.defaults.frequencyHz * (1 + ppm / 1e6) });
    const stage = result.measured;
    for (const neighbor of [stage.calibration - 1, stage.calibration + 1]) {
      if (neighbor < 0 || neighbor > 127) continue;
      const residual = ((1 + stage.ppm / 1e6) * (1 - neighbor / (2 ** 20)) - 1) * 1e6;
      assert.ok(Math.abs(stage.residualPpm) <= Math.abs(residual) + 1e-8);
    }
  }
});

test("slow and excessive input rates retain signed, uncorrected drift", () => {
  for (const method of ["exact", "table"]) {
    const reference = model.referenceHz(32766, method);
    const slow = model.calculate({ method, frequencyHz: reference * (1 - 10e-6) }).operating;
    assert.equal(slow.calibration, 0);
    assert.equal(slow.status, "slow");
    near(slow.residualPpm, -10);
    near(slow.residualSecondsPerMonth, -25.92);
    const fast = model.calculate({ method, frequencyHz: reference * (1 + 1000e-6) }).operating;
    assert.equal(fast.calibration, 127);
    assert.equal(fast.status, "above-range");
    assert.ok(fast.residualPpm > 878);
  }
  const cold = model.calculate({ operatingTemperature: -20 });
  assert.equal(cold.operating.calibration, 0);
  assert.equal(cold.operating.status, "slow");
  assert.ok(cold.operating.residualSecondsPerMonth < 0);
});

test("invalid inputs produce errors instead of a usable calibration result", () => {
  const invalid = [
    { frequencyHz: 0 }, { frequencyHz: -1 }, { frequencyHz: NaN }, { frequencyHz: Infinity },
    { frequencyHz: "512" }, { divider: 32767 }, { method: "unknown" },
    { curvature: 0.04 }, { curvature: NaN }, { curvature: -Infinity },
    { measuredTemperature: NaN }, { operatingTemperature: -274 },
    { turnoverTemperature: Infinity }, { operatingTemperature: 1e300 },
  ];
  for (const input of invalid) {
    const result = model.calculate(input);
    assert.ok(result.errors.length > 0, JSON.stringify(input));
    assert.equal(result.operating, undefined);
  }
});

test("pulse-removal timing has a 32-second cycle at nominal LSE frequency", () => {
  for (const [calibration, delaySeconds] of [
    [0, 0], [1, 0.000030517578125], [64, 0.001953125], [127, 0.003875732421875],
  ]) {
    const timing = model.pulseTiming(32768, calibration);
    assert.equal(timing.cycleSeconds, 32);
    assert.equal(timing.delaySeconds, delaySeconds);
    assert.equal(timing.pulseSeconds, 0.000030517578125);
    assert.equal(timing.passedPulses + calibration, 1048576);
    assert.equal(timing.calibration, calibration);
  }
});

test("waveform timing uses the operating frequency and final CAL", () => {
  const nominal = model.calculate({ frequencyHz: 512 });
  assert.equal(nominal.timing.lseHz, 32768);
  assert.equal(nominal.timing.calibration, 64);
  assert.equal(nominal.timing.cycleSeconds, 32);
  assert.equal(nominal.timing.delaySeconds, 0.001953125);
  const warm = model.calculate({ frequencyHz: 512, operatingTemperature: 40 });
  near(warm.timing.lseHz, 32767.705106);
  assert.ok(warm.timing.cycleSeconds > 32);
  assert.equal(warm.timing.calibration, warm.operating.calibration);
  assert.equal(model.calculate().timing.delaySeconds, 0);
  for (const method of ["exact", "table"]) {
    near(model.calculate({ method, frequencyHz: 511.982 }).timing.lseHz, 32766.848);
  }
});

test("invalid clock frequencies and CAL settings have no timing diagram model", () => {
  for (const lseHz of [0, -1, NaN, Infinity]) assert.equal(model.pulseTiming(lseHz, 64), null);
  for (const calibration of [-1, 128, 1.5, NaN, Infinity]) {
    assert.equal(model.pulseTiming(32768, calibration), null);
  }
});
