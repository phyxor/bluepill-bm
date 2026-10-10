/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#ifndef CLOCK_H
#define CLOCK_H

#include <stdbool.h>
#include <stdint.h>

// Set these frequencies for the whole build, not in one application file.
// HSI is the internal high-speed oscillator.
#ifndef HSI_VALUE
#define HSI_VALUE 8000000u
#endif
// HSE is the external high-speed oscillator.
#ifndef HSE_VALUE
#define HSE_VALUE 8000000u
#endif

// This value limits register reads for each wait. It does not measure milliseconds.
#ifndef CLOCK_DEFAULT_TIMEOUT_ITERATIONS
#define CLOCK_DEFAULT_TIMEOUT_ITERATIONS 1000000u
#endif

typedef enum { CLOCK_OK, CLOCK_INVALID_CONFIG, CLOCK_TIMEOUT, CLOCK_IN_USE } clock_status_t;

// SYSCLK is the system clock.
typedef enum { CLOCK_SYS_HSI, CLOCK_SYS_HSE, CLOCK_SYS_PLL } clock_system_source_t;

// HCLK is the clock for the CPU and the main bus.
typedef enum { CLOCK_SYSTICK_HCLK_DIV8, CLOCK_SYSTICK_HCLK } clock_systick_source_t;

typedef enum { CLOCK_TIM1 = 1, CLOCK_TIM2 = 2, CLOCK_TIM3 = 3, CLOCK_TIM4 = 4 } clock_timer_t;

// AHB is the main bus.
typedef enum {
    CLOCK_AHB_DIV1 = 1,
    CLOCK_AHB_DIV2 = 2,
    CLOCK_AHB_DIV4 = 4,
    CLOCK_AHB_DIV8 = 8,
    CLOCK_AHB_DIV16 = 16,
    CLOCK_AHB_DIV64 = 64,
    CLOCK_AHB_DIV128 = 128,
    CLOCK_AHB_DIV256 = 256,
    CLOCK_AHB_DIV512 = 512
} clock_ahb_divider_t;

// APB1 and APB2 are peripheral buses. PCLK is the clock for each bus.
typedef enum {
    CLOCK_APB_DIV1 = 1,
    CLOCK_APB_DIV2 = 2,
    CLOCK_APB_DIV4 = 4,
    CLOCK_APB_DIV8 = 8,
    CLOCK_APB_DIV16 = 16
} clock_apb_divider_t;

typedef enum {
    CLOCK_ADC_DIV2 = 2,
    CLOCK_ADC_DIV4 = 4,
    CLOCK_ADC_DIV6 = 6,
    CLOCK_ADC_DIV8 = 8
} clock_adc_divider_t;

// PLL is a phase-locked loop that multiplies its input frequency.
typedef enum { CLOCK_PLL_HSI_DIV2, CLOCK_PLL_HSE } clock_pll_source_t;

typedef enum { CLOCK_PLL_HSE_DIV1 = 1, CLOCK_PLL_HSE_DIV2 = 2 } clock_pll_hse_divider_t;

typedef enum {
    CLOCK_PLL_MUL2 = 2,
    CLOCK_PLL_MUL3 = 3,
    CLOCK_PLL_MUL4 = 4,
    CLOCK_PLL_MUL5 = 5,
    CLOCK_PLL_MUL6 = 6,
    CLOCK_PLL_MUL7 = 7,
    CLOCK_PLL_MUL8 = 8,
    CLOCK_PLL_MUL9 = 9,
    CLOCK_PLL_MUL10 = 10,
    CLOCK_PLL_MUL11 = 11,
    CLOCK_PLL_MUL12 = 12,
    CLOCK_PLL_MUL13 = 13,
    CLOCK_PLL_MUL14 = 14,
    CLOCK_PLL_MUL15 = 15,
    CLOCK_PLL_MUL16 = 16
} clock_pll_multiplier_t;

typedef struct {
    clock_system_source_t source;
    // Use these PLL fields only when source is CLOCK_SYS_PLL.
    clock_pll_source_t pll_source;
    // Use hse_divider only when PLL uses HSE. HSI always uses /2.
    clock_pll_hse_divider_t hse_divider;
    clock_pll_multiplier_t multiplier;
    clock_ahb_divider_t ahb_divider;
    clock_apb_divider_t apb1_divider;
    clock_apb_divider_t apb2_divider;
    clock_adc_divider_t adc_divider;
} clock_system_config_t;

// Enable oscillators
clock_status_t clock_enable_hsi(void);
clock_status_t clock_enable_hse(void);
clock_status_t clock_enable_lsi(void);
// LSE functions enable PWR/BKP clocks and allow writes to the backup registers.
// LSE functions keep the real-time clock (RTC) data.
clock_status_t clock_enable_lse(void);

// Enable PLL, but first enable the requested oscillator
clock_status_t clock_enable_pll(clock_pll_source_t source, clock_pll_hse_divider_t hse_divider,
                                clock_pll_multiplier_t multiplier);

// Disable returns IN_USE when another clock needs the oscillator.
clock_status_t clock_disable_hsi(void);
clock_status_t clock_disable_hse(void);
clock_status_t clock_disable_lsi(void);
clock_status_t clock_disable_lse(void);
// Disable stops PLL and keeps its input oscillator enabled.
// Disable keeps the PLL source, divider, and multiplier configuration.
clock_status_t clock_disable_pll(void);

// Enable first the selected HSI, HSE, or PLL source.
// Call it before peripherals that depend on clock timing start.
clock_status_t clock_select_sysclk(clock_system_source_t source, clock_ahb_divider_t ahb_divider,
                                   clock_apb_divider_t apb1_divider,
                                   clock_apb_divider_t apb2_divider,
                                   clock_adc_divider_t adc_divider);
clock_status_t clock_select_systick_source(clock_systick_source_t source);
// Compute the USB divider if it's possible according to PLL configuration
clock_status_t clock_select_usb_clock(void);

// Apply a defined configuration
clock_status_t clock_apply_system_config(const clock_system_config_t *config);

// Apply default clock configuration
clock_status_t clock_profile_reset(void);

// Apply specific configuration for 72MHz and 48MHz using HSE
clock_status_t clock_profile_hse8_72mhz(void);
clock_status_t clock_profile_hse8_48mhz(void);

// Return frequencies in Hz from SystemCoreClock and the clock register dividers.
uint32_t clock_get_pclk1_hz(void);
uint32_t clock_get_pclk2_hz(void);
uint32_t clock_get_apb1_timer_hz(void);
uint32_t clock_get_apb2_timer_hz(void);
uint32_t clock_get_tim_hz(clock_timer_t timer);
uint32_t clock_get_adc_hz(void);
uint32_t clock_get_systick_hz(void);

#endif
