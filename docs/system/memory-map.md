# Memory map

Target device: `STM32F103C8T6` (`STM32F103x8`, medium-density, 64 KiB Flash, 20
KiB SRAM).

## Memory map overview

The [STM32F103x8 datasheet](../../refs/stm32f103x8-datasheet.pdf#page=34)
contains the complete memory map, including peripherals.

![STM32F103x8 memory map](assets/img-20261002-115335.png)

## Top-level Cortex-M3 address space

The processor has a fixed memory map that provides up to 4 GiB of addressable
memory. The memory map in the
[ARM Cortex-M3 Generic User Guide](../../refs/arm-cortex-m3-generic-user-guide.pdf)
can be found in sections 2.2 and 4.1:

![Cortex-M3 address-space diagram](assets/img-20261002-130624.png)

| Address range                 |    Size | Region                 | Notes                                                   |
| ----------------------------- | ------: | ---------------------- | ------------------------------------------------------- |
| `0x0000_0000` - `0x1FFF_FFFF` | 512 MiB | Code                   | Boot alias, embedded Flash, system memory, option bytes |
| `0x2000_0000` - `0x3FFF_FFFF` | 512 MiB | SRAM                   | Internal SRAM plus SRAM bit-band alias area             |
| `0x4000_0000` - `0x5FFF_FFFF` | 512 MiB | Peripheral             | APB/AHB peripherals plus peripheral bit-band alias area |
| `0x6000_0000` - `0x9FFF_FFFF` |   1 GiB | External RAM           | Reserved/not implemented on STM32F103C8T6               |
| `0xA000_0000` - `0xDFFF_FFFF` |   1 GiB | External device        | Reserved/not implemented on STM32F103C8T6               |
| `0xE000_0000` - `0xE00F_FFFF` |   1 MiB | Private Peripheral Bus | Cortex-M3 core peripherals: NVIC, SysTick, SCB, debug   |
| `0xE010_0000` - `0xFFFF_FFFF` | 511 MiB | Vendor/system          | Reserved on this device unless documented otherwise     |

## On-chip memories

| Address range                 |                Size | Region              | Notes                                                                      |
| ----------------------------- | ------------------: | ------------------- | -------------------------------------------------------------------------- |
| `0x0000_0000` - `0x0000_FFFF` | 64 KiB alias window | Boot memory alias   | Aliased to Flash, system memory, or SRAM depending on `BOOT0`/`BOOT1` pins |
| `0x0800_0000` - `0x0800_FFFF` |              64 KiB | Embedded Flash      | Main program Flash for `STM32F103C8T6`                                     |
| `0x1FFF_F000` - `0x1FFF_F7FF` |               2 KiB | System memory       | ST bootloader ROM                                                          |
| `0x1FFF_F7E0` - `0x1FFF_F7E1` |             16 bits | Flash size register | Contains Flash size in KiB; expected `0x0040` for 64 KiB devices           |
| `0x1FFF_F7E8` - `0x1FFF_F7F3` |             96 bits | Unique device ID    | Factory-programmed unique ID                                               |
| `0x1FFF_F800` - `0x1FFF_F80F` |            16 bytes | Option bytes        | Flash protection and boot/configuration options                            |
| `0x2000_0000` - `0x2000_4FFF` |              20 KiB | Embedded SRAM       | Read/write SRAM. It has zero wait states at CPU clock speed.               |

## Bit-band regions

Cortex-M3 bit-banding maps each bit in a 1 MiB source region to a 32-bit word
in a 32 MiB alias region.

| Address range                 | Region                     | Notes                                                                               |
| ----------------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `0x2000_0000` - `0x200F_FFFF` | SRAM bit-band region       | Only the implemented SRAM portion starts at `0x2000_0000`; STM32F103C8T6 has 20 KiB |
| `0x2200_0000` - `0x23FF_FFFF` | SRAM bit-band alias        | Alias words for SRAM bit access                                                     |
| `0x4000_0000` - `0x400F_FFFF` | Peripheral bit-band region | Covers the first 1 MiB of peripheral space                                          |
| `0x4200_0000` - `0x43FF_FFFF` | Peripheral bit-band alias  | Alias words for peripheral bit access                                               |

Bit-band alias formula:

```text
alias = alias_base + (byte_offset * 32) + (bit_number * 4)
```

In this formula, `byte_offset` is `target_address - bit_band_base`, and
`bit_number` is `0..7`.

## Boot alias

After reset, address `0x0000_0000` is mapped according to the boot pin
configuration. The vector table is fetched from this alias region.

Alias mapping by boot mode:

| Boot mode          | Alias at `0x0000_0000` | Physical region | Common use                                           |
| ------------------ | ---------------------- | --------------- | ---------------------------------------------------- |
| Main Flash boot    | Embedded Flash         | `0x0800_0000`   | Normal user program boot                             |
| System memory boot | ST bootloader ROM      | `0x1FFF_F000`   | Built-in serial bootloader/programming               |
| SRAM boot          | Embedded SRAM          | `0x2000_0000`   | Run code loaded into RAM, mostly debug/special cases |

Jumper configuration by boot mode:

| BOOT1 jumper | BOOT0 jumper | Boot mode          |
| ------------ | ------------ | ------------------ |
| `0` or `1`   | `0`          | Main Flash boot    |
| `0`          | `1`          | System memory boot |
| `1`          | `1`          | SRAM boot          |

`BOOT1` is a don't-care value when `BOOT0=0`: both `BOOT1=0, BOOT0=0` and
`BOOT1=1, BOOT0=0` boot from main Flash.

The BOOT pin values are latched shortly after reset. Change the jumpers before
you reset or power-cycle the board. For normal development, leave `BOOT0=0`.
Set `BOOT0=1, BOOT1=0` only when you want the built-in ST bootloader.

## Peripherals

### Cortex-M3 core peripherals

These are ARM core peripherals in the Private Peripheral Bus range, not STM32
APB/AHB peripherals.

| Address range                 | Core peripheral                     |
| ----------------------------- | ----------------------------------- |
| `0xE000_E008` - `0xE000_E00F` | System control block registers      |
| `0xE000_E010` - `0xE000_E01F` | SysTick timer                       |
| `0xE000_E100` - `0xE000_E4EF` | NVIC registers                      |
| `0xE000_ED00` - `0xE000_ED3F` | System control block registers      |
| `0xE000_ED90` - `0xE000_ED93` | MPU type register (no MPU)          |
| `0xE000_EF00` - `0xE000_EF03` | Software trigger interrupt register |

### Bus peripherals

The device's peripheral space starts at `0x4000_0000`. Peripheral registers are
grouped by bus. Peripheral clocks are disabled after reset except SRAM and the
Flash interface. Enable the peripheral's clock in `RCC_AHBENR`, `RCC_APB2ENR`,
or `RCC_APB1ENR` before using it.

#### APB1 peripherals

| Address range                 | Peripheral              | Notes                              |
| ----------------------------- | ----------------------- | ---------------------------------- |
| `0x4000_0000` - `0x4000_03FF` | TIM2                    | General-purpose timer              |
| `0x4000_0400` - `0x4000_07FF` | TIM3                    | General-purpose timer              |
| `0x4000_0800` - `0x4000_0BFF` | TIM4                    | General-purpose timer              |
| `0x4000_2800` - `0x4000_2BFF` | RTC                     | Real-time clock                    |
| `0x4000_2C00` - `0x4000_2FFF` | WWDG                    | Window watchdog                    |
| `0x4000_3000` - `0x4000_33FF` | IWDG                    | Independent watchdog               |
| `0x4000_3800` - `0x4000_3BFF` | SPI2/I2S                | SPI2 peripheral                    |
| `0x4000_4400` - `0x4000_47FF` | USART2                  | USART2                             |
| `0x4000_4800` - `0x4000_4BFF` | USART3                  | USART3                             |
| `0x4000_5400` - `0x4000_57FF` | I2C1                    | I2C1                               |
| `0x4000_5800` - `0x4000_5BFF` | I2C2                    | I2C2                               |
| `0x4000_5C00` - `0x4000_5FFF` | USB device FS registers | USB full-speed device              |
| `0x4000_6000` - `0x4000_63FF` | Shared USB/CAN SRAM     | 512-byte packet/filter SRAM window |
| `0x4000_6400` - `0x4000_67FF` | bxCAN                   | CAN controller                     |
| `0x4000_6C00` - `0x4000_6FFF` | BKP                     | Backup registers                   |
| `0x4000_7000` - `0x4000_73FF` | PWR                     | Power control                      |

#### APB2 peripherals

| Address range                 | Peripheral | Notes                                       |
| ----------------------------- | ---------- | ------------------------------------------- |
| `0x4001_0000` - `0x4001_03FF` | AFIO       | Alternate-function I/O                      |
| `0x4001_0400` - `0x4001_07FF` | EXTI       | External interrupt/event controller         |
| `0x4001_0800` - `0x4001_0BFF` | GPIOA      | GPIO port A                                 |
| `0x4001_0C00` - `0x4001_0FFF` | GPIOB      | GPIO port B                                 |
| `0x4001_1000` - `0x4001_13FF` | GPIOC      | GPIO port C                                 |
| `0x4001_1400` - `0x4001_17FF` | GPIOD      | GPIO port D, limited pins on 48-pin package |
| `0x4001_2400` - `0x4001_27FF` | ADC1       | ADC1                                        |
| `0x4001_2800` - `0x4001_2BFF` | ADC2       | ADC2                                        |
| `0x4001_2C00` - `0x4001_2FFF` | TIM1       | Advanced-control timer                      |
| `0x4001_3000` - `0x4001_33FF` | SPI1       | SPI1                                        |
| `0x4001_3800` - `0x4001_3BFF` | USART1     | USART1                                      |

#### AHB peripherals

| Address range                 | Peripheral             | Notes                          |
| ----------------------------- | ---------------------- | ------------------------------ |
| `0x4002_0000` - `0x4002_03FF` | DMA1                   | 7-channel DMA controller       |
| `0x4002_1000` - `0x4002_13FF` | RCC                    | Reset and clock control        |
| `0x4002_2000` - `0x4002_23FF` | Flash memory interface | Flash access/control registers |
| `0x4002_3000` - `0x4002_33FF` | CRC                    | CRC calculation unit           |
