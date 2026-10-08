<!--
Copyright (C) 2026 Phyxor Microsystems
SPDX-FileContributor: Pablo Palazon

SPDX-License-Identifier: BSD-3-Clause
-->

# Direct-register C

Direct-register C writes peripheral registers at their memory-mapped addresses.
The reference manual defines the addresses, registers, fields, and reset
values.

## Register Header

Use names that show how a register address is built.

| Name form     | Purpose                                            | Example           |
| ------------- | -------------------------------------------------- | ----------------- |
| `*_BASE`      | Peripheral base address.                           | `RCC_BASE`        |
| `*_OFFSET`    | Register byte offset from its base.                | `RCC_CR_OFFSET`   |
| `*_REG`       | Converts a base and offset into a register access. | `RCC_REG(offset)` |
| Register name | Gives a complete register access.                  | `RCC_CR`          |
| Bit mask      | Selects a register bit or field.                   | `RCC_CR_HSION`    |
| Alias         | Gives a common register a fixed peripheral name.   | `GPIOC_CRL`       |

The local header uses this pattern:

```c
#define STM32_REG32(addr) (*(volatile uint32_t *)(uintptr_t)(addr))
#define RCC_BASE 0x40021000u
#define RCC_CR_OFFSET 0x00u
#define RCC_REG(offset) STM32_REG32(RCC_BASE + (offset))
#define RCC_CR RCC_REG(RCC_CR_OFFSET)
#define RCC_CR_HSION (1u << 0)
```

`STM32_REG32` converts an address to a pointer to a 32-bit register. The `*`
dereferences the pointer, so the macro is an assignable register value.

`volatile` tells the compiler that hardware can change the value outside normal
C code. It forces each read and write to access the register. It does not make
a read-modify-write operation atomic.

### Register Operations

Set a bit with `|=`. Clear a bit with `&= ~`. Both operations preserve the
other bits in the register.

```c
/* Enable the GPIOC peripheral clock. */
RCC_APB2ENR |= RCC_APB2ENR_IOPCEN;

/* Disable the GPIOC peripheral clock. */
RCC_APB2ENR &= ~RCC_APB2ENR_IOPCEN;
```

These are read-modify-write operations. Use a peripheral set or reset register
when the reference manual provides one and an interrupt also accesses the
register.

## AI Generated Register Header

Use the datasheet to identify the exact device, package, memory size, and pins.
Use the reference manual for peripheral base addresses, register offsets, bit
fields, access permissions, and reset values.

Generate one small header at a time. Start with the peripheral used by the
application. Compare every generated definition with the manual before use.

Use a prompt with a fixed scope and named source documents:

```text
Create a local C11 direct-register header for the STM32F103C8T6.

Use only these sources:
- docs/refs/stm32f103x8-datasheet.pdf
- docs/refs/stm32f103x8-reference.pdf

Add definitions only for RCC and GPIOC. Use uint32_t, uintptr_t, and volatile.
Define base addresses, register offsets, register-access macros, and bit masks.
Use names in the form RCC_BASE, RCC_CR_OFFSET, RCC_CR, and RCC_CR_HSION.
Add a source comment with the manual section and page for each register group.
Do not add CMSIS, HAL, LL, startup code, clock configuration, or definitions
that are not present in the named source documents. Return the header only.
```

Compile the header with the application. Then compare each address and mask
with the manual and test the peripheral on the board.
