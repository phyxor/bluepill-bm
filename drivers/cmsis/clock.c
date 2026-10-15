/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
#include "clock.h"
#include "stm32f1xx.h"

clock_status_t clock_select_systick_source(clock_systick_source_t source) {
    if ((unsigned)source > CLOCK_SYSTICK_HCLK) {
        return CLOCK_INVALID_CONFIG;
    }
    /* Reading CTRL also clears the hardware COUNTFLAG. */
    uint32_t ctrl = SysTick->CTRL;
    uint32_t selected = source == CLOCK_SYSTICK_HCLK ? SysTick_CTRL_CLKSOURCE_Msk : 0u;
    if ((ctrl & SysTick_CTRL_CLKSOURCE_Msk) == selected) {
        return CLOCK_OK;
    }
    if ((ctrl & SysTick_CTRL_ENABLE_Msk) != 0u) {
        return CLOCK_IN_USE;
    }
    /* Write only control bits, not read-only COUNTFLAG or reserved bits. */
    SysTick->CTRL = (ctrl & (SysTick_CTRL_ENABLE_Msk | SysTick_CTRL_TICKINT_Msk)) | selected;
    return CLOCK_OK;
}

uint32_t clock_get_systick_hz(void) {
    /* Report the input clock, independent of LOAD; reading CTRL clears COUNTFLAG. */
    return (SysTick->CTRL & SysTick_CTRL_CLKSOURCE_Msk) != 0u ? SystemCoreClock
                                                              : SystemCoreClock / 8u;
}

static uint32_t apb_clock_hz(uint32_t prescaler, bool timer) {
    /* Decode PPRE into a right shift of HCLK, which is already AHB-divided. */
    uint32_t shift = APBPrescTable[prescaler];
    if (timer && shift != 0u) {
        --shift; /* APB timers receive twice PCLK when APB is divided. */
    }
    return SystemCoreClock >> shift;
}

uint32_t clock_get_pclk1_hz(void) {
    uint32_t cfgr = RCC->CFGR;
    return apb_clock_hz((cfgr & RCC_CFGR_PPRE1) >> RCC_CFGR_PPRE1_Pos, false);
}

uint32_t clock_get_pclk2_hz(void) {
    uint32_t cfgr = RCC->CFGR;
    return apb_clock_hz((cfgr & RCC_CFGR_PPRE2) >> RCC_CFGR_PPRE2_Pos, false);
}

uint32_t clock_get_apb1_timer_hz(void) {
    uint32_t cfgr = RCC->CFGR;
    return apb_clock_hz((cfgr & RCC_CFGR_PPRE1) >> RCC_CFGR_PPRE1_Pos, true);
}

uint32_t clock_get_apb2_timer_hz(void) {
    uint32_t cfgr = RCC->CFGR;
    return apb_clock_hz((cfgr & RCC_CFGR_PPRE2) >> RCC_CFGR_PPRE2_Pos, true);
}

uint32_t clock_get_tim_hz(clock_timer_t timer) {
    /* The C8T6 has one APB2 timer and three APB1 timers. */
    switch (timer) {
    case CLOCK_TIM1:
        return clock_get_apb2_timer_hz();
    case CLOCK_TIM2:
    case CLOCK_TIM3:
    case CLOCK_TIM4:
        return clock_get_apb1_timer_hz();
    default:
        return 0u;
    }
}

uint32_t clock_get_adc_hz(void) {
    uint32_t cfgr = RCC->CFGR;
    uint32_t pclk2 = apb_clock_hz((cfgr & RCC_CFGR_PPRE2) >> RCC_CFGR_PPRE2_Pos, false);
    /* ADCPRE encodings 0..3 select PCLK2 divided by 2, 4, 6, or 8. */
    uint32_t divider = 2u * (((cfgr & RCC_CFGR_ADCPRE) >> RCC_CFGR_ADCPRE_Pos) + 1u);
    return pclk2 / divider;
}

static bool wait_bits(volatile uint32_t *reg, uint32_t mask, uint32_t value, uint32_t iterations) {
    /* Bound each hardware-status wait by register reads, not elapsed time. */
    while (iterations-- != 0u) {
        if ((*reg & mask) == value) {
            return true;
        }
    }
    return false;
}

static clock_status_t set_oscillator(volatile uint32_t *reg, uint32_t on, uint32_t ready,
                                     bool enabled) {
    uint32_t timeout = CLOCK_DEFAULT_TIMEOUT_ITERATIONS;
    if (timeout == 0u) {
        return CLOCK_INVALID_CONFIG;
    }
    if (enabled) {
        SET_BIT(*reg, on);
    } else {
        CLEAR_BIT(*reg, on);
    }
    /* Confirm both the ON request and the resulting ready/stopped state. */
    return wait_bits(reg, on | ready, enabled ? on | ready : 0u, timeout) ? CLOCK_OK
                                                                          : CLOCK_TIMEOUT;
}

static bool system_uses_source(uint32_t cfgr, clock_system_source_t source) {
    /* Check both the active source and the requested source during a switch. */
    return ((cfgr & RCC_CFGR_SWS) >> RCC_CFGR_SWS_Pos) == (uint32_t)source ||
           ((cfgr & RCC_CFGR_SW) >> RCC_CFGR_SW_Pos) == (uint32_t)source;
}

static bool pll_in_use(uint32_t cfgr) {
    return (RCC->CR & (RCC_CR_PLLON | RCC_CR_PLLRDY)) != 0u ||
           system_uses_source(cfgr, CLOCK_SYS_PLL);
}

static bool rtc_uses_source(uint32_t source) {
    return (RCC->BDCR & (RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL)) == (RCC_BDCR_RTCEN | source);
}

static bool enable_backup_access(uint32_t timeout) {
    /* LSE control lives in the backup domain, behind PWR/BKP clock gates. */
    SET_BIT(RCC->APB1ENR, RCC_APB1ENR_PWREN | RCC_APB1ENR_BKPEN);
    if (!wait_bits(&RCC->APB1ENR, RCC_APB1ENR_PWREN | RCC_APB1ENR_BKPEN,
                   RCC_APB1ENR_PWREN | RCC_APB1ENR_BKPEN, timeout)) {
        return false;
    }
    /* Unlock backup-domain writes without resetting RTC or backup registers. */
    SET_BIT(PWR->CR, PWR_CR_DBP);
    return wait_bits(&PWR->CR, PWR_CR_DBP, PWR_CR_DBP, timeout);
}

clock_status_t clock_enable_hsi(void) {
    return set_oscillator(&RCC->CR, RCC_CR_HSION, RCC_CR_HSIRDY, true);
}

clock_status_t clock_disable_hsi(void) {
    uint32_t cfgr = RCC->CFGR;
    /* Keep HSI running while SYSCLK, PLL, or the clock-output pin needs it. */
    if (system_uses_source(cfgr, CLOCK_SYS_HSI) ||
        (pll_in_use(cfgr) && (cfgr & RCC_CFGR_PLLSRC) == 0u) ||
        (cfgr & RCC_CFGR_MCO) == RCC_CFGR_MCO_HSI) {
        return CLOCK_IN_USE;
    }
    return set_oscillator(&RCC->CR, RCC_CR_HSION, RCC_CR_HSIRDY, false);
}

clock_status_t clock_enable_hse(void) {
    return set_oscillator(&RCC->CR, RCC_CR_HSEON, RCC_CR_HSERDY, true);
}

clock_status_t clock_disable_hse(void) {
    uint32_t cfgr = RCC->CFGR;
    /* Preserve HSE for system/PLL clocks, clock security, RTC, and clock output. */
    if (system_uses_source(cfgr, CLOCK_SYS_HSE) ||
        (pll_in_use(cfgr) && (cfgr & RCC_CFGR_PLLSRC) != 0u) || (RCC->CR & RCC_CR_CSSON) != 0u ||
        rtc_uses_source(RCC_BDCR_RTCSEL_HSE) || (cfgr & RCC_CFGR_MCO) == RCC_CFGR_MCO_HSE) {
        return CLOCK_IN_USE;
    }
    return set_oscillator(&RCC->CR, RCC_CR_HSEON, RCC_CR_HSERDY, false);
}

clock_status_t clock_enable_lsi(void) {
    return set_oscillator(&RCC->CSR, RCC_CSR_LSION, RCC_CSR_LSIRDY, true);
}

clock_status_t clock_disable_lsi(void) {
    /* An enabled RTC needs LSI; an active IWDG can also prevent shutdown in hardware. */
    if (rtc_uses_source(RCC_BDCR_RTCSEL_LSI)) {
        return CLOCK_IN_USE;
    }
    return set_oscillator(&RCC->CSR, RCC_CSR_LSION, RCC_CSR_LSIRDY, false);
}

static clock_status_t set_lse(bool enabled) {
    uint32_t timeout = CLOCK_DEFAULT_TIMEOUT_ITERATIONS;
    if (timeout == 0u) {
        return CLOCK_INVALID_CONFIG;
    }
    if (!enabled && rtc_uses_source(RCC_BDCR_RTCSEL_LSE)) {
        return CLOCK_IN_USE;
    }
    if (!enable_backup_access(timeout)) {
        return CLOCK_TIMEOUT;
    }
    return set_oscillator(&RCC->BDCR, RCC_BDCR_LSEON, RCC_BDCR_LSERDY, enabled);
}

clock_status_t clock_enable_lse(void) {
    return set_lse(true);
}

clock_status_t clock_disable_lse(void) {
    return set_lse(false);
}

static bool pll_has_consumers(uint32_t cfgr) {
    return system_uses_source(cfgr, CLOCK_SYS_PLL) || (RCC->APB1ENR & RCC_APB1ENR_USBEN) != 0u ||
           (cfgr & RCC_CFGR_MCO) == RCC_CFGR_MCO_PLLCLK_DIV2;
}

clock_status_t clock_enable_pll(clock_pll_source_t source, clock_pll_hse_divider_t hse_divider,
                                clock_pll_multiplier_t multiplier) {
    uint32_t timeout = CLOCK_DEFAULT_TIMEOUT_ITERATIONS;
    if (timeout == 0u || (unsigned)source > CLOCK_PLL_HSE ||
        (hse_divider != CLOCK_PLL_HSE_DIV1 && hse_divider != CLOCK_PLL_HSE_DIV2) ||
        (unsigned)multiplier < CLOCK_PLL_MUL2 || (unsigned)multiplier > CLOCK_PLL_MUL16 ||
        (source == CLOCK_PLL_HSE && (HSE_VALUE < 4000000u || HSE_VALUE > 16000000u)) ||
        (source == CLOCK_PLL_HSI_DIV2 && (HSI_VALUE == 0u || HSI_VALUE >= 24000000u))) {
        return CLOCK_INVALID_CONFIG;
    }
    uint64_t pll_hz =
        (source == CLOCK_PLL_HSE ? HSE_VALUE / hse_divider : HSI_VALUE / 2u) * (uint64_t)multiplier;
    if (pll_hz < 16000000u || pll_hz > 72000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    /* The caller must enable the PLL input oscillator before configuring PLL. */
    uint32_t source_on = source == CLOCK_PLL_HSE ? RCC_CR_HSEON : RCC_CR_HSION;
    if ((RCC->CR & source_on) == 0u) {
        return CLOCK_INVALID_CONFIG;
    }
    uint32_t cfgr = RCC->CFGR;
    /* PLL configuration fields are writable only while PLL is disabled. */
    if ((RCC->CR & (RCC_CR_PLLON | RCC_CR_PLLRDY)) != 0u || pll_has_consumers(cfgr)) {
        return CLOCK_IN_USE;
    }
    /* PLLMULL stores multiplier minus two; HSI always reaches PLL through /2. */
    uint32_t pll_bits = ((uint32_t)multiplier - CLOCK_PLL_MUL2) << RCC_CFGR_PLLMULL_Pos;
    if (source == CLOCK_PLL_HSE) {
        pll_bits |= RCC_CFGR_PLLSRC;
        pll_bits |= hse_divider == CLOCK_PLL_HSE_DIV2 ? RCC_CFGR_PLLXTPRE : 0u;
    }
    uint32_t mask = RCC_CFGR_PLLSRC | RCC_CFGR_PLLXTPRE | RCC_CFGR_PLLMULL;
    MODIFY_REG(RCC->CFGR, mask, pll_bits);
    if (!wait_bits(&RCC->CFGR, mask, pll_bits, timeout)) {
        return CLOCK_TIMEOUT;
    }
    return set_oscillator(&RCC->CR, RCC_CR_PLLON, RCC_CR_PLLRDY, true);
}

clock_status_t clock_disable_pll(void) {
    if (pll_has_consumers(RCC->CFGR)) {
        return CLOCK_IN_USE;
    }
    /* Stop PLL while preserving its source, multiplier, and USB divider settings. */
    return set_oscillator(&RCC->CR, RCC_CR_PLLON, RCC_CR_PLLRDY, false);
}

clock_status_t clock_select_usb_clock(void) {
    uint32_t timeout = CLOCK_DEFAULT_TIMEOUT_ITERATIONS;
    uint32_t cr = RCC->CR;
    uint32_t cfgr = RCC->CFGR;
    bool hse = (cfgr & RCC_CFGR_PLLSRC) != 0u;
    uint32_t input_hz = hse ? HSE_VALUE : HSI_VALUE;
    if (timeout == 0u || (cr & RCC_CR_PLLON) == 0u ||
        (cr & (hse ? RCC_CR_HSEON : RCC_CR_HSION)) == 0u ||
        (hse && (input_hz < 4000000u || input_hz > 16000000u)) ||
        (!hse && (input_hz == 0u || input_hz >= 24000000u))) {
        return CLOCK_INVALID_CONFIG;
    }
    uint32_t input_divider = hse && (cfgr & RCC_CFGR_PLLXTPRE) == 0u ? 1u : 2u;
    uint32_t multiplier = ((cfgr & RCC_CFGR_PLLMULL) >> RCC_CFGR_PLLMULL_Pos) + 2u;
    if (multiplier > 16u) {
        multiplier = 16u; /* Both top PLLMULL encodings mean x16. */
    }
    /* Compare before dividing so fractional input frequencies are not rounded. */
    uint64_t scaled_hz = (uint64_t)input_hz * multiplier;
    uint32_t usbpre;
    /* USBPRE = 1 selects PLL /1; USBPRE = 0 selects PLL /1.5. */
    if (scaled_hz == 48000000u * input_divider) {
        usbpre = RCC_CFGR_USBPRE;
    } else if (scaled_hz == 72000000u * input_divider) {
        usbpre = 0u;
    } else {
        return CLOCK_INVALID_CONFIG;
    }
    /* An active USB peripheral permits validation but cannot tolerate a divider change. */
    bool change_divider = (cfgr & RCC_CFGR_USBPRE) != usbpre;
    if (change_divider && (RCC->APB1ENR & RCC_APB1ENR_USBEN) != 0u) {
        return CLOCK_IN_USE;
    }
    if (!wait_bits(&RCC->CR, RCC_CR_PLLRDY, RCC_CR_PLLRDY, timeout)) {
        return CLOCK_TIMEOUT;
    }
    if (change_divider) {
        MODIFY_REG(RCC->CFGR, RCC_CFGR_USBPRE, usbpre);
    }
    return wait_bits(&RCC->CFGR, RCC_CFGR_USBPRE, usbpre, timeout) ? CLOCK_OK : CLOCK_TIMEOUT;
}

static int divider_index(uint32_t divider, const uint16_t *values, unsigned count) {
    for (unsigned i = 0; i < count; ++i) {
        if (values[i] == divider) {
            return (int)i;
        }
    }
    return -1;
}

static clock_status_t system_result(clock_status_t status) {
    /* Reflect the active hardware clock even if a transition timed out midway. */
    SystemCoreClockUpdate();
    return status;
}

static uint32_t flash_latency_for_sysclk(uint64_t sys_hz) {
    return sys_hz <= 24000000u ? 0u : sys_hz <= 48000000u ? 1u : 2u;
}

static bool set_flash_latency(uint32_t latency, uint32_t timeout) {
    MODIFY_REG(FLASH->ACR, FLASH_ACR_LATENCY, latency);
    return wait_bits(&FLASH->ACR, FLASH_ACR_LATENCY, latency, timeout);
}

static clock_status_t select_sysclk(clock_system_source_t source, clock_ahb_divider_t ahb_divider,
                                    clock_apb_divider_t apb1_divider,
                                    clock_apb_divider_t apb2_divider,
                                    clock_adc_divider_t adc_divider, bool reduce_latency) {
    static const uint16_t ahb[] = {1, 2, 4, 8, 16, 64, 128, 256, 512};
    static const uint16_t apb[] = {1, 2, 4, 8, 16};
    static const uint16_t adc[] = {2, 4, 6, 8};
    uint32_t timeout = CLOCK_DEFAULT_TIMEOUT_ITERATIONS;
    int hpre = divider_index((uint32_t)ahb_divider, ahb, 9);
    int ppre1 = divider_index((uint32_t)apb1_divider, apb, 5);
    int ppre2 = divider_index((uint32_t)apb2_divider, apb, 5);
    int adcpre = divider_index((uint32_t)adc_divider, adc, 4);
    if (timeout == 0u || (unsigned)source > CLOCK_SYS_PLL || hpre < 0 || ppre1 < 0 || ppre2 < 0 ||
        adcpre < 0) {
        return CLOCK_INVALID_CONFIG;
    }
    uint32_t cfgr = RCC->CFGR;
    uint32_t on = source == CLOCK_SYS_HSI   ? RCC_CR_HSION
                  : source == CLOCK_SYS_HSE ? RCC_CR_HSEON
                                            : RCC_CR_PLLON;
    uint32_t ready = source == CLOCK_SYS_HSI   ? RCC_CR_HSIRDY
                     : source == CLOCK_SYS_HSE ? RCC_CR_HSERDY
                                               : RCC_CR_PLLRDY;
    if ((source == CLOCK_SYS_HSI && (HSI_VALUE == 0u || HSI_VALUE >= 24000000u)) ||
        (source == CLOCK_SYS_HSE && (HSE_VALUE < 4000000u || HSE_VALUE > 16000000u))) {
        return CLOCK_INVALID_CONFIG;
    }
    if ((RCC->CR & on) == 0u) {
        return CLOCK_INVALID_CONFIG;
    }
    /* Derive the requested SYSCLK from the existing oscillator and PLL settings. */
    uint64_t sys_hz;
    if (source == CLOCK_SYS_PLL) {
        uint32_t input_on = (cfgr & RCC_CFGR_PLLSRC) != 0u ? RCC_CR_HSEON : RCC_CR_HSION;
        if ((RCC->CR & input_on) == 0u) {
            return CLOCK_INVALID_CONFIG;
        }
        if (((cfgr & RCC_CFGR_PLLSRC) == 0u && (HSI_VALUE == 0u || HSI_VALUE >= 24000000u)) ||
            ((cfgr & RCC_CFGR_PLLSRC) != 0u && (HSE_VALUE < 4000000u || HSE_VALUE > 16000000u))) {
            return CLOCK_INVALID_CONFIG;
        }
        uint32_t input_hz = (cfgr & RCC_CFGR_PLLSRC) == 0u     ? HSI_VALUE / 2u
                            : (cfgr & RCC_CFGR_PLLXTPRE) != 0u ? HSE_VALUE / 2u
                                                               : HSE_VALUE;
        uint32_t multiplier = ((cfgr & RCC_CFGR_PLLMULL) >> RCC_CFGR_PLLMULL_Pos) + 2u;
        /* Both hardware encodings 1110 and 1111 mean multiply-by-16. */
        if (multiplier > 16u) {
            multiplier = 16u;
        }
        sys_hz = (uint64_t)input_hz * multiplier;
        if (sys_hz < 16000000u) {
            return CLOCK_INVALID_CONFIG;
        }
    } else {
        sys_hz = source == CLOCK_SYS_HSI ? HSI_VALUE : HSE_VALUE;
    }
    /* Reject final APB/ADC overclocks before touching any clock registers. */
    uint64_t hclk = sys_hz / (uint32_t)ahb_divider;
    if (sys_hz == 0u || sys_hz > 72000000u || hclk / (uint32_t)apb1_divider > 36000000u ||
        hclk / (uint32_t)apb2_divider > 72000000u ||
        hclk / (uint32_t)apb2_divider / (uint32_t)adc_divider > 14000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    /* A differing SW/SWS pair means another source switch is still pending. */
    if (((cfgr & RCC_CFGR_SW) >> RCC_CFGR_SW_Pos) != ((cfgr & RCC_CFGR_SWS) >> RCC_CFGR_SWS_Pos)) {
        return CLOCK_IN_USE;
    }
    /* Wait for the already-enabled source before requesting the switch. */
    if (!wait_bits(&RCC->CR, ready, ready, timeout)) {
        return system_result(CLOCK_TIMEOUT);
    }
    /* Raise latency only when needed; retain the old value during downclocking. */
    const uint32_t latency = flash_latency_for_sysclk(sys_hz);
    const uint32_t current_latency = FLASH->ACR & FLASH_ACR_LATENCY;
    const uint32_t transition_latency = current_latency > latency ? current_latency : latency;
    MODIFY_REG(FLASH->ACR, FLASH_ACR_LATENCY | FLASH_ACR_PRFTBE | FLASH_ACR_HLFCYA,
               transition_latency | FLASH_ACR_PRFTBE);
    if (!wait_bits(&FLASH->ACR, FLASH_ACR_LATENCY | FLASH_ACR_PRFTBS,
                   transition_latency | FLASH_ACR_PRFTBS, timeout)) {
        return system_result(CLOCK_TIMEOUT);
    }
    uint32_t mask = RCC_CFGR_HPRE | RCC_CFGR_PPRE1 | RCC_CFGR_PPRE2 | RCC_CFGR_ADCPRE;
    uint32_t safe =
        RCC_CFGR_HPRE_DIV2 | RCC_CFGR_PPRE1_DIV16 | RCC_CFGR_PPRE2_DIV16 | RCC_CFGR_ADCPRE_DIV8;
    /* Slow buses first: target dividers may be unsafe with the old SYSCLK. */
    MODIFY_REG(RCC->CFGR, mask, safe);
    if (!wait_bits(&RCC->CFGR, mask, safe, timeout)) {
        return system_result(CLOCK_TIMEOUT);
    }
    /* SW requests the source; SWS confirms which source actually drives SYSCLK. */
    MODIFY_REG(RCC->CFGR, RCC_CFGR_SW, (uint32_t)source << RCC_CFGR_SW_Pos);
    if (!wait_bits(&RCC->CFGR, RCC_CFGR_SWS, (uint32_t)source << RCC_CFGR_SWS_Pos, timeout)) {
        return system_result(CLOCK_TIMEOUT);
    }
    /* Encode the requested bus/ADC dividers after the new SYSCLK becomes active. */
    uint32_t dividers = (uint32_t)(hpre == 0 ? 0 : hpre + 7) << RCC_CFGR_HPRE_Pos;
    dividers |= (uint32_t)(ppre1 == 0 ? 0 : ppre1 + 3) << RCC_CFGR_PPRE1_Pos;
    dividers |= (uint32_t)(ppre2 == 0 ? 0 : ppre2 + 3) << RCC_CFGR_PPRE2_Pos;
    dividers |= (uint32_t)adcpre << RCC_CFGR_ADCPRE_Pos;
    MODIFY_REG(RCC->CFGR, mask, dividers);
    if (!wait_bits(&RCC->CFGR, mask, dividers, timeout)) {
        return system_result(CLOCK_TIMEOUT);
    }
    /* Profile setup defers reductions until HSI is active and PLL is stopped. */
    if (reduce_latency && transition_latency > latency && !set_flash_latency(latency, timeout)) {
        return system_result(CLOCK_TIMEOUT);
    }
    const uint32_t expected_latency = reduce_latency ? latency : transition_latency;
    /* Check after the switch without rewriting an already-configured latency. */
    return system_result(wait_bits(&FLASH->ACR, FLASH_ACR_LATENCY, expected_latency, timeout)
                             ? CLOCK_OK
                             : CLOCK_TIMEOUT);
}

clock_status_t clock_select_sysclk(clock_system_source_t source, clock_ahb_divider_t ahb_divider,
                                   clock_apb_divider_t apb1_divider,
                                   clock_apb_divider_t apb2_divider,
                                   clock_adc_divider_t adc_divider) {
    return select_sysclk(source, ahb_divider, apb1_divider, apb2_divider, adc_divider, true);
}

static clock_status_t validate_system_config(const clock_system_config_t *c) {
    /* Validate only fields used by the requested source, without hardware writes. */
    static const uint16_t ahb[] = {1, 2, 4, 8, 16, 64, 128, 256, 512};
    static const uint16_t apb[] = {1, 2, 4, 8, 16};
    static const uint16_t adc[] = {2, 4, 6, 8};
    if (c == 0 || (unsigned)c->source > CLOCK_SYS_PLL || HSI_VALUE == 0u ||
        HSI_VALUE >= 24000000u || CLOCK_DEFAULT_TIMEOUT_ITERATIONS == 0u ||
        divider_index((uint32_t)c->ahb_divider, ahb, 9) < 0 ||
        divider_index((uint32_t)c->apb1_divider, apb, 5) < 0 ||
        divider_index((uint32_t)c->apb2_divider, apb, 5) < 0 ||
        divider_index((uint32_t)c->adc_divider, adc, 4) < 0) {
        return CLOCK_INVALID_CONFIG;
    }
    if (c->source == CLOCK_SYS_PLL &&
        ((unsigned)c->pll_source > CLOCK_PLL_HSE || (unsigned)c->multiplier < CLOCK_PLL_MUL2 ||
         (unsigned)c->multiplier > CLOCK_PLL_MUL16 ||
         (c->pll_source == CLOCK_PLL_HSE && c->hse_divider != CLOCK_PLL_HSE_DIV1 &&
          c->hse_divider != CLOCK_PLL_HSE_DIV2))) {
        return CLOCK_INVALID_CONFIG;
    }
    bool uses_hse = c->source == CLOCK_SYS_HSE ||
                    (c->source == CLOCK_SYS_PLL && c->pll_source == CLOCK_PLL_HSE);
    if (uses_hse && (HSE_VALUE < 4000000u || HSE_VALUE > 16000000u)) {
        return CLOCK_INVALID_CONFIG;
    }
    uint64_t sys_hz = c->source == CLOCK_SYS_HSE ? HSE_VALUE : HSI_VALUE;
    if (c->source == CLOCK_SYS_PLL) {
        uint32_t input_hz =
            c->pll_source == CLOCK_PLL_HSE ? HSE_VALUE / (uint32_t)c->hse_divider : HSI_VALUE / 2u;
        sys_hz = (uint64_t)input_hz * (uint32_t)c->multiplier;
        if (sys_hz < 16000000u) {
            return CLOCK_INVALID_CONFIG;
        }
    }
    uint64_t hclk = sys_hz / (uint32_t)c->ahb_divider;
    if (sys_hz > 72000000u || hclk / (uint32_t)c->apb1_divider > 36000000u ||
        hclk / (uint32_t)c->apb2_divider > 72000000u ||
        hclk / (uint32_t)c->apb2_divider / (uint32_t)c->adc_divider > 14000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    return CLOCK_OK;
}

static clock_status_t prepare_system_clock(void) {
    uint32_t cfgr = RCC->CFGR;
    /* Reject dependencies that would prevent stopping PLL before changing clocks. */
    if ((RCC->APB1ENR & RCC_APB1ENR_USBEN) != 0u ||
        (cfgr & RCC_CFGR_MCO) == RCC_CFGR_MCO_PLLCLK_DIV2 ||
        ((cfgr & RCC_CFGR_SW) >> RCC_CFGR_SW_Pos) != ((cfgr & RCC_CFGR_SWS) >> RCC_CFGR_SWS_Pos)) {
        return CLOCK_IN_USE;
    }
    /* HSI provides a clock independent of PLL throughout reconfiguration. */
    clock_status_t status = clock_enable_hsi();
    if (status != CLOCK_OK) {
        return status;
    }
    /* Keep existing wait states until the clock switch and PLL shutdown finish. */
    status = select_sysclk(CLOCK_SYS_HSI, CLOCK_AHB_DIV1, CLOCK_APB_DIV1, CLOCK_APB_DIV1,
                           CLOCK_ADC_DIV2, false);
    if (status != CLOCK_OK) {
        return status;
    }
    /* SYSCLK now uses HSI, so PLL can stop while its stored settings remain intact. */
    return clock_disable_pll();
}

clock_status_t clock_apply_system_config(const clock_system_config_t *c) {
    clock_status_t status = validate_system_config(c);
    if (status != CLOCK_OK) {
        return status;
    }
    /* Move to the HSI baseline only after the entire request passes validation. */
    status = prepare_system_clock();
    if (status != CLOCK_OK) {
        return status;
    }
    /* Program final wait states on HSI, before enabling or selecting PLL. */
    uint32_t sys_hz = c->source == CLOCK_SYS_HSE ? HSE_VALUE : HSI_VALUE;
    if (c->source == CLOCK_SYS_PLL) {
        uint32_t input_hz =
            c->pll_source == CLOCK_PLL_HSE ? HSE_VALUE / (uint32_t)c->hse_divider : HSI_VALUE / 2u;
        sys_hz = input_hz * (uint32_t)c->multiplier;
    }
    if (!set_flash_latency(flash_latency_for_sysclk(sys_hz), CLOCK_DEFAULT_TIMEOUT_ITERATIONS)) {
        return system_result(CLOCK_TIMEOUT);
    }
    /* Start HSE only for direct HSE or an HSE-fed PLL. */
    if (c->source == CLOCK_SYS_HSE ||
        (c->source == CLOCK_SYS_PLL && c->pll_source == CLOCK_PLL_HSE)) {
        status = clock_enable_hse();
        if (status != CLOCK_OK) {
            return status;
        }
    }
    /* Direct HSI/HSE requests leave PLL stopped; PLL requests program it explicitly. */
    if (c->source == CLOCK_SYS_PLL) {
        clock_pll_hse_divider_t divider =
            c->pll_source == CLOCK_PLL_HSE ? c->hse_divider : CLOCK_PLL_HSE_DIV1;
        status = clock_enable_pll(c->pll_source, divider, c->multiplier);
        if (status != CLOCK_OK) {
            return status;
        }
    }
    /* Apply the final source/dividers with Flash handling and SystemCoreClock update. */
    return clock_select_sysclk(c->source, c->ahb_divider, c->apb1_divider, c->apb2_divider,
                               c->adc_divider);
}

clock_status_t clock_profile_reset(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_HSI,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV1,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV2,
    };
    clock_status_t status = clock_apply_system_config(&config);
    if (status != CLOCK_OK) {
        return status;
    }
    /* PLL is stopped; restore HSI /2, x2, HSE /1, and USB /1.5 encodings. */
    uint32_t mask = RCC_CFGR_PLLSRC | RCC_CFGR_PLLXTPRE | RCC_CFGR_PLLMULL | RCC_CFGR_USBPRE;
    MODIFY_REG(RCC->CFGR, mask, 0u);
    return wait_bits(&RCC->CFGR, mask, 0u, CLOCK_DEFAULT_TIMEOUT_ITERATIONS) ? CLOCK_OK
                                                                             : CLOCK_TIMEOUT;
}

clock_status_t clock_profile_hsi8_8mhz(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_HSI,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV1,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV2,
    };
    if (HSI_VALUE != 8000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    return clock_apply_system_config(&config);
}

clock_status_t clock_profile_hsi8_16mhz(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_PLL,
        .pll_source = CLOCK_PLL_HSI_DIV2,
        .multiplier = CLOCK_PLL_MUL4,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV1,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV2,
    };
    if (HSI_VALUE != 8000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    return clock_apply_system_config(&config);
}

clock_status_t clock_profile_hsi8_32mhz(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_PLL,
        .pll_source = CLOCK_PLL_HSI_DIV2,
        .multiplier = CLOCK_PLL_MUL8,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV1,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV4,
    };
    if (HSI_VALUE != 8000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    return clock_apply_system_config(&config);
}

clock_status_t clock_profile_hsi8_48mhz(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_PLL,
        .pll_source = CLOCK_PLL_HSI_DIV2,
        .multiplier = CLOCK_PLL_MUL12,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV2,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV4,
    };
    if (HSI_VALUE != 8000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    return clock_apply_system_config(&config);
}

clock_status_t clock_profile_hse8_8mhz(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_HSE,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV1,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV2,
    };
    if (HSE_VALUE != 8000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    return clock_apply_system_config(&config);
}

clock_status_t clock_profile_hse8_16mhz(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_PLL,
        .pll_source = CLOCK_PLL_HSE,
        .hse_divider = CLOCK_PLL_HSE_DIV1,
        .multiplier = CLOCK_PLL_MUL2,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV1,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV2,
    };
    if (HSE_VALUE != 8000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    return clock_apply_system_config(&config);
}

clock_status_t clock_profile_hse8_32mhz(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_PLL,
        .pll_source = CLOCK_PLL_HSE,
        .hse_divider = CLOCK_PLL_HSE_DIV1,
        .multiplier = CLOCK_PLL_MUL4,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV1,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV4,
    };
    if (HSE_VALUE != 8000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    return clock_apply_system_config(&config);
}

clock_status_t clock_profile_hse8_72mhz(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_PLL,
        .pll_source = CLOCK_PLL_HSE,
        .hse_divider = CLOCK_PLL_HSE_DIV1,
        .multiplier = CLOCK_PLL_MUL9,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV2,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV6,
    };
    if (HSE_VALUE != 8000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    clock_status_t status = clock_apply_system_config(&config);
    /* Configure the 48 MHz USB clock only after the system profile succeeds. */
    return status == CLOCK_OK ? clock_select_usb_clock() : status;
}

clock_status_t clock_profile_hse8_48mhz(void) {
    static const clock_system_config_t config = {
        .source = CLOCK_SYS_PLL,
        .pll_source = CLOCK_PLL_HSE,
        .hse_divider = CLOCK_PLL_HSE_DIV1,
        .multiplier = CLOCK_PLL_MUL6,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV2,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV4,
    };
    if (HSE_VALUE != 8000000u) {
        return CLOCK_INVALID_CONFIG;
    }
    clock_status_t status = clock_apply_system_config(&config);
    /* Configure the 48 MHz USB clock only after the system profile succeeds. */
    return status == CLOCK_OK ? clock_select_usb_clock() : status;
}
