# Interrupts

## Concepts

- Event: A hardware or software action that can cause an interrupt.
- Peripheral: A hardware unit, such as a timer or USART.
- Status flag: A bit that records a peripheral event, even when its interrupt is disabled.
- IRQ (interrupt request): A request for the processor to run a handler.
- IRQ number (`IRQn`): The interrupt identifier. Core exceptions use negative CMSIS values.
- ISR (interrupt service routine): The handler function that services an interrupt.
- Interrupt source: The specific event that requests an interrupt.
- Source enabled: The peripheral can send an IRQ for that event.
- NVIC enabled: The NVIC permits delivery of that IRQ, subject to masks and priority.
- Disabled: Delivery is blocked at the selected enable control. An active ISR continues.
- Pending: The processor has an interrupt request that waits for service.
- Active: An ISR started but did not return. Another ISR can interrupt it.
- Mask: A control that blocks interrupt delivery without clearing the event.
- Priority: The interrupt's urgency. A lower numeric value means higher priority.
- Preemption: A higher-priority interrupt pauses the current handler.
- Preemption priority: The priority field that decides whether preemption is allowed.
- Subpriority: The field that orders pending interrupts with equal preemption priority.
- Priority grouping: The split between preemption priority bits and subpriority bits.
- Nested interrupts: One ISR runs while another ISR is paused.
- Shared interrupt: Several sources use one vector. The ISR tests their status flags.
- Vector: The handler address stored for an exception.
- Vector table: The initial stack pointer followed by exception handler addresses.
- Vector index: The entry number. A peripheral IRQ uses `IRQn + 16`.
- Exception: A processor event that runs a handler, including interrupts and faults.
- Fault: An exception caused by an execution error.
- NMI (non-maskable interrupt): An interrupt that processor interrupt masks cannot block.
- HardFault: A fault exception that `PRIMASK` and `BASEPRI` cannot block.
- Thread mode: Normal execution, such as `main()`.
- Handler mode: Execution inside an exception handler.
- Exception return: The processor ends the handler and resumes interrupted execution.
- Clear peripheral flag: Acknowledge the event with the peripheral's required register operation.
- Clear pending: Remove the NVIC request. This does not clear the peripheral flag.
- NVIC (Nested Vectored Interrupt Controller): Hardware that controls peripheral IRQ delivery.
- SCB (System Control Block): Core registers that control exceptions and processor behavior.
- SysTick: A core timer that can request periodic interrupts.
- `PRIMASK`: A processor mask that blocks all exceptions with configurable priority.
- `BASEPRI`: A processor mask that blocks configurable priorities at or below a chosen urgency.
- `FAULTMASK`: A processor mask that blocks all exceptions except NMI.
- `IPSR`: A processor register that identifies the current exception. Zero means thread mode.
- CMSIS: Standard definitions and functions for access to Cortex-M hardware.
- Register: A hardware location that stores control or status bits.
- Field: One or more register bits with a specific purpose.
- Macro: A named definition that the preprocessor substitutes before compilation.
- Intrinsic: A compiler-provided operation, such as changing a processor mask.

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

## Interrupt table
