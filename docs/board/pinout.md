<!--
Copyright (C) 2026 Phyxor Microsystems
SPDX-FileContributor: Pablo Palazon

SPDX-License-Identifier: BSD-3-Clause
-->

# STM32F103C8T6 pinout

## Overview

The STM32F103C8T6 uses the medium-density STM32F103x8 pin definition.

![Generic STM32F103 pinout diagram](../assets/img-20260904-094011.png)

The diagram is a practical board reference. The table below is the
authoritative pin mapping from the STM32F103x8 datasheet. `FT` means the
digital input is 5 V-tolerant. Each peripheral section names the GPIO
configuration needed for its signals.

## Encapsulate

This model uses the encapsulate LQFP48 with 48 pines with this distribution:

![image](assets/img-20261003-200529.png)

## Boot pins

These pins affect boot selection. `BOOT0` is sampled at reset. `PB2` is also
labelled `BOOT1` and is used with `BOOT0` by the system boot configuration.

| Pin name    | Type / I/O level | Main function after reset | Alternate functions |
| ----------- | ---------------- | ------------------------- | ------------------- |
| `PB2/BOOT1` | I/O, FT          | `PB2/BOOT1`               | -                   |
| `BOOT0`     | I                | `BOOT0`                   | -                   |

## Voltage pins

Supply and ground pins are not GPIOs. Connect every required supply and ground
pin according to the board design. Do not use these entries as signal pins.

| Pin name | Type / I/O level | Main function after reset | Alternate functions |
| -------- | ---------------- | ------------------------- | ------------------- |
| `VBAT`   | S                | `VBAT`                    | -                   |
| `VSSA`   | S                | `VSSA`                    | -                   |
| `VDDA`   | S                | `VDDA`                    | -                   |
| `VSS_1`  | S                | `VSS_1`                   | -                   |
| `VDD_1`  | S                | `VDD_1`                   | -                   |
| `VSS_2`  | S                | `VSS_2`                   | -                   |
| `VDD_2`  | S                | `VDD_2`                   | -                   |
| `VSS_3`  | S                | `VSS_3`                   | -                   |
| `VDD_3`  | S                | `VDD_3`                   | -                   |

## Reset and clock pins

- GPIO clocks: APB2 port clock for the selected GPIO.
- AFIO: APB2, `RCC_APB2ENR_AFIOEN` for remapping or debug configuration.
- Oscillator and reset control additionally use RCC and backup-domain
  registers, not a peripheral APB clock.

| Function                     | Pin               | Notes                            |
| ---------------------------- | ----------------- | -------------------------------- |
| Reset                        | `NRST`            | External reset input.            |
| Low-speed oscillator input   | `PC14-OSC32_IN`   | `OSC32_IN` after reset.          |
| Low-speed oscillator output  | `PC15-OSC32_OUT`  | `OSC32_OUT` after reset.         |
| High-speed oscillator input  | `PD0-OSC_IN`      | GPIO `PD0` requires remapping.   |
| High-speed oscillator output | `PD1-OSC_OUT`     | GPIO `PD1` requires remapping.   |
| Wakeup                       | `PA0-WKUP`        | `WKUP` alternate function.       |
| Tamper/RTC                   | `PC13-TAMPER-RTC` | `TAMPER-RTC` alternate function. |

## GPIO and special functions

### GPIO configurations

The GPIO configuration selects whether the pin is an input or output, and
whether GPIO or a peripheral controls it.

| Direction | GPIO configuration         | `MODE[1:0]`                                   | `CNF[1:0]` |
| --------- | -------------------------- | --------------------------------------------- | ---------- |
| Input     | Analog input               | `00`                                          | `00`       |
| Input     | Floating input             | `00`                                          | `01`       |
| Input     | Pull-up or pull-down input | `00`                                          | `10`       |
| Output    | GP push-pull output        | `01` (10 MHz), `10` (2 MHz), or `11` (50 MHz) | `00`       |
| Output    | GP open-drain output       | `01` (10 MHz), `10` (2 MHz), or `11` (50 MHz) | `01`       |
| Output    | AF push-pull output        | `01` (10 MHz), `10` (2 MHz), or `11` (50 MHz) | `10`       |
| Output    | AF open-drain output       | `01` (10 MHz), `10` (2 MHz), or `11` (50 MHz) | `11`       |

### GPIOA

- GPIO bus: APB2, `RCC_APB2ENR_IOPAEN`.
- AF remap: APB2, `RCC_APB2ENR_AFIOEN` when needed.
- Peripheral clocks depend on the selected function: `USART1`, `SPI1`, `TIM1`
  on APB2; `USART2`, `TIM2`, and `TIM3` on APB1.

| Pin name   | Type / I/O level | Main function after reset | Alternate functions                                      |
| ---------- | ---------------- | ------------------------- | -------------------------------------------------------- |
| `PA0-WKUP` | I/O              | `PA0`                     | `WKUP`; `USART2_CTS`; `ADC12_IN0`; `TIM2_CH1_ETR`        |
| `PA1`      | I/O              | `PA1`                     | `USART2_RTS`; `ADC12_IN1`; `TIM2_CH2`                    |
| `PA2`      | I/O              | `PA2`                     | `USART2_TX`; `ADC12_IN2`; `TIM2_CH3`                     |
| `PA3`      | I/O              | `PA3`                     | `USART2_RX`; `ADC12_IN3`; `TIM2_CH4`                     |
| `PA4`      | I/O              | `PA4`                     | `SPI1_NSS`; `USART2_CK`; `ADC12_IN4`                     |
| `PA5`      | I/O              | `PA5`                     | `SPI1_SCK`; `ADC12_IN5`                                  |
| `PA6`      | I/O              | `PA6`                     | `SPI1_MISO`; `ADC12_IN6`; `TIM3_CH1`; Remap: `TIM1_BKIN` |
| `PA7`      | I/O              | `PA7`                     | `SPI1_MOSI`; `ADC12_IN7`; `TIM3_CH2`; Remap: `TIM1_CH1N` |
| `PA8`      | I/O, FT          | `PA8`                     | `USART1_CK`; `TIM1_CH1`; `MCO`                           |
| `PA9`      | I/O, FT          | `PA9`                     | `USART1_TX`; `TIM1_CH2`                                  |
| `PA10`     | I/O, FT          | `PA10`                    | `USART1_RX`; `TIM1_CH3`                                  |
| `PA11`     | I/O, FT          | `PA11`                    | `USART1_CTS`; `CANRX`; `USBDM`; `TIM1_CH4`               |
| `PA12`     | I/O, FT          | `PA12`                    | `USART1_RTS`; `CANTX`; `USBDP`; Remap: `TIM1_ETR`        |
| `PA13`     | I/O, FT          | `JTMS/SWDIO`              | Remap: `PA13`                                            |
| `PA14`     | I/O, FT          | `JTCK/SWCLK`              | Remap: `PA14`                                            |
| `PA15`     | I/O, FT          | `JTDI`                    | Remap: `TIM2_CH1_ETR`; Remap: `PA15`; Remap: `SPI1_NSS`  |

### GPIOB

- GPIO bus: APB2, `RCC_APB2ENR_IOPBEN`.
- AF remap: APB2, `RCC_APB2ENR_AFIOEN` when needed.
- Peripheral clocks depend on the selected function: `SPI2`, `I2C1`/`I2C2`,
  `TIM1`, `TIM2`, `TIM3`, `TIM4`, `USART1`, and `USART3`.

| Pin name    | Type / I/O level | Main function after reset | Alternate functions                                 |
| ----------- | ---------------- | ------------------------- | --------------------------------------------------- |
| `PB0`       | I/O              | `PB0`                     | `ADC12_IN8`; `TIM3_CH3`; Remap: `TIM1_CH2N`         |
| `PB1`       | I/O              | `PB1`                     | `ADC12_IN9`; `TIM3_CH4`; Remap: `TIM1_CH3N`         |
| `PB2/BOOT1` | I/O, FT          | `PB2/BOOT1`               | -                                                   |
| `PB3`       | I/O, FT          | `JTDO`                    | Remap: `TIM2_CH2`; Remap: `PB3`; Remap: `TRACESWO`  |
| `PB4`       | I/O, FT          | `JNTRST`                  | Remap: `TIM3_CH1`; Remap: `PB4`; Remap: `SPI1_MISO` |
| `PB5`       | I/O              | `PB5`                     | `I2C1_SMBAI`; Remap: `SPI1_MOSI`                    |
| `PB6`       | I/O, FT          | `PB6`                     | `I2C1_SCL`; `TIM4_CH1`; Remap: `USART1_TX`          |
| `PB7`       | I/O, FT          | `PB7`                     | `I2C1_SDA`; `TIM4_CH2`; Remap: `USART1_RX`          |
| `PB8`       | I/O, FT          | `PB8`                     | `TIM4_CH3`; Remap: `I2C1_SCL`; Remap: `CANRX`       |
| `PB9`       | I/O, FT          | `PB9`                     | `TIM4_CH4`; Remap: `I2C1_SDA`; Remap: `CANTX`       |
| `PB10`      | I/O, FT          | `PB10`                    | `I2C2_SCL`; `USART3_TX`; Remap: `TIM2_CH3`          |
| `PB11`      | I/O, FT          | `PB11`                    | `I2C2_SDA`; `USART3_RX`; Remap: `TIM2_CH4`          |
| `PB12`      | I/O, FT          | `PB12`                    | `SPI2_NSS`; `I2C2_SMBAI`; `USART3_CK`; `TIM1_BKIN`  |
| `PB13`      | I/O, FT          | `PB13`                    | `SPI2_SCK`; `USART3_CTS`; `TIM1_CH1N`               |
| `PB14`      | I/O, FT          | `PB14`                    | `SPI2_MISO`; `USART3_RTS`; Remap: `TIM1_CH2N`       |
| `PB15`      | I/O, FT          | `PB15`                    | `SPI2_MOSI`; Remap: `TIM1_CH3N`                     |

### GPIOC

- GPIO bus: APB2, `RCC_APB2ENR_IOPCEN`.
- Backup-domain and oscillator functions do not use a peripheral APB bus;
  configure the related backup or RCC registers.

| Pin name          | Type / I/O level | Main function after reset | Alternate functions |
| ----------------- | ---------------- | ------------------------- | ------------------- |
| `PC13-TAMPER-RTC` | I/O              | `PC13`                    | `TAMPER-RTC`        |
| `PC14-OSC32_IN`   | I/O              | `PC14`                    | `OSC32_IN`          |
| `PC15-OSC32_OUT`  | I/O              | `PC15`                    | `OSC32_OUT`         |

### GPIOD

- GPIO bus: APB2, `RCC_APB2ENR_IOPDEN`.
- PD0/PD1 are oscillator pins after reset; enable AFIO on APB2 before remapping
  them to GPIO.

| Pin name      | Type / I/O level | Main function after reset | Alternate functions |
| ------------- | ---------------- | ------------------------- | ------------------- |
| `PD0-OSC_IN`  | I                | `OSC_IN`                  | Remap: `PD0`        |
| `PD1-OSC_OUT` | O                | `OSC_OUT`                 | Remap: `PD1`        |

## USART

### `USART1`

- Peripheral bus: APB2, `RCC_APB2ENR_USART1EN`.
- GPIO port bus: APB2 clock for GPIOA or GPIOB, depending on default or
  remapped pins.
- AFIO/remap: APB2, `RCC_APB2ENR_AFIOEN` for PB6/PB7 remapping.

| Signal       | Default pin | Remapped pin | GPIO configuration   | Restrictions                                                                            |
| ------------ | ----------- | ------------ | -------------------- | --------------------------------------------------------------------------------------- |
| `USART1_CK`  | PA8         | -            | AF push-pull output. | Conflicts with `TIM1_CH1` and `MCO`. <br>It is optional for asynchronous USART.         |
| `USART1_TX`  | PA9         | PB6          | AF push-pull output. | PA9 conflicts with `TIM1_CH2`. <br>PB6 conflicts with `I2C1_SCL` and `TIM4_CH1`.        |
| `USART1_RX`  | PA10        | PB7          | Floating input.      | PA10 conflicts with `TIM1_CH3`. <br>PB7 conflicts with `I2C1_SDA` and `TIM4_CH2`.       |
| `USART1_CTS` | PA11        | -            | Floating input.      | Conflicts with `CAN`, `USB`, and `TIM1_CH4`. <br>It is optional for asynchronous USART. |
| `USART1_RTS` | PA12        | -            | AF push-pull output. | Conflicts with `CAN`, `USB`, and `TIM1_ETR`. <br>It is optional for asynchronous USART. |

### `USART2`

- Peripheral bus: APB1, `RCC_APB1ENR_USART2EN`.
- GPIO port bus: APB2, GPIOA clock `RCC_APB2ENR_IOPAEN`.
- AFIO/remap: APB2, `RCC_APB2ENR_AFIOEN` if a remap is selected.

| Signal       | Pin | GPIO configuration   | Restrictions                                                                              |
| ------------ | --- | -------------------- | ----------------------------------------------------------------------------------------- |
| `USART2_CTS` | PA0 | Floating input.      | Conflicts with `ADC12_IN0` and `TIM2_CH1_ETR`. <br>It is optional for asynchronous USART. |
| `USART2_RTS` | PA1 | AF push-pull output. | Conflicts with `ADC12_IN1` and `TIM2_CH2`. <br>It is optional for asynchronous USART.     |
| `USART2_TX`  | PA2 | AF push-pull output. | Conflicts with `ADC12_IN2` and `TIM2_CH3`.                                                |
| `USART2_RX`  | PA3 | Floating input.      | Conflicts with `ADC12_IN3` and `TIM2_CH4`.                                                |
| `USART2_CK`  | PA4 | AF push-pull output. | Conflicts with `ADC12_IN4` and `TIM3`. <br>It is optional for asynchronous USART.         |

### `USART3`

- Peripheral bus: APB1, `RCC_APB1ENR_USART3EN`.
- GPIO port bus: APB2 GPIOB for the default pins.
- AFIO/remap: APB2, `RCC_APB2ENR_AFIOEN`; the PD8-PD12 remap is not bonded.

| Signal       | Default pin | GPIO configuration   | Restrictions                                                                                     |
| ------------ | ----------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `USART3_TX`  | PB10        | AF push-pull output. | PB10 conflicts with `I2C2_SCL` and remapped `TIM2_CH3`.                                          |
| `USART3_RX`  | PB11        | Floating input.      | PB11 conflicts with `I2C2_SDA` and remapped `TIM2_CH4`.                                          |
| `USART3_CK`  | PB12        | AF push-pull output. | Conflicts with `SPI2`, `I2C2_SMBAI`, and `TIM1_BKIN`. <br>It is optional for asynchronous USART. |
| `USART3_CTS` | PB13        | Floating input.      | Conflicts with `SPI2` and `TIM1_CH1N`. <br>It is optional for asynchronous USART.                |
| `USART3_RTS` | PB14        | AF push-pull output. | Conflicts with `SPI2` and `TIM1_CH2N`. <br>It is optional for asynchronous USART.                |

## ADC

### ADC1 and ADC2

- Peripheral bus: APB2, `RCC_APB2ENR_ADC1EN` and/or `ADC2EN`.
- GPIO port bus: APB2 GPIOA or GPIOB clock for the selected channel.
- AFIO is not needed for the ADC channel selection.

The `ADC12_INx` names identify channels shared by ADC1 and ADC2. Analog mode
disconnects the digital GPIO path. The available analog channels are:

| Channel     | GPIO | GPIO configuration | Restrictions                                                                                    |
| ----------- | ---- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `ADC12_IN0` | PA0  | Analog input.      | Conflicts with `USART2_CTS` and `TIM2_CH1_ETR`. <br>ADC1 and ADC2 share this pin.               |
| `ADC12_IN1` | PA1  | Analog input.      | Conflicts with `USART2_RTS` and `TIM2_CH2`. <br>ADC1 and ADC2 share this pin.                   |
| `ADC12_IN2` | PA2  | Analog input.      | Conflicts with `USART2_TX` and `TIM2_CH3`. <br>ADC1 and ADC2 share this pin.                    |
| `ADC12_IN3` | PA3  | Analog input.      | Conflicts with `USART2_RX` and `TIM2_CH4`. <br>ADC1 and ADC2 share this pin.                    |
| `ADC12_IN4` | PA4  | Analog input.      | Conflicts with `SPI1_NSS`, `USART2_CK`, and `TIM3`. <br>ADC1 and ADC2 share this pin.           |
| `ADC12_IN5` | PA5  | Analog input.      | Conflicts with `SPI1_SCK` and `TIM3`. <br>ADC1 and ADC2 share this pin.                         |
| `ADC12_IN6` | PA6  | Analog input.      | Conflicts with `SPI1_MISO`, `TIM3`, and remapped `TIM1_BKIN`. <br>ADC1 and ADC2 share this pin. |
| `ADC12_IN7` | PA7  | Analog input.      | Conflicts with `SPI1_MOSI`, `TIM3`, and remapped `TIM1_CH1N`. <br>ADC1 and ADC2 share this pin. |
| `ADC12_IN8` | PB0  | Analog input.      | Conflicts with `TIM3` and remapped `TIM1_CH2N`. <br>ADC1 and ADC2 share this pin.               |
| `ADC12_IN9` | PB1  | Analog input.      | Conflicts with `TIM3` and remapped `TIM1_CH3N`. <br>ADC1 and ADC2 share this pin.               |

## SPI

### `SPI1`

- Peripheral bus: APB2, `RCC_APB2ENR_SPI1EN`.
- GPIO port bus: APB2 GPIOA for default pins; GPIOB when remapped.
- AFIO/remap: APB2, `RCC_APB2ENR_AFIOEN` for the remapped pin set.

| Signal      | Default pin | Remapped pin | GPIO configuration                                                            | Restrictions                                                                                                                                               |
| ----------- | ----------- | ------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SPI1_NSS`  | PA4         | PA15         | AF push-pull output; floating input when external hardware selects the slave. | PA4 conflicts with `ADC12_IN4`, `USART2_CK`, and `TIM3`. <br>PA15 requires JTAG disable and conflicts with remapped `TIM2`. <br>NSS can use ordinary GPIO. |
| `SPI1_SCK`  | PA5         | PB3          | Master: AF push-pull output; slave: floating input.                           | PA5 conflicts with `ADC12_IN5` and `TIM3`. <br>PB3 requires JTAG disable and conflicts with remapped `TIM2`.                                               |
| `SPI1_MISO` | PA6         | PB4          | Floating input.                                                               | PA6 conflicts with `ADC12_IN6`, `TIM3`, and remapped `TIM1_BKIN`. <br>PB4 requires JTAG disable and conflicts with partial `TIM3` remap.                   |
| `SPI1_MOSI` | PA7         | PB5          | AF push-pull output; floating input in slave mode.                            | PA7 conflicts with `ADC12_IN7`, `TIM3`, and remapped `TIM1_CH1N`. <br>PB5 conflicts with `I2C1_SMBAI` and remapped `TIM3_CH2`.                             |

The `SPI1` remap selects all four signals as a group. Individual signals cannot
move independently.

### `SPI2`

- Peripheral bus: APB1, `RCC_APB1ENR_SPI2EN`.
- GPIO port bus: APB2 GPIOB, `RCC_APB2ENR_IOPBEN`.
- AFIO/remap: APB2 `RCC_APB2ENR_AFIOEN` only if another mapping is selected.

| Signal      | Pin  | GPIO configuration                                  | Restrictions                                               |
| ----------- | ---- | --------------------------------------------------- | ---------------------------------------------------------- |
| `SPI2_NSS`  | PB12 | Master: AF push-pull output; slave: floating input. | Conflicts with `USART3_CK`, `I2C2_SMBAI`, and `TIM1_BKIN`. |
| `SPI2_SCK`  | PB13 | Master: AF push-pull output; slave: floating input. | Conflicts with `USART3_CTS` and `TIM1_CH1N`.               |
| `SPI2_MISO` | PB14 | Floating input.                                     | Conflicts with `USART3_RTS` and `TIM1_CH2N`.               |
| `SPI2_MOSI` | PB15 | Master: AF push-pull output; slave: floating input. | Conflicts with `TIM1_CH3N`.                                |

`SPI2` has no alternative pin mapping. In slave mode, NSS and SCK are inputs.

## I2C

### `I2C1`

- Peripheral bus: APB1, `RCC_APB1ENR_I2C1EN`.
- GPIO port bus: APB2 GPIOB, `RCC_APB2ENR_IOPBEN`.
- AFIO/remap: APB2, `RCC_APB2ENR_AFIOEN` for the `I2C1` remap.

| Signal       | Default pin | Remapped pin | GPIO configuration | Restrictions                                                                                                    |
| ------------ | ----------- | ------------ | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `I2C1_SCL`   | PB6         | PB8          | AF open-drain.     | PB6 conflicts with `TIM4_CH1` and remapped `USART1_TX`. <br>PB8 conflicts with `TIM4_CH3` and remapped `CANRX`. |
| `I2C1_SDA`   | PB7         | PB9          | AF open-drain.     | PB7 conflicts with `TIM4_CH2` and remapped `USART1_RX`. <br>PB9 conflicts with `TIM4_CH4` and remapped `CANTX`. |
| `I2C1_SMBAI` | PB5         | -            | AF open-drain.     | Conflicts with remapped `SPI1_MOSI` and remapped `TIM3_CH2`.                                                    |

### `I2C2`

- Peripheral bus: APB1, `RCC_APB1ENR_I2C2EN`.
- GPIO port bus: APB2 GPIOB, `RCC_APB2ENR_IOPBEN`.

| Signal       | Pin  | GPIO configuration | Restrictions                                             |
| ------------ | ---- | ------------------ | -------------------------------------------------------- |
| `I2C2_SCL`   | PB10 | AF open-drain.     | Conflicts with `USART3_TX` and remapped `TIM2_CH3`.      |
| `I2C2_SDA`   | PB11 | AF open-drain.     | Conflicts with `USART3_RX` and remapped `TIM2_CH4`.      |
| `I2C2_SMBAI` | PB12 | AF open-drain.     | Conflicts with `SPI2_NSS`, `USART3_CK`, and `TIM1_BKIN`. |

I2C pins require AF open-drain mode and pull-up resistors. They cannot also be
push-pull USART, SPI, or timer outputs.

## Timers

- `TIM1` peripheral bus: APB2, `RCC_APB2ENR_TIM1EN`.
- `TIM2`, `TIM3`, and `TIM4` peripheral bus: APB1, their corresponding
  `RCC_APB1ENR_TIMxEN` bit.
- GPIO port clocks: APB2 for the port containing the selected pin.
- AFIO/remap: APB2, `RCC_APB2ENR_AFIOEN` for remapped channels.

### `TIM1`

| Signal      | Default pin | Remapped pin | GPIO configuration   | Restrictions                                                                                               |
| ----------- | ----------- | ------------ | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `TIM1_CH1`  | PA8         | -            | AF push-pull output. | Conflicts with `USART1_CK` and `MCO`.                                                                      |
| `TIM1_CH2`  | PA9         | -            | AF push-pull output. | Conflicts with `USART1_TX`.                                                                                |
| `TIM1_CH3`  | PA10        | -            | AF push-pull output. | Conflicts with `USART1_RX`.                                                                                |
| `TIM1_CH4`  | PA11        | -            | AF push-pull output. | Conflicts with `USART1_CTS`, default `CANRX`, and `USBDM`.                                                 |
| `TIM1_ETR`  | -           | PA12         | Floating input.      | Conflicts with `USART1_RTS`, default `CANTX`, and `USBDP`.                                                 |
| `TIM1_BKIN` | PB12        | PA6          | Floating input.      | PB12 conflicts with `SPI2`, `I2C2_SMBAI`, and `USART3_CK`. <br>PA6 conflicts with `SPI1`, ADC, and `TIM3`. |
| `TIM1_CH1N` | PB13        | PA7          | AF push-pull output. | PB13 conflicts with `SPI2` and `USART3_CTS`. <br>PA7 conflicts with `SPI1`, ADC, and `TIM3`.               |
| `TIM1_CH2N` | PB14        | PB0          | AF push-pull output. | PB14 conflicts with `SPI2` and `USART3_RTS`. <br>PB0 conflicts with ADC and `TIM3`.                        |
| `TIM1_CH3N` | PB15        | PB1          | AF push-pull output. | PB15 conflicts with `SPI2`. <br>PB1 conflicts with ADC and `TIM3`.                                         |

### `TIM2`

| Signal         | Default pin | Remapped pin | GPIO configuration                                                  | Restrictions                                                                                                                                                  |
| -------------- | ----------- | ------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TIM2_CH1_ETR` | PA0         | PA15         | Input/capture: floating input; output compare: AF push-pull output. | PA0 conflicts with `USART2` and ADC. <br>PA15 requires JTAG disable and conflicts with remapped `SPI1`. <br>CH1 and ETR cannot use the selected pin together. |
| `TIM2_CH2`     | PA1         | PB3          | Input/capture: floating input; output compare: AF push-pull output. | PA1 conflicts with `USART2` and ADC. <br>PB3 requires JTAG disable and conflicts with remapped `SPI1`.                                                        |
| `TIM2_CH3`     | PA2         | PB10         | Input/capture: floating input; output compare: AF push-pull output. | PA2 conflicts with `USART2` and ADC. <br>PB10 conflicts with `I2C2` and `USART3`.                                                                             |
| `TIM2_CH4`     | PA3         | PB11         | Input/capture: floating input; output compare: AF push-pull output. | PA3 conflicts with `USART2` and ADC. <br>PB11 conflicts with `I2C2` and `USART3`.                                                                             |

### `TIM3`

| Signal     | Default pin | Remapped pin | GPIO configuration                                                  | Restrictions                                                                                                           |
| ---------- | ----------- | ------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `TIM3_CH1` | PA6         | PB4          | Input/capture: floating input; output compare: AF push-pull output. | PA6 conflicts with `SPI1`, ADC, and remapped `TIM1`. <br>PB4 requires JTAG disable and conflicts with remapped `SPI1`. |
| `TIM3_CH2` | PA7         | PB5          | Input/capture: floating input; output compare: AF push-pull output. | PA7 conflicts with `SPI1`, ADC, and remapped `TIM1`. <br>PB5 conflicts with `I2C1_SMBAI` and remapped `SPI1`.          |
| `TIM3_CH3` | PB0         | -            | Input/capture: floating input; output compare: AF push-pull output. | Conflicts with ADC and remapped `TIM1_CH2N`.                                                                           |
| `TIM3_CH4` | PB1         | -            | Input/capture: floating input; output compare: AF push-pull output. | Conflicts with ADC and remapped `TIM1_CH3N`.                                                                           |

### `TIM4`

| Signal     | Pin | GPIO configuration                                                  | Restrictions                                         |
| ---------- | --- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `TIM4_CH1` | PB6 | Input/capture: floating input; output compare: AF push-pull output. | Conflicts with `I2C1_SCL` and remapped `USART1_TX`.  |
| `TIM4_CH2` | PB7 | Input/capture: floating input; output compare: AF push-pull output. | Conflicts with `I2C1_SDA` and remapped `USART1_RX`.  |
| `TIM4_CH3` | PB8 | Input/capture: floating input; output compare: AF push-pull output. | Conflicts with remapped `I2C1` and remapped `CANRX`. |
| `TIM4_CH4` | PB9 | Input/capture: floating input; output compare: AF push-pull output. | Conflicts with remapped `I2C1` and remapped `CANTX`. |

Input/capture and output-compare/PWM use different GPIO modes. They cannot be
active on the same channel at the same time.

## `CAN` and `USB`

- `CAN` peripheral bus: APB1, `RCC_APB1ENR_CANEN`.
- `USB` peripheral bus: APB1, `RCC_APB1ENR_USBEN`.
- GPIO port bus: APB2 GPIOA for default `USB`/`CAN` pins; GPIOB for remapped
  `CAN`.
- AFIO/remap: APB2, `RCC_APB2ENR_AFIOEN` for remapped `CAN`.

| Peripheral | Signal  | Default pin | Remapped pin | GPIO configuration   | Restrictions                                                                                                                                                    |
| ---------- | ------- | ----------- | ------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CAN`      | `CANRX` | PA11        | PB8          | Floating input.      | PA11 conflicts with `USBDM`, `USART1_CTS`, and `TIM1_CH4`. <br>PB8 conflicts with remapped `I2C1` and `TIM4_CH3`. <br>`CAN` remapping moves RX and TX together. |
| `CAN`      | `CANTX` | PA12        | PB9          | AF push-pull output. | PA12 conflicts with `USBDP`, `USART1_RTS`, and `TIM1_ETR`. <br>PB9 conflicts with remapped `I2C1` and `TIM4_CH4`. <br>`CAN` remapping moves RX and TX together. |
| `USB`      | `USBDM` | PA11        | -            | AF push-pull output. | Fixed to PA11. <br>It conflicts with default `CANRX`, `USART1_CTS`, and `TIM1_CH4`.                                                                             |
| `USB`      | `USBDP` | PA12        | -            | AF push-pull output. | Fixed to PA12. <br>It conflicts with default `CANTX`, `USART1_RTS`, and `TIM1_ETR`.                                                                             |

## Debug

- Debug pins are controlled by the Cortex-M3 debug block; no peripheral bus
  clock is needed for the pin function.
- AFIO/debug configuration uses APB2, `RCC_APB2ENR_AFIOEN`.
- The GPIO port clock is APB2 if the pins are released and reused as GPIO.

| Debug signal  | Pin  | Reset-time name | GPIO configuration             | Restrictions                                                                                                       |
| ------------- | ---- | --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `SWDIO`       | PA13 | `JTMS`          | Debug controller owns the pin. | Unavailable for GPIO while SWD is active. <br>Disable the complete debug interface to reclaim it.                  |
| `SWCLK`       | PA14 | `JTCK`          | Debug controller owns the pin. | Unavailable for GPIO while SWD is active. <br>Disable the complete debug interface to reclaim it.                  |
| JTAG data in  | PA15 | `JTDI`          | Debug controller owns the pin. | Disable JTAG with `AFIO_MAPR.SWJ_CFG` before using remapped `SPI1` or `TIM2`.                                      |
| JTAG data out | PB3  | `JTDO`          | Debug controller owns the pin. | Disable JTAG with `AFIO_MAPR.SWJ_CFG` before using remapped `SPI1` or `TIM2`. <br>`TRACESWO` cannot share the pin. |
| JTAG reset    | PB4  | `JNTRST`        | Debug controller owns the pin. | Disable JTAG with `AFIO_MAPR.SWJ_CFG` before using remapped `SPI1` or `TIM3`.                                      |

## Practical notes

- `PC13`, `PC14`, and `PC15` are supplied through a power switch. Limit their
  output speed to 2 MHz, keep the load at or below 30 pF, and do not use them
  as current sources. The Blue Pill LED normally uses `PC13` and is active-low.
- `PA13` and `PA14` are used by SWD as `SWDIO` and `SWCLK`. Keep them available
  while debugging unless the debug interface has deliberately been disabled.
- `PB3`, `PB4`, and `PA15` are JTAG pins after reset. Releasing JTAG while
  retaining SWD requires the AFIO debug configuration described in the
  reference manual.
- `PD0` and `PD1` are oscillator pins after reset. Their GPIO functions are
  available only after the relevant remap and clock configuration.
- `FT` means 5 V-tolerant digital input, not that the pin can be powered from 5
  V. The supply voltage remains within the STM32F103 operating limits.

## References

| Topic                 | Direct link                                                                       |
| --------------------- | --------------------------------------------------------------------------------- |
| Pinout diagram        | [STM32F103x8 datasheet page 26](../../refs/stm32f103x8-datasheet.pdf#page=26)     |
| Pin definitions       | [STM32F103x8 datasheet pages 28-33](../../refs/stm32f103x8-datasheet.pdf#page=28) |
| AF remapping          | [RM0008 page 175](../../refs/stm32f103x8-reference.pdf#page=175)                  |
| AFIO mapping register | [RM0008 page 184](../../refs/stm32f103x8-reference.pdf#page=184)                  |
