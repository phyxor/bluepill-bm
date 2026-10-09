// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
//
// SPDX-License-Identifier: BSD-3-Clause

const { test } = require("node:test");
const assert = require("node:assert/strict");
const model = require("../docs/assets/js/pinout-model.js");

test("USART2 clock conflicts with ADC channel 4 and releases PA4 when disabled", () => {
  const state = model.defaults();
  state.USART2.enabled = true;
  state["ADC channel 4"].enabled = true;
  assert.deepEqual(model.assignments(state).errors, []);
  state.USART2.signals.CK = true;
  assert.deepEqual(model.assignments(state).errors.map(e => e.pin), ["PA4"]);
  state.USART2.signals.CK = false;
  assert.deepEqual(model.assignments(state).errors, []);
  assert.equal(model.assignments(state).pins.PA4[0].label, "ADC12_IN4");
});

test("SPI1 remapping moves all signals and detects reset-time JTAG ownership", () => {
  const state = model.defaults();
  state.SPI1.enabled = true;
  state.SPI1.mapping = "Remapped";
  state.SPI1.signals.NSS = true;
  const result = model.assignments(state);
  assert.deepEqual(new Set(result.errors.map(e => e.pin)), new Set(["PA15", "PB3", "PB4"]));
  assert.equal(result.pins.PA5, undefined);
  state.Debug.mapping = "SWD only";
  assert.deepEqual(model.assignments(state).errors, []);
  assert.equal(model.assignments(state).pins.PA13[0].signal, "SWDIO");
});

test("USART1 remap collides with I2C1 and I2C1 remap clears it", () => {
  const state = model.defaults();
  state.USART1.enabled = true;
  state.USART1.mapping = "Remapped";
  state.I2C1.enabled = true;
  assert.deepEqual(new Set(model.assignments(state).errors.map(e => e.pin)), new Set(["PB6", "PB7"]));
  state.I2C1.mapping = "Remapped";
  assert.deepEqual(model.assignments(state).errors, []);
});

test("USB and remapped CAN still conflict through shared packet memory", () => {
  const state = model.defaults();
  state.USB.enabled = true;
  state.CAN.enabled = true;
  state.CAN.mapping = "Remapped";
  const errors = model.assignments(state).errors;
  assert.equal(errors.length, 1);
  assert.equal(errors[0].pin, null);
  assert.match(errors[0].message, /packet memory/);
});

test("capabilities distinguish FT digital inputs, timer remaps, and limited-drive pins", () => {
  assert.equal(model.capabilities("PA4").ft, false);
  assert.equal(model.capabilities("PA9").ft, true);
  assert.equal(model.capabilities("PB5").ft, false);
  assert.equal(model.capabilities("PB6").ft, true);
  assert.equal(model.capabilities("PA15").pwm, true);
  assert.equal(model.capabilities("PA4").pwm, false);
  for (const pin of ["PC13", "PC14", "PC15"]) assert.equal(model.capabilities(pin).warning, true);
  assert.equal(model.capabilities("5V").gpio, false);
  assert.equal(model.packagePins.PC5, undefined);
});

test("default selections are independent and every mapped signal is bonded", () => {
  const state = model.defaults();
  assert.equal(state.LSE.enabled, false);
  assert.equal(model.assignments(state).pins.PC14, undefined);
  assert.equal(model.assignments(state).pins.PC15, undefined);
  assert.ok(!model.configurationSummary(state).clocks.some(c => c.bit === "LSEON"));
  assert.deepEqual(model.assignments(state).errors, []);
  state.Debug.enabled = false;
  assert.equal(model.defaults().Debug.enabled, true);
  for (const p of model.peripherals) {
    for (const mapping of ["Default", ...Object.keys(p.maps)]) {
      const selection = model.defaults();
      selection[p.id].enabled = true;
      selection[p.id].mapping = mapping;
      for (const [signal] of p.signals) selection[p.id].signals[signal] = true;
      for (const pin of Object.keys(model.assignments(selection).pins)) assert.ok(model.packagePins[pin], `${p.id} / ${mapping}: ${pin}`);
    }
  }
});

const clocks = plan => plan.clocks.map(c => `${c.register}.${c.bit}`);
const row = (plan, signal) => plan.rows.find(r => r.signal === signal);

test("pin function details distinguish default, remapped, and optional signals", () => {
  const pa4 = model.pinFunctions("PA4");
  assert.deepEqual(pa4.map(f => f.peripheral), ["USART2", "ADC channel 4", "SPI1"]);
  assert.deepEqual(pa4.find(f => f.signal === "CK").mappings, ["Default"]);
  assert.match(pa4.find(f => f.signal === "CK").optional, /synchronous/);
  assert.equal(pa4.find(f => f.signal === "ADC12_IN4").optional, null);
  const pb3 = model.pinFunctions("PB3");
  assert.deepEqual(pb3.find(f => f.label === "SPI1_SCK").mappings, ["Remapped"]);
  assert.deepEqual(pb3.find(f => f.label === "TIM2_CH2").mappings, ["Partial remap 1", "Full remap"]);
  assert.deepEqual(model.functions("PB3"), ["SPI1_SCK (remap)", "TIM2_CH2 (remap)", "Debug_JTDO", "Trace_SWO"]);
  assert.deepEqual(model.pinFunctions("GND"), []);
});

test("USART summary enables the peripheral and remapped GPIO port with correct CRH fields", () => {
  const state = model.defaults();
  state.USART1.enabled = true;
  let plan = model.configurationSummary(state);
  assert.ok(clocks(plan).includes("RCC_APB2ENR.USART1EN"));
  assert.ok(clocks(plan).includes("RCC_APB2ENR.IOPAEN"));
  assert.ok(!clocks(plan).includes("RCC_APB2ENR.AFIOEN"));
  assert.deepEqual([row(plan, "USART1_TX").cnf, row(plan, "USART1_TX").mode], ["10", "10"]);
  assert.equal(row(plan, "USART1_TX").register, "GPIOA_CRH");
  assert.equal(row(plan, "USART1_TX").shift, 4);
  assert.deepEqual([row(plan, "USART1_RX").cnf, row(plan, "USART1_RX").mode], ["01", "00"]);
  state.USART1.mapping = "Remapped";
  plan = model.configurationSummary(state);
  assert.deepEqual(plan.ports.map(p => p.port), ["GPIOB"]);
  assert.ok(clocks(plan).includes("RCC_APB2ENR.IOPBEN"));
  assert.ok(clocks(plan).includes("RCC_APB2ENR.AFIOEN"));
  assert.equal(row(plan, "USART1_TX").register, "GPIOB_CRL");
  assert.equal(row(plan, "USART1_RX").shift, 28);
  assert.ok(plan.remaps.includes("AFIO_MAPR.USART1_REMAP = 1 (Remapped)"));
});

test("SPI role, NSS management, and output speed determine GPIO configuration", () => {
  const state = model.defaults();
  state.SPI2.enabled = true;
  state.SPI2.signals.NSS = true;
  state.settings.outputSpeed = "50";
  let plan = model.configurationSummary(state);
  assert.ok(clocks(plan).includes("RCC_APB1ENR.SPI2EN"));
  assert.deepEqual([row(plan, "SPI2_SCK").cnf, row(plan, "SPI2_SCK").mode], ["10", "11"]);
  assert.deepEqual([row(plan, "SPI2_MISO").cnf, row(plan, "SPI2_MISO").mode], ["01", "00"]);
  assert.equal(row(plan, "SPI2_NSS").mode, "11");
  state.SPI2.nss = "input";
  assert.equal(row(model.configurationSummary(state), "SPI2_NSS").mode, "00");
  state.SPI2.role = "slave";
  plan = model.configurationSummary(state);
  for (const signal of ["SPI2_SCK", "SPI2_MOSI", "SPI2_NSS"]) assert.equal(row(plan, signal).mode, "00");
  assert.deepEqual([row(plan, "SPI2_MISO").cnf, row(plan, "SPI2_MISO").mode], ["10", "11"]);
  state.SPI2.role = "slaveMulti";
  assert.equal(row(model.configurationSummary(state), "SPI2_MISO").cnf, "11");
});

test("ADC instances, I2C open drain, and conflicting requests remain distinct", () => {
  const state = model.defaults();
  state["ADC channel 4"].enabled = true;
  state.settings.adc = "ADC2";
  state.I2C1.enabled = true;
  let plan = model.configurationSummary(state);
  assert.ok(clocks(plan).includes("RCC_APB2ENR.ADC2EN"));
  assert.ok(!clocks(plan).includes("RCC_APB2ENR.ADC1EN"));
  assert.deepEqual([row(plan, "ADC12_IN4").cnf, row(plan, "ADC12_IN4").mode], ["00", "00"]);
  assert.deepEqual([row(plan, "I2C1_SCL").cnf, row(plan, "I2C1_SCL").mode], ["11", "10"]);
  state.settings.adc = "Both";
  state.USART2.enabled = true;
  state.USART2.signals.CK = true;
  plan = model.configurationSummary(state);
  assert.ok(clocks(plan).includes("RCC_APB2ENR.ADC1EN"));
  assert.ok(clocks(plan).includes("RCC_APB1ENR.USART2EN"));
  assert.equal(plan.rows.filter(r => r.pin === "PA4").length, 2);
  assert.equal(row(plan, "ADC12_IN4").conflict, true);
  assert.equal(row(plan, "USART2_CK").conflict, true);
});

test("timer internal counting needs no GPIO; capture and complementary outputs differ", () => {
  const state = model.defaults();
  state.TIM1.enabled = true;
  let plan = model.configurationSummary(state);
  assert.ok(clocks(plan).includes("RCC_APB2ENR.TIM1EN"));
  assert.deepEqual(plan.ports, []);
  state.TIM1.signals.CH1 = true;
  state.TIM1.signals.CH1N = true;
  state.TIM1.signals.BKIN = true;
  state.TIM1.role = "input";
  plan = model.configurationSummary(state);
  assert.equal(row(plan, "TIM1_CH1").mode, "00");
  assert.equal(row(plan, "TIM1_BKIN").mode, "00");
  assert.equal(row(plan, "TIM1_CH1N").mode, "10");
  state.TIM1.role = "output";
  assert.equal(row(model.configurationSummary(state), "TIM1_CH1").cnf, "10");
});

test("hardware-controlled pins need no GPIO clocks, and PC13 respects its output limit", () => {
  const state = model.defaults();
  state.LSE.enabled = true;
  state.USB.enabled = true;
  let plan = model.configurationSummary(state);
  assert.deepEqual(plan.ports, []);
  for (const r of plan.rows) assert.deepEqual([r.cnf, r.mode, r.register], [null, null, null]);
  assert.ok(clocks(plan).includes("RCC_APB1ENR.USBEN"));
  assert.ok(clocks(plan).includes("RCC_CR.PLLON"));
  assert.ok(clocks(plan).includes("RCC_APB1ENR.PWREN"));
  assert.ok(clocks(plan).includes("RCC_CR.HSEON"));
  assert.ok(clocks(plan).includes("RCC_BDCR.LSEON"));
  assert.ok(!clocks(plan).includes("RCC_APB2ENR.IOPCEN"));
  state.LED.enabled = true;
  state.settings.outputSpeed = "50";
  plan = model.configurationSummary(state);
  assert.deepEqual([row(plan, "LED_active-low LED").cnf, row(plan, "LED_active-low LED").mode], ["00", "10"]);
  assert.ok(clocks(plan).includes("RCC_APB2ENR.IOPCEN"));
  state.Debug.mapping = "SWD only";
  assert.ok(model.configurationSummary(state).remaps.some(r => r.includes("SWJ_CFG = 010")));
  state.Debug.enabled = false;
  assert.ok(model.configurationSummary(state).remaps.some(r => r.includes("SWJ_CFG = 100")));
});
