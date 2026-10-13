// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

(function (root) {
  "use strict";
  // RM0008 Rev 21, sections 5.3 and 10.2.3; ARM DUI 0552A, section 2.5.
  // DS5319 Rev 20, table 26: typical event-to-first-instruction timings at HSI 8 MHz.
  const modes = {
    sleep: { title: "Sleep", deep: 0, pdds: 0, lpds: 0, latency: 1.8, retention: "SRAM and registers retained", regulator: "On", mechanism: "The CPU clock stops. Enabled peripherals and clock sources continue." },
    stop: { title: "Stop", deep: 1, pdds: 0, lpds: 0, latency: 3.6, retention: "SRAM and registers retained", regulator: "On", mechanism: "Main clocks stop. The normal regulator keeps SRAM and registers powered. Wake-up selects HSI as SYSCLK." },
    standby: { title: "Standby", deep: 1, pdds: 1, lpds: 0, latency: 50, retention: "SRAM and most registers lost", regulator: "Off", mechanism: "The 1.8 V domain powers off. Backup registers and RTC can survive." },
  };
  const sources = {
    extiIRQ: { title: "PA0 / EXTI0 interrupt", irq: true, exti: true, handler: "EXTI0_IRQHandler" },
    extiEvent: { title: "PA0 / EXTI0 event only", event: true, exti: true },
    extiBoth: { title: "PA0 / EXTI0 interrupt + event", irq: true, event: true, exti: true, handler: "EXTI0_IRQHandler" },
    rtcIRQ: { title: "RTC alarm interrupt (EXTI17)", rtc: true, exti: true, irq: true, handler: "RTCAlarm_IRQHandler" },
    rtcEvent: { title: "RTC alarm event (EXTI17)", rtc: true, exti: true, event: true },
    systick: { title: "SysTick interrupt", irq: true, handler: "SysTick_Handler" },
    pending: { title: "TIM2 interrupt / SEVONPEND", irq: true, handler: "TIM2_IRQHandler" },
    wkup: { title: "PA0 / WKUP rising edge (EWUP)", standby: true },
    nrst: { title: "NRST external reset", reset: true },
    iwdg: { title: "Started IWDG timeout / reset", reset: true },
  };
  function defaults() {
    return { mode: "sleep", instruction: "WFI", source: "extiIRQ", profile: "hsi", rtcClock: "lse", nvic: true,
      sleepOnExit: false, lowPowerRegulator: false, primask: false, sevonpend: false, eventLatch: false, pendingEntry: false };
  }
  function isSleep(c) { return modes[c.mode].deep === 0; }
  function isStop(c) { return c.mode === "stop"; }
  function settings(c) {
    const m = { ...modes[c.mode], sleepOnExit: Boolean(c.sleepOnExit && c.mode !== "standby") };
    if (isStop(c) && c.lowPowerRegulator) {
      m.lpds = 1;
      m.latency = 5.4;
      m.regulator = "Low-power";
      m.mechanism = "Main clocks stop. The regulator stays on in low-power mode, reducing consumption but increasing wake-up latency. Wake-up selects HSI as SYSCLK.";
    }
    if (m.sleepOnExit) m.mechanism += ` With SLEEPONEXIT = 1, the final interrupt handler return enters ${m.title} again instead of resuming main code. Sleep entered on exception return uses interrupt wake rules.`;
    return m;
  }
  function configurationError(c) {
    if (c.lowPowerRegulator && !isStop(c)) return "Low-power regulator is only used in Stop. PWR_CR.LPDS is ignored in Sleep and Standby. Clear this option to run the selected mode's trace.";
    if (c.sleepOnExit && c.mode === "standby") return "Sleep-on-exit has no useful continuation in Standby: the core powers off, and wake-up follows reset instead of returning from an ISR. Clear SLEEPONEXIT for this trace.";
    return c.sleepOnExit && c.instruction === "WFE" ?
      "Incorrect entry choice for this sleep-on-exit trace: select WFI. WFE can execute with SLEEPONEXIT set, but its initial event wait differs from the interrupt-based sleep entered on handler return (ARM §2.5.2)." : null;
  }
  function comparisonConfigurations() {
    const result = [];
    for (const mode of Object.keys(modes)) {
      for (const lowPowerRegulator of mode === "stop" ? [false, true] : [false]) {
        for (const sleepOnExit of mode === "standby" ? [false] : [false, true]) {
          result.push({ ...defaults(), mode, lowPowerRegulator, sleepOnExit });
        }
      }
    }
    return result;
  }
  function rtcRuns(c) { return c.rtcClock !== "off" && (isSleep(c) || c.rtcClock !== "hse"); }
  function wake(c) {
    const s = sources[c.source];
    const instruction = c.instruction;
    const no = reason => ({ wakes: false, handler: null, reset: false, deferred: false, reason });
    const error = configurationError(c);
    if (error) return no(error);
    if (s.reset) return { wakes: true, handler: null, reset: true, deferred: false,
      reason: `${s.title} follows the reset path, not an interrupt handler.` };
    if (s.rtc && !rtcRuns(c)) return no("The RTC has no running clock in this mode. Select LSE or LSI for Stop or Standby.");
    if (c.mode === "standby") {
      if (s.standby || s.rtc) return { wakes: true, handler: null, reset: true, deferred: false,
        reason: "Standby wake-up fetches the reset vector. The old instruction and interrupt context are lost." };
      return no("Standby needs EWUP on PA0, an RTC alarm, NRST, or an IWDG reset. Ordinary EXTI and SysTick do not wake it.");
    }
    if (s.standby) return no("EWUP is the Standby wake-up path. Configure PA0 as EXTI0 for Sleep or Stop.");
    if (isStop(c) && !s.exti) return no("This clocked source stops in Stop mode. Use an EXTI line or an RTC alarm through EXTI17.");
    const enabled = c.source === "systick" || c.nvic;
    const serviceable = Boolean(s.irq && enabled && !c.primask);
    const directEvent = Boolean(s.event && instruction === "WFE");
    const pendingEvent = Boolean(s.irq && c.sevonpend && instruction === "WFE" && !c.pendingEntry);
    const wakes = instruction === "WFI" ? Boolean(s.irq && enabled) : directEvent || pendingEvent || serviceable;
    if (!wakes && instruction === "WFE" && c.pendingEntry && c.sevonpend && s.irq) return no("The IRQ is already pending. SEVONPEND needs a new not-pending to pending transition, so another request does not produce a new event.");
    if (!wakes) return no(instruction === "WFI" ? "WFI / Sleep-on-exit needs an enabled interrupt. An event-only EXTI line does not wake it." :
      "WFE needs an EXTI event, a serviceable interrupt, or a new pending interrupt with SEVONPEND = 1.");
    return { wakes: true, reset: false, handler: serviceable ? s.handler : null,
      deferred: Boolean(s.irq && enabled && c.primask),
      reason: serviceable ? c.sleepOnExit ? `The CPU enters ${s.handler}. With SLEEPONEXIT = 1, the final handler return sleeps again instead of resuming main code.` :
        `The CPU enters ${s.handler} before returning to the instruction after ${instruction}.` :
        c.primask && s.irq && enabled ? "The CPU resumes after the wait instruction. PRIMASK holds the interrupt pending until software clears PRIMASK." :
        pendingEvent && s.irq ? "A new pending interrupt creates an event. No handler runs while its NVIC IRQ is disabled." :
        "The EXTI event resumes code after WFE. An event-only route does not request an interrupt handler." };
  }
  function entry(c) {
    const error = configurationError(c);
    if (error) return { sleeps: false, reason: error };
    const instruction = c.instruction;
    if (instruction === "WFE" && c.eventLatch) return { sleeps: false, reason: "The event register was 1. WFE clears it and returns immediately. No low-power mode was entered." };
    const s = sources[c.source];
    const irqEnabled = s.irq && (c.source === "systick" || c.nvic);
    if (c.pendingEntry && (!isSleep(c) || irqEnabled && (instruction === "WFI" || !c.primask))) return { sleeps: false,
      reason: "A stale pending wake request prevents entry. Handle real work and clear stale source / EXTI / NVIC flags before retrying." };
    return { sleeps: true, reason: `The CPU executes ${instruction} and enters ${modes[c.mode].title}.` };
  }
  function clocks(c, phase = "sleeping") {
    const low = phase === "sleeping";
    const reset = phase === "reset";
    const hsiWake = isStop(c) && ["handler", "resumed", "resleep"].includes(phase);
    const pll = c.profile === "pll" && !reset && !hsiWake;
    const highOff = low && !isSleep(c);
    const bus = highOff ? "Stopped" : pll ? "HCLK 72 / PCLK1 36 / PCLK2 72 MHz" : hsiWake && c.profile === "pll" ?
      "HCLK 8 / PCLK1 4 / PCLK2 8 MHz" : "HCLK / PCLK1 / PCLK2 8 MHz";
    const rtcOn = low ? rtcRuns(c) : c.rtcClock !== "off" && (!(reset || hsiWake) || c.rtcClock !== "hse");
    return [
      ["CPU", low ? c.mode === "standby" ? "Powered off" : "Clock stopped" : "Running", !low],
      ["HSI · internal 8 MHz", highOff ? "Off" : "On", !highOff],
      ["HSE · external 8 MHz", !highOff && (pll || c.rtcClock === "hse" && !hsiWake && !reset) ? "On" : "Off", !highOff && (pll || c.rtcClock === "hse" && !hsiWake && !reset)],
      ["PLL · clock multiplier", !highOff && pll ? "On · 72 MHz" : "Off", !highOff && pll],
      ["AHB / APB buses", bus, !highOff],
      ["SysTick / TIM / USART", highOff ? "Stopped" : "Can run if enabled", !highOff],
      ["LSE · external 32.768 kHz", c.rtcClock === "lse" ? "On" : "Off in this scenario", c.rtcClock === "lse"],
      ["LSI · internal ~40 kHz", c.rtcClock === "lsi" || c.source === "iwdg" ? "On" : "Off in this scenario", c.rtcClock === "lsi" || c.source === "iwdg"],
      ["RTC · real-time clock", rtcOn ? `Running · ${c.rtcClock.toUpperCase()}${c.rtcClock === "hse" ? " / 128" : ""}` : "Stopped / disabled", rtcOn],
      ["SRAM / main registers", low && c.mode === "standby" ? "Lost" : reset ? "Reinitialized by startup" : "Retained", !(low && c.mode === "standby")],
      ["GPIO outputs", low && c.mode === "standby" ? "High impedance (WKUP / NRST / TAMPER exceptions)" : reset ? "Reset state, then app configuration" : "States retained", !(low && c.mode === "standby")],
      ["Backup domain", "Powered · RTC / backup registers retained", true],
    ];
  }
  function preparation(c) {
    const s = sources[c.source];
    const m = settings(c);
    const instruction = c.instruction;
    const error = configurationError(c);
    if (error) return [error];
    const steps = ["Finish transfers. Check for work before sleeping. Put unused GPIOs and the PC13 LED in low-current states."];
    if (!isSleep(c)) steps.push("Enable RCC_APB1ENR.PWREN before accessing PWR. Disable the ADC (ADC_CR2.ADON = 0) if it is not needed.");
    if (s.exti && c.mode !== "standby") {
      if (!s.rtc) steps.push("Enable AFIO / GPIOA clocks. Configure PA0 input and AFIO_EXTICR1.EXTI0 = PA0.");
      steps.push(`Select the EXTI${s.rtc ? "17" : "0"} rising edge in EXTI_RTSR. Set EXTI_IMR = ${Number(Boolean(s.irq))} and EXTI_EMR = ${Number(Boolean(s.event))} for this line.`);
      if (s.irq) steps.push(`${c.nvic ? "Enable" : "Disable"} ${s.rtc ? "RTCAlarm_IRQn" : "EXTI0_IRQn"} in the NVIC. Set its priority before enabling it.`);
    }
    if (s.rtc) steps.push("Enable RCC_APB1ENR.PWREN and RCC_APB1ENR.BKPEN before accessing the backup domain. Enable backup writes (PWR_CR.DBP). Select and start an RTC clock, synchronize the RTC, set a future alarm, clear RTC_CRL.ALRF, and set RTC_CRH.ALRIE. Use LSE or LSI for deep sleep.");
    if (c.source === "systick") steps.push("Configure SysTick and TICKINT. SysTick can wake Sleep, but stops in Stop and Standby. Disable it if periodic wakes are unwanted.");
    if (c.source === "pending") steps.push(`Configure TIM2 and its interrupt source. ${c.nvic ? "Enable" : "Disable"} TIM2_IRQn. SEVONPEND can signal a new pending IRQ even with its NVIC enable clear.`);
    if (c.source === "iwdg") steps.push("Start and refresh the independent watchdog before entry. Its LSI clock continues in deep sleep. A timeout resets the MCU.");
    if (c.mode === "standby") steps.push("Save needed state in backup registers or flash. Do not rely on SRAM. Enable PWR_CSR.EWUP for PA0 wake and keep PA0 low before entry, or arm an RTC alarm. EXTI17 is not required for a Standby alarm.");
    if (isStop(c)) steps.push("Handle real pending work first. Clear all stale peripheral flags, EXTI_PR bits (write 1), NVIC pending bits, and the RTC alarm flag before Stop entry.");
    if (c.mode === "standby") steps.push("Clear stale wake requests, then write PWR_CR.CWUF = 1 to clear WUF just before entry.");
    steps.push(`Set SCB_SCR.SLEEPDEEP = ${m.deep}; ${m.deep ? `PWR_CR.PDDS = ${m.pdds}; PWR_CR.LPDS = ${m.lpds}; ` : ""}SCB_SCR.SLEEPONEXIT = ${Number(Boolean(m.sleepOnExit))}; SCB_SCR.SEVONPEND = ${Number(c.sevonpend)}.`);
    if (m.sleepOnExit) steps.push("Put interrupt-driven work in the handlers. SLEEPONEXIT sleeps on the final exception return to Thread mode. Clear it inside a handler when main code needs to run again.");
    steps.push(`PRIMASK = ${Number(c.primask)}. This model starts in Thread mode with BASEPRI = 0 and FAULTMASK = 0.`);
    if (instruction === "WFE") steps.push("The event register must be 0 to sleep. SEV; WFE can drain a stale event before the final WFE. Recheck the work condition so a real wake is not discarded.");
    steps.push(`Complete memory / peripheral writes with __DSB(), then execute __${instruction}(). Pending requests can make the wait return immediately.`);
    return steps;
  }
  function recovery(c, w = wake(c)) {
    if (w.reset) return ["Reset_Handler runs startup and then main(). The old stack and SRAM context are not restored.",
      "Enable PWR access and read PWR_CSR.SBF / WUF plus RCC_CSR reset flags before clearing them. Write PWR_CR.CSBF / CWUF to clear Standby / wake flags.",
      "Restore GPIOs, peripherals, and the system clock. The RTC and backup registers can retain saved state."];
    const steps = [];
    if (w.handler) steps.push(`Enter ${w.handler}. Test and clear the source flag. Clear EXTI_PR by writing 1 for an interrupt route; clear RTC_CRL.ALRF for an RTC alarm.`);
    else steps.push(w.deferred ? "Resume after the wait with the IRQ pending. Restore needed clocks before clearing PRIMASK, then the handler can run." :
      c.sevonpend && sources[c.source].irq ? "Resume after WFE. Service the source and clear its peripheral flag and NVIC pending bit before waiting for a new pending transition." :
      "Resume after WFE. An event-only EXTI line does not set its interrupt pending bit; no ISR acknowledgement is needed for that line.");
    if (isStop(c)) steps.push(c.sleepOnExit ?
      "HSI is SYSCLK immediately on wake. Bus prescalers remain unchanged. Restore HSE / PLL inside the ISR if its work needs them, then update SystemCoreClock and timing-sensitive peripherals. This trace keeps HSI for the ISR and enters Stop again on return." :
      "HSI is SYSCLK immediately on wake. Bus prescalers remain unchanged. Restore HSE / PLL and wait for ready flags if needed. Update SystemCoreClock and timing-sensitive peripherals.");
    steps.push(c.sleepOnExit && w.handler ? "SLEEPONEXIT = 1: the final exception return sleeps again instead of returning to main. Clear SLEEPONEXIT inside a handler to resume main code." :
      "Clear SLEEPDEEP before later ordinary Sleep waits. Return to the instruction after WFI / WFE, then recheck the work condition.");
    return steps;
  }
  function powerEstimate(c) {
    // DS5319 Rev 20, tables 16-18: typical MCU currents at 3.3 V, 25 °C.
    // Use the all-peripherals-disabled reference, without RTC / IWDG loads.
    const runMa = c.profile === "pll" ? 27 : 4;
    const currentMa = isSleep(c) ? c.profile === "pll" ? 5.5 : 0.6 :
      isStop(c) ? c.lowPowerRegulator ? 0.014 : 0.024 : 0.002;
    return { runMa, currentMa, powerMw: 3.3 * currentMa, percent: 100 * currentMa / runMa };
  }
  function clockRestoration(c) {
    // RM0008 §5.3.4: Stop wakes on HSI; §5.3.5: Standby follows reset.
    const reset = c.mode === "standby" || Boolean(sources[c.source].reset);
    if (isSleep(c) && !reset) return { required: false, summary: "No · clock setup preserved",
      detail: "Sleep stops the CPU clock without changing SYSCLK or its bus dividers." };
    if (c.profile === "hsi") return { required: false, summary: "No · HSI 8 MHz is the default",
      detail: reset ? "Reset starts on HSI 8 MHz. Peripherals still need startup configuration." :
        "Stop wakes on HSI 8 MHz, which matches the selected preset. Bus dividers are retained." };
    return { required: true, summary: "Yes · restore HSE / PLL 72 MHz",
      detail: reset ? "Reset starts on HSI. Configure HSE, PLL, bus dividers, and Flash timing during startup to restore the selected preset." :
        c.sleepOnExit ? "Stop wakes on HSI. Restore clocks inside the ISR if needed, or before unmasking its pending interrupt; normal code does not resume on handler return." :
        "Stop wakes on HSI with bus dividers retained. Restart HSE / PLL and switch SYSCLK back to the selected preset." };
  }
  function wakeOverview(c) {
    return Object.entries(sources).map(([id, source]) => ({ id, title: source.title,
      WFI: wake({ ...c, source: id, instruction: "WFI" }),
      WFE: wake({ ...c, source: id, instruction: "WFE" }) }));
  }
  const api = { modes, sources, defaults, isSleep, isStop, settings, configurationError, comparisonConfigurations, rtcRuns, wake, wakeOverview, entry, clocks, preparation, recovery, powerEstimate, clockRestoration };
  root.BluePillPower = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
