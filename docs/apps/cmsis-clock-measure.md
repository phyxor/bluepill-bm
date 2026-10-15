<!--
Copyright (C) 2026 Phyxor Microsystems
SPDX-FileContributor: Pablo Palazon

SPDX-License-Identifier: BSD-3-Clause
-->

# CMSIS clock measurement application

`cmsis-clock-measure` measures HCLK, the core clock, against the board's 32.768
kHz LSE crystal. It measures the default 8 MHz HSI clock, then HSE-based
profiles from 8 MHz up to 72 MHz and back down. It then measures HSI-based
profiles from 8 MHz up to 48 MHz and back down. All profiles use the
compile-time `RTC_CALIBRATION` value, which defaults to 64. Each result
identifies the profile and calibration value. The source is
`apps/cmsis-clock-measure/main.c`.

## Build and connections

Build the application with the existing Makefile:

```sh
make APP=cmsis-clock-measure
```

To select a calibration value during compilation, use `CPPFLAGS`:

```sh
make -B APP=cmsis-clock-measure CPPFLAGS=-DRTC_CALIBRATION=127
```

`RTC_CALIBRATION` accepts integers from 0 to 127. Use `-B` when changing the
value because Make does not track compiler flag changes. You can also change
the default `#define RTC_CALIBRATION` in the application source.

To program the board, use:

```sh
make APP=cmsis-clock-measure flash
```

Connect a 3.3 V USB-to-UART adapter and open its serial terminal:

| Item                 | Configuration                                   |
| -------------------- | ----------------------------------------------- |
| Board PA9, USART1 TX | Adapter RX                                      |
| Board GND            | Adapter GND                                     |
| Serial terminal      | 115200 baud, 8 data bits, no parity, 1 stop bit |
| Flow control         | None                                            |
| LSE crystal          | 32.768 kHz on PC14 and PC15                     |
| HSE crystal          | 8 MHz on PD0 and PD1                            |

The application reconfigures the UART baud divider after changing the system
clock. It also resynchronizes the RTC registers with the APB bus before the
next measurement. HSI frequency error also affects the UART baud rate in
HSI-based measurements. It prints an error and stops if clock initialization or
measurement fails. Capture timeouts print the sample count and the clock, RTC,
and interrupt state. Invalid sample intervals print the tick gap and cycle gap.

## RTC Calibration

Use the [RTC calibration dashboard](../dashboards/rtc-calibration.md) to calculate the calibration value.

The driver sets the prescaler load to 32765, which divides the RTC input by 32766.
It initializes CAL to 64 when configuring or repairing the prescaler.
Together, these values give a nominal one-second tick from a 32768 Hz LSE clock.
Initialization preserves an existing calibration when the retained prescaler is already correct.

## Measurement method

<iframe src="../../assets/clock-measure/index.html" title="Interactive RTC and cycle counter measurement" width="100%" height="1080" loading="lazy" style="border: 0; border-radius: 12px;"></iframe>

[Open the interactive measurement figure](../assets/clock-measure/index.html).

## Read the result

The startup output reports the calibration value. Each measurement reports the
profile, nominal HCLK, measured HCLK, and elapsed core cycles. It also reports
the absolute error in Hz and the relative error as a percentage of nominal
HCLK. With calibration 64, the
measured value assumes that LSE runs at exactly 32768 Hz. Increasing calibration
above 64 slows the RTC, so more core cycles fit in each RTC second and the
apparent measured HCLK rises. Decreasing calibration below 64 has the opposite
effect. The core clock itself does not change. Measurement accuracy depends on
the LSE crystal and variations in interrupt response time.

### Example execution with CAL 64

This table records one execution with `RTC_CALIBRATION=64` and two measurements
per profile. Each measurement spans 32 RTC seconds. Values come from the printed
summary lines, and rows follow execution order, including repeated profiles.
Profile names omit the `clock_profile_` prefix.

| Order | Profile | Nominal HCLK (MHz) | Minimum (Hz) | Maximum (Hz) | Average (Hz) | Absolute error (Hz) | Relative error (%) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Reset-default HSI | 8 | 8,044,580 | 8,045,367 | 8,044,974 | 44,974 | 0.5622 |
| 2 | `hse8_8mhz` | 8 | 8,000,530 | 8,000,530 | 8,000,530 | 530 | 0.0066 |
| 3 | `hse8_16mhz` | 16 | 16,001,062 | 16,001,062 | 16,001,062 | 1,062 | 0.0066 |
| 4 | `hse8_32mhz` | 32 | 32,002,130 | 32,002,130 | 32,002,130 | 2,130 | 0.0067 |
| 5 | `hse8_48mhz` | 48 | 48,003,183 | 48,003,185 | 48,003,184 | 3,184 | 0.0066 |
| 6 | `hse8_72mhz` | 72 | 72,004,775 | 72,004,777 | 72,004,776 | 4,776 | 0.0066 |
| 7 | `hse8_48mhz` | 48 | 48,003,185 | 48,003,188 | 48,003,187 | 3,187 | 0.0066 |
| 8 | `hse8_32mhz` | 32 | 32,002,128 | 32,002,129 | 32,002,129 | 2,129 | 0.0067 |
| 9 | `hse8_16mhz` | 16 | 16,001,060 | 16,001,061 | 16,001,061 | 1,061 | 0.0066 |
| 10 | `hse8_8mhz` | 8 | 8,000,529 | 8,000,529 | 8,000,529 | 529 | 0.0066 |
| 11 | `hsi8_8mhz` | 8 | 8,046,082 | 8,046,196 | 8,046,139 | 46,139 | 0.5767 |
| 12 | `hsi8_16mhz` | 16 | 16,095,824 | 16,098,163 | 16,096,994 | 96,994 | 0.6062 |
| 13 | `hsi8_32mhz` | 32 | 32,199,324 | 32,199,761 | 32,199,543 | 199,543 | 0.6236 |
| 14 | `hsi8_48mhz` | 48 | 48,316,210 | 48,320,409 | 48,318,310 | 318,310 | 0.6631 |
| 15 | `hsi8_32mhz` | 32 | 32,203,226 | 32,203,864 | 32,203,545 | 203,545 | 0.6361 |
| 16 | `hsi8_16mhz` | 16 | 16,099,459 | 16,101,156 | 16,100,308 | 100,308 | 0.6269 |
| 17 | `hsi8_8mhz` | 8 | 8,047,132 | 8,047,625 | 8,047,379 | 47,379 | 0.5922 |

Do not halt or single-step the CPU during a measurement. A debugger halt
interrupts cycle counting and can invalidate the result. The application
rejects large gaps between samples, but it cannot detect every short halt.

The application measures frequency without adjusting either oscillator. For the
clock configuration and RTC hardware paths, see
[Clock tree](../system/clocks.md).
