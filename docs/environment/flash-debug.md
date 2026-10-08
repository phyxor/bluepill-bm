<!--
Copyright (C) 2026 Phyxor Microsystems
SPDX-FileContributor: Pablo Palazon

SPDX-License-Identifier: BSD-3-Clause
-->

# Flash and Debug

The flash process is the last step to finish the building process. We already
have the ELF file, so we need a way to copy into the target board. This step is
done with `OpenOCD` which connect to the target board with an specific device
(ST-Link v2). This device is an interface between our computer (USB) and the
debug pins in the board (SWD), and talks its own protocol (SWD).

To talk to the board we need a configuration file of `OpenOCD`
(`openocd/bluepill.cfg`) and some instruction to execute. With this tool we
execute the following `Makefile` steps:

- `flash`: Move the ELF file to the Flash ROM in the microcontroller.
- `debug-server`: Configure the microcontroller for a remote debugging session.
- `openocd`: Manual operations on the microcontroller

```c
make APP=cmsis-blink flash
make APP=cmsis-blink debug-server
make APP=cmsis-blink openocd
```

## Debug Session

To start a debug session on the target board, you have to initialize two
processes:

- OpenOCD debug server
    - Interface between ST-Link and STM32 through SWD
    - GDB Server (port `3333`)
- GDB debugger (DAP protocol)
    - Interface between ELF symbols and GDB Server

With this configuration we create a Server-Client communication using the DAP
protocol.

```mermaid
flowchart LR
  GDB -->|TCP port 3333| OpenOCD --> STLink["ST-Link"] --> SWD --> STM32F103
```

To initialize a debug session you can do it:

- Only terminal: `make APP=cmsis-blink debug`
- Remote debug with DAP editor
    - Terminal: `make APP=cmsis-blink debug-server`
    - Open DAP application from `nvim`

### GDB commands

Run these commands at the GDB prompt after `make APP=cmsis-blink debug`
connects to OpenOCD.

#### Stop and run

| Command | Action |
| --- | --- |
| `monitor reset halt` | Reset the microcontroller and stop it before the first instruction. |
| `monitor halt` | Stop the running microcontroller. |
| `continue` | Continue execution until a breakpoint, fault, or another stop event. |
| `step` | Execute the next source line. Enter a called function. |
| `next` | Execute the next source line. Step over a called function. |
| `stepi` | Execute one machine instruction. |
| `Ctrl-C` | Stop execution while GDB continues the program. |

#### Breakpoints and call stack

| Command | Action |
| --- | --- |
| `break main` | Stop when `main` starts. |
| `break file.c:42` | Stop at line 42 of `file.c`. |
| `info breakpoints` | List the active breakpoints. |
| `delete 1` | Delete breakpoint number 1. |
| `backtrace` | List the current call stack. |
| `frame 1` | Select stack frame 1. |
| `list` | Show the source code near the current line. |

#### Registers and memory

| Command | Action |
| --- | --- |
| `info registers` | List the core register values. |
| `p/x $pc` | Print the program counter in hexadecimal. |
| `p/x $sp` | Print the stack pointer in hexadecimal. |
| `x/4i $pc` | Show four machine instructions at the program counter. |
| `x/4xw 0x20000000` | Show four 32-bit words from SRAM. |
| `x/16xb 0x20000000` | Show 16 bytes from SRAM. |
| `x/4xw &variable` | Show four 32-bit words at `variable`. |
| `print/x variable` | Print `variable` in hexadecimal. |
| `set var variable = 0` | Write a new value to `variable`. This changes target state. |

See the [GDB manual](https://sourceware.org/gdb/current/onlinedocs/gdb/) for the
complete command reference.

## OpenOCD Operations

Run these commands at the OpenOCD Telnet prompt after the server connects to the
board. OpenOCD uses Telnet port `4444` by default.

### Target control

| Command | Action |
| --- | --- |
| `targets` | List the configured targets. |
| `reset halt` | Reset the microcontroller and stop it before the first instruction. |
| `halt` | Stop the running microcontroller. |
| `resume` | Continue execution from the current program counter. |
| `step` | Execute one instruction while the microcontroller is stopped. |
| `reset run` | Reset the microcontroller and run the application. |

### Inspect registers and memory

Stop the microcontroller before you read its core registers.

| Command | Action |
| --- | --- |
| `reg` | List the core registers. |
| `reg pc` | Read the program counter. |
| `mdw 0x20000000 4` | Read four 32-bit words from SRAM. |
| `mdw 0x08000000 4` | Read the first four 32-bit words from Flash. |
| `mww <address> <value>` | Write one 32-bit word to memory. This changes target state. |
| `dump_image memory.bin 0x20000000 256` | Save 256 bytes of SRAM to `memory.bin`. |

### Program Flash

Use `program` for routine Flash programming. It prepares the target, writes the
ELF file, makes sure that the written image matches the file, and resets the
microcontroller.

```text
program build/bluepill-cmsis-blink.elf verify reset
```

Use the lower-level commands when you need separate programming steps:

```text
reset init
flash write_image erase build/bluepill-cmsis-blink.elf
flash verify_image build/bluepill-cmsis-blink.elf
reset run
```

Do not run the next command unless you want to erase the complete application
Flash. It erases the configured Flash bank.

```text
flash erase_address 0x08000000 0
```

| Command | Action |
| --- | --- |
| `flash banks` | List the configured Flash banks. |
| `flash info 0` | Show the Flash bank and sector information. |
| `flash verify_image build/bluepill-cmsis-blink.elf` | Make sure that Flash matches the ELF file. |

### Stop OpenOCD

```text
shutdown
```

`shutdown` closes the OpenOCD server and disconnects its clients.

See the [OpenOCD User Guide](https://openocd.org/doc-release/html/index.html)
for the complete command reference.
