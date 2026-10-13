// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

(function () {
  "use strict";
  // Resolve from the asset URL so both directory and flat MkDocs URLs work.
  const referenceBase = new URL("../../refs/", document.currentScript.src);

  function initialize() {
    const container = document.getElementById("interrupt-explorer");
    const model = globalThis.BluePillInterrupts;
    if (!container || !model || container.dataset.initialized) return;
    container.dataset.initialized = "true";
    let selected = model.events.find(event => event.id === "USART1:RXNE");
    let state = model.defaults();

    function element(tag, text, parent, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      if (parent) parent.append(node);
      return node;
    }
    function button(text, parent, action) {
      const node = element("button", text, parent);
      node.type = "button";
      node.addEventListener("click", action);
      return node;
    }
    function list(items, parent, ordered = false) {
      const node = element(ordered ? "ol" : "ul", undefined, parent);
      for (const text of items) element("li", text, node);
      return node;
    }
    function codes(items, parent) {
      for (const text of items) element("code", text, parent);
    }
    function nvicReference(functionName, irq, register, parent) {
      const reference = element("div", undefined, parent, "irq-nvic-reference");
      element("code", `${functionName}(${irq})`, reference);
      element("code", register, reference, "irq-register-reference");
    }

    const intro = element("div", undefined, container, "irq-intro");
    element("p", "STM32F103C8T6 · 43 peripheral IRQ vectors", intro, "irq-target");
    element("p", "Choose a peripheral and an event. Follow its interrupt route and response steps.", intro);
    const layout = element("div", undefined, container, "irq-layout");
    const browser = element("aside", undefined, layout, "irq-browser");
    browser.setAttribute("aria-label", "Find an interrupt event");
    const peripheralLabel = element("label", "Peripheral", browser, "irq-control");
    const peripheral = element("select", undefined, peripheralLabel);
    element("option", "All peripherals", peripheral).value = "";
    for (const name of [...new Set(model.events.map(e => e.peripheral))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      element("option", name, peripheral).value = name;
    }
    peripheral.value = "USART1";
    const searchLabel = element("label", "Find an event, flag, or ISR", browser, "irq-control");
    const search = element("input", undefined, searchLabel);
    search.type = "search";
    search.placeholder = "RXNE, overflow, EXTI…";
    const count = element("p", undefined, browser, "irq-count");
    count.setAttribute("aria-live", "polite");
    const eventList = element("div", undefined, browser, "irq-event-list");
    const content = element("div", undefined, layout, "irq-content");
    const detail = element("section", undefined, content, "irq-detail");
    detail.setAttribute("aria-label", "Selected event and response");
    const simulator = element("section", undefined, content, "irq-simulator");
    element("h2", "Try the interrupt workflow", simulator);
    element("p", "This is a learning model, not live hardware. It follows one event with the peripheral already configured.", simulator, "irq-help");
    element("p", "Priority values use all four bits for preemption. Subpriority and instruction timing are outside this model.", simulator, "irq-help");
    const controls = element("fieldset", undefined, simulator, "irq-sim-controls");
    element("legend", "Delivery controls", controls);
    const inputs = {};
    function checkbox(key, text) {
      const label = element("label", undefined, controls, "irq-toggle");
      const input = element("input", undefined, label);
      input.type = "checkbox";
      inputs[key] = input;
      element("span", text, label);
      input.addEventListener("change", () => configure(key, input.checked));
      return label;
    }
    const sourceLabel = checkbox("sourceEnabled", "Peripheral source enabled");
    const nvicLabel = checkbox("nvicEnabled", "NVIC IRQ enabled");
    checkbox("primask", "PRIMASK blocks configurable interrupts");
    checkbox("faultmask", "FAULTMASK blocks all except NMI");
    function prioritySelect(key, caption, first) {
      const label = element("label", caption, controls, "irq-control");
      const input = element("select", undefined, label);
      inputs[key] = input;
      if (first) element("option", first, input).value = "none";
      for (let n = key === "basepri" ? 1 : 0; n <= 15; n++) element("option", String(n), input).value = n;
      input.addEventListener("change", () => configure(key, input.value === "none" ? (key === "basepri" ? 0 : null) : Number(input.value)));
    }
    prioritySelect("priority", "This IRQ priority (0 is highest)");
    prioritySelect("basepri", "BASEPRI threshold (CMSIS value)", "No threshold");
    prioritySelect("currentPriority", "Other active ISR priority", "Thread mode, no active ISR");
    const controlNote = element("p", undefined, simulator, "irq-help");
    const actions = element("div", undefined, simulator, "irq-actions");
    const actionButtons = {};
    for (const [action, text] of [
      ["trigger", "1. Trigger event"], ["enter", "2. Enter ISR"],
      ["service", "3. Service and clear"], ["return", "4. Return"],
      ["clearPending", "Clear pending only"],
    ]) actionButtons[action] = button(text, actions, () => {
      state = model.transition(selected, state, action);
      renderSimulation();
    });
    button("Reset lesson", actions, () => { state = model.defaults(); renderSimulation(); });
    const result = element("p", undefined, simulator, "irq-result");
    result.setAttribute("role", "status");
    const flow = element("ol", undefined, simulator, "irq-flow");
    flow.setAttribute("aria-label", "Interrupt workflow states");
    const stages = [];
    for (const title of ["Event", "Status flag", "Source", "Pending", "Delivery", "ISR active", "Service", "Return"]) {
      const item = element("li", undefined, flow);
      element("span", title, item, "irq-stage-title");
      stages.push({ item, value: element("span", undefined, item, "irq-stage-value") });
    }
    const stateRegisters = element("p", undefined, simulator, "irq-state-registers");
    const simulationNote = element("p", undefined, simulator, "irq-help");

    function configure(key, value) {
      state = model.transition(selected, state, "configure", { [key]: value });
      renderSimulation();
    }
    function select(event) {
      if (selected?.id !== event?.id) state = model.defaults();
      selected = event;
      renderDetail();
      renderSimulation();
    }
    function renderList() {
      const found = model.search(peripheral.value, search.value);
      count.textContent = `${found.length} event${found.length === 1 ? "" : "s"}`;
      if (!found.some(e => e.id === selected?.id)) select(found[0] || null);
      eventList.replaceChildren();
      for (const event of found) {
        const item = button("", eventList, () => {
          select(event);
          for (const node of eventList.children) node.setAttribute("aria-pressed", String(node.dataset.event === event.id));
        });
        item.className = "irq-event";
        item.dataset.event = event.id;
        item.setAttribute("aria-pressed", String(selected?.id === event.id));
        element("span", `${event.peripheral} · ${event.title}`, item, "irq-event-title");
        element("code", event.flags[0], item);
        element("span", event.route ? `IRQ ${event.route.irq} · ${event.route.handler}` : "Reset only · no ISR", item, "irq-event-route");
      }
      if (!found.length) element("p", "No matching events. Change the peripheral or search text.", eventList);
    }

    function renderDetail() {
      detail.replaceChildren();
      if (!selected) {
        element("h2", "No event selected", detail);
        return;
      }
      const event = selected;
      element("p", event.peripheral, detail, "irq-eyebrow");
      element("h2", event.title, detail);
      element("p", event.condition, detail);
      const route = element("div", undefined, detail, "irq-route");
      if (event.route) {
        element("span", `IRQ ${event.route.irq} · Vector ${event.route.vector}`, route);
        element("code", event.route.name, route);
        element("span", "ISR handler to implement", route, "irq-handler-label");
        element("code", `void ${event.route.handler}(void)`, route, "irq-handler");
        element("p", "Define this function in your app or driver. It overrides the weak default handler in system/startup_stm32f103.c.", detail, "irq-help");
      } else {
        element("span", "No IRQ or ISR. The timeout causes a reset.", route);
        element("code", "Reset_Handler", route, "irq-handler");
      }
      const registers = element("dl", undefined, detail, "irq-registers");
      element("dt", "Status to test", registers);
      codes(event.flags, element("dd", undefined, registers));
      element("dt", "Source controls", registers);
      codes(event.enables, element("dd", undefined, registers));
      if (event.route?.irq >= 0) {
        const n = event.route.irq;
        const bank = Math.floor(n / 32);
        const bit = n % 32;
        element("dt", "NVIC delivery", registers);
        const delivery = element("dd", undefined, registers);
        nvicReference("NVIC_EnableIRQ", event.route.name, `NVIC->ISER[${bank}], bit ${bit}`, delivery);
        element("dt", "Pending / active", registers);
        const irqState = element("dd", undefined, registers);
        nvicReference("NVIC_GetPendingIRQ", event.route.name, `NVIC->ISPR[${bank}], bit ${bit}`, irqState);
        nvicReference("NVIC_GetActive", event.route.name, `NVIC->IABR[${bank}], bit ${bit}`, irqState);
      }
      if (event.route?.irq === -14) element("p", "NMI bypasses NVIC enable bits and processor interrupt masks.", detail, "irq-help");
      const setup = [...event.setup];
      if (event.route) setup.push("Clear stale event flags, then set the listed source controls. An OR expression gives alternative enable paths.");
      if (event.route?.irq >= 0) setup.push(`Set the IRQ priority, then enable ${event.route.name} in the NVIC.`);
      if (setup.length) {
        element("h3", "Before enabling", detail);
        list(setup, detail, true);
      }
      element("h3", "Respond to this event", detail);
      list(event.route ? ["Test the event status and its source enable fields.", ...event.service,
        "Service other enabled sources on this vector, then return."] : event.service, detail, true);
      if (event.notes.length) list(event.notes, detail);
      element("p", "Enable fields normally use 1 to enable and 0 to disable. Follow exceptions noted above.", detail, "irq-help");
      const reference = element("a", event.reference.label, detail, "irq-reference");
      reference.href = event.reference.url || `${new URL(event.reference.file, referenceBase)}#page=${event.reference.page}`;
      reference.target = "_blank";
      reference.rel = "noopener";
      if (event.route) {
        const related = model.events.filter(e => e.route?.irq === event.route.irq && e.id !== event.id);
        const other = element("details", undefined, detail, "irq-related");
        element("summary", `${related.length} other events on this vector`, other);
        const links = element("div", undefined, other, "irq-related-list");
        for (const sibling of related) button(`${sibling.peripheral}: ${sibling.title}`, links, () => {
          peripheral.value = sibling.peripheral;
          search.value = "";
          select(sibling);
          renderList();
        });
        if (!related.length) element("p", "No other catalog events use this vector.", links);
        if ([19, 20, 21, 22].includes(event.route.irq)) element("p", "CAN ISR names in this project omit the vendor name's digit 1. Use the exact ISR name shown above.", detail, "irq-help");
      }
      element("p", "Handler names match system/startup_stm32f103.c. Device IRQ names match the STM32F103xB CMSIS header.", detail, "irq-help");
    }

    function renderSimulation() {
      simulator.hidden = !selected?.route;
      if (!selected?.route) return;
      const nmi = selected.route.irq === -14;
      const core = selected.route.irq < 0;
      for (const [key, input] of Object.entries(inputs)) {
        if (input.type === "checkbox") input.checked = state[key];
        else input.value = key === "currentPriority" && state[key] === null || key === "basepri" && state[key] === 0 ? "none" : String(state[key]);
        input.disabled = nmi && key !== "sourceEnabled" || core && key === "nvicEnabled" || selected.peripheral === "WWDG" && key === "sourceEnabled";
      }
      nvicLabel.hidden = core;
      sourceLabel.lastChild.textContent = core ? "Peripheral interrupt source enabled" : "Peripheral source enabled";
      controlNote.textContent = nmi ? "NMI ignores the delivery masks and configurable priorities." :
        selected.peripheral === "WWDG" ? "EWI cannot be disabled after it is set. Only the NVIC control can block its delivery." :
        "BASEPRI selects an urgency threshold here. The actual register uses the selected value shifted left by four bits.";
      const reason = model.blocked(selected, state);
      actionButtons.enter.disabled = Boolean(reason);
      actionButtons.service.disabled = !state.active;
      actionButtons.return.disabled = !state.active;
      actionButtons.clearPending.disabled = !state.pending || nmi;
      result.textContent = reason || `Ready to enter ${selected.route.handler}.`;
      if (state.returned && !state.pending) result.textContent = "The ISR returned. The processor resumes the interrupted code.";
      result.dataset.ready = String(!reason);
      const values = [
        [state.flag || state.serviced, state.flag || state.serviced ? "Produced" : "Not produced"],
        [state.flag, state.flag ? "Set" : "Clear"],
        [state.sourceEnabled, state.sourceEnabled ? "Enabled" : "Disabled"],
        [state.pending, state.pending ? "Waiting" : "Clear"],
        [!reason, state.active ? "Entered" : reason ? "Waiting" : "Allowed"],
        [state.active, state.active ? "Active" : "Inactive"],
        [state.serviced, state.serviced ? "Handled and cleared" : "Not serviced"],
        [state.returned, state.returned ? "Returned" : "Not returned"],
      ];
      for (let i = 0; i < stages.length; i++) {
        stages[i].item.dataset.on = String(values[i][0]);
        stages[i].value.textContent = values[i][1];
      }
      stateRegisters.textContent = `Status flag: ${Number(state.flag)} · Pending: ${Number(state.pending)} · Active: ${Number(state.active)}`;
      simulationNote.textContent = selected.request === "pulse" ?
        "SysTick requests service on a counter wrap. An uncleared COUNTFLAG alone does not request another interrupt." :
        "If you return without removing the source, it can request service again. Clearing NVIC pending alone leaves the source unchanged.";
      if (state.pending && state.active) simulationNote.textContent += " An interrupt can be active and pending at the same time.";
    }
    peripheral.addEventListener("change", renderList);
    search.addEventListener("input", renderList);
    renderDetail();
    renderSimulation();
    renderList();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
  if (typeof document$ !== "undefined") document$.subscribe(initialize);
})();
