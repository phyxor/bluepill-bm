<!--
Copyright (C) 2026 Phyxor Microsystems
SPDX-FileContributor: Pablo Palazon

SPDX-License-Identifier: BSD-3-Clause
-->

# AGENTS.md

Guidance for AI agents working in this STM32 Blue Pill bare-metal project.

## Project Goal

This repository is a learning project for bare-metal STM32F103C8T6 development
without STM32CubeIDE. Keep the project small, explicit, and educational. Prefer
code that explains the hardware path from reset, linker script, startup code,
registers, and peripherals.

Target hardware:

- Board: Blue Pill development board
- MCU: STM32F103C8T6
- Core: ARM Cortex-M3
- Flash: 64 KiB official C8T6 size
- RAM: 20 KiB
- Debug/programming: ST-Link V2 clone over SWD
- Onboard LED: usually `PC13`, active-low

## Current Tooling

Use the existing Makefile tooling.

Common build commands:

```sh
make
make APP=bare-blink
make APP=cmsis-blink
make clean
```

Flash and debug commands:

```sh
make flash
make openocd
make debug
```

## Repository Layout

Important paths:

- `apps/`: one application per directory
- `apps/bare-blink/`: direct-register LED blink example
- `apps/cmsis-blink/`: CMSIS-based LED blink example
- `system/`: shared runtime code linked into applications
- `system/startup_stm32f103.c`: active startup and vector table
- `system/system_stm32f103.c`: current minimal system initialization
- `system/newlib_stubs.c`: minimal Newlib syscall stubs
- `include/stm32f103c8t6.h`: local direct-register header for `bare-*` apps
- `drivers/cmsis/`: project CMSIS-oriented driver code
- `system/asm/startup_stm32f103c8tx.s`: reference assembly startup, not linked by
  default
- `linker/STM32F103C8TX_FLASH.ld`: active linker script
- `openocd/bluepill.cfg`: OpenOCD config for this board/probe
- `vendor/STM32CubeF1/`: pinned STM32CubeF1 Git submodule
- `build/`: generated build output; do not edit by hand

## Application Naming Rules

Application prefixes define the abstraction layer:

- `bare-*`: direct-register examples using only local project headers
- `cmsis-*`: examples allowed to use vendored CMSIS headers from STM32CubeF1
- `ll-*`: future examples for STM32 LL drivers, only add when explicitly needed
- `hal-*`: future examples for STM32 HAL, only add when explicitly needed

Keep these layers separate. Do not include CMSIS, HAL, LL, or vendor headers in
`bare-*` examples.

## Build Boundaries

The Makefile enforces the current boundary:

- Default `APP` is `bare-blink`.
- Project name is `bluepill-$(APP)`.
- `bare-*` apps compile with `-Iinclude` only.
- `cmsis-*` apps also get CMSIS include paths and `-DUSE_CMSIS -DSTM32F103xB`.
- `drivers/cmsis/*.c` is compiled only for `cmsis-*` apps.

Do not add global CMSIS include paths to all builds. If a new app needs a
layer, make the Makefile condition explicit and prefix the app accordingly.

## CMSIS And Vendor Policy

STM32CubeF1 is a Git submodule at:

```text
vendor/STM32CubeF1
```

Current intended state:

```text
d12e75247d5bcedc734f829b394517ab4c2726e3 vendor/STM32CubeF1 (v1.8.7)
```

The submodule is pinned to ST's official `v1.8.7` release tag. Do not move it
to a branch tip unless explicitly asked.

CMSIS include paths:

```text
vendor/STM32CubeF1/Drivers/CMSIS/Core/Include
vendor/STM32CubeF1/Drivers/CMSIS/Device/ST/STM32F1xx/Include
```

For Blue Pill `STM32F103C8T6`, the STM32CubeF1 device define is:

```text
STM32F103xB
```

CMSIS source files should include the family entry header:

```c
#include "stm32f1xx.h"
```

Do not include `stm32f103xb.h` directly unless there is a concrete reason.

## clangd Policy

Keep clangd configuration layered:

- Root `.clangd`: common C and Cortex-M flags only
- `apps/.clangd`: local include paths, with CMSIS flags for `cmsis-*` paths
- `drivers/cmsis/.clangd`: CMSIS driver include paths and symbols

Do not use global `CPATH` for this project. Do not add CMSIS include paths to
the root `.clangd`.

Known header handling in `drivers/cmsis/.clangd`:

```yaml
---
If:
  PathMatch: .*\.h
CompileFlags:
  Add:
    - -x
    - c-header
```

This avoids clangd guessing Objective-C++ for standalone or empty `.h` files.

## Startup And Linker Rules

The active startup file is `system/startup_stm32f103.c`.

It is responsible for:

- Providing the interrupt vector table
- Loading the initial stack pointer from `_estack`
- Calling `SystemInit()`
- Copying `.data` from flash to RAM
- Clearing `.bss`
- Calling `main()`
- Routing unimplemented interrupts to `Default_Handler`

Interrupt handlers are weak aliases. Defining a function with the same handler
name in an app or driver overrides the default.

The assembly startup file in `asm/` is reference material only. Do not wire it
into the build unless explicitly asked.

The active linker script is `linker/STM32F103C8TX_FLASH.ld` and currently
models:

```text
FLASH: 0x08000000, 64K
RAM:   0x20000000, 20K
```

## Clock Assumptions

`system/system_stm32f103.c` currently keeps the chip on its simple default clock
setup. It does not yet configure HSE, PLL, 72 MHz system clock, flash wait
states, or bus prescalers.

When adding timing-sensitive code, state the assumed clock clearly. SysTick
code and examples should not silently assume 72 MHz until clock setup exists.

## OpenOCD Notes

Use `openocd/bluepill.cfg` for this board. It includes:

```tcl
set CPUTAPID 0x2ba01477
```

This was needed because the board/probe reported Cortex-M3 debug ID
`0x2ba01477`, while the default STM32F1 OpenOCD config expected a different
value.

## Code Style

Keep changes minimal and explicit.

- Prefer direct, readable C over abstractions in early learning examples
- Keep register examples close to the hardware being explained
- Use `volatile` for memory-mapped registers
- Avoid adding compatibility layers without a concrete need
- Avoid introducing HAL or LL into bare-register examples
- Preserve generated-output directories as generated only
- Do not edit vendored STM32CubeF1 files unless explicitly requested
- Prefer small comments that explain hardware intent, not obvious C syntax

## Verification Expectations

For firmware changes, run the smallest relevant build:

```sh
make APP=bare-blink
make APP=cmsis-blink
```

For changes that affect shared runtime, startup, linker, or Makefile behavior,
build both bare and CMSIS examples if available.

## Current Useful Next Steps

Likely future project additions:

1. Add a SysTick interrupt example.
2. Add USART1 output and implement `board_putchar()` for `printf`.
3. Configure the STM32F103 clock tree for 72 MHz.
4. Add more direct-register peripheral examples before introducing higher
   layers.
