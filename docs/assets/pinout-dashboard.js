// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

(function () {
  "use strict";
  function initialize() {
    const container = document.getElementById("pinout-dashboard");
    if (!container || container.dataset.initialized) return;
    container.dataset.initialized = "true";
    const model = globalThis.BluePillPinout;
    let state = model.defaults();
    let selected = "PA4";
    const controls = [];
    function writeText(node, text) {
      node.replaceChildren();
      // Build inline code nodes without interpreting the text as HTML.
      const identifiers = /\b(?:(?:RCC|AFIO|GPIO[A-D]|PWR|BKP|SPI[12x]|USART[123x]|TIM[1234x])_[A-Z0-9_]+(?:\.[A-Z0-9_]+)?|(?:CNF|MODE)\d*(?:\[\d+:\d+\])?|ODR\d+|(?:USART[123]|SPI[12]|I2C[12]|TIM[1-4]|ADC[12]|ADC12)(?:_[A-Z0-9_]+)?|GPIO[A-D]|P[ABCD]\d+|CRL|CRH|SSM|SSI|PWREN|BKPEN|AFIOEN|USBEN|HSERDY|LSERDY|PLLRDY|ADCCLK)(?:\s*=\s*[01]+)?(?![A-Za-z0-9_])/g;
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
    function html(tag, text, parent, className) {
      const node = document.createElement(tag);
      if (text !== undefined) {
        if (tag === "code" || tag === "option") node.textContent = text;
        else writeText(node, text);
      }
      if (className) node.className = className;
      if (parent) parent.append(node);
      return node;
    }
    html("p", "Select peripherals to reserve pins. Click a pin for its assignments and alternate functions. These controls plan pin use; they do not configure the board.", container);
    const legend = html("p", "○ Available · ● Occupied · ! Conflict · ■ Fixed connection", container, "pinout-legend");
    legend.setAttribute("aria-label", "Pin state legend");
    const summary = html("div", undefined, container, "pinout-summary");
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");
    const layout = html("div", undefined, container, "pinout-layout");
    const drawing = html("div", undefined, layout, "pinout-drawing");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 1200 1120");
    svg.setAttribute("aria-labelledby", "pinout-svg-title pinout-svg-description");
    drawing.append(svg);
    function shape(tag, attrs, text, parent = svg) {
      const node = document.createElementNS(svg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      if (text !== undefined) node.textContent = text;
      parent.append(node);
      return node;
    }
    shape("title", { id: "pinout-svg-title" }, "Interactive Blue Pill pinout");
    shape("desc", { id: "pinout-svg-description" }, "USB at the top, SWD at the bottom. Both 20-pin headers follow the reference image. Numbers are MCU package pins, not header positions.");
    shape("text", { x: 600, y: 28, "text-anchor": "middle", class: "pinout-title" }, "BLUE PILL · STM32F103C8T6");
    shape("rect", { x: 470, y: 120, width: 260, height: 740, rx: 14, class: "pinout-board" });
    shape("rect", { x: 555, y: 96, width: 90, height: 65, rx: 6, class: "pinout-metal" });
    shape("text", { x: 600, y: 139, "text-anchor": "middle" }, "USB");
    shape("rect", { x: 562, y: 215, width: 76, height: 70, rx: 5, class: "pinout-metal" });
    shape("circle", { cx: 600, cy: 250, r: 22, class: "pinout-chip" });
    shape("text", { x: 600, y: 309, "text-anchor": "middle", class: "pinout-board-text" }, "RESET");
    shape("rect", { x: 530, y: 405, width: 140, height: 140, rx: 4, transform: "rotate(45 600 475)", class: "pinout-chip" });
    shape("text", { x: 600, y: 470, "text-anchor": "middle", class: "pinout-board-text" }, "STM32F103");
    shape("text", { x: 600, y: 496, "text-anchor": "middle", class: "pinout-board-text" }, "C8T6 · LQFP48");
    shape("rect", { x: 550, y: 630, width: 100, height: 40, rx: 16, class: "pinout-metal" });
    shape("text", { x: 600, y: 658, "text-anchor": "middle" }, "8 MHz");
    shape("rect", { x: 565, y: 715, width: 70, height: 28, rx: 8, class: "pinout-metal" });
    shape("text", { x: 600, y: 774, "text-anchor": "middle", class: "pinout-board-text" }, "32.768 kHz");
    shape("circle", { cx: 665, cy: 817, r: 9, class: "pinout-led" });
    shape("text", { x: 600, y: 827, "text-anchor": "middle", class: "pinout-board-text" }, "PC13 LED");
    const pinNodes = [];
    function pin(pin, x, y, side, position) {
      const cap = model.capabilities(pin);
      const group = shape("g", { class: "pinout-pin", tabindex: "0", role: "button" });
      const title = shape("title", {}, "", group);
      shape("line", { x1: side === "left" ? 462 : side === "right" ? 738 : x,
        y1: y, x2: x, y2: y, class: "pinout-wire" }, undefined, group);
      shape("rect", { x, y: y - 13, width: 78, height: 25, rx: 3, class: "pinout-pin-box" }, undefined, group);
      const caption = shape("text", { x: x + 39, y: y + 5, "text-anchor": "middle" }, pin, group);
      const number = model.packagePins[pin];
      if (number) shape("text", { x: side === "left" ? 489 : side === "right" ? 711 : x + 39,
        y: side === "left" || side === "right" ? y + 5 : y + 31,
        "text-anchor": "middle", class: "pinout-number" }, String(number), group);
      const labelX = side === "left" ? x - 12 : side === "right" ? 840 : x;
      const badges = cap.gpio ? `${cap.ft ? "◆" : "◇"}${cap.pwm ? " · ⊓" : ""}${cap.warning ? " · ⚠ Limited drive" : ""}` : "";
      const line = shape("text", { x: labelX, y: side === "bottom" || side === "top" ? y + 53 : y + 5,
        "text-anchor": side === "left" ? "end" : "start" }, undefined, group);
      const badge = shape("tspan", { dx: side === "left" ? 8 : 0, class: "pinout-badge" }, badges, line);
      const signals = shape("tspan", { dx: side === "left" ? 0 : 8, class: "pinout-signals" }, "", line);
      if (side === "left") line.append(signals, badge);
      function choose() { selected = pin; update(); }
      group.addEventListener("click", choose);
      group.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(); }
      });
      pinNodes.push({ pin, group, title, caption, line, signals, badge, badges, position, cap });
    }
    const left = ["PB12", "PB13", "PB14", "PB15", "PA8", "PA9", "PA10", "PA11", "PA12", "PA15", "PB3", "PB4", "PB5", "PB6", "PB7", "PB8", "PB9", "5V", "GND", "3V3"];
    const right = ["GND", "GND", "3V3", "NRST", "PB11", "PB10", "PB1", "PB0", "PA7", "PA6", "PA5", "PA4", "PA3", "PA2", "PA1", "PA0", "PC15", "PC14", "PC13", "VBAT"];
    left.forEach((p, i) => pin(p, 370, 165 + i * 35, "left", `Left header, position ${i + 1} from USB`));
    right.forEach((p, i) => pin(p, 755, 165 + i * 35, "right", `Right header, position ${i + 1} from USB`));
    pin("PB2", 225, 66, "top", "BOOT1 jumper signal");
    pin("BOOT0", 835, 66, "top", "BOOT0 jumper signal");
    shape("text", { x: 600, y: 74, "text-anchor": "middle", class: "pinout-badge" }, "BOOT jumpers · GND / signal / 3V3");
    pin("PA13", 425, 915, "bottom", "SWD connector: SWDIO");
    pin("PA14", 680, 915, "bottom", "SWD connector: SWCLK");
    shape("text", { x: 600, y: 890, "text-anchor": "middle", class: "pinout-badge" }, "SWD: 3V3 · SWDIO · SWCLK · GND");
    shape("text", { x: 600, y: 1035, "text-anchor": "middle", class: "pinout-badge" }, "Numbers = LQFP48 package pins · PD0/PD1 connect to the onboard HSE crystal");
    shape("text", { x: 600, y: 1065, "text-anchor": "middle", class: "pinout-badge" }, "Voltage legend: ◆ 5 V-tolerant digital input · ◇ Not 5 V-tolerant");
    shape("text", { x: 600, y: 1095, "text-anchor": "middle", class: "pinout-badge" }, "PWM legend: ⊓ Timer PWM output available · May require remapping");
    const info = html("section", undefined, container, "pinout-info");
    info.setAttribute("aria-label", "Selected pin details");
    const configuration = html("section", undefined, container, "pinout-configuration");
    configuration.setAttribute("aria-label", "Selected pin configuration summary");
    html("h2", "Configuration summary", configuration);
    html("p", "Required clock enables and GPIO register settings for the current selections. MODE sets the GPIO output drive limit, not the peripheral clock frequency. CNF selects the input or output type.", configuration);
    const settings = html("div", undefined, configuration, "pinout-configuration-settings");
    const settingControls = [];
    for (const [key, caption, options] of [
      ["outputSpeed", "GPIO output drive limit", [["2", "2 MHz"], ["10", "10 MHz"], ["50", "50 MHz"]]],
      ["adc", "ADC instance for selected channels", [["ADC1", "ADC1"], ["ADC2", "ADC2"], ["Both", "ADC1 and ADC2"]]],
    ]) {
      const label = html("label", caption, settings);
      const input = html("select", undefined, label);
      input.name = key;
      for (const [value, text] of options) html("option", text, input).value = value;
      settingControls.push({ key, input });
      input.addEventListener("change", () => { state.settings[key] = input.value; update(); });
    }
    html("p", "Output drive limits: MODE=10 for 2 MHz, MODE=01 for 10 MHz, MODE=11 for 50 MHz.", configuration);
    const configurationResults = html("div", undefined, configuration);
    const form = html("form", undefined, layout, "pinout-controls");
    form.setAttribute("aria-label", "Peripheral toggles");
    form.tabIndex = 0;
    const toolbar = html("div", undefined, form, "pinout-toolbar");
    const reset = html("button", "Reset selections", toolbar);
    reset.type = "button";
    html("h3", "Peripheral toggles", form);
    form.addEventListener("submit", event => event.preventDefault());
    for (const category of [...new Set(model.peripherals.map(p => p.group))]) {
      const section = html("details", undefined, form);
      html("summary", category, section);
      const grid = html("div", undefined, section, "pinout-control-grid");
      for (const p of model.peripherals.filter(p => p.group === category)) {
        const field = html("fieldset", undefined, grid);
        html("legend", p.id, field);
        function toggle(signal) {
          const label = html("label", undefined, field);
          const input = html("input", undefined, label);
          input.type = "checkbox";
          if (!signal) input.setAttribute("role", "switch");
          const caption = html("span", signal ? `${signal}${p.optional[signal] ? " (optional)" : ""}` : `Enable ${p.id}`, label);
          if (signal && p.optional[signal]) label.title = p.optional[signal];
          controls.push({ input, p, signal, caption });
          input.addEventListener("change", () => {
            if (signal) state[p.id].signals[signal] = input.checked;
            else state[p.id].enabled = input.checked;
            update();
          });
        }
        toggle();
        if (Object.keys(p.maps).length) {
          const label = html("label", "Pin mapping ", field);
          const input = html("select", undefined, label);
          for (const mapping of ["Default", ...Object.keys(p.maps)]) html("option", mapping, input).value = mapping;
          controls.push({ input, p, mapping: true });
          input.addEventListener("change", () => { state[p.id].mapping = input.value; update(); });
        }
        function operationControl(key, caption, options) {
          const label = html("label", caption, field);
          const input = html("select", undefined, label);
          input.name = `${p.id}-${key}`;
          for (const [value, text] of options) html("option", text, input).value = value;
          controls.push({ input, p, setting: key });
          input.addEventListener("change", () => { state[p.id][key] = input.value; update(); });
        }
        if (p.roles.length) operationControl("role", p.group === "Timers" ? "Main channels" : "Operation", p.roles);
        if (p.group === "SPI") operationControl("nss", "Master NSS", [["output", "Hardware output"], ["input", "Hardware input"]]);
        if (p.signals.length > 1) p.signals.forEach(([signal]) => toggle(signal));
      }
    }
    reset.addEventListener("click", () => { state = model.defaults(); update(); });
    function renderConfiguration() {
      const plan = model.configurationSummary(state);
      configurationResults.replaceChildren();
      for (const c of settingControls) c.input.value = state.settings[c.key];
      if (plan.errors.length) html("p", "Resolve the reported conflicts before applying these settings. Red rows are conflicting requests, not a usable GPIO configuration.", configurationResults, "pinout-configuration-conflict");
      html("h3", "Clocks to enable", configurationResults);
      function table(headers) {
        const wrapper = html("div", undefined, configurationResults, "pinout-table-scroll");
        const node = html("table", undefined, wrapper);
        const head = html("tr", undefined, html("thead", undefined, node));
        for (const caption of headers) html("th", caption, head).scope = "col";
        return html("tbody", undefined, node);
      }
      const clockRows = table(["Clock / target", "Bus", "Enable bit (set to 1)", "Required for"]);
      for (const clock of plan.clocks) {
        const row = html("tr", undefined, clockRows);
        row.dataset.clock = `${clock.register}.${clock.bit}`;
        html("td", /^IOP[A-D]EN$/.test(clock.bit) ? `GPIO${clock.bit[3]}` : clock.bit.replace(/EN$|ON$/, ""), row);
        html("td", clock.bus, row);
        html("code", `${clock.register}.${clock.bit}`, html("td", undefined, row));
        html("td", clock.reasons.join(", "), row);
      }
      if (!plan.clocks.length) html("p", "No clock enables are required by the current selections.", configurationResults);
      html("h3", "GPIO ports to enable", configurationResults);
      const ports = html("div", undefined, configurationResults, "pinout-port-list");
      for (const port of plan.ports) {
        const card = html("div", undefined, ports);
        card.dataset.port = port.port;
        html("strong", port.port, card);
        html("code", `RCC_APB2ENR.IOP${port.port.at(-1)}EN = 1`, card);
        html("span", port.pins.join(", "), card);
      }
      if (!plan.ports.length) html("p", "No GPIO port clocks are needed. Hardware-controlled pins do not require GPIO register writes.", ports);
      html("h3", "GPIO CNF and MODE", configurationResults);
      html("p", "Values are binary. CNF/MODE apply to each pin’s four-bit CRL/CRH field. A dash means hardware controls the pin. PC13 output is limited to 2 MHz.", configurationResults);
      const gpioRows = table(["Pin", "Selected signal", "GPIO register / field", "CNF[1:0]", "MODE[1:0]", "Configuration", "Notes"]);
      const gpioPins = plan.rows.filter(pin => !["LSE", "HSE", "Debug"].includes(pin.peripheral));
      for (const pin of gpioPins) {
        const row = html("tr", undefined, gpioRows);
        row.dataset.pin = pin.pin;
        row.dataset.signal = pin.signal;
        row.classList.toggle("pinout-configuration-conflict", pin.conflict);
        html("td", pin.pin, row);
        html("td", `${pin.signal}${pin.optional ? " (optional)" : ""}`, row);
        const register = html("td", undefined, row);
        html("code", pin.register || "—", register);
        if (pin.register) html("small", `CNF: bits ${pin.shift + 3}:${pin.shift + 2}; MODE: bits ${pin.shift + 1}:${pin.shift}`, register);
        html("code", pin.conflict ? "—" : pin.cnf || "—", html("td", undefined, row));
        html("code", pin.conflict ? "—" : pin.mode || "—", html("td", undefined, row));
        html("td", `${pin.conflict ? "Conflict: " : ""}${pin.configuration}`, row);
        html("td", `${pin.conflict ? `Requested CNF=${pin.cnf || "—"}, MODE=${pin.mode || "—"}. ` : ""}${pin.notes}`, row);
      }
      if (!gpioPins.length) html("p", "No GPIO configuration entries for the current selections.", configurationResults);
      if (plan.remaps.length) {
        html("h3", "AFIO routing", configurationResults);
        const list = html("ul", undefined, configurationResults);
        for (const remap of plan.remaps) html("code", remap, html("li", undefined, list));
      }
      if (plan.notes.length) {
        html("h3", "Clock and setup notes", configurationResults);
        const list = html("ul", undefined, configurationResults);
        for (const note of plan.notes) html("li", note, list);
      }
    }
    function update() {
      const result = model.assignments(state);
      summary.replaceChildren();
      summary.classList.toggle("has-conflicts", result.errors.length > 0);
      html("strong", `${Object.keys(result.pins).length} occupied pins · ${result.errors.length} conflicts`, summary);
      if (result.errors.length) {
        const list = html("ul", undefined, summary);
        result.errors.forEach(error => html("li", error.message, list));
      } else html("p", "No conflicts in the selected pin assignments.", summary);
      for (const node of pinNodes) {
        const owners = result.pins[node.pin] || [];
        const status = owners.length > 1 ? "conflict" : owners.length ? "occupied" : node.cap.gpio ? "available" : "fixed";
        node.group.dataset.state = status;
        node.group.classList.toggle("is-selected", selected === node.pin);
        node.caption.textContent = `${status === "conflict" ? "! " : status === "occupied" ? "● " : ""}${node.pin}`;
        const labels = owners.map(o => `${o.label}${o.optional ? " (optional)" : ""}`);
        node.signals.replaceChildren();
        owners.forEach((owner, index) => {
          if (index) node.signals.append(document.createTextNode(" + "));
          const color = status === "conflict" && !owner.optional ? "#a00d20"
            : owner.label.startsWith("ADC") ? "#147218"
            : owner.label.startsWith("USART") ? "#00748e"
            : owner.label.startsWith("SPI") ? "#6040a4"
            : owner.label.startsWith("TIM") ? "#a13b49" : "#152434";
          const signal = shape("tspan", {}, labels[index], node.signals);
          signal.style.fill = color;
          if (owner.optional) signal.style.fontWeight = "normal";
        });
        if (!node.cap.gpio) node.signals.textContent = "";
        node.badge.textContent = owners.some(o => o.peripheral.startsWith("ADC channel")) ? `${node.badges} · Analog input: 0–VDDA` : node.badges;
        const tolerance = node.cap.gpio ? `${node.cap.ft ? "5 V-tolerant digital input" : "Not 5 V-tolerant"}. ` : "";
        const optionalNotes = owners.filter(o => o.optional).map(o => `${o.label}: ${o.optional}`).join(" ");
        const description = `${node.pin}, ${node.position}, ${status}. ${tolerance}${node.cap.pwm ? "PWM available. " : ""}${labels.join(", ")}${optionalNotes ? `. ${optionalNotes}` : ""}${node.cap.warning ? ". Maximum 2 MHz output, 30 pF load. Do not use as a current source." : ""}`;
        node.title.textContent = description;
        node.group.setAttribute("aria-label", description);
        // Keep badges and active signals together within the label column.
        node.line.removeAttribute("textLength");
        if (node.line.getComputedTextLength() > 310) {
          node.line.setAttribute("textLength", "310");
          node.line.setAttribute("lengthAdjust", "spacingAndGlyphs");
        }
      }
      info.replaceChildren();
      const cap = model.capabilities(selected);
      const locations = pinNodes.filter(n => n.pin === selected).map(n => n.position);
      html("h3", `${selected}${model.packagePins[selected] ? ` · package pin ${model.packagePins[selected]}` : ""}`, info);
      html("p", locations.join("; "), info);
      const owners = result.pins[selected] || [];
      html("p", `Assignments: ${owners.length ? owners.map(o => `${o.label}${o.optional ? " (optional)" : ""}`).join(" + ") : "none"}.`, info);
      for (const owner of owners.filter(o => o.optional)) html("p", `${owner.label}: ${owner.optional}`, info);
      html("p", `Functions: ${model.functions(selected).join(", ") || "fixed supply / control connection"}.`, info);
      if (cap.gpio) html("p", `${cap.ft ? "5 V-tolerant digital input" : "Not 5 V-tolerant"}. Analog inputs must remain between 0 V and VDDA. ${cap.pwm ? "PWM is available through a timer channel; some mappings require remapping and releasing debug pins." : "No timer PWM output on this pin."}`, info);
      if (cap.warning) html("p", "⚠ PC13–PC15: maximum output speed 2 MHz, maximum load 30 pF. Do not use these pins as current sources. PC13 also connects to the active-low board LED.", info);
      for (const c of controls) {
        if (c.mapping) c.input.value = state[c.p.id].mapping;
        else if (c.setting) c.input.value = state[c.p.id][c.setting];
        else c.input.checked = c.signal ? state[c.p.id].signals[c.signal] : state[c.p.id].enabled;
        const map = c.p.maps[state[c.p.id].mapping] || {};
        const routed = !c.signal || (Object.hasOwn(map, c.signal) ? map[c.signal] : c.p.signals.find(([signal]) => signal === c.signal)[1]);
        c.input.disabled = Boolean((c.mapping || c.signal || c.setting) && !state[c.p.id].enabled || !routed
          || c.setting === "nss" && (state[c.p.id].role !== "master" || !state[c.p.id].signals.NSS));
        if (c.signal) {
          c.caption.replaceChildren();
          html("code", c.signal, c.caption);
          c.caption.append(document.createTextNode(`${c.p.optional[c.signal] ? " (optional)" : ""}${routed ? "" : " (not routed)"}`));
        }
      }
      renderConfiguration();
    }
    update();
  }
  if (typeof document$ !== "undefined") document$.subscribe(initialize);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
})();
