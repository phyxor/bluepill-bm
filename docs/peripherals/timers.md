# General-purpose timers (TIM)

TIM peripherals count clock ticks or external edges independently of the CPU.
On the Blue Pill, use them when a busy-wait loop or SysTick is not precise
enough, when a pin must react at a defined time, or when hardware must measure
an external signal.

## Basic idea

A timer increments or decrements `TIMx_CNT` at a programmable rate. It
generates an update event (UEV) when the counter reaches its auto-reload value
and wraps. Four capture/compare channels can react when the counter matches a
value, capture the counter on a pin edge, or drive a waveform on a pin.

| Use case                    | Timer feature                    | Example                                                                  |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| Periodic delay or time base | Update event                     | Run an interrupt every 1 ms.                                             |
| Time interval measurement   | Input capture                    | Capture timer values on two signal edges and subtract them.              |
| Event trigger               | Output compare or one-pulse mode | Toggle a pin, generate one delayed pulse, or trigger another peripheral. |
| PWM                         | Output compare                   | Drive an LED, servo, or motor controller with programmable duty cycle.   |
| Position measurement        | Encoder mode                     | Count quadrature encoder transitions on CH1 and CH2.                     |

## Timer acronyms

| Acronym | Meaning                                 |
| ------- | --------------------------------------- |
| `ARR`   | Auto-Reload Register                    |
| `ARPE`  | Auto-Reload Preload Enable              |
| `BDTR`  | Break and Dead-Time Register            |
| `BKIN`  | Break Input                             |
| `CC`    | Capture/Compare                         |
| `CCER`  | Capture/Compare Enable Register         |
| `CCMR`  | Capture/Compare Mode Register           |
| `CCR`   | Capture/Compare Register                |
| `CHx`   | Timer channel x                         |
| `CHxN`  | Complementary output of timer channel x |
| `CNT`   | Counter Register                        |
| `CEN`   | Counter Enable                          |
| `DIER`  | DMA/Interrupt Enable Register           |
| `DTG`   | Dead-Time Generator                     |
| `EGR`   | Event Generation Register               |
| `ETR`   | External Trigger                        |
| `HSI`   | High-Speed Internal oscillator          |
| `IC`    | Input Capture                           |
| `ITR`   | Internal Trigger                        |
| `JTAG`  | Joint Test Action Group debug interface |
| `MMS`   | Master Mode Selection                   |
| `MOE`   | Main Output Enable                      |
| `OC`    | Output Compare                          |
| `OPM`   | One-Pulse Mode                          |
| `PCLK`  | APB Peripheral Clock                    |
| `PSC`   | Prescaler Register                      |
| `PWM`   | Pulse-Width Modulation                  |
| `RCR`   | Repetition Counter Register             |
| `SMS`   | Slave Mode Selection                    |
| `SMCR`  | Slave Mode Control Register             |
| `SR`    | Status Register                         |
| `TI`    | Timer Input                             |
| `TRGO`  | Trigger Output                          |
| `TS`    | Trigger Selection                       |
| `UDE`   | Update DMA Enable                       |
| `UDIS`  | Update Disable                          |
| `UEV`   | Update Event                            |
| `UG`    | Update Generation                       |
| `UIE`   | Update Interrupt Enable                 |
| `UIF`   | Update Interrupt Flag                   |
| `URS`   | Update Request Source                   |

See the shared [acronyms](../reference/acronyms.md#timer-peripheral-terms) page
for timer terms alongside project-wide terms such as `AFIO`, `APB`, `DMA`,
`GPIO`, `NVIC`, `RCC`, `SWD`, and `TIM`.

## Timers on STM32F103C8T6

The C8T6 has one advanced-control timer and three general-purpose timers. The
reference manual also describes other STM32F1 timers; do not assume those are
present on this device.

| Timer  | Type             | Bus  | RCC enable           | Counter | Channels | C8T6-specific notes                                                                  |
| ------ | ---------------- | ---- | -------------------- | ------- | -------- | ------------------------------------------------------------------------------------ |
| `TIM1` | Advanced-control | APB2 | `RCC_APB2ENR_TIM1EN` | 16-bit  | 4        | Adds CH1N..CH3N, repetition counter, break input, dead time, and main-output enable. |
| `TIM2` | General-purpose  | APB1 | `RCC_APB1ENR_TIM2EN` | 16-bit  | 4        | CH1 and ETR share one pin.                                                           |
| `TIM3` | General-purpose  | APB1 | `RCC_APB1ENR_TIM3EN` | 16-bit  | 4        | Supports a partial remap on the C8T6.                                                |
| `TIM4` | General-purpose  | APB1 | `RCC_APB1ENR_TIM4EN` | 16-bit  | 4        | Only its default channel pins are usable on the 48-pin package.                      |

Enable the timer clock before accessing its registers. GPIO clocks are APB2
clocks, even for an APB1 timer.

```c
RCC->APB1ENR |= RCC_APB1ENR_TIM3EN;
RCC->APB2ENR |= RCC_APB2ENR_IOPAEN;
```

The timer input clock depends on the APB prescaler:

```text
f_TIM = PCLKx       when the corresponding APB prescaler is 1
f_TIM = 2 * PCLKx   when the corresponding APB prescaler is greater than 1
```

The current project starts from 8 MHz HSI with both APB prescalers equal to 1,
so `TIM1`, `TIM2`, `TIM3`, and `TIM4` initially run from an 8 MHz timer clock.
Recalculate timing values whenever the RCC clock tree changes.

Use the [clock dashboard](../system/clock-dashboard.md#interrupt-targets) to
calculate `PSC` and `ARR` from a target period and a custom clock
configuration.

## GPIO pins and remapping

Timer outputs use alternate-function push-pull GPIO mode. Timer inputs, such as
input capture, ETR, and BKIN, use an input mode, commonly floating input.
Enable the GPIO port clock before configuring the pin. A remap also needs the
AFIO clock and the relevant `AFIO_MAPR` field.

| Signal direction             | GPIO configuration                                                               |
| ---------------------------- | -------------------------------------------------------------------------------- |
| CHx output, CHxN output      | Alternate-function push-pull, with a suitable output speed                       |
| CHx input capture, ETR, BKIN | Input floating, or input pull-up/pull-down when the external circuit requires it |

The tables below contain mappings usable on the 48-pin STM32F103C8T6. A pin can
only be used by one selected alternate function at a time.

### TIM1

| `TIM1_REMAP`        | ETR  | CH1 | CH2 | CH3  | CH4  | BKIN | CH1N | CH2N | CH3N |
| ------------------- | ---- | --- | --- | ---- | ---- | ---- | ---- | ---- | ---- |
| `00`, no remap      | PA12 | PA8 | PA9 | PA10 | PA11 | PB12 | PB13 | PB14 | PB15 |
| `01`, partial remap | PA12 | PA8 | PA9 | PA10 | PA11 | PA6  | PA7  | PB0  | PB1  |

The full TIM1 remap uses port E pins and is not available on the 48-pin
package.

### TIM2

| `TIM2_REMAP`        | CH1 / ETR | CH2 | CH3  | CH4  | Debug-pin note              |
| ------------------- | --------- | --- | ---- | ---- | --------------------------- |
| `00`, no remap      | PA0       | PA1 | PA2  | PA3  | None                        |
| `01`, partial remap | PA15      | PB3 | PA2  | PA3  | PA15 and PB3 are JTAG pins. |
| `10`, partial remap | PA0       | PA1 | PB10 | PB11 | None                        |
| `11`, full remap    | PA15      | PB3 | PB10 | PB11 | PA15 and PB3 are JTAG pins. |

`TIM2_CH1` and `TIM2_ETR` share their selected pin, so they cannot be used at
the same time. To use PA15 or PB3 as timer pins while retaining SWD debugging,
disable JTAG but keep SWD enabled through `AFIO_MAPR.SWJ_CFG`.

### TIM3 and TIM4

| Timer  | Remap               | CH1 | CH2 | CH3 | CH4 | ETR | Notes                                       |
| ------ | ------------------- | --- | --- | --- | --- | --- | ------------------------------------------- |
| `TIM3` | `00`, no remap      | PA6 | PA7 | PB0 | PB1 | PE0 | PE0 is not bonded on the 48-pin package.    |
| `TIM3` | `10`, partial remap | PB4 | PB5 | PB0 | PB1 | PE0 | PB4 is a JTAG pin. PE0 remains unavailable. |
| `TIM4` | `0`, no remap       | PB6 | PB7 | PB8 | PB9 | PE0 | PE0 is not bonded on the 48-pin package.    |

TIM3 full remap requires PC6 through PC9. TIM4 remap requires PD12 through
PD15. Neither mapping is available on the C8T6's 48-pin package. TIM3 partial
remap needs JTAG disabled to reclaim PB4.

## Key features

| Feature                       | How it works                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counter and prescaler         | `CNT` counts the timer clock after division by `PSC + 1`. The counter can count up, down, or center-aligned.                                                         |
| Auto-reload                   | `ARR` sets the terminal count and therefore the update period.                                                                                                       |
| Four channels                 | Each `CCRx` can capture an input edge, compare a count, generate PWM, or create a one-pulse output.                                                                  |
| Synchronization               | `CR2.MMS` selects a master trigger output. `SMCR.TS` and `SMCR.SMS` let another timer reset, gate, start from, or count that trigger.                                |
| Interrupts                    | `DIER.UIE` enables update interrupts. `CCxIE` enables capture/compare interrupts. The corresponding flags are in `SR`.                                               |
| DMA                           | `DIER.UDE`, `CCxDE`, and `TDE` generate DMA requests on update, compare/capture, and trigger events.                                                                 |
| Encoder interface             | `SMCR.SMS` modes 1 through 3 use CH1 and CH2 to count a quadrature encoder.                                                                                          |
| Advanced outputs, TIM1 only   | CH1N..CH3N provide complementary outputs. `BDTR.DTG` adds dead time, `BDTR.BKE` enables the BKIN safety input, and `BDTR.MOE` must be set before outputs drive pins. |
| Repetition counter, TIM1 only | `RCR + 1` overflows or underflows occur before a UEV, useful for reducing update frequency in PWM applications.                                                      |

Use TIM1's break and complementary-output features for power stages only after
understanding the external safety circuit. A break event can disable outputs
immediately; it is not required for ordinary LED PWM.

## Registers you use most

| Register                   | Purpose                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `TIMx_CR1`                 | Enables the counter (`CEN`), selects direction/alignment, one-pulse mode (`OPM`), update behavior (`UDIS`, `URS`), and ARR preload (`ARPE`). |
| `TIMx_CR2`                 | Chooses the master trigger output (`MMS`).                                                                                                   |
| `TIMx_SMCR`                | Selects trigger input and slave, external-clock, or encoder mode.                                                                            |
| `TIMx_DIER`                | Enables update, capture/compare, trigger interrupts and their DMA requests.                                                                  |
| `TIMx_SR`                  | Holds `UIF`, `CCxIF`, `TIF`, and over-capture status flags. Write a flag as zero to clear it.                                                |
| `TIMx_EGR`                 | Writing `UG` reinitializes the counter and prescaler counter and forces an update of buffered registers.                                     |
| `TIMx_CCMR1`, `TIMx_CCMR2` | Select input capture or output compare/PWM mode for channels 1/2 and 3/4.                                                                    |
| `TIMx_CCER`                | Enables each channel and selects input edge or output polarity.                                                                              |
| `TIMx_CNT`                 | Current counter value.                                                                                                                       |
| `TIMx_PSC`                 | Prescaler reload value. The timer clock is divided by `PSC + 1`.                                                                             |
| `TIMx_ARR`                 | Auto-reload value. An up-counter runs from 0 through `ARR`.                                                                                  |
| `TIMx_CCR1` to `TIMx_CCR4` | Captured count in input mode, or compare/PWM threshold in output mode.                                                                       |
| `TIM1_RCR`, `TIM1_BDTR`    | TIM1-only repetition, dead-time, break, and main-output control.                                                                             |

## Update events and timing

For an up-counting timer without TIM1 repetition:

```text
f_CNT = f_TIM / (PSC + 1)
f_UEV = f_CNT / (ARR + 1)
period = (PSC + 1) * (ARR + 1) / f_TIM
```

`PSC` is buffered, so its new value takes effect at the next UEV. Generate one
with `EGR.UG` after writing `PSC` and `ARR`, before enabling the counter. This
also sets `SR.UIF` when `URS` is clear, so clear pending flags before enabling
an interrupt.

| Goal at `f_TIM = 8 MHz`     | `PSC` | `ARR` | Result                              |
| --------------------------- | ----- | ----- | ----------------------------------- |
| 1 ms update interrupt       | 7     | 999   | `f_CNT = 1 MHz`, `f_UEV = 1 kHz`    |
| 1 s update interrupt        | 7999  | 999   | `f_CNT = 1 kHz`, `f_UEV = 1 Hz`     |
| 1 kHz PWM base              | 7     | 999   | 1000 counter steps per PWM period   |
| 1 us measurement resolution | 7     | 65535 | 1 MHz counter, wrap after 65.536 ms |

With TIM1, the normal UEV rate is additionally divided by `RCR + 1`.

## Configuration examples

These examples use CMSIS register names. They show the hardware sequence. A
`bare-*` application needs equivalent local register definitions instead of
vendor CMSIS headers.

### Periodic 1 ms interrupt

This TIM3 configuration produces a 1 kHz update event from the project's
current 8 MHz timer clock. The interrupt handler clears `UIF` before doing its
work.

```c
RCC->APB1ENR |= RCC_APB1ENR_TIM3EN;

TIM3->CR1 = 0u;
TIM3->PSC = 7u;
TIM3->ARR = 999u;
TIM3->EGR = TIM_EGR_UG;       /* Load PSC and ARR; resets CNT. */
TIM3->SR = 0u;                /* Discard the UEV caused by UG. */
TIM3->DIER = TIM_DIER_UIE;
NVIC_EnableIRQ(TIM3_IRQn);
TIM3->CR1 = TIM_CR1_CEN;

void TIM3_IRQHandler(void)
{
    if ((TIM3->SR & TIM_SR_UIF) != 0u) {
        TIM3->SR = 0u;
        /* Runs every 1 ms. */
    }
}
```

### PWM output on TIM3 CH1

TIM3 channel 1 is on PA6 without remapping. PWM mode 1 makes the output active
while `CNT < CCR1`. With `ARR = 999` and `CCR1 = 250`, the duty cycle is 25%.

```c
RCC->APB2ENR |= RCC_APB2ENR_IOPAEN;
RCC->APB1ENR |= RCC_APB1ENR_TIM3EN;

GPIOA->CRL &= ~(GPIO_CRL_CNF6 | GPIO_CRL_MODE6);
GPIOA->CRL |= GPIO_CRL_CNF6_1 | GPIO_CRL_MODE6_1;

TIM3->PSC = 7u;
TIM3->ARR = 999u;
TIM3->CCR1 = 250u;
TIM3->CCMR1 = TIM_CCMR1_OC1PE | TIM_CCMR1_OC1M_1 | TIM_CCMR1_OC1M_2;
TIM3->CCER = TIM_CCER_CC1E;
TIM3->CR1 = TIM_CR1_ARPE;
TIM3->EGR = TIM_EGR_UG;
TIM3->CR1 |= TIM_CR1_CEN;
```

### Measure an input interval

Configure a channel as input capture, select an edge in `CCER`, and enable
`CCxE`. At each selected edge, hardware copies `CNT` into `CCRx` and sets
`CCxIF`. The elapsed time between two captures is:

```text
elapsed_ticks = (second_capture - first_capture) modulo (ARR + 1)
elapsed_time = elapsed_ticks / f_CNT
```

For example, set `TIM2->PSC = 7` for 1 us resolution, set `CC1S = 01` in
`CCMR1` to map TI1 to channel 1, set `CC1E` in `CCER`, then read `CCR1` on each
`CC1IF` interrupt. Use the input filter fields (`IC1F`) when the external
signal is noisy, and handle `CC1OF` if a new edge arrives before software reads
the previous capture.

### Trigger, synchronize, or use DMA

For one delayed pulse, configure a channel in PWM or output-compare mode, set
`CR1.OPM`, and use `CCR` for the transition time and `ARR` for the end of the
pulse. The timer stops on its next UEV.

For timer chaining, configure the master timer's `CR2.MMS` to expose an update
or compare event as TRGO. On the slave timer, choose the matching internal
trigger with `SMCR.TS`, then use `SMCR.SMS` reset, gated, trigger, or external
clock mode. RM0008's internal-trigger table identifies the valid ITR links for
each timer.

For a DMA-driven waveform or sample sequence, enable `DIER.UDE` for updates or
the relevant `CCxDE` bit for a compare/capture event, then configure the DMA
channel specified by the device DMA mapping. The timer generates requests; DMA
performs the data movement without entering the CPU interrupt handler.

## Reference manual pages

| Topic                                                               | Direct link                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| C8T6 timer features and clock-tree timer multiplier                 | [STM32F103x8 datasheet pages 18-19](../refs/stm32f103x8-datasheet.pdf#page=18) |
| C8T6 pin definitions                                                | [STM32F103x8 datasheet page 28](../refs/stm32f103x8-datasheet.pdf#page=28)     |
| RCC APB clock-enable registers                                      | [RM0008 page 112](../refs/stm32f103x8-reference.pdf#page=112)                  |
| TIM4, TIM3, TIM2, and TIM1 remapping tables                         | [RM0008 pages 177-179](../refs/stm32f103x8-reference.pdf#page=177)             |
| `AFIO_MAPR` timer remap fields                                      | [RM0008 page 185](../refs/stm32f103x8-reference.pdf#page=185)                  |
| TIM1 advanced-control timer chapter                                 | [RM0008 page 292](../refs/stm32f103x8-reference.pdf#page=292)                  |
| TIM1 repetition counter and break/dead-time registers               | [RM0008 pages 357-361](../refs/stm32f103x8-reference.pdf#page=357)             |
| TIM2-TIM5 general-purpose timer chapter                             | [RM0008 page 365](../refs/stm32f103x8-reference.pdf#page=365)                  |
| General-purpose timer synchronization and internal triggers         | [RM0008 pages 398-400](../refs/stm32f103x8-reference.pdf#page=398)             |
| `CR1`, `SMCR`, `DIER`, `SR`, and `EGR`                              | [RM0008 pages 404-412](../refs/stm32f103x8-reference.pdf#page=404)             |
| Capture/compare, counter, prescaler, auto-reload, and DMA registers | [RM0008 pages 413-423](../refs/stm32f103x8-reference.pdf#page=413)             |
