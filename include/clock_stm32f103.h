/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
#ifndef CLOCK_STM32F103_H
#define CLOCK_STM32F103_H

#include <stdbool.h>
#include <stdint.h>

/* Override these for the entire build, not in an application source file. */
#ifndef HSI_VALUE
#define HSI_VALUE 8000000u
#endif
#ifndef HSE_VALUE
#define HSE_VALUE 8000000u
#endif

typedef enum {
    CLOCK_STM32F103_OK,
    CLOCK_STM32F103_INVALID_CONFIG,
    CLOCK_STM32F103_TIMEOUT,
    CLOCK_STM32F103_IN_USE,
    CLOCK_STM32F103_BACKUP_RESET_REQUIRED
} clock_stm32f103_status_t;

typedef enum { CLOCK_SYS_HSI, CLOCK_SYS_HSE, CLOCK_SYS_PLL } clock_system_source_t;

typedef enum { CLOCK_PLL_HSI_DIV2, CLOCK_PLL_HSE } clock_pll_source_t;

typedef struct {
    clock_system_source_t source;
    clock_pll_source_t pll_source;
    bool hsi_enabled;
    bool hse_enabled;
    bool pll_enabled;
    uint8_t hse_pll_divider; /* 1 or 2. */
    uint8_t pll_multiplier;  /* 2 through 16. */
    uint16_t ahb_divider;    /* 1, 2, 4, 8, 16, 64, 128, 256, 512. */
    uint8_t apb1_divider;    /* 1, 2, 4, 8, 16. */
    uint8_t apb2_divider;
    uint8_t adc_divider;    /* 2, 4, 6, 8. Does not enable ADC clocks. */
    bool usb_divide_by_1_5; /* USBPRE only; does not enable USB. */
    uint8_t flash_wait_states;
    bool flash_prefetch;
    uint32_t timeout_iterations; /* Maximum register reads per wait, not milliseconds. */
} clock_system_config_t;

typedef enum {
    CLOCK_RTC_NONE,
    CLOCK_RTC_LSE,
    CLOCK_RTC_LSI,
    CLOCK_RTC_HSE_DIV128
} clock_rtc_source_t;

typedef struct {
    clock_rtc_source_t source; /* NONE disables RTCEN and preserves the backup domain. */
    uint32_t prescaler;        /* 20-bit divider minus one. */
    bool reset_backup_domain;  /* Permit clearing RTC and backup registers when changing source. */
    uint32_t timeout_iterations;
} clock_rtc_config_t;

typedef struct {
    uint16_t divider; /* 4, 8, 16, 32, 64, 128, 256. */
    uint32_t timeout_iterations;
} clock_iwdg_config_t;

/* Call during initialization, before timing-dependent peripherals run.
 * Invalid configurations do not change clock registers. After a system-clock
 * timeout, SystemCoreClock reflects the active source; inspect SWS before retrying.
 */
clock_stm32f103_status_t clock_stm32f103_configure_system(const clock_system_config_t *config);
clock_stm32f103_status_t clock_stm32f103_configure_rtc(const clock_rtc_config_t *config);
/* Enable LSI and configure IWDG's clock divider. Does not start or reload IWDG. */
clock_stm32f103_status_t clock_stm32f103_configure_iwdg(const clock_iwdg_config_t *config);

#endif
