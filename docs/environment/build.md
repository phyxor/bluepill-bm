# Build Process

What we want to create is an embedded application to run on the Blue Pill
board. To perform this task, you have to create the correct startup code,
cross-compile the application on an x86 computer, and copy it to an ARM board.

The main file for this process is the `Makefile`, which contains all the steps
to build the application and flash it onto the board.

## Building process

The build process is the same for all applications, so you have to select the
application when you run the `make` command. The variable that specifies the
application is `APP`. For example, to build the `cmsis-blink` application, run:

```c
make APP=cmsis-blink
```

The command creates these files in the `build/` folder:

- `bluepill-cmsis-blink.elf` is the executable file. It contains the program,
  addresses, and debug information.
- `bluepill-cmsis-blink.bin` is a raw binary copy of the program.
- `bluepill-cmsis-blink.hex` is an Intel HEX text file. It contains program
  data and addresses.
- `bluepill-cmsis-blink.map` is a linker map file. It shows where the linker
  placed each program section and symbol.

### Compilation process

The first step is to create an object file for each source file.

1. Preprocess: Expand `#include` files, `#define` macros, and conditional
   blocks such as `#if`.
2. Compile: Translate the preprocessed C code into ARM Thumb assembly. This
   Makefile selects Cortex-M3 Thumb instructions with
   `-mcpu=cortex-m3 -mthumb`.
3. Assemble: Translate the assembly into machine-code sections and symbols in
   an ELF relocatable object file.
4. Write the object file: GCC writes the result to
   `build/apps/bare-blink/main.o.`

The Makefile uses these C compiler flags for all applications:

- `-mcpu=cortex-m3` selects the Cortex-M3 processor.
- `-mthumb` generates Thumb instructions.
- `-Wall` enables common compiler warnings.
- `-Wextra` enables extra compiler warnings.
- `-Werror` treats warnings as errors.
- `-ffunction-sections` puts each function in a separate section.
- `-fdata-sections` puts each data item in a separate section.
- `-g3` adds debug information, including macro definitions.
- `-O0` disables compiler optimization.
- `-std=c11` uses the C11 language standard.
- `-Iinclude` searches the local `include/` directory for header files.

The Makefile adds these flags only for `cmsis-*` applications:

- `-I$(CMSIS_CORE_INC)` searches the CMSIS core header directory.
- `-I$(CMSIS_DEVICE_INC)` searches the STM32F1 device header directory.
- `-I$(CMSIS_DRIVER_DIR)` searches the project CMSIS driver header directory.
- `-DUSE_CMSIS` defines the `USE_CMSIS` macro.
- `-DSTM32F103xB` defines the STM32F103xB device macro.

The compiler does not link the object file into the final executable because
the linker requires special options.

### Link process

After the compiler produces all object files, the linker produces the final ELF
executable. This step depends completely on the target board, so you have to be
careful and read the datasheets and the reference manual. You should pay
attention to how the board starts and put the information exactly where the
board expects it.

The linker needs these components:

- `$(OBJECTS)` is the list of compiled object files.
- `$(LINKER_SCRIPT)` is `linker/STM32F103C8TX_FLASH.ld`. It defines the Flash
  and RAM memory regions and the layout of the final program.
- `$(LDLIBS)` is `-lm`. It links the C math library.
- `-o $@` writes the final executable to the ELF target file.

The Makefile uses these linker options:

- `-mcpu=cortex-m3` selects the Cortex-M3 processor.
- `-mthumb` selects Thumb instructions.
- `-T$(LINKER_SCRIPT)` gives the linker the memory layout file.
- `-nostartfiles` does not link the standard C startup files. The project uses
  its own startup code.
- `-Wl,--gc-sections` passes `--gc-sections` to the linker. It removes unused
  functions and data sections.
- `-Wl,-Map=$(BUILD_DIR)/$(PROJECT).map` passes a map-file name to the linker.
  The linker writes the addresses of sections and symbols to this file.
- `--specs=nano.specs` selects the small Newlib C library configuration.
- `--specs=nosys.specs` selects stub system-call functions for this target.

The build produces the ELF files that you flash onto the target board. We also
generate more output files such as `.bin` and `.hex` for debugging and
analysis.

### Linker script

The linker script is `linker/STM32F103C8TX_FLASH.ld`.

#### Memory regions

- `FLASH` starts at `0x08000000` and has a size of 64 KiB.
    - Vector table, program code, read-only data, and initial values.
- `RAM` starts at `0x20000000` and has a size of 20 KiB.
    - Variables, the heap, and the stack.
    - `_Min_Heap_Size` reserves `0x200`, or 512 bytes, for the heap.
    - `_Min_Stack_Size` reserves `0x400`, or 1024 bytes, for the stack.

#### Script parts

- `ENTRY(Reset_Handler)` sets `Reset_Handler` as the program entry point.
- `MEMORY` defines the Flash and RAM regions that the linker can use.
- `_estack` sets the first stack address to the end of RAM.
- `.isr_vector` stores the interrupt vector table at the start of Flash.
- `.text` stores program instructions in Flash.
- `.rodata` stores read-only data, such as constant values and strings, in
  Flash.
- `.data` stores initialized variables in RAM.
- `.ramfunc` stores functions or data that must run from RAM.
- `.bss` stores zero-initialized variables in RAM.
