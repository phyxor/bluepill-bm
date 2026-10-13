# Interrupts

## CMSIS NVIC registers

The Nested Vectored Interrupt Controller (NVIC) controls peripheral interrupt
delivery
[Cortex-M3 Generic User Guide, section 4.2](../refs/arm-cortex-m3-generic-user-guide.pdf#page=129).

### Functions and macros

| Function or macro                                      | Use                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `NVIC_EnableIRQ(irq)`                                  | Enable one peripheral IRQ.                                                    |
| `NVIC_DisableIRQ(irq)`                                 | Disable one peripheral IRQ. The active handler continues.                     |
| `NVIC_GetEnableIRQ(irq)`                               | Return `1` if the IRQ is enabled.                                             |
| `NVIC_SetPendingIRQ(irq)`                              | Set the NVIC pending bit.                                                     |
| `NVIC_ClearPendingIRQ(irq)`                            | Clear the NVIC pending bit, not the peripheral flag.                          |
| `NVIC_GetPendingIRQ(irq)`                              | Return `1` if the IRQ is pending.                                             |
| `NVIC_GetActive(irq)`                                  | Return `1` if the IRQ is active.                                              |
| `NVIC_SetPriority(irq, priority)`                      | Set peripheral or configurable core priority.                                 |
| `NVIC_GetPriority(irq)`                                | Read the priority.                                                            |
| `NVIC_SetPriorityGrouping(group)`                      | Split priority bits between preemption and subpriority.                       |
| `NVIC_GetPriorityGrouping()`                           | Read that split.                                                              |
| `NVIC_EncodePriority(group, preempt, sub)`             | Build a value for `NVIC_SetPriority`.                                         |
| `NVIC_DecodePriority(priority, group, &preempt, &sub)` | Extract both priority fields.                                                 |
| `NVIC_GetVector(irq)`                                  | Read a handler address.                                                       |
| `NVIC_SetVector(irq, address)`                         | Write a handler address. The table must be writable, such as in RAM.          |
| `NVIC_SystemReset()`                                   | Request a system reset.                                                       |
| `SysTick_Config(ticks)`                                | Start SysTick with an interrupt. Return `1` if the reload value is too large. |
| `NVIC`, `SCB`, `SysTick`                               | Access core registers.                                                        |
| `NVIC_BASE`                                            | Base address of the NVIC registers.                                           |
| `NVIC_USER_IRQ_OFFSET`                                 | Convert a peripheral IRQ number to a vector index.                            |
| `__NVIC_PRIO_BITS`                                     | Number of implemented priority bits.                                          |
| `NVIC_STIR_INTID_Msk`, `NVIC_STIR_INTID_Pos`           | Select a peripheral IRQ for a software request.                               |
| `CMSIS_NVIC_VIRTUAL`, `CMSIS_VECTAB_VIRTUAL`           | Replace the default NVIC or vector API definitions.                           |

### Global interrupt masks

| Intrinsic                                     | Use                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `__disable_irq()`                             | Block all exceptions with configurable priority. NMI and HardFault remain enabled.           |
| `__enable_irq()`                              | Remove the PRIMASK block. Other masks still apply.                                           |
| `__get_PRIMASK()`, `__set_PRIMASK(value)`     | Save and restore the global mask.                                                            |
| `__get_BASEPRI()`, `__set_BASEPRI(value)`     | Block configurable priorities with the same or larger encoded value. `0` removes this block. |
| `__set_BASEPRI_MAX(value)`                    | Increase the mask without weakening an existing nonzero mask.                                |
| `__disable_fault_irq()`                       | Block all exceptions except NMI.                                                             |
| `__enable_fault_irq()`                        | Remove the FAULTMASK block.                                                                  |
| `__get_FAULTMASK()`, `__set_FAULTMASK(value)` | Read or write that mask.                                                                     |
| `__get_IPSR()`                                | Read the current exception number.                                                           |
