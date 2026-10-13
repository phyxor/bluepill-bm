// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

(function () {
  "use strict";
  function initialize() {
    const root = document.getElementById("low-power-dashboard");
    const model = globalThis.BluePillPower;
    if (!root || !model || root.dataset.initialized) return;
    root.dataset.initialized = "true";
    let config = model.defaults();
    let phase = "ready";
    let trace = [];
    let message = "Configure the experiment, then enter the selected mode.";
    const controls = {};
    const script = Array.from(document.scripts).find(s => /\/low-power-dashboard\.js(?:\?|$)/.test(s.src));
    const referenceBase = new URL("../../refs/", script ? script.src : location.href);
    function writeText(node, text) {
      // Render identifiers as inline code without interpreting text as HTML.
      const identifiers = /\b(?:(?:(?:SCB|RCC|PWR|AFIO|ADC\d*|EXTI|RTC|BKP)_[A-Z0-9_]+(?:\.[A-Z0-9_]+)?|PRIMASK|BASEPRI|FAULTMASK|SLEEPDEEP|SLEEPONEXIT|SEVONPEND|PDDS|LPDS|EWUP|WUF|SBF|DBP|ADON|ALRIE|ALRF|TICKINT|CWUF|CSBF|EXTI\d+|[A-Za-z0-9]+_(?:IRQHandler|IRQn|Handler)|SystemCoreClock|WFI|WFE|SEV)\b|__(?:DSB|WFI|WFE|SEV)\(\)|main\(\))/g;
      node.replaceChildren();
      let offset = 0;
      for (const match of text.matchAll(identifiers)) {
        node.append(document.createTextNode(text.slice(offset, match.index)));
        const code = document.createElement("code");
        code.textContent = match[0];
        node.append(code);
        offset = match.index + match[0].length;
      }
      node.append(document.createTextNode(text.slice(offset)));
    }
    function el(tag, text, parent, className) {
      const node = document.createElement(tag);
      if (text !== undefined) {
        if (["code", "pre", "option"].includes(tag)) node.textContent = text;
        else writeText(node, text);
      }
      if (className) node.className = className;
      if (parent) parent.append(node);
      return node;
    }
    function button(text, parent, action) {
      const node = el("button", text, parent);
      node.type = "button";
      node.addEventListener("click", action);
      return node;
    }
    function section(title, parent, className = "lp-panel") {
      const node = el("section", undefined, parent, className);
      el("h2", title, node);
      return node;
    }
    function ordered(items, parent) {
      const list = el("ol", undefined, parent);
      for (const item of items) el("li", item, list);
    }
    function reset() {
      phase = "ready";
      trace = [];
      message = "Configuration changed. Enter the mode to start a new trace.";
      render();
    }
    el("p", "STM32F103C8T6 · low-power teaching model", root, "lp-eyebrow");
    const layout = el("div", undefined, root, "lp-layout");
    const sidebar = el("aside", undefined, layout, "lp-controls lp-panel");
    el("h2", "Configure", sidebar);
    function select(key, caption, options) {
      const label = el("label", caption, sidebar, "lp-control");
      const input = el("select", undefined, label);
      input.id = `lp-${key}`;
      for (const [value, text] of options) el("option", text, input).value = value;
      input.value = config[key];
      controls[key] = input;
      input.addEventListener("change", () => { config = { ...config, [key]: input.value }; reset(); });
    }
    select("mode", "Low-power mode", Object.entries(model.modes).map(([key, mode]) => [key, mode.title]));
    const modeOptions = el("fieldset", undefined, sidebar, "lp-toggles");
    el("legend", "Mode options", modeOptions);
    select("instruction", "Entry instruction", [["WFI", "WFI · wait for interrupt"], ["WFE", "WFE · wait for event"]]);
    select("source", "Wake-up signal", Object.entries(model.sources).map(([key, source]) => [key, source.title]));
    select("profile", "Clock setup before entry", [["hsi", "HSI · 8 MHz"], ["pll", "HSE + PLL · 72 MHz"]]);
    select("rtcClock", "RTC clock", [["lse", "LSE · 32.768 kHz"], ["lsi", "LSI · about 40 kHz"], ["hse", "HSE / 128"], ["off", "RTC disabled"]]);
    const advanced = el("fieldset", undefined, sidebar, "lp-toggles");
    el("legend", "Interrupt and entry controls", advanced);
    function checkbox(key, caption, parent = advanced) {
      const label = el("label", undefined, parent, "lp-toggle");
      const input = el("input", undefined, label);
      input.type = "checkbox";
      input.id = `lp-${key}`;
      input.checked = config[key];
      controls[key] = input;
      el("span", caption, label);
      input.addEventListener("change", () => { config = { ...config, [key]: input.checked }; reset(); });
    }
    checkbox("sleepOnExit", "Sleep-on-exit · SLEEPONEXIT", modeOptions);
    checkbox("lowPowerRegulator", "Low-power regulator · LPDS", modeOptions);
    checkbox("nvic", "NVIC IRQ enabled");
    checkbox("primask", "PRIMASK = 1 · defer ISR");
    checkbox("sevonpend", "SEVONPEND = 1");
    checkbox("eventLatch", "Stale WFE event register = 1");
    checkbox("pendingEntry", "Stale pending wake request");
    const content = el("div", undefined, layout, "lp-content");
    const tabList = el("div", undefined, content, "lp-tabs");
    tabList.setAttribute("role", "tablist");
    tabList.setAttribute("aria-label", "Low-power dashboard sections");
    const tabs = [];
    function selectTab(index, focus = false) {
      tabs.forEach(({ tab, panel }, i) => {
        tab.setAttribute("aria-selected", String(i === index));
        tab.tabIndex = i === index ? 0 : -1;
        panel.hidden = i !== index;
      });
      if (focus) tabs[index].tab.focus();
    }
    function tabSection(title, caption) {
      const panel = section(title, content);
      const index = tabs.length;
      panel.id = `lp-panel-${index}`;
      panel.setAttribute("role", "tabpanel");
      panel.tabIndex = 0;
      const tab = button(caption, tabList, () => selectTab(index));
      tab.id = `lp-tab-${index}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panel.id);
      panel.setAttribute("aria-labelledby", tab.id);
      tabs.push({ tab, panel });
      tab.addEventListener("keydown", event => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        selectTab(next, true);
      });
      selectTab(0);
      return panel;
    }
    const overview = tabSection("What changes", "Overview");
    const heading = el("p", undefined, overview, "lp-mode-description");
    el("p", "Green: enabled / available / retained, or fast wake. Red: disabled / lost, or slow wake. Amber: an intermediate state or wake time. Wake speed is relative to the listed modes.", overview, "lp-help lp-color-legend");
    function wakeSpeed(mode) {
      return mode.deep === 0 ? "fast" : mode.pdds === 1 ? "slow" : "intermediate";
    }
    const metrics = el("div", undefined, overview, "lp-metrics");
    const metricValues = [];
    for (const caption of ["Memory in selected mode", "Typical wake-up latency", "Estimated MCU power · % of Run", "Restore system clock after wake-up"]) {
      const metric = el("div", undefined, metrics);
      el("span", caption, metric, "lp-help");
      metricValues.push(el("strong", undefined, metric));
    }
    const clockRestoreHint = el("span", undefined, metricValues[3].parentElement, "lp-help");
    el("h3", "Clocks in selected mode", overview);
    const clockMetrics = el("div", undefined, overview, "lp-metrics lp-clock-metrics");
    el("p", "Latency: datasheet typical at 8 MHz HSI, event to first instruction. It is not a route-specific estimate or a maximum.", overview, "lp-help");
    const powerHint = el("p", undefined, overview, "lp-help");
    const powerLink = el("a", "Power reference: DS5319 tables 16-18", overview, "lp-help");
    powerLink.href = `${new URL("stm32f103x8-datasheet.pdf", referenceBase)}#page=44`;
    const simulator = tabSection("Step through entry and wake-up", "Entry and wake-up");
    const route = el("p", undefined, simulator, "lp-route");
    const actions = el("div", undefined, simulator, "lp-actions");
    function log(title, detail) { trace.push([title, detail]); }
    const enter = button("1. Enter mode", actions, () => {
      const result = model.entry(config);
      trace = [];
      log(`Execute ${config.instruction}`, result.reason);
      if (config.instruction === "WFE" && config.eventLatch) {
        config = { ...config, eventLatch: false };
        controls.eventLatch.checked = false;
      }
      phase = result.sleeps ? "sleeping" : "skipped";
      message = result.reason;
      render();
    });
    const trigger = button("2. Trigger wake signal", actions, () => {
      const w = model.wake(config);
      log(model.sources[config.source].title, w.reason);
      if (!w.wakes) message = `Still in ${model.modes[config.mode].title}. ${w.reason}`;
      else if (w.reset) {
        phase = "reset";
        message = "Reset_Handler → startup → main(). No return to the old wait instruction.";
        log("Reset path", message);
      } else {
        phase = w.handler ? "handler" : "resumed";
        message = w.reason + (model.isStop(config) ? " SYSCLK is now HSI; the old bus prescalers remain." : "");
        log(w.handler ? "ISR entry" : "Code resumes", message);
      }
      render();
    });
    const next = button("3. Service / continue", actions, () => {
      const w = model.wake(config);
      if (["handler", "handlerRestored"].includes(phase) && config.sleepOnExit) {
        phase = "sleeping";
        message = "The handler clears its source. SLEEPONEXIT returns directly to sleep, using the selected depth. Main code does not resume.";
        if (model.isStop(config)) message += " With SLEEPDEEP = 1 and PDDS = 0, this enters Stop again.";
        log("Exception return → sleep", message);
      } else if (phase === "resumed" && w.deferred) {
        config = { ...config, primask: false };
        controls.primask.checked = false;
        phase = "handlerRestored";
        message = `Software restores needed clocks, then clears PRIMASK. The pending ${model.sources[config.source].handler} now runs.`;
        log("Deferred ISR entry", message);
      } else {
        phase = "complete";
        message = model.isStop(config) ? "The source is serviced, SLEEPDEEP is cleared, and software restores the selected clock setup. Normal code can continue." :
          "The source is serviced. Normal code continues after the wait instruction and rechecks the work condition.";
        log("Resume application", message);
      }
      render();
    });
    button("Reset trace", actions, reset);
    const result = el("p", undefined, simulator, "lp-result");
    result.setAttribute("role", "status");
    result.setAttribute("aria-live", "polite");
    const traceList = el("ol", undefined, simulator, "lp-trace");
    const wakePanel = tabSection("Wake-up sources at a glance", "Wake-up sources");
    const wakeHint = el("p", undefined, wakePanel, "lp-help");
    const wakeMetrics = el("div", undefined, wakePanel, "lp-wake-metrics");
    const clocksPanel = tabSection("Clock and state inventory", "Clocks and state");
    const inventoryHint = el("p", undefined, clocksPanel, "lp-help");
    const tableWrap = el("div", undefined, clocksPanel, "lp-table-wrap lp-clock-table");
    const table = el("table", undefined, tableWrap);
    const tableHead = el("tr", undefined, el("thead", undefined, table));
    for (const title of ["Clock / resource", "In selected mode", "Current trace"]) el("th", title, tableHead).scope = "col";
    const tableBody = el("tbody", undefined, table);
    const before = tabSection("Before entry", "Before entry");
    const after = tabSection("After wake-up", "After wake-up");
    const beforeList = el("div", undefined, before);
    const afterList = el("div", undefined, after);
    const bits = el("pre", undefined, before, "lp-registers");
    const registerText = el("code", undefined, bits);
    const comparison = tabSection("Compare modes", "Compare modes");
    const compareWrap = el("div", undefined, comparison, "lp-table-wrap lp-compare-table");
    const compareTable = el("table", undefined, compareWrap);
    const compareHead = el("tr", undefined, el("thead", undefined, compareTable));
    for (const title of ["Mode", "Sleep-on-exit (SLEEPONEXIT)", "Low-power regulator (LPDS)", "Main clocks", "RAM", "Wake path / return", "Typical µs"]) el("th", title, compareHead).scope = "col";
    const compareBody = el("tbody", undefined, compareTable);
    for (const c of model.comparisonConfigurations()) {
      const mode = model.settings(c);
      const row = el("tr", undefined, compareBody);
      el("th", mode.title, row).scope = "row";
      el("td", c.sleepOnExit ? "Enabled · WFI trace" : "Disabled", row).dataset.on = String(c.sleepOnExit);
      const regulator = el("td", c.mode === "standby" ? "Not used · regulator off" : c.mode === "sleep" ? "Not used · regulator on" : c.lowPowerRegulator ? "Enabled · regulator on" : "Disabled · regulator on", row);
      if (c.mode === "stop") regulator.dataset.on = String(c.lowPowerRegulator);
      else regulator.dataset.tone = "intermediate";
      const mainClocks = el("td", mode.deep === 0 ? "CPU stopped; others can run" : "HSI / HSE / PLL / buses stopped", row);
      mainClocks.dataset.tone = mode.deep === 0 ? "intermediate" : "negative";
      el("td", c.mode === "standby" ? "Lost" : "Retained", row).dataset.on = String(c.mode !== "standby");
      el("td", c.mode === "standby" ? "Wake → reset" : c.sleepOnExit ? `Interrupt → ISR → ${mode.title} again` : "WFI → ISR → code; WFE event → code", row);
      const speed = wakeSpeed(mode);
      el("td", `${mode.latency} · ${speed}`, row).dataset.speed = speed;
    }
    const sourceLine = el("p", undefined, comparison, "lp-help");
    el("span", "Primary sources: ", sourceLine);
    for (const [file, page, label] of [["stm32f103x8-reference.pdf", 72, "RM0008 §5.3"], ["stm32f103x8-datasheet.pdf", 56, "DS5319 table 26"], ["arm-cortex-m3-generic-user-guide.pdf", 44, "Cortex-M3 sleep rules"]]) {
      const link = el("a", label, sourceLine);
      link.href = `${new URL(file, referenceBase)}#page=${page}`;
      el("span", " · ", sourceLine);
    }
    function render() {
      config = { ...config,
        lowPowerRegulator: model.isStop(config) && config.lowPowerRegulator,
        sleepOnExit: config.mode !== "standby" && config.sleepOnExit };
      controls.lowPowerRegulator.disabled = !model.isStop(config);
      controls.lowPowerRegulator.checked = config.lowPowerRegulator;
      controls.lowPowerRegulator.parentElement.title = model.isStop(config) ? "" : "LPDS only affects Stop mode.";
      controls.sleepOnExit.disabled = config.mode === "standby";
      controls.sleepOnExit.checked = config.sleepOnExit;
      controls.sleepOnExit.parentElement.title = config.mode === "standby" ? "Standby wakes through reset, with no ISR return path." : "";
      const mode = model.settings(config);
      const selectedClocks = model.clocks(config, "sleeping");
      clockMetrics.replaceChildren();
      for (const [name, state, on] of selectedClocks.filter(([name]) => /^(HSI|HSE|PLL|AHB|LSE|LSI|RTC)\b/.test(name))) {
        const metric = el("div", undefined, clockMetrics);
        metric.dataset.on = String(on);
        el("span", name, metric, "lp-help");
        el("strong", `${on ? "✓ Enabled" : "✗ Disabled"}`, metric);
        el("span", state, metric, "lp-help");
      }
      const error = model.configurationError(config);
      controls.instruction.setAttribute("aria-invalid", String(config.sleepOnExit && config.instruction === "WFE" && config.mode !== "standby"));
      controls.lowPowerRegulator.setAttribute("aria-invalid", String(config.lowPowerRegulator && !model.isStop(config)));
      controls.sleepOnExit.setAttribute("aria-invalid", String(config.sleepOnExit && config.mode === "standby"));
      const w = model.wake(config);
      writeText(heading, mode.mechanism);
      metricValues[0].textContent = mode.retention;
      metricValues[0].parentElement.dataset.on = String(config.mode !== "standby");
      metricValues[1].parentElement.dataset.speed = wakeSpeed(mode);
      metricValues[1].textContent = `${mode.latency} µs typical · ${wakeSpeed(mode)}`;
      const power = model.powerEstimate(config);
      const rounded = value => String(Number(value.toPrecision(3)));
      metricValues[2].textContent = `≈ ${rounded(power.percent)}% of Run`;
      metricValues[2].parentElement.dataset.tone = "positive";
      const clockRestore = model.clockRestoration(config);
      writeText(metricValues[3], clockRestore.summary);
      metricValues[3].parentElement.dataset.tone = clockRestore.required ? "intermediate" : "positive";
      writeText(clockRestoreHint, clockRestore.detail);
      const current = power.currentMa < 1 ? `${rounded(power.currentMa * 1000)} µA` : `${rounded(power.currentMa)} mA`;
      writeText(powerHint, `Power reference for the selected mode: ${current} (≈ ${rounded(power.powerMw)} mW), compared with Run at ${power.runMa} mA (${config.profile === "pll" ? "72 MHz" : "HSI 8 MHz"}). Typical at 3.3 V / 25 °C, with peripherals disabled and RTC / IWDG off. Board loads and additional enabled sources are excluded. This is a reference estimate, not the current trace's measured power.`);
      writeText(route, `${error ? "Incorrect combination" : w.wakes ? "Wake route" : "No wake route"}: ${w.reason}`);
      route.dataset.wakes = String(w.wakes);
      writeText(result, error || message);
      enter.disabled = Boolean(error) || ["sleeping", "handler", "handlerRestored", "resumed"].includes(phase);
      trigger.disabled = phase !== "sleeping";
      next.disabled = !["handler", "handlerRestored", "resumed"].includes(phase);
      writeText(next, phase === "resumed" && w.deferred ? "3. Clear PRIMASK / enter ISR" : "3. Service / continue");
      controls.nvic.disabled = config.source === "systick" || !model.sources[config.source].irq || config.mode === "standby";
      controls.eventLatch.disabled = config.instruction !== "WFE";
      writeText(wakeHint, `${mode.title} · ${config.instruction} · SLEEPONEXIT = ${Number(config.sleepOnExit)} · NVIC IRQ: ${config.nvic ? "enabled" : "disabled"} · PRIMASK = ${Number(config.primask)} · SEVONPEND = ${Number(config.sevonpend)} · RTC clock: ${config.rtcClock.toUpperCase()}. Only the selected signal is configured. Other cards preview what happens if you select that configuration.`);
      wakeMetrics.replaceChildren();
      for (const source of model.wakeOverview(config)) {
        const outcome = source[config.instruction];
        const card = el("article", undefined, wakeMetrics, "lp-wake-metric");
        card.dataset.source = source.id;
        card.dataset.on = String(outcome.wakes);
        const label = el("h3", source.title, card);
        label.id = `lp-wake-${source.id}`;
        card.setAttribute("aria-labelledby", label.id);
        const selected = source.id === config.source;
        if (selected) card.setAttribute("aria-current", "true");
        el("span", selected ? "Selected configuration" : "Alternative · not configured", card, "lp-help");
        el("strong", error ? "Invalid configuration" : outcome.wakes ? "Valid wake source" : "Not valid", card, "lp-wake-status");
        const summary = !outcome.wakes ? "Cannot wake with these options" : outcome.reset ? "Wake → reset" :
          outcome.handler ? `Wake → ${outcome.handler}` : outcome.deferred ? "Wake → code · ISR deferred" : "Wake → code · no ISR";
        el("p", selected ? summary : `If configured: ${summary}`, card, "lp-wake-path");
      }
      traceList.replaceChildren();
      if (!trace.length) el("li", "No steps yet. Start with Enter mode.", traceList, "lp-help");
      for (const [title, detail] of trace) {
        const item = el("li", undefined, traceList);
        el("strong", title, item);
        el("span", detail, item);
      }
      const currentPhase = ["ready", "skipped", "complete"].includes(phase) ? "running" : phase;
      const currentClocks = model.clocks(config, currentPhase);
      inventoryHint.textContent = `Current trace: ${phase}. Only the selected clock preset and RTC / IWDG sources are enabled in this model.`;
      tableBody.replaceChildren();
      selectedClocks.forEach(([name, selected, on], index) => {
        const row = el("tr", undefined, tableBody);
        el("th", name, row).scope = "row";
        const selectedCell = el("td", selected, row);
        selectedCell.dataset.on = String(on);
        const cell = el("td", currentClocks[index][1], row);
        cell.dataset.on = String(currentClocks[index][2]);
      });
      beforeList.replaceChildren();
      afterList.replaceChildren();
      ordered(model.preparation(config), beforeList);
      ordered(w.wakes ? model.recovery(config, w) : [w.reason, "Choose a source that can wake this mode before testing on hardware."], afterList);
      registerText.textContent = `SCB_SCR.SLEEPDEEP  = ${mode.deep}\nPWR_CR.PDDS        = ${mode.pdds}${model.isSleep(config) ? " (ignored)" : ""}\nPWR_CR.LPDS        = ${Number(config.lowPowerRegulator)}${!model.isStop(config) ? " (ignored)" : ""}\nSCB_SCR.SLEEPONEXIT = ${Number(config.sleepOnExit)}${config.mode === "standby" ? " (no return after wake)" : ""}\nSCB_SCR.SEVONPEND   = ${Number(config.sevonpend)}\nPRIMASK            = ${Number(config.primask)}\n__DSB(); __${config.instruction}();`;
    }
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
  if (typeof document$ !== "undefined") document$.subscribe(initialize);
})();
