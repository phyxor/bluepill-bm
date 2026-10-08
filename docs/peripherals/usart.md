# Build a USART driver from RM0008

This page shows how to turn the STM32F103 reference manual (RM0008) into a
small polling USART driver. The target is the Blue Pill's STM32F103C8T6, which
has three USART peripherals: `USART1`, `USART2`, and `USART3`.

Start with four questions when reading a peripheral chapter:

1. Which bus clocks the peripheral and which RCC bit enables it?
2. Which GPIO pins carry its signals, and can they be remapped?
3. Which GPIO mode does each signal need?
4. Which peripheral registers establish the desired frame format, baud rate,
   and transfer direction?

For a first serial console, use asynchronous `8N1`: 8 data bits, no parity, and
1 stop bit. It requires only a TX pin and `UE` plus `TE` in `USART_CR1`.

## 1. Find the peripheral clock

The STM32F1 has two peripheral buses, APB1 and APB2. A USART does not work
until its APB clock is enabled in RCC. GPIO ports and AFIO are themselves APB2
peripherals, even when the USART is on APB1.

| Peripheral | Bus  | RCC clock-enable bit   | USART clock used for baud rate |
| ---------- | ---- | ---------------------- | ------------------------------ |
| `USART1`   | APB2 | `RCC_APB2ENR_USART1EN` | `PCLK2`                        |
| `USART2`   | APB1 | `RCC_APB1ENR_USART2EN` | `PCLK1`                        |
| `USART3`   | APB1 | `RCC_APB1ENR_USART3EN` | `PCLK1`                        |

For example, USART2 TX on PA2 needs both GPIOA and USART2 clocks:

```c
RCC->APB2ENR |= RCC_APB2ENR_IOPAEN;
RCC->APB1ENR |= RCC_APB1ENR_USART2EN;
```

The project's current `SystemInit()` keeps the default 8 MHz HSI clock and does
not prescale APB1 or APB2. Thus `PCLK1` and `PCLK2` are both 8 MHz. If the
clock tree changes, calculate `BRR` using the new `PCLK1` or `PCLK2`, not a
hard-coded 8 MHz value.

## 2. Find the pins

RM0008 table 52 through table 54 list the USART alternate-function mappings.
These are MCU signal names. Make sure that the selected pin exists in the
package and is exposed by the board before you use it.

| Peripheral | Default signals                                         | Remapped signals                                                                                                               | Blue Pill note                                                                                                        |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `USART1`   | TX `PA9`, RX `PA10`                                     | TX `PB6`, RX `PB7`                                                                                                             | Both mappings are available. Remapping changes only TX/RX.                                                            |
| `USART2`   | CTS `PA0`, RTS `PA1`, TX `PA2`, RX `PA3`, CK `PA4`      | CTS `PD3`, RTS `PD4`, TX `PD5`, RX `PD6`, CK `PD7`                                                                             | The PD remap requires a 100- or 144-pin package, so it is not available on the 48-pin C8T6.                           |
| `USART3`   | TX `PB10`, RX `PB11`, CK `PB12`, CTS `PB13`, RTS `PB14` | Partial: TX `PC10`, RX `PC11`, CK `PC12`, CTS `PB13`, RTS `PB14`. Full: TX `PD8`, RX `PD9`, CK `PD10`, CTS `PD11`, RTS `PD12`. | Partial remap requires at least 64 pins. Full remap requires 100 or 144 pins. Use the default mapping on a Blue Pill. |

`CK` is only for synchronous USART mode. `CTS` and `RTS` are hardware flow
control signals. A normal asynchronous TX/RX connection does not need them.

To select a remap, first enable AFIO on APB2, then change the appropriate
`AFIO_MAPR` field. Do not enable a remap whose package restriction excludes the
C8T6. Default mappings need no AFIO configuration.

```c
RCC->APB2ENR |= RCC_APB2ENR_AFIOEN;
AFIO->MAPR |= AFIO_MAPR_USART1_REMAP;  /* USART1 TX PB6, RX PB7. */
```

## 3. Configure GPIO for the signal direction

STM32F1 GPIO uses four bits per pin in `GPIOx_CRL` for pins 0 to 7 and
`GPIOx_CRH` for pins 8 to 15. The field is `CNF[1:0]:MODE[1:0]`.

| USART signal direction    | GPIO configuration           | `CNF` | `MODE`                                                |
| ------------------------- | ---------------------------- | ----- | ----------------------------------------------------- |
| USART output: TX, RTS, CK | Alternate-function push-pull | `10`  | `01`, `10`, or `11` for 10, 2, or 50 MHz output speed |
| USART input: RX, CTS      | Input floating               | `01`  | `00`                                                  |

For a 2 MHz USART2 TX output on PA2 and a floating USART2 RX input on PA3:

```c
/* PA2: alternate-function push-pull, 2 MHz: CNF=10, MODE=10. */
GPIOA->CRL &= ~(GPIO_CRL_CNF2 | GPIO_CRL_MODE2);
GPIOA->CRL |= GPIO_CRL_CNF2_1 | GPIO_CRL_MODE2_1;

/* PA3: floating input: CNF=01, MODE=00. */
GPIOA->CRL &= ~(GPIO_CRL_CNF3 | GPIO_CRL_MODE3);
GPIOA->CRL |= GPIO_CRL_CNF3_0;
```

Connect a USB-to-UART adapter's RX input to the STM32 TX pin, for example PA2,
and connect adapter ground to board ground. The adapter must use 3.3 V logic.

## 4. Configure the USART

The USART register map starts with the registers below. The basic polling
driver only needs `SR`, `DR`, `BRR`, `CR1`, and the reset value of `CR2`.

| Register     | Main use in a basic driver                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `USART_SR`   | Read `TXE` before writing another byte. Read `RXNE` before receiving a byte. `TC` means that the final stop bit left the pin. |
| `USART_DR`   | Write the byte to transmit or read the received byte.                                                                         |
| `USART_BRR`  | Programs the baud-rate divider.                                                                                               |
| `USART_CR1`  | Enables the peripheral (`UE`), transmitter (`TE`), receiver (`RE`), word length, parity, and basic USART interrupts.          |
| `USART_CR2`  | Selects stop bits with `STOP[1:0]`. Reset value `00` selects one stop bit. It also controls synchronous clock options.        |
| `USART_CR3`  | Enables CTS/RTS flow control, DMA, and single-wire mode when needed.                                                          |
| `USART_GTPR` | Sets guard time and the prescaler for Smartcard or synchronous modes. The asynchronous `8N1` example does not use it.         |

### Baud rate

RM0008 defines:

```text
baud = fPCLK / (16 * USARTDIV)
```

`USART_BRR` stores `USARTDIV` as a 12-bit mantissa and a 4-bit fraction. For
normal oversampling by 16, this reduces to a convenient integer calculation:

```text
BRR = round(fPCLK / baud)
```

With the current 8 MHz APB clock and 115200 baud:

```text
BRR = round(8,000,000 / 115,200) = 69 = 0x0045
actual baud = 8,000,000 / 69 = 115,942 baud
```

The error is about 0.64%, which is normally acceptable. Compute a new value
from the actual peripheral clock whenever RCC settings change.

### Control registers for 8N1

`CR1` reset values select 8 data bits and no parity. Set `UE` and `TE` for
transmit-only output. Add `RE` when you use RX. Leave `CR2.STOP` as `00` for
one stop bit. Leave `CR3` clear when you do not use flow control, DMA, or
special modes.

```c
USART2->BRR = (8000000u + (115200u / 2u)) / 115200u;
USART2->CR2 = 0u;                         /* STOP = 00: one stop bit. */
USART2->CR3 = 0u;
USART2->CR1 = USART_CR1_UE | USART_CR1_TE | USART_CR1_RE;
```

Transmit by waiting for `TXE`, then writing `DR`. `TXE` means the data register
can accept the next byte. Wait for `TC` only before disabling USART or entering
a low-power state after the final byte.

```c
static int usart2_putchar(int ch)
{
    while ((USART2->SR & USART_SR_TXE) == 0u) {
    }

    USART2->DR = (uint16_t)(uint8_t)ch;
    return ch;
}
```

## 5. Send `printf()` through USART

`system/newlib_stubs.c` supplies Newlib's `_write()` system call. `printf()`
ultimately calls `_write()`, which sends each byte to the weak
`board_putchar(int ch)` symbol. If no driver defines that symbol, `_write()`
returns `-1` with `errno` set to `ENOSYS`.

Define `board_putchar()` in the USART driver after the peripheral is
initialized. The existing CMSIS driver uses this exact hook.

```c
int board_putchar(int ch)
{
    return usart2_putchar(ch);
}
```

Then initialize the driver before the first `printf()`:

```c
int main(void)
{
    uart_init();
    printf("USART2 is ready\r\n");

    while (1) {
    }
}
```

Use `\r\n` for a conventional terminal newline. This output path blocks: each
byte waits for `TXE`, so it is simple and appropriate for a learning example,
but it does not suit time-critical logging. Add an interrupt- or DMA-backed
buffer if output must not block execution.

## Reference manual pages

| Topic                                              | Direct link                                                   |
| -------------------------------------------------- | ------------------------------------------------------------- |
| RCC APB peripheral clock enables                   | [RM0008 page 112](../refs/stm32f103x8-reference.pdf#page=112) |
| GPIO modes and `CNF`/`MODE` encoding               | [RM0008 page 161](../refs/stm32f103x8-reference.pdf#page=161) |
| GPIO configuration registers                       | [RM0008 page 171](../refs/stm32f103x8-reference.pdf#page=171) |
| USART3 and USART2 remapping, tables 52 and 53      | [RM0008 page 180](../refs/stm32f103x8-reference.pdf#page=180) |
| USART1 remapping, table 54                         | [RM0008 page 181](../refs/stm32f103x8-reference.pdf#page=181) |
| USART chapter introduction and features            | [RM0008 page 785](../refs/stm32f103x8-reference.pdf#page=785) |
| Transmitter configuration and `TXE`/`TC` procedure | [RM0008 page 791](../refs/stm32f103x8-reference.pdf#page=791) |
| Receiver configuration                             | [RM0008 page 794](../refs/stm32f103x8-reference.pdf#page=794) |
| Fractional baud-rate generation                    | [RM0008 page 798](../refs/stm32f103x8-reference.pdf#page=798) |
| USART register map and `USART_SR`                  | [RM0008 page 818](../refs/stm32f103x8-reference.pdf#page=818) |
| `USART_DR` and `USART_BRR`                         | [RM0008 page 820](../refs/stm32f103x8-reference.pdf#page=820) |
| `USART_CR1`                                        | [RM0008 page 821](../refs/stm32f103x8-reference.pdf#page=821) |
| `USART_CR2`, `USART_CR3`, and `USART_GTPR`         | [RM0008 page 823](../refs/stm32f103x8-reference.pdf#page=823) |
