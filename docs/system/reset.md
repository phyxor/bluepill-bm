# Reset

## Reset Registers

| Reset type | Other registers | `RCC_CSR` register | Backup domain registers |
| ---------- | :-------------: | :----------------: | :---------------------: |
| System     |        ✓        |         —          |            —            |
| Power      |        ✓        |         ✓          |            —            |
| Backup     |        —        |         —          |            ✓            |

✓ = reset; — = unchanged.

## System Events

| Reset event                               | Reset type | Register and flag to check                     |
| ----------------------------------------- | ---------- | ---------------------------------------------- |
| Low level on NRST                         | System     | `RCC_CSR.PINRSTF`                              |
| Window watchdog timeout                   | System     | `RCC_CSR.WWDGRSTF`                             |
| Independent watchdog timeout              | System     | `RCC_CSR.IWDGRSTF`                             |
| Software reset                            | System     | `RCC_CSR.SFTRSTF`                              |
| Low-power management reset                | System     | `RCC_CSR.LPWRRSTF`                             |
| Power-on/power-down reset                 | Power      | `RCC_CSR.PORRSTF`                              |
| Exit from Standby mode                    | Power      | `PWR_CSR.SBF`                                  |
| Software backup domain reset              | Backup     | No status flag; software sets `RCC_BDCR.BDRST` |
| Power-on after both VDD and VBAT were off | Backup     | No dedicated status flag                       |

Reset flags in `RCC_CSR` remain set until software sets `RCC_CSR.RMVF` or a
power reset occurs. Read these flags before clearing them. More than one flag
can be set. Clear the Standby flag by setting `PWR_CR.CSBF`.
