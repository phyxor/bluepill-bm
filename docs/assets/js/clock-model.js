// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
//
// SPDX-License-Identifier: BSD-3-Clause

/* STM32F103C8T6 clock calculations. Frequencies are in Hz. */
(function (root) {
  "use strict";

  const ahbDividers = [1, 2, 4, 8, 16, 64, 128, 256, 512];
  const apbDividers = [1, 2, 4, 8, 16];
  const adcDividers = [2, 4, 6, 8];
  const watchdogDividers = [4, 8, 16, 32, 64, 128, 256];
  const defaults = {
    hsi: 8000000, hse: 8000000, lsi: 40000, lse: 32768,
    hsiOn: true, hseOn: false, lsiOn: false, lseOn: false,
    pllOn: false, pllSource: "hsi", hseDivider: 1, multiplier: 2,
    systemSource: "hsi", ahbDivider: 1, apb1Divider: 1, apb2Divider: 1,
    adcDivider: 2, adcOn: false, tim1On: false, tim2On: false,
    tim3On: false, tim4On: false, usbDivider: 1.5, usbOn: false,
    systickDivider: 8, systickOn: false, systickReload: 0,
    rtcSource: "none", rtcOn: false, rtcReload: 32767,
    iwdgOn: false, iwdgDivider: 4, mcoSource: "none",
    latency: 0, prefetch: false,
  };
  const presets = {
    reset: defaults,
    hse72: { ...defaults, hseOn: true, pllOn: true, pllSource: "hse",
      multiplier: 9, systemSource: "pll", apb1Divider: 2,
      adcDivider: 6, latency: 2, prefetch: true, usbOn: true },
    hse48: { ...defaults, hseOn: true, pllOn: true, pllSource: "hse",
      multiplier: 6, systemSource: "pll", apb1Divider: 2,
      adcDivider: 4, latency: 1, prefetch: true, usbOn: true, usbDivider: 1 },
    hse36: { ...defaults, hseOn: true, pllOn: true, pllSource: "hse",
      hseDivider: 2, multiplier: 9, systemSource: "pll",
      adcDivider: 4, latency: 1, prefetch: true },
    hse24: { ...defaults, hseOn: true, pllOn: true, pllSource: "hse",
      multiplier: 3, systemSource: "pll", prefetch: true },
    hse16: { ...defaults, hseOn: true, pllOn: true, pllSource: "hse",
      multiplier: 2, systemSource: "pll", prefetch: true },
    hsi64: { ...defaults, pllOn: true, multiplier: 16, systemSource: "pll",
      apb1Divider: 2, adcDivider: 6, latency: 2, prefetch: true },
  };
  const timingDefaults = { timer: 2, timerPeriodMs: 200, systickPeriodMs: 50, systickTargetMode: false, rtcPeriodMs: 1000, iwdgPeriodMs: 1000 };

  function targetCycles(inputHz, periodMs, maximum, minimum = 2) {
    if (!Number.isFinite(inputHz) || inputHz <= 0) return { errors: ["The input clock is unavailable."] };
    if (!Number.isFinite(periodMs) || periodMs <= 0) return { errors: ["Enter a positive target period in milliseconds."] };
    const cycles = inputHz * periodMs / 1000;
    const tolerance = Number.EPSILON * maximum * 4;
    if (cycles < minimum || cycles > maximum + tolerance) return {
      errors: [`Target is outside the hardware range: ${minimum / inputHz * 1000} through ${maximum / inputHz * 1000} ms.`],
    };
    return { cycles: Math.min(cycles, maximum), errors: [] };
  }

  function timingResult(inputHz, targetMs, cycles) {
    const periodSeconds = cycles / inputHz;
    const errorSeconds = periodSeconds - targetMs / 1000;
    const exact = Math.abs(cycles - inputHz * targetMs / 1000) <= Number.EPSILON * Math.max(cycles, 1) * 4;
    return { inputHz, periodSeconds, hz: inputHz / cycles, exact,
      errorSeconds: exact ? 0 : errorSeconds,
      errorPpm: exact ? 0 : errorSeconds / (targetMs / 1000) * 1000000, errors: [] };
  }

  function planTimer(inputHz, periodMs) {
    const target = targetCycles(inputHz, periodMs, 65536 * 65536);
    if (target.errors.length) return target;
    let best;
    // PSC and ARR are 16-bit on the C8T6. ARR = 0 blocks the counter.
    // Search for the closest period; ties prefer the smallest PSC (finest resolution).
    for (let divider = Math.max(1, Math.floor(target.cycles / 65536));
      divider <= Math.min(65536, Math.ceil(target.cycles / 2)); divider++) {
      const counts = Math.max(2, Math.min(65536, Math.round(target.cycles / divider)));
      const cycles = divider * counts;
      const error = Math.abs(cycles - target.cycles);
      if (!best || error < best.error) best = { divider, counts, cycles, error };
      if (error === 0) break;
    }
    return { ...timingResult(inputHz, periodMs, best.cycles), psc: best.divider - 1,
      arr: best.counts - 1, counterHz: inputHz / best.divider,
      tickSeconds: best.divider / inputHz };
  }

  function planSysTick(inputHz, periodMs) {
    const target = targetCycles(inputHz, periodMs, 0x1000000);
    if (target.errors.length) return target;
    const cycles = Math.round(target.cycles);
    return { ...timingResult(inputHz, periodMs, cycles), reload: cycles - 1 };
  }

  function planRtc(inputHz, periodMs) {
    // The RTC has a 20-bit prescaler; PRL = 0 divides by one.
    const target = targetCycles(inputHz, periodMs, 0x100000, 1);
    if (target.errors.length) return target;
    const cycles = Math.round(target.cycles);
    return { ...timingResult(inputHz, periodMs, cycles), reload: cycles - 1 };
  }

  function planIwdg(inputHz, periodMs) {
    const target = targetCycles(inputHz, periodMs, 256 * 4096, 4);
    if (target.errors.length) return target;
    let best;
    // PR selects /4 through /256; RLR is 12-bit. Ties prefer finer resolution.
    for (const divider of watchdogDividers) {
      const counts = Math.max(1, Math.min(4096, Math.round(target.cycles / divider)));
      const cycles = divider * counts;
      const error = Math.abs(cycles - target.cycles);
      if (!best || error < best.error) best = { divider, counts, cycles, error };
    }
    return { ...timingResult(inputHz, periodMs, best.cycles), divider: best.divider,
      pr: watchdogDividers.indexOf(best.divider), reload: best.counts - 1,
      counterHz: inputHz / best.divider, tickSeconds: best.divider / inputHz };
  }

  function timingToC(timer, tim, systick, systickDivider) {
    let code = '#include "stm32f1xx.h"\n';
    if (!tim.errors.length && [1, 2, 3, 4].includes(timer)) {
      const irq = timer === 1 ? "TIM1_UP" : `TIM${timer}`;
      const bus = timer === 1 ? "APB2" : "APB1";
      code += `
/* Dedicated TIM${timer}: internal clock, edge-aligned up-counter.
 * Input ${tim.inputHz} Hz; achieved update period ${tim.periodSeconds * 1000} ms.
 * Recompute these values after a clock change.
 */
void tim${timer}_init_update(void) {
    RCC->${bus}ENR |= RCC_${bus}ENR_TIM${timer}EN;
    (void)RCC->${bus}ENR;
    TIM${timer}->CR1 = 0u;
    TIM${timer}->DIER = 0u;
    TIM${timer}->SMCR = 0u;
    TIM${timer}->PSC = ${tim.psc}u;
    TIM${timer}->ARR = ${tim.arr}u;
${timer === 1 ? "    TIM1->RCR = 0u;\n" : ""}    TIM${timer}->EGR = TIM_EGR_UG; /* Load PSC/ARR and reset CNT. */
    TIM${timer}->SR = 0u; /* Clear the update flag caused by UG. */
    NVIC_ClearPendingIRQ(${irq}_IRQn);
    TIM${timer}->DIER = TIM_DIER_UIE;
    NVIC_EnableIRQ(${irq}_IRQn);
    TIM${timer}->CR1 = TIM_CR1_ARPE | TIM_CR1_CEN;
}

void ${irq}_IRQHandler(void) {
    if ((TIM${timer}->SR & TIM_SR_UIF) != 0u) {
        TIM${timer}->SR = (uint32_t)~TIM_SR_UIF;
        /* Handle the periodic timer interrupt here. */
    }
}
`;
    }
    if (!systick.errors.length && [1, 8].includes(systickDivider)) {
      code += `
/* SysTick input ${systick.inputHz} Hz; achieved period ${systick.periodSeconds * 1000} ms. */
void systick_init_periodic(void) {
    SysTick->CTRL = 0u;
    SysTick->LOAD = ${systick.reload}u;
    SysTick->VAL = 0u;
    SCB->ICSR = SCB_ICSR_PENDSTCLR_Msk;
    SysTick->CTRL = SysTick_CTRL_ENABLE_Msk | SysTick_CTRL_TICKINT_Msk${systickDivider === 1 ? " | SysTick_CTRL_CLKSOURCE_Msk" : ""};
}

void SysTick_Handler(void) {
    /* Handle the periodic SysTick interrupt here. */
}
`;
    }
    return code;
  }

  function calculate(input) {
    const c = { ...defaults, ...input };
    const errors = [];
    const clocks = {};
    const fields = [];
    const error = (text) => errors.push(text);
    const divide = (hz, divider) => hz === null ? null : hz / divider;
    const add = (name, hz, source, enabled = true) => {
      clocks[name] = { hz, source, status: hz === null ? "Unavailable" : enabled ? "Active" : "Gated" };
      return hz;
    };
    const field = (name, value, width = 1) => {
      const binary = value.toString(2).padStart(width, "0");
      const checks = {
        "RCC_CR.HSION": `Wait for RCC_CR.HSIRDY = ${Number(c.hsiOn)}. Do not disable an active SYSCLK or PLL source.`,
        "RCC_CR.HSEON": `Wait for RCC_CR.HSERDY = ${Number(c.hseOn)}. Do not disable an active SYSCLK or PLL source.`,
        "RCC_CR.PLLON": `Wait for RCC_CR.PLLRDY = ${Number(c.pllOn)}. Switch SYSCLK away from PLL before disabling it.`,
        "RCC_CR.HSEBYP": "Change only with HSEON = 0. Read back HSEBYP = 0 for the crystal.",
        "RCC_CSR.LSION": `Wait for RCC_CSR.LSIRDY = ${Number(c.lsiOn || c.iwdgOn)}.${c.iwdgOn ? " IWDG keeps LSI enabled." : ""}`,
        "RCC_BDCR.LSEON": `Allow backup-domain writes, then wait for RCC_BDCR.LSERDY = ${Number(c.lseOn)}.`,
        "RCC_BDCR.LSEBYP": "Allow backup-domain writes. Change only with LSEON = 0; read back LSEBYP = 0.",
        "RCC_CFGR.SW": `Wait for RCC_CFGR.SWS = ${binary}. The selected source must be ready.`,
        "RCC_CFGR.PLLSRC": `Before writing, clear PLLON and wait for PLLRDY = 0. Then read back PLLSRC = ${binary}.`,
        "RCC_CFGR.PLLXTPRE": `Before writing, clear PLLON and wait for PLLRDY = 0. Then read back PLLXTPRE = ${binary}.`,
        "RCC_CFGR.PLLMUL (CMSIS: PLLMULL)": `Before writing, clear PLLON and wait for PLLRDY = 0. Then read back PLLMUL = ${binary}.`,
        "RCC_CFGR.USBPRE": `Keep USBEN = 0 while writing. Read back USBPRE = ${binary} before enabling USB. No USB clock-ready flag.`,
        "RCC_BDCR.RTCSEL": `Allow backup-domain writes; read back RTCSEL = ${binary}. Changing an existing source requires a backup-domain reset.`,
        "RCC_BDCR.RTCEN": c.rtcOn ? "Read back RTCEN = 1. With the RTC source ready, clear RTC_CRL.RSF and wait for RSF = 1 before RTC access." : "Read back RTCEN = 0. No separate ready flag; do not wait for RTC synchronization while its clock is disabled.",
        "FLASH_ACR.LATENCY": `Read back FLASH_ACR.LATENCY = ${binary} before increasing SYSCLK. No separate ready flag.`,
        "FLASH_ACR.PRFTBE": `Wait for FLASH_ACR.PRFTBS = ${binary}. Change prefetch only with SYSCLK = HCLK and SYSCLK below 24 MHz.`,
        "RTC_PRLH.PRL[19:16]": "With RTC clock enabled and synchronized: wait for RTC_CRL.RTOFF = 1, set CNF = 1, write both prescaler fields, clear CNF, then wait for RTOFF = 1.",
        "RTC_PRLL.PRL[15:0]": "With RTC clock enabled and synchronized: wait for RTC_CRL.RTOFF = 1, set CNF = 1, write both prescaler fields, clear CNF, then wait for RTOFF = 1.",
        "IWDG_PR.PR": "Write IWDG_KR = 0x5555 to unlock. Wait for IWDG_SR.PVU = 0 before and after writing PR.",
      };
      fields.push({ name, value, binary, check: checks[name] || `Read back ${name} = ${binary}. No separate ready flag.` });
    };
    const allowed = (key, values) => {
      if (!values.includes(c[key])) error(`${key}: select an allowed value.`);
    };
    for (const key of ["hsi", "hse", "lsi", "lse"]) {
      if (!Number.isFinite(c[key]) || c[key] <= 0) error(`${key.toUpperCase()}: enter a positive frequency.`);
    }
    allowed("pllSource", ["hsi", "hse"]);
    allowed("systemSource", ["hsi", "hse", "pll"]);
    allowed("rtcSource", ["none", "lse", "lsi", "hse"]);
    allowed("mcoSource", ["none", "sysclk", "hsi", "hse", "pll"]);
    allowed("hseDivider", [1, 2]);
    allowed("multiplier", Array.from({ length: 15 }, (_, i) => i + 2));
    allowed("ahbDivider", ahbDividers);
    allowed("apb1Divider", apbDividers);
    allowed("apb2Divider", apbDividers);
    allowed("adcDivider", adcDividers);
    allowed("usbDivider", [1, 1.5]);
    allowed("systickDivider", [1, 8]);
    allowed("iwdgDivider", watchdogDividers);
    allowed("latency", [0, 1, 2]);
    for (const [key, max] of [["systickReload", 0xffffff], ["rtcReload", 0xfffff]]) {
      if (!Number.isInteger(c[key]) || c[key] < 0 || c[key] > max) error(`${key}: enter an integer from 0 to ${max}.`);
    }
    if (errors.length) return { clocks, fields, errors, flash: "Correct the form values.", usb: "Correct the form values." };

    // Starting IWDG forces LSI on even if LSION is clear.
    const hsi = add("HSI", c.hsiOn ? c.hsi : null, "Internal RC");
    const hse = add("HSE", c.hseOn ? c.hse : null, "External crystal");
    const lsi = add("LSI", c.lsiOn || c.iwdgOn ? c.lsi : null, "Internal RC");
    const lse = add("LSE", c.lseOn ? c.lse : null, "External crystal");
    if (c.hseOn && (c.hse < 4000000 || c.hse > 16000000)) error("HSE crystal frequency must be between 4 and 16 MHz.");
    const pllInput = add("PLL input", divide(c.pllSource === "hsi" ? hsi : hse,
      c.pllSource === "hsi" ? 2 : c.hseDivider), c.pllSource === "hsi" ? "HSI / 2" : `HSE / ${c.hseDivider}`);
    const pll = add("PLLCLK", c.pllOn && pllInput !== null ? pllInput * c.multiplier : null, `PLL input x ${c.multiplier}`);
    if (c.pllOn && pllInput === null) error("PLL is enabled but its oscillator is disabled.");
    if (pll !== null && (pll < 16000000 || pll > 72000000)) error("PLLCLK must be between 16 and 72 MHz.");
    const sysclk = add("SYSCLK", { hsi, hse, pll }[c.systemSource], c.systemSource.toUpperCase());
    if (sysclk === null) error("The selected SYSCLK source is disabled or unavailable. Hardware cannot switch to it.");
    const hclk = add("HCLK", divide(sysclk, c.ahbDivider), `SYSCLK / ${c.ahbDivider}`);
    add("FCLK", hclk, "HCLK");
    add("FLITFCLK", hsi, "HSI (Flash programming interface)");
    add("HCLK / 8", divide(hclk, 8), "HCLK / 8");
    const pclk1 = add("PCLK1", divide(hclk, c.apb1Divider), `HCLK / ${c.apb1Divider}`);
    const pclk2 = add("PCLK2", divide(hclk, c.apb2Divider), `HCLK / ${c.apb2Divider}`);
    for (const [name, hz, max] of [["SYSCLK", sysclk, 72000000], ["HCLK", hclk, 72000000],
      ["PCLK1", pclk1, 36000000], ["PCLK2", pclk2, 72000000]]) {
      if (hz !== null && hz > max) error(`${name} exceeds ${max / 1000000} MHz.`);
    }
    for (const timer of [1, 2, 3, 4]) {
      const pclk = timer === 1 ? pclk2 : pclk1;
      const divider = timer === 1 ? c.apb2Divider : c.apb1Divider;
      add(`TIM${timer}CLK`, pclk === null ? null : pclk * (divider === 1 ? 1 : 2),
        `PCLK${timer === 1 ? 2 : 1}${divider === 1 ? "" : " x 2"}`, c[`tim${timer}On`]);
    }
    const adc = add("ADCCLK", divide(pclk2, c.adcDivider), `PCLK2 / ${c.adcDivider}`, c.adcOn);
    if (adc !== null && c.adcOn && adc > 14000000) error("Enabled ADC clock exceeds 14 MHz. Increase ADCPRE.");
    const systick = add("SysTick input", divide(hclk, c.systickDivider), `HCLK / ${c.systickDivider}`);
    add("SysTick interrupt", c.systickOn && c.systickReload !== 0 ? divide(systick, c.systickReload + 1) : null, "SysTick input / (RELOAD + 1)");
    if (c.systickOn && c.systickReload === 0) error("SysTick RELOAD must be at least 1 to generate interrupts.");
    const usb = add("USBCLK", divide(pll, c.usbDivider), `PLLCLK / ${c.usbDivider}`, c.usbOn);
    let usbInfo = "USB is disabled. Enable an HSE-derived PLL at 48 MHz with /1, or 72 MHz with /1.5, before enabling USBEN.";
    if (c.usbOn) {
      if (usb !== 48000000) error("USB requires exactly 48 MHz from an enabled PLL. Use PLL = 48 MHz with USBPRE = 1, or PLL = 72 MHz with USBPRE = 0.");
      if (c.pllSource !== "hse") error("Use an HSE-derived PLL for USB. The internal HSI RC oscillator does not provide the required USB clock accuracy.");
      if (pclk1 === null || pclk1 <= 8000000) error("USB requires PCLK1 greater than 8 MHz to avoid packet memory overrun or underrun.");
      usbInfo = usb === 48000000 && c.pllSource === "hse" && pclk1 > 8000000 ?
        "USB clock configuration is valid: 48 MHz from HSE through the PLL, with PCLK1 above 8 MHz. Set USBPRE before USBEN. Use a crystal with the required USB accuracy." :
        "USB clock configuration is invalid. Check the PLL source, enable state, USBPRE, and PCLK1 (must exceed 8 MHz).";
    }
    const rtc = add("RTCCLK", c.rtcOn ? { none: null, lse, lsi, hse: divide(hse, 128) }[c.rtcSource] : null, c.rtcSource === "hse" ? "HSE / 128" : c.rtcSource.toUpperCase());
    if (c.rtcOn && rtc === null) error("RTC is enabled but its selected source is unavailable.");
    add("RTC counter", divide(rtc, c.rtcReload + 1), "RTCCLK / (prescaler + 1)");
    add("IWDGCLK", c.iwdgOn ? lsi : null, "LSI");
    add("IWDG counter", c.iwdgOn ? divide(lsi, c.iwdgDivider) : null, `LSI / ${c.iwdgDivider}`);
    for (const name of ["SysTick interrupt", "RTC counter", "IWDG counter"]) {
      const clock = clocks[name];
      clock.periodSeconds = clock.hz === null ? null : 1 / clock.hz;
    }
    const mco = add("MCO", { none: null, sysclk, hsi, hse, pll: divide(pll, 2) }[c.mcoSource], c.mcoSource === "pll" ? "PLLCLK / 2" : c.mcoSource.toUpperCase());
    if (c.mcoSource !== "none" && mco === null) error("The selected MCO source is unavailable.");
    if (mco !== null && mco > 50000000) error("MCO exceeds the 50 MHz PA8 output limit. Select a slower source.");

    const requiredLatency = sysclk === null ? null : sysclk <= 24000000 ? 0 : sysclk <= 48000000 ? 1 : 2;
    if (requiredLatency !== null && c.latency < requiredLatency) error(`Flash needs at least ${requiredLatency} wait states at this SYSCLK. Set FLASH_ACR.LATENCY before increasing the clock.`);
    if (c.ahbDivider !== 1 && !c.prefetch) error("Flash prefetch must be enabled when HPRE divides SYSCLK.");
    const flash = requiredLatency === null ? "Flash requirements cannot be calculated without SYSCLK." :
      `Flash requires at least ${requiredLatency} wait states; selected LATENCY = ${c.latency}, prefetch ${c.prefetch ? "enabled" : "disabled"}. ` +
      "Set wait states before increasing SYSCLK. Enable prefetch while SYSCLK = HCLK and SYSCLK is below 24 MHz. Lower wait states only after slowing the clock.";

    for (const [name, enabled] of [["HSI", c.hsiOn], ["HSE", c.hseOn], ["LSI", c.lsiOn || c.iwdgOn],
      ["LSE", c.lseOn], ["PLLCLK", c.pllOn], ["RTCCLK", c.rtcOn], ["RTC counter", c.rtcOn],
      ["SysTick interrupt", c.systickOn], ["IWDGCLK", c.iwdgOn], ["IWDG counter", c.iwdgOn],
      ["MCO", c.mcoSource !== "none"]]) {
      if (!enabled) clocks[name].status = "Disabled";
    }

    for (const [name, value] of [["RCC_CR.HSION", c.hsiOn], ["RCC_CR.HSEON", c.hseOn],
      ["RCC_CR.HSEBYP", false], ["RCC_CR.PLLON", c.pllOn], ["RCC_CSR.LSION", c.lsiOn],
      ["RCC_BDCR.LSEON", c.lseOn], ["RCC_BDCR.LSEBYP", false], ["RCC_BDCR.RTCEN", c.rtcOn],
      ["RCC_APB1ENR.USBEN", c.usbOn], ["RCC_APB2ENR.ADC1EN", c.adcOn], ["RCC_APB2ENR.ADC2EN", c.adcOn],
      ["RCC_APB2ENR.TIM1EN", c.tim1On], ["RCC_APB1ENR.TIM2EN", c.tim2On],
      ["RCC_APB1ENR.TIM3EN", c.tim3On], ["RCC_APB1ENR.TIM4EN", c.tim4On],
      ["FLASH_ACR.PRFTBE", c.prefetch], ["SysTick_CTRL.ENABLE", c.systickOn], ["SysTick_CTRL.TICKINT", c.systickOn]]) field(name, Number(value));
    field("RCC_CFGR.PLLSRC", c.pllSource === "hse" ? 1 : 0);
    field("RCC_CFGR.PLLXTPRE", c.hseDivider === 2 ? 1 : 0);
    field("RCC_CFGR.PLLMUL (CMSIS: PLLMULL)", c.multiplier - 2, 4);
    field("RCC_CFGR.SW", ["hsi", "hse", "pll"].indexOf(c.systemSource), 2);
    field("RCC_CFGR.HPRE", c.ahbDivider === 1 ? 0 : ahbDividers.indexOf(c.ahbDivider) + 7, 4);
    field("RCC_CFGR.PPRE1", c.apb1Divider === 1 ? 0 : apbDividers.indexOf(c.apb1Divider) + 3, 3);
    field("RCC_CFGR.PPRE2", c.apb2Divider === 1 ? 0 : apbDividers.indexOf(c.apb2Divider) + 3, 3);
    field("RCC_CFGR.ADCPRE", adcDividers.indexOf(c.adcDivider), 2);
    field("RCC_CFGR.USBPRE", c.usbDivider === 1 ? 1 : 0);
    field("RCC_CFGR.MCO", { none: 0, sysclk: 4, hsi: 5, hse: 6, pll: 7 }[c.mcoSource], 3);
    field("RCC_BDCR.RTCSEL", ["none", "lse", "lsi", "hse"].indexOf(c.rtcSource), 2);
    field("SysTick_CTRL.CLKSOURCE", c.systickDivider === 1 ? 1 : 0);
    field("SysTick_LOAD.RELOAD", c.systickReload, 24);
    field("RTC_PRLH.PRL[19:16]", c.rtcReload >>> 16, 4);
    field("RTC_PRLL.PRL[15:0]", c.rtcReload & 0xffff, 16);
    field("IWDG_PR.PR", watchdogDividers.indexOf(c.iwdgDivider), 3);
    field("FLASH_ACR.LATENCY", c.latency, 3);
    return { clocks, fields, errors, flash, usb: usbInfo };
  }

  function toC(input) {
    const c = { ...defaults, ...input };
    const result = calculate(c);
    const errors = [...result.errors];
    if (!Number.isInteger(c.hsi) || !Number.isInteger(c.hse)) errors.push("C export requires integer HSI and HSE frequencies in Hz.");
    if (result.clocks.ADCCLK && result.clocks.ADCCLK.hz > 14000000) errors.push("C export requires ADCCLK at or below 14 MHz, even when the ADC clock is gated.");
    if (c.hsi >= 24000000) errors.push("The C API requires HSI below 24 MHz for Flash reconfiguration.");
    if (errors.length) return { code: "", errors };
    const systemSource = { hsi: "CLOCK_SYS_HSI", hse: "CLOCK_SYS_HSE", pll: "CLOCK_SYS_PLL" }[c.systemSource];
    const rtcSource = c.rtcOn ? { none: "CLOCK_RTC_NONE", lse: "CLOCK_RTC_LSE", lsi: "CLOCK_RTC_LSI", hse: "CLOCK_RTC_HSE_DIV128" }[c.rtcSource] : "CLOCK_RTC_NONE";
    const code = `#include "clock_stm32f103.h"

/* Apply at startup, before timing-dependent peripherals run.
 * This is a polling budget per wait, not a duration in milliseconds.
 * Set HSI_VALUE/HSE_VALUE for all runtime files if using different oscillators.
 */
#define APP_CLOCK_WAIT_ITERATIONS 10000000u
_Static_assert(HSI_VALUE == ${c.hsi}u, "Build HSI_VALUE must match this configuration");
_Static_assert(HSE_VALUE == ${c.hse}u, "Build HSE_VALUE must match this configuration");

const clock_system_config_t system_clock_config = {
    .source = ${systemSource},
    .pll_source = ${c.pllSource === "hse" ? "CLOCK_PLL_HSE" : "CLOCK_PLL_HSI_DIV2"},
    .hsi_enabled = ${c.hsiOn},
    .hse_enabled = ${c.hseOn},
    .pll_enabled = ${c.pllOn},
    .hse_pll_divider = ${c.hseDivider}u,
    .pll_multiplier = ${c.multiplier}u,
    .ahb_divider = ${c.ahbDivider}u,
    .apb1_divider = ${c.apb1Divider}u,
    .apb2_divider = ${c.apb2Divider}u,
    .adc_divider = ${c.adcDivider}u,
    .usb_divide_by_1_5 = ${c.usbDivider === 1.5},
    .flash_wait_states = ${c.latency}u,
    .flash_prefetch = ${c.prefetch},
    .timeout_iterations = APP_CLOCK_WAIT_ITERATIONS,
};

const clock_rtc_config_t rtc_clock_config = {
    .source = ${rtcSource},
    .prescaler = ${c.rtcReload}u,
    .reset_backup_domain = false, /* Set true only to clear RTC/backup data when changing source. */
    .timeout_iterations = APP_CLOCK_WAIT_ITERATIONS,
};

const clock_iwdg_config_t iwdg_clock_config = {
    .divider = ${c.iwdgDivider}u,
    .timeout_iterations = APP_CLOCK_WAIT_ITERATIONS,
};

clock_stm32f103_status_t configure_clocks(void) {
    clock_stm32f103_status_t status = clock_stm32f103_configure_system(&system_clock_config);
    if (status != CLOCK_STM32F103_OK) {
        return status;
    }
    status = clock_stm32f103_configure_rtc(&rtc_clock_config);
    if (status != CLOCK_STM32F103_OK) {
        return status;
    }
${c.iwdgOn || c.lsiOn ? "    /* Sets LSI and PR only. Configure reload/start IWDG separately. */\n    return clock_stm32f103_configure_iwdg(&iwdg_clock_config);" : "    /* Call clock_stm32f103_configure_iwdg(&iwdg_clock_config) when needed. */\n    return CLOCK_STM32F103_OK;"}
}
`;
    return { code, errors: [] };
  }

  const model = { calculate, toC, planTimer, planSysTick, planRtc, planIwdg, timingToC, timingDefaults,
    defaults, presets, ahbDividers, apbDividers, adcDividers, watchdogDividers };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.BluePillClocks = model;
})(globalThis);
