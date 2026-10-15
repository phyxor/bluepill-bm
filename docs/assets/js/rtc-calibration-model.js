// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

/* AN2604 sections 1-3. Frequencies are in Hz and temperatures in degrees Celsius. */
(function (root) {
  "use strict";

  const cycleLength = 2 ** 20;
  const stepPpm = 1e6 / cycleLength;
  const monthSeconds = 30 * 24 * 60 * 60;
  const defaults = Object.freeze({
    frequencyHz: 32766 / 64,
    divider: 32766,
    method: "exact",
    measuredTemperature: 25,
    operatingTemperature: 25,
    turnoverTemperature: 25,
    curvature: -0.04,
  });

  function referenceHz(divider, method) {
    // AN2604 section 2 prints 511.968 instead of the exact 32766 / 64.
    return method === "table" && divider === 32766 ? 511.968 : divider / 64;
  }

  function tableCalibration(ppm) {
    const roundedPpm = Math.round(ppm);
    let best = 0, bestDistance = Infinity, bestResidual = Infinity;
    for (let calibration = 0; calibration <= 127; ++calibration) {
      const compensation = calibration * stepPpm;
      const distance = Math.abs(Math.round(compensation) - roundedPpm);
      const residual = Math.abs(ppm - compensation);
      if (distance < bestDistance || (distance === bestDistance && residual < bestResidual)) {
        best = calibration;
        bestDistance = distance;
        bestResidual = residual;
      }
    }
    return best;
  }

  function clean(value) { return Math.abs(value) < 1e-9 ? 0 : value; }

  function pulseTiming(lseHz, calibration) {
    if (!Number.isFinite(lseHz) || lseHz <= 0 ||
        !Number.isInteger(calibration) || calibration < 0 || calibration > 127) return null;
    return {
      lseHz, calibration, pulseSeconds: 1 / lseHz,
      cycleSeconds: cycleLength / lseHz,
      delaySeconds: calibration / lseHz,
      passedPulses: cycleLength - calibration,
    };
  }

  function correction(ppm, method) {
    const rate = 1 + ppm / 1e6;
    const desired = method === "table" ? tableCalibration(ppm) : Math.round((1 - 1 / rate) * cycleLength);
    const calibration = Math.max(0, Math.min(127, desired));
    const compensationPpm = calibration * stepPpm;
    const residualPpm = clean(method === "table"
      ? ppm - compensationPpm
      : (rate * (1 - calibration / cycleLength) - 1) * 1e6);
    const maximumPpm = method === "table" ? 127 * stepPpm : (1 / (1 - 127 / cycleLength) - 1) * 1e6;
    return {
      ppm: clean(ppm), roundedPpm: Math.round(ppm) || 0, calibration, compensationPpm,
      residualPpm, secondsPerMonth: clean(ppm * monthSeconds / 1e6),
      residualSecondsPerMonth: clean(residualPpm * monthSeconds / 1e6),
      status: ppm < -1e-9 ? "slow" : ppm > maximumPpm + 1e-9 ? "above-range" : "in-range",
    };
  }

  function calculate(input = {}) {
    const config = { ...defaults, ...input };
    const errors = [];
    const error = (field, message) => errors.push({ field, message });
    if (!Number.isFinite(config.frequencyHz) || config.frequencyHz <= 0 ||
        !Number.isFinite(config.frequencyHz * 64)) {
      error("frequencyHz", "Enter a positive, finite measured frequency.");
    }
    if (![32766, 32768].includes(config.divider)) error("divider", "Select an RTC divider of 32766 or 32768.");
    if (!["exact", "table"].includes(config.method)) error("method", "Select a supported calculation method.");
    for (const field of ["measuredTemperature", "operatingTemperature", "turnoverTemperature"]) {
      if (!Number.isFinite(config[field]) || config[field] < -273.15) {
        error(field, "Enter a finite temperature at or above -273.15 °C.");
      }
    }
    if (!Number.isFinite(config.curvature) || config.curvature > 0) {
      error("curvature", "Enter a finite, nonpositive crystal curvature.");
    }
    if (errors.length) return { errors };

    const reference = referenceHz(config.divider, config.method);
    const ppm = (config.frequencyHz - reference) / reference * 1e6;
    // Remove the temperature effect already present in the measured frequency.
    const temperatureShiftPpm = config.curvature * (
      (config.operatingTemperature - config.turnoverTemperature) ** 2 -
      (config.measuredTemperature - config.turnoverTemperature) ** 2);
    const operatingPpm = ppm + temperatureShiftPpm;
    if (!Number.isFinite(operatingPpm) || operatingPpm <= -1e6) {
      error("operatingTemperature", "These inputs predict a nonpositive or nonfinite oscillator frequency.");
      return { errors };
    }
    const operating = correction(operatingPpm, config.method);
    const operatingLseHz = reference * 64 * (1 + operatingPpm / 1e6);
    return {
      errors, referenceHz: reference, exactReferenceHz: config.divider / 64,
      crystalHz: config.frequencyHz * 64, reload: config.divider - 1,
      temperatureShiftPpm: clean(temperatureShiftPpm),
      measured: correction(ppm, config.method), operating,
      timing: pulseTiming(operatingLseHz, operating.calibration),
    };
  }

  const api = { defaults, referenceHz, calculate, pulseTiming, stepPpm, cycleLength, monthSeconds };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BluePillRtcCalibration = api;
})(globalThis);
