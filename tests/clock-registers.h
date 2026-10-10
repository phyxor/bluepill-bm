/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
#include "clock_stm32f103.h"
#include "stm32f1xx.h"

extern RCC_TypeDef test_rcc;
extern FLASH_TypeDef test_flash;
extern PWR_TypeDef test_pwr;
extern RTC_TypeDef test_rtc;
extern IWDG_TypeDef test_iwdg;
extern SysTick_Type test_systick;

#undef RCC
#undef FLASH
#undef PWR
#undef RTC
#undef IWDG
#undef SysTick
#define RCC (&test_rcc)
#define FLASH (&test_flash)
#define PWR (&test_pwr)
#define RTC (&test_rtc)
#define IWDG (&test_iwdg)
#define SysTick (&test_systick)

/* Optional SYSCLK-switch emulation and write tracing in the host tests. */
void test_modify_register(volatile uint32_t *reg, uint32_t clear, uint32_t set);
#undef MODIFY_REG
#define MODIFY_REG(REG, CLEARMASK, SETMASK) test_modify_register(&(REG), (CLEARMASK), (SETMASK))
#undef SET_BIT
#undef CLEAR_BIT
#define SET_BIT(REG, BIT) test_modify_register(&(REG), 0u, (BIT))
#define CLEAR_BIT(REG, BIT) test_modify_register(&(REG), (BIT), 0u)
