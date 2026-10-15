// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

(function () {
  "use strict";

  function initialize() {
    const container = document.getElementById("rtc-calibration-dashboard");
    if (!container || container.dataset.initialized) return;
    container.dataset.initialized = "true";
    const model = globalThis.BluePillRtcCalibration;
    const controls = {};
    const element = (tag, text, parent, className) => {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      if (parent) parent.append(node);
      return node;
    };
    const signed = (value, digits = 3) => {
      const rounded = Number(value.toFixed(digits));
      return (rounded > 0 ? "+" : "") + rounded.toFixed(digits);
    };
    const drift = (seconds) => `${signed(seconds)} s / 30 days`;
    const toolbar = element("div", undefined, container, "rtc-toolbar");
    function button(text, action) {
      const node = element("button", text, toolbar);
      node.type = "button";
      node.addEventListener("click", action);
    }
    button("Perfect reference", () => {
      controls.frequencyHz.value = model.referenceHz(Number(controls.divider.value), controls.method.value);
      update();
    });
    button("AN2604 frequency example", () => preset({ method: "table", frequencyHz: 511.982 }));
    button("AN2604 at 40 °C", () => preset({ method: "table", frequencyHz: 511.982, operatingTemperature: 40 }));
    button("Reset", () => preset({}));
    button("512 Hz / CAL 64 example", () => preset({ frequencyHz: 512 }));

    const layout = element("div", undefined, container, "rtc-layout");
    const form = element("form", undefined, layout, "rtc-form");
    form.addEventListener("submit", (event) => event.preventDefault());
    function fieldset(title) {
      const group = element("fieldset", undefined, form);
      element("legend", title, group);
      return group;
    }
    function control(parent, key, title, hint, options) {
      const label = element("label", undefined, parent, "rtc-control");
      element("span", title, label);
      const input = element(options ? "select" : "input", undefined, label);
      input.name = key;
      if (options) {
        for (const [value, text] of options) element("option", text, input).value = value;
      } else {
        input.type = "number";
        input.step = "any";
        if (key.endsWith("Temperature")) input.min = "-273.15";
        if (key === "frequencyHz") { input.min = "0"; input.step = "0.000001"; }
        if (key === "curvature") input.max = "0";
      }
      input.id = `rtc-cal-${key}`;
      const description = element("small", hint, label);
      description.id = `${input.id}-hint`;
      input.setAttribute("aria-describedby", description.id);
      controls[key] = input;
    }
    const measurement = fieldset("Frequency measurement");
    control(measurement, "frequencyHz", "Measured CCO frequency (Hz)", "Approximately 512 Hz, measured on PC13 before calibration.");
    control(measurement, "divider", "RTC divider", "The prescaler load register contains divider minus one.", [
      [32766, "32766 · AN2604 / current firmware"], [32768, "32768 · conventional divider"],
    ]);
    control(measurement, "method", "Calculation method", "Exact mode keeps full precision. Table mode reproduces the note's rounded lookup.", [
      ["exact", "Exact reference and pulse removal"], ["table", "AN2604 printed reference and table"],
    ]);
    const temperatures = fieldset("Temperature correction");
    control(temperatures, "measuredTemperature", "Measurement temperature (°C)", "Crystal temperature when the frequency was measured.");
    control(temperatures, "operatingTemperature", "Operating temperature (°C)", "Crystal temperature for the final calibration.");
    control(temperatures, "turnoverTemperature", "Turnover temperature T₀ (°C)", "Temperature of peak crystal frequency. AN2604 uses 25 °C ± 5 °C.");
    control(temperatures, "curvature", "Curvature K (ppm/°C²)", "AN2604 uses −0.040 for its evaluation-board crystal. Use your crystal's specification.");

    const results = element("section", undefined, layout, "rtc-results");
    results.setAttribute("aria-label", "Calibration results");
    const status = element("p", undefined, results, "rtc-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const reference = element("p", undefined, results, "rtc-reference");
    const metrics = {};
    function metric(parent, key, title, hint) {
      const card = element("div", undefined, parent, "rtc-metric");
      element("dt", title, card);
      const value = element("dd", undefined, card);
      value.dataset.metric = key;
      element("small", hint, card);
      metrics[key] = value;
    }
    element("h2", "At measurement temperature", results);
    const measured = element("dl", undefined, results, "rtc-metrics");
    metric(measured, "measuredPpm", "Frequency deviation", "Parts per million (ppm). Positive means the RTC runs fast.");
    metric(measured, "measuredRounded", "Rounded deviation", "Nearest whole ppm.");
    metric(measured, "measuredCal", "Base CAL value", "Calibration at the measurement temperature.");
    metric(measured, "measuredMonth", "Drift before calibration", "A month is exactly 30 days. Negative means lost time.");
    element("h2", "At operating temperature", results);
    const operating = element("dl", undefined, results, "rtc-metrics");
    metric(operating, "temperatureShift", "Temperature shift", "Relative to the measurement temperature.");
    metric(operating, "operatingPpm", "Predicted deviation", "Measured deviation plus the temperature shift.");
    metric(operating, "operatingRounded", "Rounded prediction", "Nearest whole ppm at the operating temperature.");
    metric(operating, "finalCal", "Final CAL value", "Best available setting in BKP_RTCCR.CAL[6:0].");
    metric(operating, "operatingMonth", "Drift before calibration", "Prediction at a constant operating temperature.");
    metric(operating, "residualPpm", "Remaining deviation", "Includes calibration step rounding and range limits.");
    metric(operating, "residualMonth", "Drift after calibration", "Prediction with the final CAL value applied.");
    metric(operating, "compensation", "Pulse-removal correction", "CAL × 0.953674316 ppm of the input clock.");
    const rangeLabel = element("label", "Final CAL position (0 to 127)", results, "rtc-range");
    const meter = element("meter", undefined, rangeLabel);
    meter.min = 0;
    meter.max = 127;
    const explanation = element("p", undefined, results, "rtc-reference");
    const code = element("code", undefined, element("pre", undefined, results, "rtc-code"));

    const pulseSection = element("section", undefined, container, "rtc-pulse-section");
    element("h2", "Pulse removal near the 2²⁰ boundary", pulseSection);
    element("p", "The waveform follows the final CAL recommendation at the operating temperature. The LSE never stops; only pulses reaching the RTC prescaler are omitted.", pulseSection, "rtc-reference");
    const timingMetrics = element("dl", undefined, pulseSection, "rtc-metrics");
    metric(timingMetrics, "correctionPeriod", "Time between correction cycles", "2²⁰ / LSE frequency. With CAL = 0, no correction occurs.");
    metric(timingMetrics, "countingDelay", "Total counting delay per cycle", "CAL / LSE frequency. This is not a whole-second stop.");
    metric(timingMetrics, "omittedPulses", "Omitted pulses per cycle", "Selected from the final CAL value, from 0 to 127.");
    metric(timingMetrics, "lsePulse", "One LSE clock period", "Time represented by each omitted pulse.");
    const figure = element("figure", undefined, pulseSection, "rtc-pulse-figure");
    const waveformScroll = element("div", undefined, figure, "rtc-waveform-scroll");
    waveformScroll.tabIndex = 0;
    waveformScroll.setAttribute("role", "region");
    waveformScroll.setAttribute("aria-label", "Pulse-removal waveform. Scroll horizontally to inspect all pulses.");
    const svgNamespace = "http://www.w3.org/2000/svg";
    function svgElement(tag, attributes, parent, text) {
      const node = document.createElementNS(svgNamespace, tag);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      if (text !== undefined) node.textContent = text;
      parent.append(node);
      return node;
    }
    const waveform = svgElement("svg", {
      viewBox: "0 0 840 332", role: "img", class: "rtc-waveform",
      "aria-labelledby": "rtc-cal-pulses-title rtc-cal-pulses-desc",
    }, waveformScroll);
    const waveformCaption = element("figcaption", undefined, figure);

    function drawWaveform(timing) {
      const calibration = timing.calibration;
      waveformScroll.hidden = false;
      metrics.correctionPeriod.textContent = `${timing.cycleSeconds.toFixed(6)} s`;
      metrics.countingDelay.textContent = `${timing.delaySeconds.toFixed(9)} s (${(timing.delaySeconds * 1000).toFixed(6)} ms)`;
      metrics.omittedPulses.textContent = `${calibration} ${calibration === 1 ? "pulse" : "pulses"}`;
      metrics.lsePulse.textContent = `${(timing.pulseSeconds * 1e6).toFixed(6)} µs`;
      waveform.replaceChildren();
      svgElement("title", { id: "rtc-cal-pulses-title" }, waveform, `RTC pulse removal with CAL ${calibration}`);
      svgElement("desc", { id: "rtc-cal-pulses-desc" }, waveform,
        `The LSE keeps oscillating while ${calibration} pulses per correction cycle are omitted from the RTC input, delaying prescaler progress by ${(timing.delaySeconds * 1000).toFixed(6)} milliseconds.`);

      // Group the pulse budget at the frame boundary for explanation, not as a hardware trace.
      const shownOmissions = Math.min(calibration, 6);
      const cells = 8 + shownOmissions;
      const start = 200, width = 600 / cells;
      const gapStart = start + 4 * width;
      const boundary = gapStart + shownOmissions * width;
      const text = (x, y, label, anchor = "start", className = "") =>
        svgElement("text", { x, y, "text-anchor": anchor, class: className }, waveform, label);
      if (calibration) {
        svgElement("rect", { x: gapStart, y: 64, width: boundary - gapStart, height: 236, class: "rtc-wave-omission" }, waveform);
        text(gapStart - 6, 28, "2²⁰ − CAL", "end");
        text(gapStart - 6, 48, `${timing.passedPulses.toLocaleString("en-US")} cycles`, "end", "rtc-wave-small");
        text((gapStart + boundary) / 2, 140, `${calibration} ${calibration === 1 ? "pulse" : "pulses"} omitted`, "middle", "rtc-wave-small");
      } else {
        text(start, 28, "CAL = 0: no pulses omitted");
      }
      svgElement("line", { x1: boundary, x2: boundary, y1: 60, y2: 306, class: "rtc-wave-boundary" }, waveform);
      text(boundary + 6, 28, "2²⁰ boundary");
      text(boundary + 6, 48, "1,048,576 → next cycle", "start", "rtc-wave-small");
      text(16, 96, "LSE clock");
      text(16, 114, "keeps running", "start", "rtc-wave-small");
      text(16, 180, "RTC clock input");
      text(16, 198, "after calibration", "start", "rtc-wave-small");
      text(16, 266, "Prescaler");
      text(16, 284, "count progress", "start", "rtc-wave-small");

      function squareWave(low, omit) {
        let path = `M ${start} ${low}`;
        for (let i = 0; i < cells; ++i) {
          const x = start + i * width;
          const suppressed = omit && i >= 4 && i < 4 + shownOmissions;
          if (!suppressed) path += ` V ${low - 24} H ${x + width / 2} V ${low}`;
          path += ` H ${x + width}`;
        }
        return path;
      }
      svgElement("path", { d: squareWave(104, false), class: "rtc-wave-line" }, waveform);
      svgElement("path", { d: squareWave(188, true), class: "rtc-wave-line rtc-wave-calibrated" }, waveform);
      let progress = 292, progressPath = `M ${start} ${progress}`;
      for (let i = 0; i < cells; ++i) {
        if (i < 4 || i >= 4 + shownOmissions) progressPath += ` V ${progress -= 6}`;
        progressPath += ` H ${start + (i + 1) * width}`;
      }
      svgElement("path", { d: progressPath, class: "rtc-wave-line" }, waveform);
      if (calibration > 6) {
        const middle = (gapStart + boundary) / 2;
        for (const y of [104, 188, 268]) {
          svgElement("rect", { x: middle - 10, y: y - 28, width: 20, height: 38, class: "rtc-wave-break-mask" }, waveform);
          svgElement("path", { d: `M ${middle - 8} ${y + 5} l 6 -10 M ${middle + 2} ${y + 5} l 6 -10`, class: "rtc-wave-line" }, waveform);
        }
      }
      text(start, 324, calibration > 6 ? "Broken time axis: omitted pulses are compressed." : "Local clock periods near the cycle boundary.", "start", "rtc-wave-small");
      waveformCaption.textContent = calibration
        ? `CAL ${calibration}: ${timing.passedPulses.toLocaleString("en-US")} pulses reach the prescaler per 1,048,576 LSE cycles at an estimated ${timing.lseHz.toFixed(6)} Hz. Omitted pulses are grouped here to illustrate their total delay; AN2604 does not specify their exact placement within the cycle.`
        : `CAL 0: every LSE pulse reaches the prescaler. The ${timing.cycleSeconds.toFixed(6)}-second calibration cycle has no omitted pulses and no counting delay.`;
    }

    function preset(values) {
      for (const [key, value] of Object.entries({ ...model.defaults, ...values })) controls[key].value = value;
      update();
    }
    function update() {
      const config = {};
      for (const [key, input] of Object.entries(controls)) {
        input.removeAttribute("aria-invalid");
        config[key] = key === "method" ? input.value : input.tagName === "SELECT" ? Number(input.value) : input.valueAsNumber;
      }
      const result = model.calculate(config);
      if (result.errors.length) {
        for (const error of result.errors) controls[error.field].setAttribute("aria-invalid", "true");
        status.textContent = result.errors.map((error) => error.message).join(" ");
        status.dataset.state = "invalid";
        for (const value of Object.values(metrics)) value.textContent = "Not available";
        reference.textContent = "Enter valid inputs to calculate calibration.";
        explanation.textContent = "";
        meter.hidden = true;
        code.textContent = "No calibration setting available.";
        waveformScroll.hidden = true;
        waveformCaption.textContent = "Enter valid inputs to display the pulse-removal waveform.";
        return;
      }
      const { measured: base, operating: final } = result;
      meter.hidden = false;
      meter.value = final.calibration;
      metrics.measuredPpm.textContent = `${signed(base.ppm)} ppm`;
      metrics.measuredRounded.textContent = `${signed(base.roundedPpm, 0)} ppm`;
      metrics.measuredCal.textContent = base.calibration;
      metrics.measuredMonth.textContent = drift(base.secondsPerMonth);
      metrics.temperatureShift.textContent = `${signed(result.temperatureShiftPpm)} ppm`;
      metrics.operatingPpm.textContent = `${signed(final.ppm)} ppm`;
      metrics.operatingRounded.textContent = `${signed(final.roundedPpm, 0)} ppm`;
      metrics.finalCal.textContent = final.calibration;
      metrics.operatingMonth.textContent = drift(final.secondsPerMonth);
      metrics.residualPpm.textContent = `${signed(final.residualPpm)} ppm`;
      metrics.residualMonth.textContent = drift(final.residualSecondsPerMonth);
      metrics.compensation.textContent = `${final.compensationPpm.toFixed(6)} ppm`;
      reference.textContent = `Reference ${result.referenceHz.toFixed(6)} Hz · inferred LSE ${result.crystalHz.toFixed(6)} Hz · RTC prescaler load ${result.reload}.`;
      status.dataset.state = final.status;
      status.textContent = final.status === "slow"
        ? "The RTC is slow at the operating temperature. CAL = 0 is the best available setting because calibration cannot add pulses."
        : final.status === "above-range"
          ? "The required correction exceeds CAL = 127. The remaining drift is shown below."
          : "The predicted deviation is within the calibration range. The remaining drift includes step rounding.";
      explanation.textContent = config.method === "table"
        ? "AN2604 table mode uses the printed reference (511.968 Hz for divider 32766), whole-ppm lookup, and approximate ppm subtraction."
        : "Exact mode uses divider / 64 as the reference and keeps the full deviation when choosing the closest pulse-removal setting.";
      code.textContent = `/* RTC divider ${config.divider}: prescaler load ${result.reload}. */\n#define RTC_CALIBRATION ${final.calibration}u\nrtc_calibration(RTC_CALIBRATION);`;
      drawWaveform(result.timing);
    }
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    preset({});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize);
  else initialize();
  if (typeof document$ !== "undefined") document$.subscribe(initialize);
})();
