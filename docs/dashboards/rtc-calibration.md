---
hide:
    - toc
---

# RTC calibration dashboard

Enter the RTC (real-time clock) output frequency to calculate calibration and time drift.
The default is the perfect reference for AN2604's divider of 32766: 511.968750 Hz.
PPM means parts per million, the frequency error relative to the selected reference.
Positive deviation means the RTC gains time. Negative deviation means it loses time.

<div id="rtc-calibration-dashboard"></div>
<noscript>Enable JavaScript to use the RTC calibration dashboard.</noscript>

## Measurement and prescaler

Enable the LSE clock, select it for the RTC, and enable `BKP_RTCCR.CCO` to measure the approximately 512 Hz output on PC13.
This output divides the oscillator frequency by 64 before calibration, so changing CAL does not change the measured pin frequency.

| RTC divider | Prescaler load | Exact output reference | Use |
| --- | --- | --- | --- |
| 32766 | 32765 | 511.968750 Hz | AN2604 and current project RTC driver |
| 32768 | 32767 | 512.000000 Hz | Conventional divider without the calibration bias |

Select the divider that matches the RTC configuration.
The dashboard does not change the firmware prescaler.
A nominal 32768 Hz crystal produces 512 Hz on PC13, regardless of this divider setting.
With divider 32766, that nominal crystal needs CAL = 64 to produce one RTC second per real second.

## Pulse-removal timing

The waveform follows the final CAL recommendation and the predicted LSE frequency at the operating temperature.
Select the 512 Hz / CAL 64 example to see the nominal firmware configuration.
The LSE keeps running throughout calibration.
Only the RTC input pulses are omitted, so prescaler progress is delayed rather than stopped for a whole second.

```text
correction_cycle_seconds = 1048576 / LSE_frequency_Hz
total_counting_delay_seconds = CAL / LSE_frequency_Hz
```

For an exact 32768 Hz LSE, a correction cycle lasts 32 seconds:

| CAL | Total counting delay per cycle | Correction-cycle interval |
| --- | --- | --- |
| 0 | 0 ms, no correction | 32 s |
| 64 | 1.953125 ms | 32 s |
| 127 | 3.875732 ms | 32 s |

The diagram groups the omitted pulses near the 2^20 boundary to show their combined effect.
AN2604 specifies the omitted-pulse count per cycle, not the exact position of each omission.
The shaded interval is an equivalent grouped delay, not a claim that hardware pauses once for that entire duration.

## Calculation methods

Exact mode uses `reference = divider / 64` and chooses the CAL value that minimizes the remaining frequency error.
CAL removes between 0 and 127 pulses per 2^20 input cycles.
Each step removes approximately 0.953674316 ppm of the input clock.

```text
deviation_ppm = (measured_Hz - reference_Hz) / reference_Hz * 1000000
corrected_rate = (1 + deviation_ppm / 1000000) * (1 - CAL / 1048576)
remaining_ppm = (corrected_rate - 1) * 1000000
seconds_per_month = deviation_ppm * 2592000 / 1000000
```

AN2604 table mode uses the note's printed 511.968 Hz reference and its whole-ppm lookup table.
Where two table entries have the same rounded ppm, the dashboard selects the one with the smaller unrounded residual.
This mode reproduces the 511.982 Hz example: about +27.35 ppm, rounded to +27 ppm, and CAL = 28.
The residual is about +0.643 ppm, or +1.666 seconds per 30-day month.
Exact mode gives different results because 511.968 Hz is a rounded reference.

Calibration can only slow the RTC.
For a negative deviation, CAL = 0 is the best available setting and the RTC still loses time.
For a deviation above the correction range, CAL = 127 leaves some positive drift.

## Temperature correction

Enter the crystal temperature during measurement and its expected operating temperature.
The dashboard subtracts the temperature effect already included in the measured frequency:

```text
temperature_shift_ppm = K * ((T_operating - T0)^2 - (T_measured - T0)^2)
operating_ppm = measured_ppm + temperature_shift_ppm
```

AN2604 uses a turnover temperature `T0` of 25 °C and curvature `K` of -0.040 ppm/°C² for its evaluation-board crystal.
Use the crystal manufacturer's values for your board.
At a measurement temperature of 25 °C and operating temperature of 40 °C, the shift is -9 ppm.
The AN2604 example then selects CAL = 19.
The final drift estimate assumes a constant operating temperature for a 30-day month.

Source: [ST AN2604, RTC calibration](../refs/rtc-calibration-stm.pdf), sections 1.1, 1.2, 2, and 3.
