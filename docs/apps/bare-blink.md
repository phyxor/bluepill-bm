# Bare blink application

`bare-blink` is the first direct-register application in this project. It
blinks the board LED connected to PC13, which means Port C pin 13.

On most Blue Pill boards this LED is active-low: driving PC13 low turns the LED
on, and driving PC13 high turns the LED off.

The application does three things:

1. Enables the GPIOC peripheral clock.
2. Configures PC13 as a general-purpose push-pull output.
3. Toggles PC13 forever, with a busy-wait delay between toggles.

The GPIO concepts and reference manual links are summarized in
[GPIO Peripheral](../peripherals/gpio.md).

## Code path

The application source is:

```text
apps/bare-blink/main.c
```

It uses the local learning header:

```text
include/stm32f103c8t6.h
```

This app does not use CMSIS, HAL, LL, or STM32CubeF1 headers.

## GPIOC clock

GPIOC is connected to the APB2 bus. Before the GPIOC registers can be used, the
application enables the GPIOC peripheral clock:

```c
RCC_APB2ENR |= RCC_APB2ENR_IOPCEN;
```

See the [GPIO main registers](../peripherals/gpio.md#main-registers) for the
registers that the peripheral clock enables.

## PC13 configuration

PC13 is configured through `GPIOC_CRH` because pins 8 through 15 use the high
configuration register.

The app clears the existing PC13 configuration field:

```c
GPIOC_CRH &= ~GPIO_CFG_MASK(LED_PIN);
```

Then it writes the new mode:

```c
GPIOC_CRH |= GPIO_CFG(LED_PIN, GPIO_MODE_OUTPUT_2MHZ, GPIO_CNF_OUTPUT_PP);
```

That selects:

| Field         | Value  | Meaning                          |
| ------------- | ------ | -------------------------------- |
| `MODE13[1:0]` | `0b10` | Output mode, max speed 2 MHz     |
| `CNF13[1:0]`  | `0b00` | General-purpose push-pull output |

The configuration registers and push-pull mode are summarized in
[GPIO Peripheral](../peripherals/gpio.md).

## LED toggle

The app toggles PC13 by XORing bit 13 in the output data register:

```c
GPIOC_ODR ^= GPIO_PIN(LED_PIN);
```

For an active-low LED:

| PC13 level | LED state |
| ---------- | --------- |
| Low        | On        |
| High       | Off       |

The GPIO reference page also summarizes the safer set/reset register, `BSRR`,
in [Main registers](../peripherals/gpio.md#main-registers).

## Delay loop

The delay function is just a busy-wait loop:

```c
static void delay(volatile uint32_t count) {
  while (count-- > 0u) {
    __asm volatile("nop");
  }
}
```

It repeatedly executes `nop`, which consumes CPU cycles so the LED state
remains visible before the next toggle.

This loop is useful for a first example, but it is not an accurate timer. Later
examples can use SysTick or a hardware timer.
