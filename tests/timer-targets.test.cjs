// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
//
// SPDX-License-Identifier: BSD-3-Clause

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const model = require("../docs/assets/clock-model.js");

test("TIM2 at 200 ms uses the doubled APB1 timer clock", () => {
  const clocks = model.calculate(model.presets.hse72).clocks;
  assert.equal(clocks.PCLK1.hz, 36000000);
  const plan = model.planTimer(clocks.TIM2CLK.hz, 200);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.psc, 224);
  assert.equal(plan.arr, 63999);
  assert.equal(plan.periodSeconds, 0.2);
  assert.equal(plan.hz, 5);
  assert.equal(plan.exact, true);
});

test("the same target is recalculated for every clock profile and APB2 divider", () => {
  for (const preset of Object.values(model.presets)) {
    const clocks = model.calculate(preset).clocks;
    for (const name of ["TIM1CLK", "TIM2CLK", "TIM3CLK", "TIM4CLK"]) {
      const plan = model.planTimer(clocks[name].hz, 200);
      assert.deepEqual(plan.errors, []);
      assert.equal(plan.periodSeconds, 0.2);
      assert.ok(plan.psc >= 0 && plan.psc <= 65535);
      assert.ok(plan.arr >= 1 && plan.arr <= 65535);
    }
  }
  const clocks = model.calculate({ ...model.presets.hse72, apb2Divider: 4 }).clocks;
  assert.equal(clocks.TIM1CLK.hz, 36000000);
  assert.equal(model.planTimer(clocks.TIM1CLK.hz, 200).periodSeconds, 0.2);
});

test("SysTick at 50 ms calculates RELOAD for either clock source", () => {
  const hclk = model.calculate(model.presets.hse72).clocks.HCLK.hz;
  const core = model.planSysTick(hclk, 50);
  const divided = model.planSysTick(hclk / 8, 50);
  assert.equal(core.reload, 3599999);
  assert.equal(divided.reload, 449999);
  assert.equal(core.periodSeconds, 0.05);
  assert.equal(divided.periodSeconds, 0.05);
  assert.equal(core.errorPpm, 0);
});

test("unrepresentable targets report the achieved period and signed error", () => {
  const ms = 2.25 / 8000000 * 1000;
  const tim = model.planTimer(8000000, ms);
  const systick = model.planSysTick(8000000, ms);
  assert.equal(tim.psc, 0);
  assert.equal(tim.arr, 1);
  assert.equal(systick.reload, 1);
  assert.equal(tim.periodSeconds, 2 / 8000000);
  assert.equal(tim.exact, false);
  assert.ok(tim.errorSeconds < 0 && tim.errorPpm < 0);
  assert.equal(systick.periodSeconds, tim.periodSeconds);
});

test("TIM and SysTick respect register-width and nonzero-reload limits", () => {
  const timMaxMs = 65536 * 65536 / 1000000 * 1000;
  const tim = model.planTimer(1000000, timMaxMs);
  assert.equal(tim.psc, 65535);
  assert.equal(tim.arr, 65535);
  assert.ok(model.planTimer(1000000, timMaxMs + 1).errors.length);
  const sysMaxMs = 0x1000000 / 9000000 * 1000;
  assert.equal(model.planSysTick(9000000, sysMaxMs).reload, 0xffffff);
  assert.ok(model.planSysTick(9000000, 2000).errors.length);
  assert.ok(model.planTimer(8000000, 1 / 8000000 * 1000).errors.length);
  assert.ok(model.planSysTick(8000000, 1 / 8000000 * 1000).errors.length);
  const zeroReload = model.calculate({ systickOn: true, systickReload: 0 });
  assert.ok(zeroReload.errors.some(error => error.includes("at least 1")));
  assert.equal(zeroReload.clocks["SysTick interrupt"].hz, null);
});

test("invalid or unavailable clocks cannot produce timer settings", () => {
  for (const plan of [model.planTimer, model.planSysTick]) {
    for (const [clock, ms] of [[null, 200], [0, 50], [NaN, 200], [8000000, 0], [8000000, NaN]]) {
      assert.ok(plan(clock, ms).errors.length);
    }
  }
});

test("generated TIM and SysTick initialization and handlers compile with CMSIS", () => {
  for (const timer of [1, 2, 3, 4]) {
    for (const divider of [1, 8]) {
      const code = model.timingToC(timer, model.planTimer(72000000, 200),
        model.planSysTick(72000000 / divider, 50), divider);
      const compiled = spawnSync("arm-none-eabi-gcc", ["-mcpu=cortex-m3", "-mthumb",
        "-std=c11", "-Wall", "-Wextra", "-Werror", "-fsyntax-only", "-x", "c",
        "-DSTM32F103xB", "-I", path.join(__dirname, "../vendor/STM32CubeF1/Drivers/CMSIS/Core/Include"),
        "-I", path.join(__dirname, "../vendor/STM32CubeF1/Drivers/CMSIS/Device/ST/STM32F1xx/Include"),
        "-"], { input: code, encoding: "utf8" });
      assert.equal(compiled.status, 0, compiled.error || compiled.stderr);
      assert.match(code, /EGR = TIM_EGR_UG/);
      if (timer === 1) assert.match(code, /TIM1_UP_IRQHandler/);
    }
  }
});
