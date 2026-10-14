# GPIO peripheral

## Main registers

- 32-bit configuration registers (`GPIOx_CRL`, `GPIOx_CRH`)
- 32-bit data registers (`GPIOx_IDR`, `GPIOx_ODR`)
- 32-bit atomic set/restet registers (`GPIOx_BSRR`) - no IRQ interruption
- 16-bit atomic reset register (`GPIOxBRR`) - no IRQ interruption
- 32-bit locking configuration register (`GPIOx_LCKR`)

## GPIO modes

### Input / Output

| Configuration        | `CNF` | `MODE`  | Purpose                                                    | Meaning of `0`         | Meaning of `1`              |
| -------------------- | ----- | ------- | ---------------------------------------------------------- | ---------------------- | --------------------------- |
| GP push-pull output  | `00`  | Nonzero | Drive an LED or digital signal                             | `ODR`: drive low       | `ODR`: drive high           |
| GP open-drain output | `01`  | Nonzero | Drive low or release a shared line                         | `ODR`: drive low       | `ODR`: release the pin      |
| AF push-pull output  | `10`  | Nonzero | Let a peripheral drive the pin, such as USART TX           | Peripheral: drive low  | Peripheral: drive high      |
| AF open-drain output | `11`  | Nonzero | Let a peripheral drive a shared line, such as I2C          | Peripheral: drive low  | Peripheral: release the pin |
| Analog input         | `00`  | `00`    | Measure voltage with the ADC (analog-to-digital converter) | `IDR` always reads `0` | Not reported by `IDR`       |
| Floating input       | `01`  | `00`    | Read a digital signal without a pull resistor              | `IDR`: low             | `IDR`: high                 |
| Input with pull-down | `10`  | `00`    | Default to low. Set `ODR = 0`                              | `IDR`: low             | `IDR`: high                 |
| Input with pull-up   | `10`  | `00`    | Default to high. Set `ODR = 1`                             | `IDR`: low             | `IDR`: high                 |

### Output modes

| `MODE` | Maximum output speed | Purpose                          |
| ------ | -------------------- | -------------------------------- |
| `10`   | 2 MHz                | Slow signals, such as LEDs       |
| `01`   | 10 MHz               | Signals that need faster changes |
| `11`   | 50 MHz               | Fast signals, such as SPI clocks |

## External interrupt / wakeup lines

Configure the pin in input mode

> [!TODO] Create a link to the EXTI

> [!TODO] Create a link to Wakup Event

## Alternate Functions

Alternate functions connect pins to peripherals, such as USART, SPI, I2C, and
timers. Each signal uses specific pins. Some signals can move to other pins
through remapping. See the [STM32F103C8 pinout](../dashboards/pinout.md) for pin
assignments and GPIO configuration.

## Physical Connections

- Connect the grounds of the board and external circuit.
- Use 3.3 V signals. Apply 5 V only to pins and modes that the datasheet
  permits.
- Keep current within the datasheet limits for each pin and for the whole
  device. Do not use absolute maximum ratings as operating targets.
- Add a series resistor to each external LED. Calculate
  `R = (3.3 V - LED voltage) / LED current`.
- Use a transistor or driver for motors, relays, and other high-current loads.
  Add a protection diode across a DC relay coil to limit voltage spikes.
- Use a pull-up resistor to 3.3 V for a default high input, or a pull-down to
  ground for a default low input. A 10 kΩ resistor is a common starting value.
- Internal pull resistors are weak. Use external resistors when the level must
  stay defined during reset or when wires pick up noise.
- Open-drain outputs need pull-ups. For I2C, choose external pull-ups that meet
  the bus timing and current limits. Pull-ups do not belong in series with the
  signal.
- Do not connect two push-pull outputs together or short an output to a supply
  rail.
- PC13 has stricter current and speed limits. Use it for the onboard LED, not
  for high-current loads or fast signals.
