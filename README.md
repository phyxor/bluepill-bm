<!--
Copyright (C) 2026 Phyxor Microsystems
SPDX-FileContributor: Pablo Palazon

SPDX-License-Identifier: BSD-3-Clause
-->

# Blue Pill Bare-Metal

This project is a learning exercise in developing bare-metal applications for
the Blue Pill board. It includes the code needed to initialize the processor,
write drivers, and build applications. I do not use an official IDE, but I use
vendor dependencies to simplify driver generation.

To make the project practical, I selected the Blue Pill board with an
STM32F103C microcontroller. It is the board I had at home.

![Blue Pill board](docs/assets/img-20260904-094011.png)

- Board: Blue Pill development board
- MCU: STM32F103C8T6
- Core: ARM Cortex-M3
- Flash: 64 KiB official C8T6 size
- RAM: 20 KiB
- Debug/programming: ST-Link V2 clone over SWD
- Onboard LED: usually `PC13`, active-low

## Dependencies

This project includes dependencies as Git submodules to simplify development.
This lets me update or change versions quickly.

- [STMicroelectronics/STM32CubeF1](https://github.com/STMicroelectronics/STM32CubeF1):
  HAL + LL Drivers, CMSIS Core, CMSIS Device, and MW libraries

## Getting started

Clone the repository and initialize its submodules:

```bash
git clone https://github.com/ppalazon/bluepill-bm.git
cd bluepill-bm
git submodule update --init --recursive
```

After cloning the repository and initializing its dependencies, you can compile
and flash the Blue Pill board with an ST-Link V2 connector.

```bash
make APP=cmsis-dma-mem2mem
make APP=cmsis-dma-mem2mem flash
```

## Objectives

The first part covers board initialization and a useful application.

- [x] Collect datasheets and reference manuals for the STM32F103C microcontroller.
- [x] Collect the Blue Pill board manual.
- [x] Document the microcontroller memory map.
- [x] Describe what happens after reset or power-on.
- [x] Prepare the linker script to map flash and RAM.
- [x] Write C runtime code to initialize `.data` and `.bss`.
- [x] Declare the vector table and write startup code that reaches `main()`.

The second part covers peripheral drivers and test applications for each
peripheral.

- [x] GPIO peripheral
- [x] System Tick (SysTick) Timer
- [x] General-Purpose Timers (TIM)
- [x] The Universal Asynchronous Receiver / Transmitter Protocol (UART)
- [x] Analog-to-Digital Converter (ADC)
- [x] Serial Peripheral Interface (SPI)
- [ ] Inter-Integrated Circuit (I2C)
- [x] External Interrupts and Events (EXTI)
- [x] The Real-Time Clock (RTC)
- [x] Independent Watchdog (IWDG)
- [x] Direct Memory Access (DMA)
- [x] Power Management and Energy Efficiency

The third part will generate the same drivers with higher-level libraries, such
as the Hardware Abstraction Layer (HAL) and Low Layer (LL).

Read more about this project in
[the documentation](https://pablo.palazon.dev/bluepill-bm).

## License

The code and documentation in this repository use the
[BSD 3-Clause License](LICENSE). Reference documents and other third-party
material remain under the licenses and terms of their copyright holders.

## Trademark notice

STM32 is a trademark of STMicroelectronics. This independent project uses the
STM32 name only to identify the target device and compatible software. The
project is not affiliated with or endorsed by STMicroelectronics.
