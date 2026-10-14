# SysTick timer

SysTick is a small timer built into the ARM Cortex-M3 core.

SysTick is commonly used for a fixed time base, such as a 1 ms system tick,
simple delays, or a small cooperative scheduler.

## Basic idea

SysTick is a 24-bit down-counter:

| Step      | Meaning                                                   |
| --------- | --------------------------------------------------------- |
| Load      | Software writes the reload value into `STK_LOAD`.         |
| Count     | The counter decrements from that value down to zero.      |
| Wrap      | When it reaches zero, it reloads and sets the count flag. |
| Interrupt | If enabled, the wrap event calls `SysTick_Handler`.       |

The reload value controls the period:

```text
reload = tick_clock_hz / ticks_per_second - 1
```

For example, if the core clock is `8 MHz` and you want a 1 ms tick, use:

```text
reload = 8_000_000 / 1000 - 1 = 7999
```

Use the [clock dashboard](../dashboards/clock-dashboard.md) to calculate
`RELOAD` from a target period and the selected HCLK or HCLK / 8 source.

## Registers you use most

SysTick is controlled by core memory-mapped registers. It does not need an RCC
peripheral clock enable.

| Register    | Purpose                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------- |
| `STK_CTRL`  | Enables SysTick, selects the clock source, enables the interrupt, and exposes the count flag. |
| `STK_LOAD`  | Holds the 24-bit reload value. The maximum value is `0x00FF_FFFF`.                            |
| `STK_VAL`   | Holds the current counter value. Writing any value clears the counter and count flag.         |
| `STK_CALIB` | STM32-provided calibration value for a 1 ms reference when using the external SysTick clock.  |

With `STK_CTRL_CLKSOURCE` set, SysTick uses the Cortex clock, usually `HCLK`.
With it cleared, STM32F1 feeds SysTick from `HCLK / 8`.

## Practical notes

SysTick is simple, but it has limits:

| Topic             | Note                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Counter width     | The reload value is only 24 bits, so long delays need software counters.                 |
| Clock changes     | If you change `HCLK`, recompute `STK_LOAD` or the tick period changes.                   |
| Interrupt handler | The vector table must contain `SysTick_Handler` at the SysTick exception slot.           |
| Busy waits        | Polling the count flag works, but wastes CPU while waiting.                              |
| Low power         | SysTick is core-related. Check the sleep mode behavior before using it as a wake source. |

SysTick is a good first timer because it avoids GPIO pins, alternate functions,
prescalers, and APB timer clock details. Use the general-purpose timers later
when you need PWM, input capture, output compare, encoder mode, or independent
timer channels.

## Reference manual pages

Use the project-local STM32F103 reference manual for the STM32-specific SysTick
details:

| Topic                                    | Direct link                                                   |
| ---------------------------------------- | ------------------------------------------------------------- |
| Clock tree and SysTick clock source note | [RM0008 page 93](../refs/stm32f103x8-reference.pdf#page=93)   |
| SysTick calibration value                | [RM0008 page 197](../refs/stm32f103x8-reference.pdf#page=197) |
| SysTick vector-table entry               | [RM0008 page 204](../refs/stm32f103x8-reference.pdf#page=204) |

RM0008 describes the STM32 clock connection, calibration value, and exception
vector. The full bit-level definition of `STK_CTRL`, `STK_LOAD`, `STK_VAL`, and
`STK_CALIB` belongs to the Cortex-M3 core documentation.
