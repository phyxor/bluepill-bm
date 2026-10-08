/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
#include "clock_stm32f103.h"
#include "stm32f1xx.h"

static bool wait_bits(volatile uint32_t *reg, uint32_t mask, uint32_t value, uint32_t iterations) {
    while (iterations-- != 0u) {
        if ((*reg & mask) == value) {
            return true;
        }
    }
    return false;
}

static int divider_index(uint16_t divider, const uint16_t *values, unsigned count) {
    for (unsigned i = 0; i < count; ++i) {
        if (values[i] == divider) {
            return (int)i;
        }
    }
    return -1;
}

static clock_stm32f103_status_t system_result(clock_stm32f103_status_t status) {
    SystemCoreClockUpdate();
    return status;
}

clock_stm32f103_status_t clock_stm32f103_configure_system(const clock_system_config_t *c) {
    static const uint16_t ahb[] = {1, 2, 4, 8, 16, 64, 128, 256, 512};
    static const uint16_t apb[] = {1, 2, 4, 8, 16};
    static const uint16_t adc[] = {2, 4, 6, 8};
    if (c == 0 || c->timeout_iterations == 0u || HSI_VALUE == 0u || HSI_VALUE >= 24000000u ||
        HSE_VALUE < 4000000u || HSE_VALUE > 16000000u || (unsigned)c->source > CLOCK_SYS_PLL ||
        (unsigned)c->pll_source > CLOCK_PLL_HSE || c->pll_multiplier < 2u ||
        c->pll_multiplier > 16u || (c->hse_pll_divider != 1u && c->hse_pll_divider != 2u) ||
        c->flash_wait_states > 2u) {
        return CLOCK_STM32F103_INVALID_CONFIG;
    }
    int hpre = divider_index(c->ahb_divider, ahb, 9);
    int ppre1 = divider_index(c->apb1_divider, apb, 5);
    int ppre2 = divider_index(c->apb2_divider, apb, 5);
    int adcpre = divider_index(c->adc_divider, adc, 4);
    if (hpre < 0 || ppre1 < 0 || ppre2 < 0 || adcpre < 0 ||
        (!c->hsi_enabled &&
         (c->source == CLOCK_SYS_HSI || (c->pll_enabled && c->pll_source == CLOCK_PLL_HSI_DIV2))) ||
        (!c->hse_enabled &&
         (c->source == CLOCK_SYS_HSE || (c->pll_enabled && c->pll_source == CLOCK_PLL_HSE))) ||
        (c->source == CLOCK_SYS_PLL && !c->pll_enabled)) {
        return CLOCK_STM32F103_INVALID_CONFIG;
    }
    uint64_t pll_hz =
        (c->pll_source == CLOCK_PLL_HSI_DIV2 ? HSI_VALUE / 2u : HSE_VALUE / c->hse_pll_divider) *
        (uint64_t)c->pll_multiplier;
    uint64_t sys_hz = c->source == CLOCK_SYS_HSI   ? HSI_VALUE
                      : c->source == CLOCK_SYS_HSE ? HSE_VALUE
                                                   : pll_hz;
    uint64_t hclk = sys_hz / c->ahb_divider;
    unsigned latency = sys_hz <= 24000000u ? 0u : sys_hz <= 48000000u ? 1u : 2u;
    if ((c->pll_enabled && (pll_hz < 16000000u || pll_hz > 72000000u)) || sys_hz > 72000000u ||
        hclk > 72000000u || hclk / c->apb1_divider > 36000000u ||
        hclk / c->apb2_divider > 72000000u || hclk / c->apb2_divider / c->adc_divider > 14000000u ||
        c->flash_wait_states < latency || (c->ahb_divider != 1u && !c->flash_prefetch)) {
        return CLOCK_STM32F103_INVALID_CONFIG;
    }
    /* Do not interrupt an active USB clock or remove HSE from RTC/CSS. */
    if ((RCC->APB1ENR & RCC_APB1ENR_USBEN) != 0u ||
        (!c->hse_enabled && ((RCC->CR & RCC_CR_CSSON) != 0u ||
                             ((RCC->BDCR & RCC_BDCR_RTCEN) != 0u &&
                              (RCC->BDCR & RCC_BDCR_RTCSEL) == RCC_BDCR_RTCSEL_HSE))) ||
        (c->hse_enabled &&
         (RCC->CR & (RCC_CR_HSEON | RCC_CR_HSEBYP)) == (RCC_CR_HSEON | RCC_CR_HSEBYP))) {
        return CLOCK_STM32F103_IN_USE;
    }
    uint32_t timeout = c->timeout_iterations;
    SET_BIT(RCC->CR, RCC_CR_HSION);
    if (!wait_bits(&RCC->CR, RCC_CR_HSIRDY, RCC_CR_HSIRDY, timeout)) {
        return system_result(CLOCK_STM32F103_TIMEOUT);
    }
    MODIFY_REG(RCC->CFGR, RCC_CFGR_SW, RCC_CFGR_SW_HSI);
    if (!wait_bits(&RCC->CFGR, RCC_CFGR_SWS, RCC_CFGR_SWS_HSI, timeout)) {
        return system_result(CLOCK_STM32F103_TIMEOUT);
    }
    /* HSI at 8 MHz gives a safe point for Flash and PLL reconfiguration. */
    MODIFY_REG(RCC->CFGR, RCC_CFGR_HPRE, RCC_CFGR_HPRE_DIV1);
    CLEAR_BIT(RCC->CR, RCC_CR_PLLON);
    if (!wait_bits(&RCC->CR, RCC_CR_PLLRDY, 0u, timeout)) {
        return system_result(CLOCK_STM32F103_TIMEOUT);
    }
    MODIFY_REG(FLASH->ACR, FLASH_ACR_LATENCY | FLASH_ACR_PRFTBE | FLASH_ACR_HLFCYA,
               c->flash_wait_states | (c->flash_prefetch ? FLASH_ACR_PRFTBE : 0u));
    if (!wait_bits(&FLASH->ACR, FLASH_ACR_LATENCY, c->flash_wait_states, timeout) ||
        !wait_bits(&FLASH->ACR, FLASH_ACR_PRFTBS, c->flash_prefetch ? FLASH_ACR_PRFTBS : 0u,
                   timeout)) {
        return system_result(CLOCK_STM32F103_TIMEOUT);
    }
    if (c->hse_enabled) {
        if ((RCC->CR & RCC_CR_HSEON) == 0u) {
            CLEAR_BIT(RCC->CR, RCC_CR_HSEBYP);
        }
        SET_BIT(RCC->CR, RCC_CR_HSEON);
        if (!wait_bits(&RCC->CR, RCC_CR_HSERDY, RCC_CR_HSERDY, timeout)) {
            return system_result(CLOCK_STM32F103_TIMEOUT);
        }
    }
    uint32_t cfgr = (uint32_t)(hpre == 0 ? 0 : hpre + 7) << RCC_CFGR_HPRE_Pos;
    cfgr |= (uint32_t)(ppre1 == 0 ? 0 : ppre1 + 3) << RCC_CFGR_PPRE1_Pos;
    cfgr |= (uint32_t)(ppre2 == 0 ? 0 : ppre2 + 3) << RCC_CFGR_PPRE2_Pos;
    cfgr |= (uint32_t)adcpre << RCC_CFGR_ADCPRE_Pos;
    cfgr |= (uint32_t)(c->pll_multiplier - 2u) << RCC_CFGR_PLLMULL_Pos;
    cfgr |= c->pll_source == CLOCK_PLL_HSE ? RCC_CFGR_PLLSRC : 0u;
    cfgr |= c->hse_pll_divider == 2u ? RCC_CFGR_PLLXTPRE : 0u;
    cfgr |= c->usb_divide_by_1_5 ? 0u : RCC_CFGR_USBPRE;
    uint32_t mask = RCC_CFGR_HPRE | RCC_CFGR_PPRE1 | RCC_CFGR_PPRE2 | RCC_CFGR_ADCPRE |
                    RCC_CFGR_PLLMULL | RCC_CFGR_PLLSRC | RCC_CFGR_PLLXTPRE | RCC_CFGR_USBPRE;
    MODIFY_REG(RCC->CFGR, mask, cfgr);
    if (!wait_bits(&RCC->CFGR, mask, cfgr, timeout)) {
        return system_result(CLOCK_STM32F103_TIMEOUT);
    }
    if (c->pll_enabled) {
        SET_BIT(RCC->CR, RCC_CR_PLLON);
        if (!wait_bits(&RCC->CR, RCC_CR_PLLRDY, RCC_CR_PLLRDY, timeout)) {
            return system_result(CLOCK_STM32F103_TIMEOUT);
        }
    }
    MODIFY_REG(RCC->CFGR, RCC_CFGR_SW, (uint32_t)c->source << RCC_CFGR_SW_Pos);
    if (!wait_bits(&RCC->CFGR, RCC_CFGR_SWS, (uint32_t)c->source << RCC_CFGR_SWS_Pos, timeout)) {
        return system_result(CLOCK_STM32F103_TIMEOUT);
    }
    if (!c->hse_enabled) {
        CLEAR_BIT(RCC->CR, RCC_CR_HSEON);
        if (!wait_bits(&RCC->CR, RCC_CR_HSERDY, 0u, timeout)) {
            return system_result(CLOCK_STM32F103_TIMEOUT);
        }
    }
    if (!c->hsi_enabled) {
        CLEAR_BIT(RCC->CR, RCC_CR_HSION);
        if (!wait_bits(&RCC->CR, RCC_CR_HSIRDY, 0u, timeout)) {
            return system_result(CLOCK_STM32F103_TIMEOUT);
        }
    }
    return system_result(CLOCK_STM32F103_OK);
}

clock_stm32f103_status_t clock_stm32f103_configure_rtc(const clock_rtc_config_t *c) {
    if (c == 0 || c->timeout_iterations == 0u || (unsigned)c->source > CLOCK_RTC_HSE_DIV128 ||
        c->prescaler > 0xfffffu) {
        return CLOCK_STM32F103_INVALID_CONFIG;
    }
    uint32_t source = (uint32_t)c->source << RCC_BDCR_RTCSEL_Pos;
    uint32_t current = RCC->BDCR & RCC_BDCR_RTCSEL;
    if (source != 0u && current != 0u && current != source && !c->reset_backup_domain) {
        return CLOCK_STM32F103_BACKUP_RESET_REQUIRED;
    }
    if ((c->source == CLOCK_RTC_LSE &&
         (RCC->BDCR & (RCC_BDCR_LSEON | RCC_BDCR_LSEBYP)) == (RCC_BDCR_LSEON | RCC_BDCR_LSEBYP)) ||
        (c->source == CLOCK_RTC_HSE_DIV128 &&
         (RCC->CR & (RCC_CR_HSEON | RCC_CR_HSEBYP)) == (RCC_CR_HSEON | RCC_CR_HSEBYP))) {
        return CLOCK_STM32F103_IN_USE;
    }
    uint32_t timeout = c->timeout_iterations;
    SET_BIT(RCC->APB1ENR, RCC_APB1ENR_PWREN | RCC_APB1ENR_BKPEN);
    if (!wait_bits(&RCC->APB1ENR, RCC_APB1ENR_PWREN | RCC_APB1ENR_BKPEN,
                   RCC_APB1ENR_PWREN | RCC_APB1ENR_BKPEN, timeout)) {
        return CLOCK_STM32F103_TIMEOUT;
    }
    SET_BIT(PWR->CR, PWR_CR_DBP);
    if (!wait_bits(&PWR->CR, PWR_CR_DBP, PWR_CR_DBP, timeout)) {
        return CLOCK_STM32F103_TIMEOUT;
    }
    if (c->source == CLOCK_RTC_NONE) {
        CLEAR_BIT(RCC->BDCR, RCC_BDCR_RTCEN);
        return wait_bits(&RCC->BDCR, RCC_BDCR_RTCEN, 0u, timeout) ? CLOCK_STM32F103_OK
                                                                  : CLOCK_STM32F103_TIMEOUT;
    }
    if (current != 0u && current != source) {
        SET_BIT(RCC->BDCR, RCC_BDCR_BDRST);
        CLEAR_BIT(RCC->BDCR, RCC_BDCR_BDRST);
    }
    if (c->source == CLOCK_RTC_LSE) {
        if ((RCC->BDCR & RCC_BDCR_LSEON) == 0u) {
            CLEAR_BIT(RCC->BDCR, RCC_BDCR_LSEBYP);
        }
        SET_BIT(RCC->BDCR, RCC_BDCR_LSEON);
        if (!wait_bits(&RCC->BDCR, RCC_BDCR_LSERDY, RCC_BDCR_LSERDY, timeout)) {
            return CLOCK_STM32F103_TIMEOUT;
        }
    } else if (c->source == CLOCK_RTC_LSI) {
        SET_BIT(RCC->CSR, RCC_CSR_LSION);
        if (!wait_bits(&RCC->CSR, RCC_CSR_LSIRDY, RCC_CSR_LSIRDY, timeout)) {
            return CLOCK_STM32F103_TIMEOUT;
        }
    } else {
        if ((RCC->CR & RCC_CR_HSEON) == 0u) {
            CLEAR_BIT(RCC->CR, RCC_CR_HSEBYP);
        }
        SET_BIT(RCC->CR, RCC_CR_HSEON);
        if (!wait_bits(&RCC->CR, RCC_CR_HSERDY, RCC_CR_HSERDY, timeout)) {
            return CLOCK_STM32F103_TIMEOUT;
        }
    }
    MODIFY_REG(RCC->BDCR, RCC_BDCR_RTCSEL, source);
    SET_BIT(RCC->BDCR, RCC_BDCR_RTCEN);
    if (!wait_bits(&RCC->BDCR, RCC_BDCR_RTCSEL | RCC_BDCR_RTCEN, source | RCC_BDCR_RTCEN,
                   timeout)) {
        return CLOCK_STM32F103_TIMEOUT;
    }
    CLEAR_BIT(RTC->CRL, RTC_CRL_RSF);
    if (!wait_bits(&RTC->CRL, RTC_CRL_RSF, RTC_CRL_RSF, timeout) ||
        !wait_bits(&RTC->CRL, RTC_CRL_RTOFF, RTC_CRL_RTOFF, timeout)) {
        return CLOCK_STM32F103_TIMEOUT;
    }
    SET_BIT(RTC->CRL, RTC_CRL_CNF);
    WRITE_REG(RTC->PRLH, (c->prescaler >> 16) & 0xfu);
    WRITE_REG(RTC->PRLL, c->prescaler & 0xffffu);
    CLEAR_BIT(RTC->CRL, RTC_CRL_CNF);
    return wait_bits(&RTC->CRL, RTC_CRL_RTOFF, RTC_CRL_RTOFF, timeout) ? CLOCK_STM32F103_OK
                                                                       : CLOCK_STM32F103_TIMEOUT;
}

clock_stm32f103_status_t clock_stm32f103_configure_iwdg(const clock_iwdg_config_t *c) {
    static const uint16_t dividers[] = {4, 8, 16, 32, 64, 128, 256};
    if (c == 0 || c->timeout_iterations == 0u) {
        return CLOCK_STM32F103_INVALID_CONFIG;
    }
    int prescaler = divider_index(c->divider, dividers, 7);
    if (prescaler < 0) {
        return CLOCK_STM32F103_INVALID_CONFIG;
    }
    SET_BIT(RCC->CSR, RCC_CSR_LSION);
    uint32_t timeout = c->timeout_iterations;
    if (!wait_bits(&RCC->CSR, RCC_CSR_LSIRDY, RCC_CSR_LSIRDY, timeout)) {
        return CLOCK_STM32F103_TIMEOUT;
    }
    WRITE_REG(IWDG->KR, 0x5555u);
    if (!wait_bits(&IWDG->SR, IWDG_SR_PVU, 0u, timeout)) {
        WRITE_REG(IWDG->KR, 0u);
        return CLOCK_STM32F103_TIMEOUT;
    }
    WRITE_REG(IWDG->PR, (uint32_t)prescaler);
    bool ready = wait_bits(&IWDG->SR, IWDG_SR_PVU, 0u, timeout) &&
                 wait_bits(&IWDG->PR, IWDG_PR_PR, (uint32_t)prescaler, timeout);
    WRITE_REG(IWDG->KR, 0u); /* Lock prescaler access without starting IWDG. */
    return ready ? CLOCK_STM32F103_OK : CLOCK_STM32F103_TIMEOUT;
}
