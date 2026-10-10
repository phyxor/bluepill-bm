/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "systick.h"
#include "stm32f1xx.h"
#include <stdint.h>

void systick_msec_delay(uint32_t delay) {
    // Load number of clock cycles per millisecond
    SysTick->LOAD = (SystemCoreClock / 1000u) - 1u;

    // Clear systick current value register
    SysTick->VAL = 0;

    // Select internal clock source (bit 2) and enable it (bit 0)
    SysTick->CTRL = (SysTick_CTRL_CLKSOURCE_Msk | SysTick_CTRL_ENABLE_Msk);

    for (uint32_t i = 0; i < delay; i++) {
        while ((SysTick->CTRL & SysTick_CTRL_COUNTFLAG_Msk) == 0) {}
    }

    // Disable systick
    SysTick->CTRL = 0u;
}
