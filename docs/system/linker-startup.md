# Linker and Startup

## STM32 Memory Models

| Memory | Start         | End           | Size   |
| ------ | ------------- | ------------- | ------ |
| Flash  | `0x0800_0000` | `0x0800_FFFF` | 64 KiB |
| SRAM   | `0x2000_0000` | `0x2000_4FFF` | 20 KiB |

## Linker Script

The linker script is `linker/STM32F103C8TX_FLASH.ld`.

| Section                           | VMA   | LMA   | Loadable | Allocatable |
| --------------------------------- | ----- | ----- | -------- | ----------- |
| `.isr_vector`, `.text`, `.rodata` | Flash | Flash | Yes      | Yes         |
| `.data`, `.ramfunc`               | SRAM  | Flash | Yes      | Yes         |
| `.bss`, `._user_heap_stack`       | SRAM  | None  | No       | Yes         |
| `.debug_*`, `.comment`, `.note*`  | None  | None  | No       | No          |

- The VMA (Virtual Memory Address) is the address used while the firmware runs.
- The LMA (Load Memory Address) is the address in the firmware image.

Flash sections use the same VMA and LMA.

`.data` and `.ramfunc` use Flash as the LMA and SRAM as the VMA.

### Linker Script Sections

The linker places sections in this order:

1. `.isr_vector` starts at the beginning of Flash. It contains the initial
   stack pointer, reset handler, core exception handlers, and peripheral IRQ
   handlers.
2. `.text` contains code. `.rodata` contains read-only data. Both are in Flash.
3. `.data` contains initialized writable data. Startup copies it from Flash to
   SRAM. `.ramfunc` also runs from SRAM and loads from Flash.
4. `.bss` contains zero-initialized data in SRAM. Startup clears it.
5. `._user_heap_stack` reserves 512 bytes for the heap and 1024 bytes for the
   stack in SRAM.

### Linker Script Directives

| Directive              | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `MEMORY`               | Defines the `Flash` and `SRAM` regions.                     |
| `ENTRY(Reset_Handler)` | Sets the `ELF` entry symbol.                                |
| `SECTIONS`             | Defines output sections and merges matching input sections. |
| `KEEP()`               | Prevents linker garbage collection of a section.            |
| `> FLASH` or `> RAM`   | Sets the `VMA` region for an output section.                |
| `ALIGN(n)`             | Rounds an address up to an `n`-byte boundary.               |
| `PROVIDE()`            | Defines a symbol when no other object defines it.           |
| `AT > FLASH`           | Sets the `LMA` region for an output section.                |
| `.`                    | Is the current location counter.                            |

## Startup file

The active startup file is `system/startup_stm32f103.c`.

### Tasks to perform

- Implementing the vector table `.isr_vector`
- Creating interrupt handlers (Default Handlers)
- Establishing the firmware’s entry point (Implement the `ENTRY` -
  `Reset_Handler`)
- Transferring the `.data` section (From `FLASH` to `SRAM`)
- Zeroing the `.bss` section (Initializing to `0`)

### CPU execution flow

With `BOOT0=0`, the CPU uses this reset sequence:

1. Flash at `0x0800_0000` is aliased to `0x0000_0000`.
2. The CPU loads the initial stack pointer from vector table word 0.
3. The CPU loads `Reset_Handler` from vector table word 1.
4. `Reset_Handler` calls `SystemInit`.
5. `Reset_Handler` copies `.data` from Flash to SRAM.
6. `Reset_Handler` clears `.bss` in SRAM.
7. `Reset_Handler` calls `main`.

`main` runs from Flash unless the linker places its code in `.ramfunc`.
