// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
//
// SPDX-License-Identifier: BSD-3-Clause

(function () {
  "use strict";

  function initialize() {
    const container = document.getElementById("clock-calculator");
    if (!container || container.dataset.initialized) return;
    container.dataset.initialized = "true";
    const model = globalThis.BluePillClocks;
    const initialValues = { ...model.defaults, ...model.timingDefaults };
    const timers = [1, 2, 3, 4];
    const controlFields = {
      hsiOn: "RCC_CR.HSION",
      hseOn: "RCC_CR.HSEON",
      lsiOn: "RCC_CSR.LSION",
      lseOn: "RCC_BDCR.LSEON",
      systemSource: "RCC_CFGR.SW",
      pllOn: "RCC_CR.PLLON",
      pllSource: "RCC_CFGR.PLLSRC",
      hseDivider: "RCC_CFGR.PLLXTPRE",
      multiplier: "RCC_CFGR.PLLMUL",
      ahbDivider: "RCC_CFGR.HPRE",
      apb1Divider: "RCC_CFGR.PPRE1",
      apb2Divider: "RCC_CFGR.PPRE2",
      latency: "FLASH_ACR.LATENCY",
      prefetch: "FLASH_ACR.PRFTBE",
      usbDivider: "RCC_CFGR.USBPRE",
      usbOn: "RCC_APB1ENR.USBEN",
      mcoSource: "RCC_CFGR.MCO",
      adcDivider: "RCC_CFGR.ADCPRE",
      adcOn: "RCC_APB2ENR.ADC1EN / RCC_APB2ENR.ADC2EN",
      systickDivider: "SysTick_CTRL.CLKSOURCE",
      systickOn: "SysTick_CTRL.ENABLE / SysTick_CTRL.TICKINT",
      rtcSource: "RCC_BDCR.RTCSEL",
      rtcOn: "RCC_BDCR.RTCEN",
      iwdgOn: "IWDG_KR.KEY (start command: 0xCCCC)",
    };
    for (const timer of timers) controlFields[`tim${timer}On`] = `RCC_APB${timer === 1 ? 2 : 1}ENR.TIM${timer}EN`;
    const adcSampleCycles = [1.5, 7.5, 13.5, 28.5, 41.5, 55.5, 71.5, 239.5];
    for (const timer of timers) initialValues[`tim${timer}PeriodMs`] = model.timingDefaults.timerPeriodMs;
    const controls = {};
    const gateSwitches = [];
    const form = document.createElement("form");
    form.className = "clock-form";
    form.addEventListener("submit", (event) => event.preventDefault());

    function element(tag, text, parent) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (parent) parent.append(node);
      return node;
    }
    function group(title, open = false) {
      const section = element("details", undefined, form);
      section.className = "clock-settings-group";
      section.open = open;
      element("summary", title, section);
      const box = element("fieldset", undefined, section);
      element("legend", title, box);
      return box;
    }
    function control(parent, key, label, options) {
      const wrapper = element("label", undefined, parent);
      wrapper.className = "clock-control";
      const caption = element("span", label, wrapper);
      if (controlFields[key]) {
        const reference = element("code", controlFields[key], caption);
        reference.className = "clock-control-reference";
      }
      const input = element(options ? "select" : "input", undefined, wrapper);
      input.name = key;
      if (options) {
        for (const option of options) {
          const [value, text] = Array.isArray(option) ? option : [option, String(option)];
          const node = element("option", text, input);
          node.value = value;
        }
      } else if (typeof initialValues[key] === "boolean") {
        input.type = "checkbox";
      } else {
        input.type = "number";
        input.min = key.endsWith("Reload") ? 0 : 1;
        input.step = "1";
        if (key.endsWith("PeriodMs")) { input.min = "0"; input.step = "any"; }
        if (key === "hse") { input.min = 4000000; input.max = 16000000; }
      }
      controls[key] = input;
    }
    function gateControl(parent, key, label) {
      const existing = controls[key];
      control(parent, key, `⏻ ${label} (reset: ${model.defaults[key] ? "on" : "off"})`);
      const input = controls[key];
      input.setAttribute("role", "switch");
      if (existing) controls[key] = existing;
      gateSwitches.push({ key, input });
      const toggle = (event) => {
        event.stopPropagation();
        controls[key].checked = input.checked;
        update();
      };
      input.addEventListener("input", toggle);
      input.addEventListener("change", toggle);
    }
    const divisors = (values) => values.map((value) => [value, `/ ${value}`]);
    const sources = group("Oscillators (Hz)");
    for (const source of ["hsi", "hse", "lsi", "lse"]) {
      control(sources, source, `${source.toUpperCase()} frequency`);
      control(sources, `${source}On`, `Enable ${source.toUpperCase()}`);
    }
    const pll = group("System and PLL", true);
    control(pll, "systemSource", "SYSCLK source", [["hsi", "HSI"], ["hse", "HSE"], ["pll", "PLL"]]);
    control(pll, "pllOn", "Enable PLL");
    control(pll, "pllSource", "PLL source", [["hsi", "HSI / 2"], ["hse", "HSE"]]);
    control(pll, "hseDivider", "HSE divider for PLL", divisors([1, 2]));
    control(pll, "multiplier", "PLL multiplier", Array.from({ length: 15 }, (_, i) => [i + 2, `x ${i + 2}`]));
    const buses = group("Buses and peripherals", true);
    control(buses, "ahbDivider", "AHB divider", divisors(model.ahbDividers));
    control(buses, "apb1Divider", "APB1 divider", divisors(model.apbDividers));
    control(buses, "apb2Divider", "APB2 divider", divisors(model.apbDividers));

    const toolbar = element("div", undefined, container);
    toolbar.className = "clock-toolbar";
    element("h2", "Clock configuration", toolbar);
    const buttons = element("div", undefined, toolbar);
    buttons.className = "clock-presets";
    for (const [key, label] of [["reset", "Reset defaults"], ["hse72", "72 MHz (HSE)"],
      ["hse48", "48 MHz (HSE)"], ["hse36", "36 MHz (HSE)"],
      ["hse24", "24 MHz (HSE)"], ["hse16", "16 MHz (HSE)"], ["hsi64", "64 MHz (HSI)"]]) {
      const button = element("button", label, buttons);
      button.type = "button";
      button.addEventListener("click", () => setPreset(key));
    }
    const layout = element("div", undefined, container);
    layout.className = "clock-dashboard-layout";
    const settings = element("aside", undefined, layout);
    settings.className = "clock-settings";
    settings.setAttribute("aria-label", "Clock settings");
    settings.append(form);
    const results = element("section", undefined, layout);
    results.className = "clock-results";
    results.setAttribute("aria-label", "Calculated clock results");
    const tabs = element("div", undefined, results);
    tabs.className = "clock-tabs";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Clock result views");
    const panels = [];
    const topics = new Map();
    for (const [index, [key, title]] of [["system", "SystemClock and Bus Peripherals"],
      ["tim", "TIM Clocks"], ["adc", "ADC Clocks"], ["systick", "SysTick clocks"],
      ["usb", "USB Clock"], ["rtc", "RTC Clocks"], ["iwdg", "IWDG clocks"], ["mco", "MCO"],
      ["flash", "FLASH LATENCY"]].entries()) {
      const button = element("button", title, tabs);
      button.type = "button";
      button.id = `clock-tab-${key}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `clock-panel-${key}`);
      const panel = element("section", undefined, results);
      panel.id = `clock-panel-${key}`;
      panel.className = "clock-result-panel";
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", button.id);
      panel.tabIndex = 0;
      const metrics = element("dl", undefined, panel);
      metrics.className = "clock-metrics clock-topic-frequencies";
      const content = element("div", undefined, panel);
      content.className = "clock-topic-content";
      topics.set(key, { panel, metrics, content });
      panels.push({ button, panel });
      button.addEventListener("click", () => selectPanel(index));
      button.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? panels.length - 1 :
          (index + (event.key === "ArrowLeft" ? -1 : 1) + panels.length) % panels.length;
        selectPanel(next);
        panels[next].button.focus();
      });
    }
    function selectPanel(index) {
      panels.forEach(({ button, panel }, i) => {
        button.setAttribute("aria-selected", String(i === index));
        button.tabIndex = i === index ? 0 : -1;
        panel.hidden = i !== index;
      });
    }
    selectPanel(0);
    const system = topics.get("system");
    const summary = element("div");
    results.prepend(summary);
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    summary.className = "clock-summary";
    const status = element("p", undefined, summary);
    const errors = element("ul", undefined, summary);
    element("p", "Oscillators, system clock, and buses. ⏻ marks switchable peripheral clocks. Yellow cards indicate a closed gate; available frequencies and timing plans remain visible. Switch labels show the hardware reset default.", system.content);
    const flashTopic = topics.get("flash");
    const flashForm = element("form");
    flashForm.className = "clock-form";
    flashForm.setAttribute("aria-label", "Flash configuration");
    flashForm.addEventListener("submit", (event) => event.preventDefault());
    flashTopic.panel.prepend(flashForm);
    control(flashForm, "latency", "Flash wait states", [0, 1, 2]);
    control(flashForm, "prefetch", "Enable Flash prefetch");
    element("h3", "Flash configuration", flashTopic.content);
    const flashInfo = element("p", undefined, flashTopic.content);
    const usbTopic = topics.get("usb");
    const usbForm = element("form");
    usbForm.className = "clock-form";
    usbForm.setAttribute("aria-label", "USB clock configuration");
    usbForm.addEventListener("submit", (event) => event.preventDefault());
    usbTopic.panel.prepend(usbForm);
    control(usbForm, "usbDivider", "USB divider", divisors([1, 1.5]));
    gateControl(usbForm, "usbOn", "Enable USB clock");
    element("h3", "USB configuration", usbTopic.content);
    const usbInfo = element("p", undefined, usbTopic.content);
    const mcoForm = element("form");
    mcoForm.className = "clock-form";
    mcoForm.setAttribute("aria-label", "MCO clock configuration");
    mcoForm.addEventListener("submit", (event) => event.preventDefault());
    topics.get("mco").panel.prepend(mcoForm);
    control(mcoForm, "mcoSource", "MCO source on PA8", [["none", "None"], ["sysclk", "SYSCLK"], ["hsi", "HSI"], ["hse", "HSE"], ["pll", "PLL / 2"]]);
    const timTopic = topics.get("tim");
    const adcTopic = topics.get("adc");
    const adcForm = element("form");
    adcForm.className = "clock-form";
    adcForm.setAttribute("aria-label", "ADC clock configuration");
    adcForm.addEventListener("submit", (event) => event.preventDefault());
    adcTopic.panel.prepend(adcForm);
    control(adcForm, "adcDivider", "ADC divider", divisors(model.adcDividers));
    gateControl(adcForm, "adcOn", "Enable ADC1 / ADC2 clocks");
    element("p", "Sampling time is the time used to capture the analog input. A complete 12-bit conversion takes the selected sampling time plus 12.5 ADC clock cycles. The times below use ADCCLK; the maximum allowed ADC clock is 14 MHz.", adcTopic.content);
    const sysTopic = topics.get("systick");
    const timForm = element("form");
    timForm.className = "clock-timing-targets";
    timForm.setAttribute("aria-label", "TIM update interrupt targets");
    timForm.addEventListener("submit", (event) => event.preventDefault());
    timTopic.panel.prepend(timForm);
    const timerMetrics = new Map();
    for (const timer of timers) {
      const section = element("section", undefined, timForm);
      section.className = "clock-timer-group";
      const heading = element("h3", `TIM${timer}`, section);
      heading.id = `clock-tim${timer}-heading`;
      section.setAttribute("aria-labelledby", heading.id);
      gateControl(section, `tim${timer}On`, `Enable TIM${timer} clock`);
      control(section, `tim${timer}PeriodMs`, "Target period (ms)");
      const metrics = element("dl", undefined, section);
      metrics.className = "clock-metrics";
      timerMetrics.set(timer, metrics);
    }
    element("p", "Plans use APB timer doubling and edge-aligned up-counting, with RCR = 0 on TIM1. Equal-error choices use the smallest PSC for finer counter resolution. Yellow means gated; green means an enabled exact nominal target; red means an invalid or inexact target. Oscillator accuracy affects actual timing.", timTopic.content);
    const sysForm = element("form");
    sysForm.className = "clock-form clock-timing-targets";
    sysForm.setAttribute("aria-label", "SysTick interrupt target");
    sysForm.addEventListener("submit", (event) => event.preventDefault());
    sysTopic.panel.prepend(sysForm);
    control(sysForm, "systickPeriodMs", "SysTick target period (ms)");
    control(sysForm, "systickDivider", "SysTick source", [[1, "HCLK"], [8, "HCLK / 8"]]);
    gateControl(sysForm, "systickOn", "Enable SysTick counter and interrupt");
    element("p", "RELOAD is calculated automatically when the target or clock changes. Yellow means the counter is switched off; green means an enabled exact nominal target; red means an invalid or inexact target. Oscillator accuracy affects actual timing.", sysTopic.content);
    const rtcTopic = topics.get("rtc");
    const rtcForm = element("form");
    rtcForm.className = "clock-form clock-timing-targets";
    rtcForm.setAttribute("aria-label", "RTC counter target");
    rtcForm.addEventListener("submit", (event) => event.preventDefault());
    rtcTopic.panel.prepend(rtcForm);
    control(rtcForm, "rtcPeriodMs", "RTC target period (ms)");
    control(rtcForm, "rtcSource", "RTC source", [["none", "None"], ["lse", "LSE"], ["lsi", "LSI"], ["hse", "HSE / 128"]]);
    gateControl(rtcForm, "rtcOn", "Enable RTC clock");
    element("p", "Enable the selected oscillator under Oscillators and open the RTC gate to run the counter. The 20-bit prescaler PRL is calculated automatically. Each counter tick can generate an RTC second interrupt when SECIE is enabled. Yellow means gated; green means an enabled exact nominal target; red means an invalid or inexact target. Oscillator accuracy affects actual timing.", rtcTopic.content);
    const iwdgTopic = topics.get("iwdg");
    const iwdgForm = element("form");
    iwdgForm.className = "clock-form clock-timing-targets";
    iwdgForm.setAttribute("aria-label", "IWDG timeout target");
    iwdgForm.addEventListener("submit", (event) => event.preventDefault());
    iwdgTopic.panel.prepend(iwdgForm);
    control(iwdgForm, "iwdgPeriodMs", "IWDG target timeout (ms)");
    gateControl(iwdgForm, "iwdgOn", "Enable IWDG clock");
    element("p", "Enable LSI under Oscillators and enable IWDG here to run the watchdog in this calculator. These switches are independent. The prescaler PR and 12-bit reload RLR are calculated automatically. Timeout = (RLR + 1) / counter frequency. Expiry causes a reset, not an interrupt. Green means an exact nominal target; red means an invalid or inexact target. Actual timeout depends on LSI oscillator accuracy.", iwdgTopic.content);

    function clockTopic(name) {
      if (name === "RTCCLK" || name === "RTC counter") return "rtc";
      if (name.startsWith("TIM")) return "tim";
      if (name.startsWith("SysTick") || name === "HCLK / 8") return "systick";
      if (name === "ADCCLK") return "adc";
      if (name === "USBCLK") return "usb";
      if (name.startsWith("IWDG")) return "iwdg";
      if (name === "MCO") return "mco";
      return "system";
    }

    function metricContainer(topic, name) {
      return topic === "tim" ? timerMetrics.get(Number(name.match(/^TIM([1-4])/)[1])) : topics.get(topic).metrics;
    }

    function gateKey(name) {
      if (name.startsWith("TIM")) return `tim${name.match(/^TIM([1-4])/)[1]}On`;
      if (name === "ADCCLK") return "adcOn";
      if (name === "USBCLK") return "usbOn";
      if (name === "RTCCLK" || name.startsWith("RTC ")) return "rtcOn";
      if (name.startsWith("SysTick") && name !== "SysTick input") return "systickOn";
      if (name.startsWith("IWDG")) return "iwdgOn";
      return null;
    }
    function markGate(card, key, configuration) {
      if (!key) return;
      const gated = !configuration[key];
      card.dataset.gated = String(gated);
      if (gated) card.dataset.status = "Gated";
      element("span", gated ? "⏻ Gated — switch off" : "⏻ Enabled — switch on", card);
    }

    function frequency(hz) {
      if (hz === null) return "No clock";
      const scale = hz >= 1000000 ? 1000000 : hz >= 1000 ? 1000 : 1;
      return `${(hz / scale).toLocaleString(undefined, { maximumSignificantDigits: 8 })} ${scale === 1000000 ? "MHz" : scale === 1000 ? "kHz" : "Hz"}`;
    }
    function period(seconds) {
      if (seconds === null) return "No period";
      const [scale, unit] = seconds >= 1 ? [1, "s"] : seconds >= 0.001 ? [1000, "ms"] :
        seconds >= 0.000001 ? [1000000, "µs"] : [1000000000, "ns"];
      return `${(seconds * scale).toLocaleString(undefined, { maximumSignificantDigits: 8 })} ${unit}`;
    }
    function update() {
      const configuration = { iwdgDivider: model.defaults.iwdgDivider };
      for (const [key, input] of Object.entries(controls)) {
        configuration[key] = input.type === "checkbox" ? input.checked :
          typeof initialValues[key] === "number" ? (input.value === "" ? NaN : Number(input.value)) : input.value;
      }
      for (const { key, input } of gateSwitches) input.checked = configuration[key];
      // Keep the calculator's IWDG switch independent of the oscillator switch.
      const iwdgRunning = configuration.iwdgOn && configuration.lsiOn;
      const base = model.calculate({ ...configuration, iwdgOn: iwdgRunning,
        systickOn: false, systickReload: 0, rtcOn: false, rtcReload: 0 });
      const clockErrors = { errors: ["Correct the clock configuration before calculating timer targets."] };
      const iwdg = !configuration.lsiOn ? { errors: ["Enable LSI under Oscillators to calculate the IWDG timeout."] } :
        base.errors.length ? clockErrors : model.planIwdg(base.clocks.LSI.hz, configuration.iwdgPeriodMs);
      if (!iwdg.errors.length) configuration.iwdgDivider = iwdg.divider;
      const timerPlans = new Map(timers.map((timer) => [timer, base.errors.length ? clockErrors :
        model.planTimer(base.clocks[`TIM${timer}CLK`]?.hz, configuration[`tim${timer}PeriodMs`])]));
      const sys = base.errors.length ? clockErrors : model.planSysTick(base.clocks["SysTick input"]?.hz, configuration.systickPeriodMs);
      configuration.systickReload = sys.errors.length ? 0 : sys.reload;
      const rtcInputHz = configuration.rtcSource === "hse" ?
        (base.clocks.HSE.hz === null ? null : base.clocks.HSE.hz / 128) :
        base.clocks[configuration.rtcSource.toUpperCase()]?.hz;
      // RTC timing depends on its oscillator, not on SYSCLK, buses, Flash, or USB.
      const rtc = model.planRtc(rtcInputHz, configuration.rtcPeriodMs);
      configuration.rtcReload = rtc.errors.length ? 0 : rtc.reload;
      const result = model.calculate({ ...configuration, iwdgOn: iwdgRunning });
      const diagnostics = new Set(result.errors);
      flashInfo.textContent = result.flash;
      usbInfo.textContent = result.usb.includes("invalid") ?
        "USB requires 48 MHz from an HSE-derived PLL, with PCLK1 above 8 MHz." : result.usb;
      for (const topic of topics.values()) {
        topic.metrics.replaceChildren();
      }
      for (const metrics of timerMetrics.values()) metrics.replaceChildren();
      for (const [name, clock] of Object.entries(result.clocks)) {
        const key = gateKey(name);
        const clockStatus = key && configuration[key] && clock.hz === null ? "Unavailable" : clock.status;
        const card = element("div", undefined, metricContainer(clockTopic(name), name));
        card.className = "clock-metric";
        card.dataset.clock = name;
        card.dataset.status = clockStatus;
        element("dt", name, card);
        element("dd", frequency(clock.hz), card);
        if ("periodSeconds" in clock) {
          const label = name === "SysTick interrupt" ? "Interrupt period" : "Tick period";
          const interval = element("span", `${label}: ${period(clock.periodSeconds)}`, card);
          interval.className = "clock-period";
        }
        element("span", `Source: ${clock.source}`, card);
        element("span", key && !configuration[key] ? "Gated" : clockStatus, card);
        markGate(card, key, configuration);
      }
      const adcHz = result.clocks.ADCCLK.hz;
      const adcValid = Number.isFinite(adcHz) && adcHz > 0 && adcHz <= 14000000;
      if (configuration.adcOn && !adcValid) diagnostics.add(adcHz > 14000000 ?
        "ADC: ADCCLK exceeds the 14 MHz limit. Increase the ADC divider." :
        "ADC: ADCCLK is unavailable. Enable a valid system clock source.");
      for (const [selection, sampleCycles] of adcSampleCycles.entries()) {
        const card = element("div", undefined, adcTopic.metrics);
        card.className = "clock-metric";
        card.dataset.sample = selection.toString(2).padStart(3, "0");
        card.dataset.status = adcValid ? "Active" : "Error";
        element("dt", `${card.dataset.sample}: ${sampleCycles} sample cycles`, card);
        element("dd", adcValid ? period((sampleCycles + 12.5) / adcHz) : "No valid timing", card);
        element("span", "Total conversion time", card);
        if (adcValid) {
          element("span", `Sampling time: ${period(sampleCycles / adcHz)}`, card);
          element("span", `Conversion phase: ${period(12.5 / adcHz)} (12.5 cycles)`, card);
          element("span", `Total: ${sampleCycles + 12.5} cycles at ${frequency(adcHz)}`, card);
        }
        markGate(card, "adcOn", configuration);
      }
      function timingCard(topic, name, hz, status, lines) {
        const card = element("div", undefined, metricContainer(topic, name));
        card.className = "clock-metric";
        card.dataset.planned = "true";
        card.dataset.status = status;
        element("dt", name, card);
        element("dd", frequency(hz), card);
        for (const line of lines) element("span", line, card);
        markGate(card, gateKey(name), configuration);
      }
      const errorText = (plan) => plan.exact ? "Exact nominal period" :
        `Error: ${plan.errorPpm > 0 ? "+" : ""}${plan.errorPpm.toLocaleString(undefined, { maximumSignificantDigits: 6 })} ppm (parts per million)`;
      function reportPlan(name, plan, targetMs, enabled) {
        if (!enabled) return;
        for (const error of plan.errors) diagnostics.add(`${name}: ${error}`);
        if (!plan.errors.length && !plan.exact) diagnostics.add(
          `${name}: target ${period(targetMs / 1000)} cannot be met exactly. Closest period: ${period(plan.periodSeconds)}. ${errorText(plan)}.`);
      }
      for (const [timer, tim] of timerPlans) {
        reportPlan(`TIM${timer}`, tim, configuration[`tim${timer}PeriodMs`], configuration[`tim${timer}On`]);
        const valid = !tim.errors.length && tim.exact;
        const status = valid ? "Target met" : "Error";
        const input = controls[`tim${timer}PeriodMs`];
        input.setAttribute("aria-invalid", String(!valid));
        input.dataset.valid = String(valid);
        if (tim.errors.length) {
          timingCard("tim", `TIM${timer} target`, null, status, []);
          continue;
        }
        timingCard("tim", `TIM${timer} counter (planned)`, tim.counterHz, status,
          [`Source: TIM${timer}CLK / (PSC + 1)`, `PSC = ${tim.psc}`, `Tick period: ${period(tim.tickSeconds)}`, status]);
        timingCard("tim", `TIM${timer} update interrupt (planned)`, tim.hz, status,
          [`Source: ${frequency(tim.inputHz)} timer input`, `PSC = ${tim.psc}, ARR = ${tim.arr}`,
            `Target: ${period(configuration[`tim${timer}PeriodMs`] / 1000)}`, `Achieved: ${period(tim.periodSeconds)}`, status]);
      }
      const sysValid = !sys.errors.length && sys.exact;
      reportPlan("SysTick", sys, configuration.systickPeriodMs, configuration.systickOn);
      if (configuration.systickOn && sys.errors.some((error) => error.includes("hardware range"))) diagnostics.add(
        "SysTick: try HCLK / 8, a TIM timer, or a software counter for a longer target period.");
      const sysStatus = sysValid ? "Target met" : "Error";
      controls.systickPeriodMs.setAttribute("aria-invalid", String(!sysValid));
      controls.systickPeriodMs.dataset.valid = String(sysValid);
      if (sys.errors.length) {
        timingCard("systick", "SysTick target", null, sysStatus, []);
      } else {
        timingCard("systick", "SysTick counter (planned)", sys.inputHz, sysStatus,
          [`Source: HCLK / ${configuration.systickDivider}`, `Tick period: ${period(1 / sys.inputHz)}`, `RELOAD = ${sys.reload}`, sysStatus]);
        timingCard("systick", "SysTick interrupt (planned)", sys.hz, sysStatus,
          [`Source: HCLK / ${configuration.systickDivider} (${frequency(sys.inputHz)})`, `RELOAD = ${sys.reload}`,
            `Target: ${period(configuration.systickPeriodMs / 1000)}`, `Achieved: ${period(sys.periodSeconds)}`, sysStatus]);
      }
      const rtcValid = !rtc.errors.length && rtc.exact;
      reportPlan("RTC", rtc, configuration.rtcPeriodMs, configuration.rtcOn);
      const rtcStatus = rtcValid ? "Target met" : "Error";
      controls.rtcPeriodMs.setAttribute("aria-invalid", String(!rtcValid));
      controls.rtcPeriodMs.dataset.valid = String(rtcValid);
      if (rtc.errors.length) {
        timingCard("rtc", "RTC target", null, rtcStatus, []);
      } else {
        timingCard("rtc", "RTC counter / second interrupt (planned)", rtc.hz, rtcStatus,
          [`Source: ${frequency(rtc.inputHz)} RTCCLK / (PRL + 1)`, `PRL = ${rtc.reload}`,
            `Target: ${period(configuration.rtcPeriodMs / 1000)}`, `Achieved: ${period(rtc.periodSeconds)}`, rtcStatus]);
      }
      const iwdgValid = !iwdg.errors.length && iwdg.exact;
      reportPlan("IWDG", iwdg, configuration.iwdgPeriodMs, configuration.iwdgOn);
      const iwdgStatus = iwdgValid ? "Target met" : "Error";
      controls.iwdgPeriodMs.setAttribute("aria-invalid", String(!iwdgValid));
      controls.iwdgPeriodMs.dataset.valid = String(iwdgValid);
      if (iwdg.errors.length) {
        timingCard("iwdg", "IWDG timeout target", null, iwdgStatus, []);
      } else {
        timingCard("iwdg", "IWDG counter (planned)", iwdg.counterHz, iwdgStatus,
          [`Source: LSI / ${iwdg.divider}`, `PR = ${iwdg.pr} (divide by ${iwdg.divider})`,
            `Tick period: ${period(iwdg.tickSeconds)}`, iwdgStatus]);
        timingCard("iwdg", "IWDG timeout (planned)", iwdg.hz, iwdgStatus,
          [`PR = ${iwdg.pr}, RLR = ${iwdg.reload}`, `Target: ${period(configuration.iwdgPeriodMs / 1000)}`,
            `Achieved: ${period(iwdg.periodSeconds)}`, "Reset on expiry", iwdgStatus]);
      }
      status.textContent = diagnostics.size ? "Clock configuration or timing targets need attention." :
        "Configuration is within the checked clock limits; enabled timing targets are exact nominal matches.";
      summary.dataset.valid = String(diagnostics.size === 0);
      errors.replaceChildren();
      for (const diagnostic of diagnostics) element("li", diagnostic, errors);
      for (const topic of topics.values()) {
        topic.metrics.hidden = topic.metrics.children.length === 0;
      }
    }
    function setPreset(name) {
      const savedSysTickDivider = name !== "reset" ? controls.systickDivider.value : null;
      const savedRtcSource = name !== "reset" ? controls.rtcSource.value : null;
      for (const [key, value] of Object.entries({ ...model.presets[name], usbOn: false })) {
        if (!controls[key]) continue;
        if (controls[key].type === "checkbox") controls[key].checked = value;
        else controls[key].value = value;
      }
      if (name === "reset") {
        for (const [key, value] of Object.entries(model.timingDefaults)) {
          if (!controls[key]) continue;
          if (controls[key].type === "checkbox") controls[key].checked = value;
          else controls[key].value = value;
        }
        for (const timer of timers) controls[`tim${timer}PeriodMs`].value = initialValues[`tim${timer}PeriodMs`];
      }
      if (savedSysTickDivider !== null) controls.systickDivider.value = savedSysTickDivider;
      if (savedRtcSource !== null) controls.rtcSource.value = savedRtcSource;
      update();
    }
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    flashForm.addEventListener("input", update);
    flashForm.addEventListener("change", update);
    usbForm.addEventListener("input", update);
    usbForm.addEventListener("change", update);
    mcoForm.addEventListener("input", update);
    mcoForm.addEventListener("change", update);
    adcForm.addEventListener("input", update);
    adcForm.addEventListener("change", update);
    timForm.addEventListener("input", update);
    timForm.addEventListener("change", update);
    sysForm.addEventListener("input", update);
    sysForm.addEventListener("change", update);
    rtcForm.addEventListener("input", update);
    rtcForm.addEventListener("change", update);
    iwdgForm.addEventListener("input", update);
    iwdgForm.addEventListener("change", update);
    setPreset("reset");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
  // Material emits this event when instant navigation replaces the page.
  if (typeof document$ !== "undefined") document$.subscribe(initialize);
})();
