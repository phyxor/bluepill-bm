// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

(function (root) {
  "use strict";
  const peripherals = [];
  function add(id, group, signals, maps = {}, enabled = false) {
    peripherals.push({ id, group, signals: Object.entries(signals), maps, enabled });
  }
  add("USART1", "USART", { TX: "PA9", RX: "PA10", CK: "PA8", CTS: "PA11", RTS: "PA12" },
    { Remapped: { TX: "PB6", RX: "PB7" } });
  add("USART2", "USART", { TX: "PA2", RX: "PA3", CK: "PA4", CTS: "PA0", RTS: "PA1" });
  add("USART3", "USART", { TX: "PB10", RX: "PB11", CK: "PB12", CTS: "PB13", RTS: "PB14" });
  for (let channel = 0; channel < 10; channel++) {
    add(`ADC channel ${channel}`, "ADC", { [`ADC12_IN${channel}`]: channel < 8 ? `PA${channel}` : `PB${channel - 8}` });
  }
  add("SPI1", "SPI", { NSS: "PA4", SCK: "PA5", MISO: "PA6", MOSI: "PA7" },
    { Remapped: { NSS: "PA15", SCK: "PB3", MISO: "PB4", MOSI: "PB5" } });
  add("SPI2", "SPI", { NSS: "PB12", SCK: "PB13", MISO: "PB14", MOSI: "PB15" });
  add("I2C1", "I2C", { SCL: "PB6", SDA: "PB7", SMBAI: "PB5" },
    { Remapped: { SCL: "PB8", SDA: "PB9" } });
  add("I2C2", "I2C", { SCL: "PB10", SDA: "PB11", SMBAI: "PB12" });
  add("TIM1", "Timers", { CH1: "PA8", CH2: "PA9", CH3: "PA10", CH4: "PA11", BKIN: "PB12", CH1N: "PB13", CH2N: "PB14", CH3N: "PB15" },
    { "Partial remap": { BKIN: "PA6", CH1N: "PA7", CH2N: "PB0", CH3N: "PB1" } });
  // TIM1_ETR is bonded only with the partial remap on this package.
  peripherals.at(-1).signals.push(["ETR", null]);
  peripherals.at(-1).maps["Partial remap"].ETR = "PA12";
  add("TIM2", "Timers", { CH1_ETR: "PA0", CH2: "PA1", CH3: "PA2", CH4: "PA3" }, {
    "Partial remap 1": { CH1_ETR: "PA15", CH2: "PB3" },
    "Partial remap 2": { CH3: "PB10", CH4: "PB11" },
    "Full remap": { CH1_ETR: "PA15", CH2: "PB3", CH3: "PB10", CH4: "PB11" },
  });
  add("TIM3", "Timers", { CH1: "PA6", CH2: "PA7", CH3: "PB0", CH4: "PB1" },
    { "Partial remap": { CH1: "PB4", CH2: "PB5" } });
  add("TIM4", "Timers", { CH1: "PB6", CH2: "PB7", CH3: "PB8", CH4: "PB9" });
  add("CAN", "USB / CAN", { RX: "PA11", TX: "PA12" }, { Remapped: { RX: "PB8", TX: "PB9" } });
  add("USB", "USB / CAN", { DM: "PA11", DP: "PA12" });
  add("Debug", "Board / debug", { SWDIO: "PA13", SWCLK: "PA14", JTDI: "PA15", JTDO: "PB3", JNTRST: "PB4" },
    { "SWD only": { JTDI: null, JTDO: null, JNTRST: null } }, true);
  add("HSE", "Board / debug", { OSC_IN: "PD0", OSC_OUT: "PD1" }, {}, true);
  add("LSE", "Board / debug", { OSC32_IN: "PC14", OSC32_OUT: "PC15" });
  add("LED", "Board / debug", { "active-low LED": "PC13" });
  add("MCO", "Board / debug", { MCO: "PA8" });
  add("Wakeup", "Board / debug", { WKUP: "PA0" });
  add("Tamper / RTC", "Board / debug", { TAMPER: "PC13" });
  add("Trace", "Board / debug", { SWO: "PB3" });

  const optionalByGroup = {
    USART: {
      CK: "Needed for synchronous USART operation; not needed for asynchronous serial communication.",
      CTS: "Needed only when using CTS hardware flow control.",
      RTS: "Needed only when using RTS hardware flow control.",
    },
    SPI: {
      NSS: "Optional with software NSS management. A slave using hardware NSS needs this signal; a master can select slaves with another GPIO.",
    },
    I2C: {
      SMBAI: "Needed only for SMBus alert; not needed for ordinary I2C communication.",
    },
  };
  for (const p of peripherals) {
    p.optional = p.group === "Timers"
      ? Object.fromEntries(p.signals.map(([signal]) => [signal, "Needed only for the selected timer channel or external feature. Internal timer counting does not require signal pins."]))
      : optionalByGroup[p.group] || {};
    p.roles = p.group === "SPI"
      ? [["master", "Master (full duplex)"], ["slave", "Slave (point to point)"], ["slaveMulti", "Slave (multi-slave)"]]
      : p.group === "Timers" ? [["output", "Output compare / PWM"], ["input", "Input capture / external trigger"]] : [];
  }

  const packagePins = {
    VBAT: 1, PC13: 2, PC14: 3, PC15: 4, PD0: 5, PD1: 6, NRST: 7,
    PA0: 10, PA1: 11, PA2: 12, PA3: 13, PA4: 14, PA5: 15, PA6: 16, PA7: 17,
    PB0: 18, PB1: 19, PB2: 20, PB10: 21, PB11: 22, PB12: 25, PB13: 26,
    PB14: 27, PB15: 28, PA8: 29, PA9: 30, PA10: 31, PA11: 32, PA12: 33,
    PA13: 34, PA14: 37, PA15: 38, PB3: 39, PB4: 40, PB5: 41, PB6: 42,
    PB7: 43, PB8: 45, PB9: 46,
  };
  const pwmPins = new Set(["PA0", "PA1", "PA2", "PA3", "PA6", "PA7", "PA8", "PA9", "PA10", "PA11", "PA15", "PB0", "PB1", "PB3", "PB4", "PB5", "PB6", "PB7", "PB8", "PB9", "PB10", "PB11", "PB13", "PB14", "PB15"]);
  function capabilities(pin) {
    const gpio = /^P[ABCD]\d+$/.test(pin);
    const ft = /^PA(8|9|1[0-5])$/.test(pin) || /^PB(2|3|4|[6-9]|1[0-5])$/.test(pin);
    return { gpio, ft, pwm: pwmPins.has(pin), warning: ["PC13", "PC14", "PC15"].includes(pin) };
  }
  function defaults() {
    const state = Object.fromEntries(peripherals.map(p => [p.id, {
      enabled: p.enabled, mapping: "Default", signals: Object.fromEntries(p.signals.map(([s]) => [s, !p.optional[s]])),
      role: p.roles[0]?.[0], nss: "output",
    }]));
    state.settings = { outputSpeed: "2", adc: "ADC1" };
    return state;
  }
  function assignments(state) {
    const pins = {};
    const errors = [];
    for (const p of peripherals) {
      const selection = state[p.id];
      if (!selection?.enabled) continue;
      for (const [signal, defaultPin] of p.signals) {
        if (selection.signals?.[signal] === false) continue;
        const map = p.maps[selection.mapping] || {};
        const pin = Object.hasOwn(map, signal) ? map[signal] : defaultPin;
        if (!pin) continue;
        (pins[pin] ||= []).push({ peripheral: p.id, signal, label: p.group === "ADC" ? signal : `${p.id}_${signal}`, optional: p.optional[signal] || null });
      }
    }
    for (const [pin, owners] of Object.entries(pins)) {
      if (owners.length > 1) errors.push({ pin, message: `${pin}: ${owners.map(o => o.label).join(" + ")} share this pin.` });
    }
    if (state.USB?.enabled && state.CAN?.enabled) {
      errors.push({ pin: null, message: "USB and CAN cannot operate simultaneously: they share packet memory on STM32F103, even with CAN remapped." });
    }
    return { pins, errors };
  }
  function pinFunctions(pin) {
    const result = [];
    for (const p of peripherals) {
      for (const [signal, defaultPin] of p.signals) {
        const mappings = [];
        if (defaultPin === pin) mappings.push("Default");
        for (const [name, map] of Object.entries(p.maps)) if (map[signal] === pin) mappings.push(name);
        if (!mappings.length) continue;
        const label = p.group === "ADC" ? signal : `${p.id}_${signal}`;
        result.push({ peripheral: p.id, group: p.group, signal, label, mappings, optional: p.optional[signal] || null });
      }
    }
    return result;
  }
  function functions(pin) {
    return pinFunctions(pin).flatMap(entry => [
      ...(entry.mappings.includes("Default") ? [entry.label] : []),
      ...(entry.mappings.some(mapping => mapping !== "Default") ? [`${entry.label} (remap)`] : []),
    ]);
  }

  // RM0008 section 9.1.11, tables 22–29: peripheral GPIO configurations.
  function gpioConfiguration(owner, selection, speed) {
    const { peripheral: id, signal } = owner;
    const mode = { "2": "10", "10": "01", "50": "11" }[speed] || "10";
    const input = { cnf: "01", mode: "00", configuration: "Floating input", notes: "" };
    const output = { cnf: "10", mode, configuration: "AF push-pull output", notes: `Output drive limit: ${speed} MHz.` };
    const hardware = (configuration, notes) => ({ cnf: null, mode: null, configuration, notes });
    if (id.startsWith("ADC channel")) return { cnf: "00", mode: "00", configuration: "Analog input", notes: "Analog voltage: 0–VDDA." };
    if (/^USART/.test(id)) return ["RX", "CTS"].includes(signal) ? input : output;
    if (/^SPI/.test(id)) {
      const master = selection.role === "master" || !selection.role;
      if (signal === "NSS") return master && selection.nss !== "input"
        ? { ...output, notes: `${output.notes} Hardware NSS output: set SPIx_CR2.SSOE.` }
        : input;
      if (signal === "MISO") return master ? input : {
        ...output, cnf: selection.role === "slaveMulti" ? "11" : "10",
        configuration: selection.role === "slaveMulti" ? "AF open-drain output" : output.configuration,
        notes: selection.role === "slaveMulti" ? `${output.notes} A pull-up is required on the shared MISO line.` : output.notes,
      };
      return master ? output : input;
    }
    if (/^I2C/.test(id)) return { ...output, cnf: "11", configuration: "AF open-drain", notes: "External pull-up resistors are required on the I2C/SMBus lines." };
    if (/^TIM/.test(id)) {
      if (["BKIN", "ETR"].includes(signal)) return input;
      if (signal.endsWith("N")) return output;
      const config = selection.role === "input" ? input : output;
      return signal === "CH1_ETR" ? { ...config, notes: `${config.notes} CH1 and ETR share this pin; select one function.`.trim() } : config;
    }
    if (id === "CAN") return signal === "RX" ? input : output;
    if (id === "LED") return { cnf: "00", mode: "10", configuration: "GP push-pull output (2 MHz)", notes: "PC13 LED is active-low. Set ODR13 high before enabling output to keep it off. Maximum 30 pF; do not source current." };
    if (id === "MCO") return { ...output, notes: "Select the clock output with RCC_CFGR.MCO; choose an output drive limit suitable for that clock." };
    if (id === "Wakeup") return { ...input, notes: "Enable PWR_CSR.EWUP for standby wakeup." };
    if (id === "USB") return hardware("USB transceiver", "USB enable connects DM/DP automatically. No GPIO CNF/MODE programming is required (RM0008 table 29).");
    if (id === "Debug" || id === "Trace") return hardware("Debug controller", id === "Trace" ? "Enable trace in the debug controller and configure SWJ for SWO; GPIO CNF/MODE does not select trace." : "Debug controller owns the pin. Use AFIO_MAPR.SWJ_CFG to select JTAG/SWD or release pins.");
    if (id === "HSE" || id === "LSE") return hardware("Oscillator controller", "Crystal pin pair; oscillator enable takes ownership. No GPIO CNF/MODE programming is required.");
    return hardware("Backup-domain tamper input", "Enable tamper through BKP_CR.TPE with PWR_CR.DBP write access. RTC operation additionally needs a selected RTC clock source and RCC_BDCR.RTCEN.");
  }

  function configurationSummary(state) {
    const assigned = assignments(state);
    const clocks = new Map();
    const ports = new Map();
    const notes = new Set();
    const remaps = [];
    const settings = state.settings || { outputSpeed: "2", adc: "ADC1" };
    function clock(register, bit, bus, reason) {
      const key = `${register}.${bit}`;
      if (!clocks.has(key)) clocks.set(key, { register, bit, bus, reasons: new Set() });
      clocks.get(key).reasons.add(reason);
    }
    function afio(reason) { clock("RCC_APB2ENR", "AFIOEN", "APB2", reason); }
    for (const p of peripherals) {
      const selection = state[p.id];
      if (!selection?.enabled) continue;
      if (["USART", "SPI", "I2C", "Timers"].includes(p.group) || p.id === "USB" || p.id === "CAN") {
        const bus = ["USART1", "SPI1", "TIM1"].includes(p.id) ? "APB2" : "APB1";
        clock(`RCC_${bus}ENR`, `${p.id}EN`, bus, p.id);
      }
      if (p.group === "ADC") {
        for (const adc of settings.adc === "Both" ? ["ADC1", "ADC2"] : [settings.adc || "ADC1"]) clock("RCC_APB2ENR", `${adc}EN`, "APB2", p.id);
        notes.add("ADC channel pins are shared by ADC1 and ADC2. Select the ADC instance above; set RCC_CFGR.ADCPRE so ADCCLK is at most 14 MHz.");
      }
      if (p.id === "HSE") clock("RCC_CR", "HSEON", "Oscillator", "HSE crystal");
      if (p.id === "LSE") {
        clock("RCC_APB1ENR", "PWREN", "APB1", "Backup-domain write access for LSE");
        clock("RCC_BDCR", "LSEON", "Backup domain", "LSE crystal");
        notes.add("Before changing RCC_BDCR, enable PWREN and set PWR_CR.DBP. Wait for LSERDY after enabling LSE.");
      }
      if (p.id === "HSE") notes.add("Wait for RCC_CR.HSERDY after enabling HSE. Enabling the crystal does not select it as the system clock.");
      if (p.id === "Wakeup" || p.id === "Tamper / RTC") clock("RCC_APB1ENR", "PWREN", "APB1", p.id);
      if (p.id === "Tamper / RTC") clock("RCC_APB1ENR", "BKPEN", "APB1", "Tamper configuration");
      if (p.id === "USB") {
        clock("RCC_CR", "PLLON", "PLL", "USB 48 MHz clock source");
        notes.add("USB requires a 48 MHz clock from the PLL/USB prescaler. Enable the selected PLL source, configure PLL multiplication and RCC_CFGR.USBPRE, then wait for PLLRDY. USBEN alone does not configure the clock tree.");
      }
      if (p.group === "SPI" && selection.signals.NSS === false) notes.add(`${p.id}: NSS is not selected. Use software NSS management (SPIx_CR1.SSM/SSI); master chip-select outputs can use separate GPIOs.`);
      if (selection.mapping !== "Default" && Object.hasOwn(p.maps, selection.mapping)) {
        afio(`${p.id} ${selection.mapping}`);
        const values = { USART1: "1", SPI1: "1", I2C1: "1", CAN: "10", TIM1: "01", TIM3: "10" };
        const value = p.id === "TIM2" ? { "Partial remap 1": "01", "Partial remap 2": "10", "Full remap": "11" }[selection.mapping] : values[p.id];
        remaps.push(p.id === "Debug" ? "AFIO_MAPR.SWJ_CFG = 010 (JTAG disabled, SWD retained)" : `AFIO_MAPR.${p.id}_REMAP = ${value} (${selection.mapping})`);
      }
      if (p.id === "Trace") afio("SWJ / trace configuration");
    }
    if (state.Debug && !state.Debug.enabled) {
      afio("Release debug pins");
      remaps.push("AFIO_MAPR.SWJ_CFG = 100 (JTAG and SWD disabled)");
    }
    const rows = [];
    for (const [pin, owners] of Object.entries(assigned.pins).sort(([a], [b]) => a[1].localeCompare(b[1]) || Number(a.slice(2)) - Number(b.slice(2)))) {
      for (const owner of owners) {
        const config = gpioConfiguration(owner, state[owner.peripheral], settings.outputSpeed || "2");
        const port = `GPIO${pin[1]}`;
        const number = Number(pin.slice(2));
        if (config.mode !== null) {
          if (!ports.has(port)) ports.set(port, new Set());
          ports.get(port).add(pin);
          clock("RCC_APB2ENR", `IOP${pin[1]}EN`, "APB2", `${port}: ${pin}`);
        }
        rows.push({ pin, port, peripheral: owner.peripheral, signal: owner.label, optional: owner.optional, ...config,
          register: config.mode === null ? null : `${port}_${number < 8 ? "CRL" : "CRH"}`,
          shift: config.mode === null ? null : (number % 8) * 4,
          conflict: owners.length > 1,
        });
      }
    }
    return {
      clocks: [...clocks.values()].map(c => ({ ...c, reasons: [...c.reasons] })),
      ports: [...ports].sort(([a], [b]) => a.localeCompare(b)).map(([port, pins]) => ({ port, pins: [...pins] })),
      rows, notes: [...notes], remaps, errors: assigned.errors,
    };
  }
  const api = { peripherals, packagePins, capabilities, defaults, assignments, functions, pinFunctions, configurationSummary };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BluePillPinout = api;
})(globalThis);
