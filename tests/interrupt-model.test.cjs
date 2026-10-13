// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../docs/assets/js/interrupt-model.js");
const event = id => {
  const found = model.events.find(e => e.id === id);
  assert.ok(found, id);
  return found;
};
const rx = event("USART1:RXNE");

test("every peripheral route matches the actual CMSIS enum and project vector order", () => {
  const root = path.join(__dirname, "..");
  const header = fs.readFileSync(path.join(root, "vendor/STM32CubeF1/Drivers/CMSIS/Device/ST/STM32F1xx/Include/stm32f103xb.h"), "utf8");
  const startup = fs.readFileSync(path.join(root, "system/startup_stm32f103.c"), "utf8");
  const irqs = new Map([...header.matchAll(/(\w+_IRQn)\s*=\s*(-?\d+)/g)].map(m => [m[1], Number(m[2])]));
  const handlers = [...startup.matchAll(/DEFAULT_HANDLER\((\w+_IRQHandler)\);/g)].map(m => m[1]);
  assert.equal(handlers.length, 43);
  const external = model.routes.filter(r => r.irq >= 0);
  assert.equal(external.length, 43);
  for (const route of model.routes) {
    assert.equal(irqs.get(route.name), route.irq, route.name);
    assert.equal(route.vector, route.irq + 16);
    if (route.irq >= 0) assert.equal(route.handler, handlers[route.irq]);
    else assert.ok(startup.includes(`DEFAULT_HANDLER(${route.handler});`));
    assert.ok(model.events.some(e => e.route?.irq === route.irq), route.name);
  }
});

test("catalog entries have unique identifiers, response steps, and local manual sources", () => {
  assert.equal(new Set(model.events.map(e => e.id)).size, model.events.length);
  for (const e of model.events) {
    assert.ok(e.condition && e.flags.length && e.enables.length && e.service.length, e.id);
    if (e.reference.file) {
      assert.ok(fs.existsSync(path.join(__dirname, "../docs/refs", e.reference.file)), e.id);
      assert.ok(Number.isInteger(e.reference.page) && e.reference.page > 0, e.id);
    } else assert.ok(e.reference.url.startsWith("https://www.st.com/"), e.id);
  }
});

test("register fields in the event catalog exist in the device or core headers", () => {
  const device = fs.readFileSync(path.join(__dirname, "../vendor/STM32CubeF1/Drivers/CMSIS/Device/ST/STM32F1xx/Include/stm32f103xb.h"), "utf8");
  const core = fs.readFileSync(path.join(__dirname, "../vendor/STM32CubeF1/Drivers/CMSIS/Core/Include/core_cm3.h"), "utf8");
  const macros = new Set([...`${device}\n${core}`.matchAll(/^#define\s+(\w+)/gm)].map(m => m[1]));
  for (const e of model.events) {
    for (const text of [...e.flags, ...e.enables]) {
      for (const match of text.matchAll(/(\w+)->(\w+)\.(\w+)/g)) {
        let [, peripheral, register, field] = match;
        peripheral = peripheral.replace(/\d+$/, "");
        if (peripheral.startsWith("DMA1_Channel")) peripheral = "DMA";
        if (peripheral === "SysTick") field += "_Msk";
        if (peripheral === "SCB") field += "_Msk";
        const macro = `${peripheral}_${register}_${field}`;
        assert.ok(macros.has(macro), `${e.id}: ${macro}`);
      }
    }
  }
});

test("a disabled peripheral records the event, and enabling a level source requests service", () => {
  let state = { ...model.defaults(), sourceEnabled: false };
  state = model.transition(rx, state, "trigger");
  assert.equal(state.flag, true);
  assert.equal(state.pending, false);
  state = model.transition(rx, state, "configure", { sourceEnabled: true });
  assert.equal(state.pending, true);
  assert.equal(model.blocked(rx, state), null);
});

test("NVIC disable and processor masks preserve pending and enforce priority", () => {
  const pending = model.transition(rx, model.defaults(), "trigger");
  for (const fields of [{ nvicEnabled: false }, { primask: true }, { faultmask: true },
    { basepri: 8 }, { currentPriority: 8 }, { currentPriority: 0 }]) {
    const state = model.transition(rx, pending, "configure", fields);
    assert.ok(model.blocked(rx, state));
    assert.equal(model.transition(rx, state, "enter").active, false);
    assert.equal(state.pending, true);
  }
  for (const fields of [{ basepri: 9 }, { currentPriority: 9 }, { priority: 0, basepri: 1 }]) {
    const state = model.transition(rx, pending, "configure", fields);
    assert.equal(model.blocked(rx, state), null);
  }
});

test("a latched request can run after its source is disabled", () => {
  let state = model.transition(rx, model.defaults(), "trigger");
  state = model.transition(rx, state, "configure", { sourceEnabled: false });
  assert.equal(state.pending, true);
  assert.equal(model.transition(rx, state, "enter").active, true);
});

test("service clears the source while exception return clears active", () => {
  let state = model.transition(rx, model.defaults(), "trigger");
  state = model.transition(rx, state, "enter");
  assert.equal(state.pending, false);
  assert.equal(state.flag, true);
  state = model.transition(rx, state, "configure", { nvicEnabled: false, primask: true });
  assert.equal(state.active, true);
  state = model.transition(rx, state, "service");
  assert.equal(state.flag, false);
  assert.equal(state.active, true);
  state = model.transition(rx, state, "return");
  assert.equal(state.active, false);
  assert.equal(state.pending, false);
  assert.equal(state.returned, true);
});

test("an unserviced level source reasserts after pending clear or ISR return", () => {
  let state = model.transition(rx, model.defaults(), "trigger");
  state = model.transition(rx, state, "clearPending");
  assert.equal(state.flag, true);
  assert.equal(state.pending, true);
  state = model.transition(rx, state, "enter");
  state = model.transition(rx, state, "return");
  assert.equal(state.pending, true);
  assert.equal(state.flag, true);
});

test("another event can make an IRQ both active and pending", () => {
  let state = model.transition(rx, model.defaults(), "trigger");
  state = model.transition(rx, state, "enter");
  state = model.transition(rx, state, "trigger");
  assert.equal(state.active, true);
  assert.equal(state.pending, true);
});

test("SysTick COUNTFLAG does not reassert pending and has no NVIC enable bit", () => {
  const tick = event("SysTick:wrap");
  let state = model.transition(tick, { ...model.defaults(), nvicEnabled: false }, "trigger");
  assert.equal(model.blocked(tick, state), null);
  state = model.transition(tick, state, "enter");
  state = model.transition(tick, state, "return");
  assert.equal(state.flag, true);
  assert.equal(state.pending, false);
  state = model.transition(tick, state, "configure", { sourceEnabled: true });
  assert.equal(state.pending, false);
});

test("clock-security NMI bypasses all configurable masks and priorities", () => {
  const css = event("RCC:CSSF");
  const state = model.transition(css, { ...model.defaults(), nvicEnabled: false,
    primask: true, faultmask: true, basepri: 1, priority: 15, currentPriority: 0 }, "trigger");
  assert.equal(model.blocked(css, state), null);
  assert.equal(model.transition(css, state, "enter").active, true);
  assert.equal(css.route.handler, "NMI_Handler");
});

test("IWDG timeout has no IRQ, and a reset event cannot enter an ISR", () => {
  const timeout = event("IWDG:reset");
  assert.equal(timeout.route, null);
  assert.match(model.blocked(timeout, model.defaults()), /reset/);
  assert.deepEqual(model.transition(timeout, model.defaults(), "trigger"), model.defaults());
});

test("search finds shared vectors, flags, and ISR names across peripherals", () => {
  assert.ok(model.search("", "USART1_IRQHandler").some(e => e.id === rx.id));
  assert.deepEqual(model.search("USART1", "RXNE received").map(e => e.id), [rx.id]);
  assert.ok(model.search("", "USB_HP_CAN_TX_IRQHandler").some(e => e.peripheral === "USB"));
  assert.ok(model.search("", "USB_HP_CAN_TX_IRQHandler").some(e => e.peripheral === "CAN1"));
  assert.equal(model.search("USART1", "SPI").length, 0);
});
