// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

const { test } = require("node:test");
const assert = require("node:assert/strict");
const model = require("../docs/assets/js/power-model.js");
const config = patch => ({ ...model.defaults(), ...patch });

test("wake overview lists all sources and both instructions with mode-specific execution paths", () => {
  const overview = patch => model.wakeOverview(config(patch));
  const row = (patch, id) => overview(patch).find(source => source.id === id);
  assert.deepEqual(overview({}).map(source => source.id), Object.keys(model.sources));
  assert.equal(row({}, "extiIRQ").WFI.handler, "EXTI0_IRQHandler");
  assert.equal(row({}, "extiEvent").WFI.wakes, false);
  assert.equal(row({}, "extiEvent").WFE.wakes, true);
  assert.equal(row({ nvic: false, sevonpend: true }, "pending").WFE.handler, null);
  assert.equal(row({ nvic: false, sevonpend: true }, "pending").WFE.wakes, true);
  assert.equal(row({ primask: true, sevonpend: true }, "extiIRQ").WFE.deferred, true);
  assert.equal(row({ mode: "stop" }, "systick").WFI.wakes, false);
  assert.equal(row({ mode: "stop", rtcClock: "hse" }, "rtcEvent").WFE.wakes, false);
  assert.equal(row({ mode: "standby" }, "wkup").WFI.reset, true);
  assert.equal(row({ mode: "standby" }, "rtcIRQ").WFE.reset, true);
  assert.equal(row({ mode: "standby" }, "extiIRQ").WFI.wakes, false);
  assert.equal(row({ sleepOnExit: true }, "extiIRQ").WFE.wakes, false);
});

test("clock restoration distinguishes retained Sleep clocks, Stop HSI wake, and reset", () => {
  for (const c of model.comparisonConfigurations()) {
    assert.equal(model.clockRestoration({ ...c, profile: "hsi" }).required, false, c.mode);
    const restore = model.clockRestoration({ ...c, profile: "pll" });
    assert.equal(restore.required, model.modes[c.mode].deep === 1, c.mode);
    if (c.sleepOnExit && model.isStop(c)) assert.match(restore.detail, /inside the ISR/);
  }
  for (const source of ["nrst", "iwdg"]) {
    const reset = model.clockRestoration(config({ source, profile: "pll" }));
    assert.equal(reset.required, true);
    assert.match(reset.detail, /during startup/);
  }
});

test("Sleep-on-exit shares Sleep hardware state but changes the final ISR return", () => {
  const now = config({ rtcClock: "hse", profile: "pll" });
  const exit = { ...now, sleepOnExit: true };
  assert.deepEqual(model.clocks(exit), model.clocks(now));
  assert.deepEqual(model.powerEstimate(exit), model.powerEstimate(now));
  assert.equal(model.wake(exit).handler, "EXTI0_IRQHandler");
  assert.match(model.wake(exit).reason, /handler return sleeps again/);
  assert.ok(model.recovery(exit).some(text => /final exception return sleeps again/.test(text)));
  const event = { ...exit, instruction: "WFE", source: "extiEvent" };
  assert.match(model.configurationError(event), /Incorrect entry choice/);
  assert.equal(model.wake(event).wakes, false);
  assert.equal(model.wake(event).handler, null);
  assert.equal(model.wake({ ...event, source: "pending", nvic: false, sevonpend: true }).wakes, false);
  assert.equal(model.entry({ ...exit, instruction: "WFE", eventLatch: true }).sleeps, false);
  assert.match(model.preparation(event)[0], /select WFI/);
  assert.equal(model.configurationError({ ...event, instruction: "WFI" }), null);
  assert.equal(model.configurationError({ ...event, sleepOnExit: false }), null);
  assert.equal(model.wake({ ...event, sleepOnExit: false }).wakes, true);
  for (const c of model.comparisonConfigurations()) {
    const bits = model.preparation(c).find(text => text.includes("SCB_SCR.SLEEPONEXIT ="));
    assert.ok(bits.includes(`SCB_SCR.SLEEPONEXIT = ${Number(c.sleepOnExit)}`), c.mode);
  }
});

test("both Stop-on-exit variants retain the Stop hardware path and return to deep sleep", () => {
  for (const lowPowerRegulator of [false, true]) {
    const c = config({ mode: "stop", sleepOnExit: true, lowPowerRegulator, profile: "pll" });
    assert.equal(model.isStop(c), true);
    assert.deepEqual(model.clocks(c), model.clocks({ ...c, sleepOnExit: false }));
    assert.deepEqual(model.powerEstimate(c), model.powerEstimate({ ...c, sleepOnExit: false }));
    const wake = model.wake(c);
    assert.equal(wake.handler, "EXTI0_IRQHandler");
    assert.match(wake.reason, /final handler return sleeps again/);
    assert.equal(model.clocks(c, "handler").find(row => row[0] === "PLL · clock multiplier")[1], "Off");
    assert.equal(model.wake({ ...c, source: "systick" }).wakes, false);
    assert.equal(model.wake({ ...c, source: "rtcIRQ", rtcClock: "hse" }).wakes, false);
    assert.ok(model.recovery(c).some(text => text.includes("Restore HSE / PLL inside the ISR")));
    assert.match(model.configurationError({ ...c, instruction: "WFE" }), /select WFI/);
    const preparation = model.preparation(c).join(" ");
    assert.match(preparation, /SLEEPDEEP = 1/);
    assert.match(preparation, /PDDS = 0/);
    assert.match(preparation, /SLEEPONEXIT = 1/);
    assert.ok(preparation.includes(`LPDS = ${Number(lowPowerRegulator)}`));
  }
});

test("RTC alarm preparation enables backup access in every low-power mode", () => {
  for (const mode of Object.keys(model.modes)) {
    for (const source of ["rtcIRQ", "rtcEvent"]) {
      const steps = model.preparation(config({ mode, source })).join(" ");
      const access = steps.indexOf("Enable backup writes (PWR_CR.DBP)");
      assert.ok(access >= 0, `${mode} / ${source}: backup writes`);
      for (const clock of ["RCC_APB1ENR.PWREN", "RCC_APB1ENR.BKPEN"]) {
        const enable = steps.indexOf(clock);
        assert.ok(enable >= 0 && enable < access, `${mode} / ${source}: ${clock} before DBP`);
      }
    }
  }
});

test("power reference uses typical datasheet currents and the selected Run baseline", () => {
  assert.equal(model.powerEstimate(config({})).percent, 15);
  const pllSleep = model.powerEstimate(config({ profile: "pll" }));
  assert.equal(pllSleep.runMa, 27);
  assert.equal(pllSleep.currentMa, 5.5);
  assert.ok(Math.abs(pllSleep.percent - 20.37037037) < 1e-7);
  for (const [mode, lowPowerRegulator, currentMa] of [["stop", false, 0.024], ["stop", true, 0.014], ["standby", false, 0.002]]) {
    const hsi = model.powerEstimate(config({ mode, lowPowerRegulator }));
    const pll = model.powerEstimate(config({ mode, lowPowerRegulator, profile: "pll" }));
    assert.equal(hsi.currentMa, currentMa);
    assert.equal(pll.currentMa, currentMa);
    assert.equal(hsi.powerMw, currentMa * 3.3);
    assert.ok(pll.percent < hsi.percent);
  }
});

test("WFI interrupt entry, PRIMASK deferral, and event-only rejection", () => {
  assert.equal(model.wake(config({})).handler, "EXTI0_IRQHandler");
  const masked = model.wake(config({ primask: true }));
  assert.equal(masked.wakes, true);
  assert.equal(masked.handler, null);
  assert.equal(masked.deferred, true);
  assert.equal(model.wake(config({ nvic: false })).wakes, false);
  assert.equal(model.wake(config({ source: "extiEvent" })).wakes, false);
});

test("WFE separates event wake, IRQ service, and new-pending event wake", () => {
  assert.equal(model.wake(config({ instruction: "WFE", source: "extiEvent" })).handler, null);
  assert.equal(model.wake(config({ instruction: "WFE", source: "extiBoth" })).handler, "EXTI0_IRQHandler");
  assert.equal(model.wake(config({ instruction: "WFE", primask: true })).wakes, false);
  const pending = model.wake(config({ instruction: "WFE", source: "pending", nvic: false, sevonpend: true }));
  assert.equal(pending.wakes, true);
  assert.equal(pending.handler, null);
  assert.equal(model.wake(config({ instruction: "WFE", source: "pending", nvic: false })).wakes, false);
  assert.equal(model.wake(config({ instruction: "WFE", source: "pending", nvic: false, sevonpend: true, pendingEntry: true })).wakes, false);
});

test("Stop needs a live EXTI path; RTC HSE clock and clocked timers cannot wake it", () => {
  for (const lowPowerRegulator of [false, true]) {
    const c = config({ mode: "stop", lowPowerRegulator });
    assert.equal(model.wake({ ...c, source: "systick" }).wakes, false);
    assert.equal(model.wake({ ...c, source: "pending", instruction: "WFE", sevonpend: true }).wakes, false);
    assert.equal(model.wake({ ...c, source: "extiIRQ" }).handler, "EXTI0_IRQHandler");
    for (const rtcClock of ["lse", "lsi"]) assert.equal(model.wake({ ...c, source: "rtcEvent", rtcClock, instruction: "WFE" }).wakes, true);
    for (const rtcClock of ["off", "hse"]) assert.equal(model.wake({ ...c, source: "rtcIRQ", rtcClock }).wakes, false);
  }
});

test("Standby wake always resets, independently of IRQ delivery and wait instruction", () => {
  for (const instruction of ["WFI", "WFE"]) {
    for (const source of ["wkup", "rtcIRQ", "rtcEvent", "nrst", "iwdg"]) {
      const wake = model.wake(config({ mode: "standby", source, instruction, nvic: false, primask: true }));
      assert.equal(wake.wakes, true, source);
      assert.equal(wake.reset, true, source);
      assert.equal(wake.handler, null, source);
    }
    for (const source of ["extiIRQ", "extiEvent", "extiBoth", "systick", "pending"]) {
      assert.equal(model.wake(config({ mode: "standby", source, instruction })).wakes, false, source);
    }
  }
});

test("stale WFE latch and pending deep-sleep requests prevent mode entry", () => {
  assert.equal(model.entry(config({ instruction: "WFE", eventLatch: true })).sleeps, false);
  assert.equal(model.entry(config({ instruction: "WFI", eventLatch: true })).sleeps, true);
  assert.equal(model.entry(config({ instruction: "WFE", pendingEntry: true })).sleeps, false);
  assert.equal(model.entry(config({ instruction: "WFE", source: "pending", nvic: false, sevonpend: true, pendingEntry: true })).sleeps, true);
  for (const c of model.comparisonConfigurations().filter(c => !model.isSleep(c))) assert.equal(model.entry({ ...c, pendingEntry: true }).sleeps, false);
});

test("three base modes validate all option and instruction combinations", () => {
  assert.deepEqual(Object.keys(model.modes), ["sleep", "stop", "standby"]);
  for (const mode of Object.keys(model.modes)) {
    for (const sleepOnExit of [false, true]) {
      for (const lowPowerRegulator of [false, true]) {
        for (const instruction of ["WFI", "WFE"]) {
          const c = config({ mode, sleepOnExit, lowPowerRegulator, instruction });
          const invalid = lowPowerRegulator && mode !== "stop" || sleepOnExit && (mode === "standby" || instruction === "WFE");
          assert.equal(Boolean(model.configurationError(c)), invalid, JSON.stringify(c));
          assert.equal(model.entry(c).sleeps, !invalid, JSON.stringify(c));
        }
      }
    }
  }
  assert.match(model.configurationError(config({ lowPowerRegulator: true })), /LPDS is ignored/);
  assert.match(model.configurationError(config({ mode: "standby", sleepOnExit: true })), /wake-up follows reset/);
  const rows = model.comparisonConfigurations();
  assert.equal(rows.length, 7);
  for (const c of rows) assert.equal(model.configurationError(c), null);
  assert.equal(model.settings(config({ mode: "stop", lowPowerRegulator: true })).latency, 5.4);
  assert.equal(model.settings(config({ mode: "stop" })).latency, 3.6);
});

test("clock inventory distinguishes Sleep, Stop wake on HSI, restoration, and Standby loss", () => {
  const get = (c, phase, row) => model.clocks(config(c), phase).find(r => r[0] === row)[1];
  assert.equal(get({ profile: "pll" }, "sleeping", "PLL · clock multiplier"), "On · 72 MHz");
  assert.equal(get({ mode: "stop", profile: "pll" }, "sleeping", "HSI · internal 8 MHz"), "Off");
  assert.equal(get({ mode: "stop", profile: "pll" }, "handler", "PLL · clock multiplier"), "Off");
  assert.equal(get({ mode: "stop", profile: "pll" }, "handler", "AHB / APB buses"), "HCLK 8 / PCLK1 4 / PCLK2 8 MHz");
  assert.equal(get({ mode: "stop", profile: "pll" }, "running", "PLL · clock multiplier"), "On · 72 MHz");
  assert.equal(get({ mode: "standby" }, "sleeping", "SRAM / main registers"), "Lost");
  assert.equal(get({ mode: "standby" }, "reset", "HSI · internal 8 MHz"), "On");
});
