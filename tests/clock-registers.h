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

#undef RCC
#undef FLASH
#undef PWR
#undef RTC
#undef IWDG
#define RCC (&test_rcc)
#define FLASH (&test_flash)
#define PWR (&test_pwr)
#define RTC (&test_rtc)
#define IWDG (&test_iwdg)
