<!--
Copyright (C) 2026 Phyxor Microsystems
SPDX-FileContributor: Pablo Palazon

SPDX-License-Identifier: BSD-3-Clause
-->

# Blue Pill Bare-Metal

This site explains bare-metal development for the Blue Pill board with an
STM32F103C microcontroller. Follow the documentation to identify the hardware,
configure peripherals, and build applications.

## Getting Started

1. Read the [board information](board/info.md) and
   [pinout](board/pinout.md).
2. Build and test the [bare blink application](apps/bare-blink.md).
3. Read [Build Process](environment/build.md) and
   [Flash and Debug](environment/flash-debug.md) before programming the board.

## Project Structure

- `apps/` contains example applications.
- `drivers/` contains project driver code.
- `include/` contains local headers for direct-register applications.
- `system/` contains startup and runtime code.
- `linker/` contains linker scripts.
- `openocd/` contains the board and debug-probe configuration.
- `docs/` contains this documentation.

## Development Workflow

1. Identify the board, microcontroller, pins, memory, and clock requirements.
2. Read the system documentation for the memory map, reset path, linker script,
   and startup code.
3. Configure a peripheral and verify it with a small application.
4. Build the firmware, flash it with an ST-Link probe, and debug it through SWD.

## Build, Flash, and Debug


```sh
make
make APP=app-name
make APP=cmsis-blink
make APP=cmsis-blink flash
make APP=cmsis-blink openocd
make APP=cmsis-blink debug
make APP=cmsis-blink debug-server
```

## Documentation Map

- [Board](board/info.md): Board hardware and package pinout.
- [System](system/memory-map.md): Memory, reset, startup, linker, and clock
  documentation.
- [Peripherals](peripherals/gpio.md): GPIO, ADC, timers, USART, and SysTick.
- [Development Models](dev-models/abstraction-layers.md): Direct-register C and
  CMSIS development.
- [Applications](apps/bare-blink.md): Small hardware experiments.
- [Environment](environment/development.md): Development tools, build, flash,
  debug, and documentation procedures.

## Reference Manuals

Use these primary documents for device facts:

- [Reference Manual: STM32F1](refs/stm32f103x8-reference.pdf): Describes
  STM32F1 registers and peripherals.
- [Datasheet: STM32F103C](refs/stm32f103x8-datasheet.pdf): Lists device
  features, limits, and pin assignments.
- [ARM User Guide: Cortex-M3](refs/arm-cortex-m3-generic-user-guide.pdf):
  Describes the Cortex-M3 processor and its core peripherals.
