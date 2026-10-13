---
hide:
    - toc
---

# Interrupt explorer

Select an event to see the ISR handler name from `system/startup_stm32f103.c`.
Define that function in your app or driver to override its weak default handler.

<div id="interrupt-explorer"></div>
<noscript>Enable JavaScript to use the interrupt explorer.</noscript>

## C example

This CMSIS example assumes that EXTI0 and its NVIC interrupt are configured and enabled.
It counts input edges and clears the peripheral event flag.

```c
#include "stm32f1xx.h"

volatile uint32_t edge_count;

void EXTI0_IRQHandler(void) {
    if ((EXTI->IMR & EXTI_IMR_MR0) &&
        (EXTI->PR & EXTI_PR_PR0)) {
        EXTI->PR = EXTI_PR_PR0;  // Write 1 to clear this event.
        edge_count++;           // Respond to the event.
    }
}
```

Clearing NVIC pending alone does not clear the peripheral event flag.
