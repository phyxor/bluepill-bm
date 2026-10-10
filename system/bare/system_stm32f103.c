/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "stm32f103c8t6.h"

void SystemInit(void) {
    // Keep the reset-default HSI clock using only the local register definitions.
    RCC_CR |= RCC_CR_HSION;
    RCC_CFGR = 0u;
    FLASH_ACR = 0u;
}
