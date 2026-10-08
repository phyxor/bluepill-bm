// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
//
// SPDX-License-Identifier: BSD-3-Clause

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculate, toC, planRtc, planIwdg, presets } = require("../docs/assets/clock-model.js");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const hz = (result, name) => result.clocks[name].hz;
const field = (result, name) => result.fields.find((entry) => entry.name === name).binary;

test("RTC planning uses source frequency and the full 20-bit prescaler range", () => {
  for (const [inputHz, reload] of [[32768, 32767], [40000, 39999], [8000000 / 128, 62499]]) {
    const plan = planRtc(inputHz, 1000);
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.reload, reload);
    assert.equal(plan.exact, true);
    assert.equal(plan.hz, 1);
    assert.equal(planRtc(inputHz, 1000 / inputHz).reload, 0);
    assert.equal(planRtc(inputHz, 0x100000 / inputHz * 1000).reload, 0xfffff);
    const result = calculate({ ...presets.hse72, lseOn: true, lsiOn: true,
      rtcOn: true, rtcSource: inputHz === 32768 ? "lse" : inputHz === 40000 ? "lsi" : "hse", rtcReload: plan.reload });
    assert.deepEqual(result.errors, []);
    assert.equal(hz(result, "RTC counter"), plan.hz);
  }
});

test("RTC planning reports quantization, unavailable clocks, and invalid targets", () => {
  const plan = planRtc(32768, 1);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.reload, 32);
  assert.equal(plan.exact, false);
  assert.equal(plan.periodSeconds, 33 / 32768);
  assert.ok(plan.errorPpm > 0);
  for (const inputHz of [null, undefined, 0, NaN]) assert.ok(planRtc(inputHz, 1000).errors.length);
  for (const target of [0, -1, NaN, Infinity, 0.001, 32001]) assert.ok(planRtc(32768, target).errors.length);
});

test("IWDG planning selects the finest exact prescaler and full 12-bit reload range", () => {
  for (const [periodMs, divider, pr, reload] of [
    [0.1, 4, 0, 0], [409.6, 4, 0, 4095], [1000, 16, 2, 2499], [26214.4, 256, 6, 4095],
  ]) {
    const plan = planIwdg(40000, periodMs);
    assert.deepEqual(plan.errors, []);
    assert.equal(plan.exact, true);
    assert.equal(plan.divider, divider);
    assert.equal(plan.pr, pr);
    assert.equal(plan.reload, reload);
    assert.equal(plan.counterHz, 40000 / divider);
    assert.equal(plan.periodSeconds, divider * (reload + 1) / 40000);
  }
  assert.equal(planIwdg(32000, 1000).reload, 3999);
  assert.equal(planIwdg(32000, 1000).divider, 8);
});

test("IWDG planning reports quantization and invalid targets", () => {
  const plan = planIwdg(40000, 0.15);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.exact, false);
  assert.equal(plan.divider, 4);
  assert.equal(plan.reload, 1);
  assert.equal(plan.periodSeconds, 0.0002);
  assert.ok(plan.errorPpm > 0);
  for (const target of [0, -1, NaN, Infinity, 0.09, 26215]) assert.ok(planIwdg(40000, target).errors.length);
  for (const inputHz of [null, undefined, 0, NaN]) assert.ok(planIwdg(inputHz, 1000).errors.length);
});

test("all clock profiles use valid bus, ADC, Flash, and USB configurations", () => {
  for (const [name, sysclk, pclk1, adc, latency, usb] of [
    ["reset", 8, 8, 4, 0, false], ["hse72", 72, 36, 12, 2, true],
    ["hse48", 48, 24, 12, 1, true], ["hse36", 36, 36, 9, 1, false],
    ["hse24", 24, 24, 12, 0, false], ["hse16", 16, 16, 8, 0, false],
    ["hsi64", 64, 32, 64 / 6, 2, false],
  ]) {
    const r = calculate({ ...presets[name], adcOn: true });
    assert.deepEqual(r.errors, [], name);
    assert.equal(hz(r, "SYSCLK"), sysclk * 1000000, name);
    assert.equal(hz(r, "PCLK1"), pclk1 * 1000000, name);
    assert.ok(Math.abs(hz(r, "ADCCLK") - adc * 1000000) < 0.001, name);
    assert.equal(presets[name].latency, latency, name);
    assert.equal(presets[name].usbOn, usb, name);
    if (usb) assert.equal(hz(r, "USBCLK"), 48000000, name);
  }
});

test("reset clocks distinguish disabled sources from gated peripherals", () => {
  const r = calculate(presets.reset);
  assert.deepEqual(r.errors, []);
  assert.equal(hz(r, "SYSCLK"), 8000000);
  assert.equal(hz(r, "SysTick input"), 1000000);
  assert.equal(hz(r, "ADCCLK"), 4000000);
  assert.equal(r.clocks.ADCCLK.status, "Gated");
  assert.equal(r.clocks.HSE.status, "Disabled");
  assert.equal(hz(r, "PLLCLK"), null);
  assert.equal(hz(r, "USBCLK"), null);
  assert.equal(hz(r, "SysTick interrupt"), null);
  assert.equal(r.clocks["SysTick interrupt"].periodSeconds, null);
  assert.equal(r.clocks["RTC counter"].periodSeconds, null);
  assert.equal(r.clocks["IWDG counter"].periodSeconds, null);
});

test("72 MHz preset has valid buses, timer doubling, Flash, and USB", () => {
  const r = calculate(presets.hse72);
  assert.deepEqual(r.errors, []);
  for (const name of ["PLLCLK", "SYSCLK", "HCLK", "TIM1CLK", "TIM2CLK", "TIM3CLK", "TIM4CLK"]) assert.equal(hz(r, name), 72000000);
  assert.equal(hz(r, "PCLK1"), 36000000);
  assert.equal(hz(r, "ADCCLK"), 12000000);
  assert.equal(hz(r, "USBCLK"), 48000000);
  assert.equal(field(r, "RCC_CFGR.PPRE1"), "100");
  assert.equal(field(r, "RCC_CFGR.PLLMUL (CMSIS: PLLMULL)"), "0111");
  assert.equal(field(r, "FLASH_ACR.LATENCY"), "010");
});

test("HSI can provide 64 MHz but cannot provide an accurate USB clock", () => {
  const r = calculate({ ...presets.hse72, pllSource: "hsi", multiplier: 16, usbOn: false });
  assert.deepEqual(r.errors, []);
  assert.equal(hz(r, "SYSCLK"), 64000000);
  const usb = calculate({ ...presets.hse72, pllSource: "hsi", multiplier: 12, usbDivider: 1 });
  assert.equal(hz(usb, "USBCLK"), 48000000);
  assert.ok(usb.errors.some((message) => message.includes("accuracy")));
});

test("USB can use a 48 MHz PLL while SYSCLK uses HSE", () => {
  const r = calculate({ ...presets.hse72, usbDivider: 1,
    systemSource: "hse", hse: 12000000, multiplier: 4, apb1Divider: 1 });
  assert.deepEqual(r.errors, []);
  assert.equal(hz(r, "SYSCLK"), 12000000);
  assert.equal(hz(r, "USBCLK"), 48000000);
  assert.equal(field(r, "RCC_CFGR.USBPRE"), "1");
});

test("USB detects wrong divider, disabled PLL, and slow APB1", () => {
  assert.ok(calculate({ ...presets.hse72, usbDivider: 1 }).errors.some((m) => m.includes("exactly 48")));
  assert.ok(calculate({ ...presets.hse72, pllOn: false }).errors.some((m) => m.includes("exactly 48")));
  assert.ok(calculate({ ...presets.hse72, systemSource: "hsi", apb1Divider: 1 }).errors.some((m) => m.includes("greater than 8")));
});

test("disabled selected sources propagate unavailable clocks", () => {
  const r = calculate({ ...presets.hse72, hseOn: false });
  assert.equal(hz(r, "SYSCLK"), null);
  assert.equal(hz(r, "PCLK1"), null);
  assert.ok(r.errors.some((m) => m.includes("oscillator is disabled")));
});

test("bus, ADC, MCO, and PLL limits detect invalid configurations", () => {
  const r = calculate({ ...presets.hse72, apb1Divider: 1, adcDivider: 2, adcOn: true, mcoSource: "sysclk" });
  for (const name of ["PCLK1", "ADC", "MCO"]) assert.ok(r.errors.some((m) => m.includes(name)));
  assert.ok(calculate({ ...presets.hse72, multiplier: 16 }).errors.some((m) => m.includes("PLLCLK must")));
  assert.ok(calculate({ pllOn: true }).errors.some((m) => m.includes("PLLCLK must")));
});

test("Flash thresholds use SYSCLK and enforce prefetch with AHB division", () => {
  for (const [hse, multiplier, latency] of [[8000000, 3, 0], [8000001, 3, 1], [8000000, 6, 1], [8000001, 6, 2]]) {
    const configuration = { ...presets.hse72, hse, multiplier, latency, usbOn: false };
    const valid = calculate(configuration);
    assert.deepEqual(valid.errors, []);
    if (latency) assert.ok(calculate({ ...configuration, latency: latency - 1 }).errors.some((m) => m.includes("wait states")));
  }
  const divided = calculate({ ...presets.hse72, ahbDivider: 2, latency: 1, prefetch: false, usbOn: false });
  assert.ok(divided.errors.some((m) => m.includes("at least 2 wait states")));
  assert.ok(divided.errors.some((m) => m.includes("prefetch")));
});

test("RTC, SysTick, IWDG, and MCO derived clocks", () => {
  const r = calculate({ ...presets.hse72, lseOn: true, rtcOn: true, rtcSource: "lse",
    systickOn: true, systickDivider: 1, systickReload: 71999,
    iwdgOn: true, iwdgDivider: 256, mcoSource: "pll" });
  assert.deepEqual(r.errors, []);
  assert.equal(hz(r, "RTC counter"), 1);
  assert.equal(hz(r, "SysTick interrupt"), 1000);
  assert.equal(hz(r, "IWDG counter"), 156.25);
  assert.equal(r.clocks["SysTick interrupt"].periodSeconds, 0.001);
  assert.equal(r.clocks["RTC counter"].periodSeconds, 1);
  assert.equal(r.clocks["IWDG counter"].periodSeconds, 0.0064);
  assert.equal(hz(r, "MCO"), 36000000);
  assert.equal(field(r, "IWDG_PR.PR"), "110");
  assert.equal(field(r, "RCC_CFGR.MCO"), "111");
  assert.equal(hz(calculate({ hseOn: true, rtcOn: true, rtcSource: "hse" }), "RTCCLK"), 62500);
});

test("AHB encodings include the jump from /16 to /64", () => {
  for (const [divider, encoding] of [[1, "0000"], [16, "1011"], [64, "1100"], [512, "1111"]]) {
    const r = calculate({ ahbDivider: divider, prefetch: true });
    assert.deepEqual(r.errors, []);
    assert.equal(hz(r, "HCLK"), 8000000 / divider);
    assert.equal(field(r, "RCC_CFGR.HPRE"), encoding);
  }
});

test("incomplete and out-of-range numeric input returns errors, not NaN clocks", () => {
  for (const input of [{ hse: NaN }, { rtcReload: -1 }, { systickReload: 0x1000000 }, { multiplier: 17 }, { ahbDivider: 32 }]) {
    const r = calculate(input);
    assert.ok(r.errors.length);
    assert.deepEqual(r.clocks, {});
  }
});

test("hardware checks follow selected sources and distinguish ready flags from readback", () => {
  const r = calculate({ ...presets.hse72, lseOn: true, rtcOn: true, rtcSource: "lse" });
  const check = (name) => r.fields.find((entry) => entry.name === name).check;
  assert.match(check("RCC_CR.HSEON"), /HSERDY = 1/);
  assert.match(check("RCC_CR.PLLON"), /PLLRDY = 1/);
  assert.match(check("RCC_CFGR.SW"), /SWS = 10/);
  assert.match(check("RCC_CFGR.PLLSRC"), /PLLRDY = 0/);
  assert.match(check("RCC_BDCR.LSEON"), /LSERDY = 1/);
  assert.match(check("RCC_BDCR.RTCEN"), /RSF = 1/);
  assert.match(check("RTC_PRLH.PRL[19:16]"), /RTOFF = 1/);
  assert.match(check("IWDG_PR.PR"), /PVU = 0/);
  assert.match(check("FLASH_ACR.PRFTBE"), /PRFTBS = 1/);
  assert.match(check("FLASH_ACR.LATENCY"), /Read back FLASH_ACR.LATENCY = 010/);
  const reset = calculate(presets.reset);
  assert.match(reset.fields.find((entry) => entry.name === "RCC_CFGR.SW").check, /SWS = 00/);
  assert.match(reset.fields.find((entry) => entry.name === "RCC_CR.PLLON").check, /PLLRDY = 0/);
  assert.match(reset.fields.find((entry) => entry.name === "RCC_BDCR.RTCEN").check, /do not wait/);
  assert.ok(r.fields.every((entry) => typeof entry.check === "string" && entry.check.length > 0));
});

test("exported structs and usage compile against the public C API for every profile", () => {
  for (const [name, preset] of Object.entries(presets)) {
    const exported = toC(preset);
    assert.deepEqual(exported.errors, [], name);
    const compiled = spawnSync("arm-none-eabi-gcc", ["-mcpu=cortex-m3", "-mthumb",
      "-std=c11", "-Wall", "-Wextra", "-Werror", "-fsyntax-only", "-x", "c",
      "-I", path.join(__dirname, "../include"), "-"], { input: exported.code, encoding: "utf8" });
    assert.equal(compiled.status, 0, `${name}: ${compiled.error || compiled.stderr}`);
  }
});

test("C export omits gated peripherals and includes independent RTC and IWDG configs", () => {
  const r = toC({ ...presets.hse72, lseOn: true, rtcOn: true, rtcSource: "lse", iwdgOn: true });
  assert.deepEqual(r.errors, []);
  assert.match(r.code, /\.source = CLOCK_RTC_LSE/);
  assert.match(r.code, /clock_stm32f103_configure_iwdg\(&iwdg_clock_config\)/);
  assert.doesNotMatch(r.code, /ADC1EN|USBEN|TIM1EN|SysTick_CTRL|RCC_CFGR\.MCO/);
  assert.equal(toC(presets.hse72).code, toC({ ...presets.hse72, tim1On: true, adcOn: true }).code);
});

test("C export rejects invalid configurations and unsafe gated ADC dividers", () => {
  assert.ok(toC({ ...presets.hse72, latency: 0 }).errors.length);
  assert.ok(toC({ ...presets.hse72, adcDivider: 2 }).errors.some((m) => m.includes("even when")));
  assert.equal(toC({ ...presets.hse72, adcDivider: 2 }).code, "");
});
