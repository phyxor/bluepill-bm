# C development models

| Model             | Register access                          | Main dependency               | Hardware visibility     | Best first use                      |
| ----------------- | ---------------------------------------- | ----------------------------- | ----------------------- | ----------------------------------- |
| Direct-register C | Project-owned addresses and masks        | Local headers                 | Highest                 | Learn the hardware sequence         |
| CMSIS             | Vendor device structs and ARM core APIs  | CMSIS-Core and device headers | High                    | Use standard names and core helpers |
| STM32 LL          | Thin vendor peripheral functions         | STM32 LL drivers              | Medium                  | Reduce register boilerplate         |
| STM32 HAL         | Higher-level peripheral handles and APIs | STM32 HAL and configuration   | Lower                   | Build features quickly              |
| RTOS application  | APIs provided by an operating system     | RTOS plus a hardware layer    | Depends on lower layers | Coordinate concurrent tasks         |
