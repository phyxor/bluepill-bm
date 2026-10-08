/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
#include <assert.h>
#include <stdio.h>
#include <string.h>

RCC_TypeDef test_rcc;
FLASH_TypeDef test_flash;
PWR_TypeDef test_pwr;
RTC_TypeDef test_rtc;
IWDG_TypeDef test_iwdg;

static const clock_system_config_t reset_config = {
    .source = CLOCK_SYS_HSI,
    .pll_source = CLOCK_PLL_HSI_DIV2,
    .hsi_enabled = true,
    .hse_pll_divider = 1,
    .pll_multiplier = 2,
    .ahb_divider = 1,
    .apb1_divider = 1,
    .apb2_divider = 1,
    .adc_divider = 2,
    .usb_divide_by_1_5 = true,
    .timeout_iterations = 4,
};

static void clear_registers(void) {
    memset(&test_rcc, 0, sizeof(test_rcc));
    memset(&test_flash, 0, sizeof(test_flash));
    memset(&test_pwr, 0, sizeof(test_pwr));
    memset(&test_rtc, 0, sizeof(test_rtc));
    memset(&test_iwdg, 0, sizeof(test_iwdg));
    SystemCoreClock = HSI_VALUE;
}

int main(void) {
    clear_registers();
    clock_system_config_t c = reset_config;
    c.apb1_divider = 3;
    assert(clock_stm32f103_configure_system(&c) == CLOCK_STM32F103_INVALID_CONFIG);
    assert(test_rcc.CR == 0 && test_rcc.CFGR == 0);

    c = reset_config;
    assert(clock_stm32f103_configure_system(&c) == CLOCK_STM32F103_TIMEOUT);
    assert(SystemCoreClock == HSI_VALUE);

    clear_registers();
    test_rcc.CR = RCC_CR_HSION | RCC_CR_HSIRDY;
    test_rcc.APB1ENR = RCC_APB1ENR_TIM2EN;
    test_rcc.APB2ENR = RCC_APB2ENR_ADC1EN;
    c.apb1_divider = 2;
    c.adc_divider = 4;
    assert(clock_stm32f103_configure_system(&c) == CLOCK_STM32F103_OK);
    assert((test_rcc.CFGR & RCC_CFGR_PPRE1) == RCC_CFGR_PPRE1_DIV2);
    assert((test_rcc.CFGR & RCC_CFGR_ADCPRE) == RCC_CFGR_ADCPRE_DIV4);
    assert(test_rcc.APB1ENR == RCC_APB1ENR_TIM2EN);
    assert(test_rcc.APB2ENR == RCC_APB2ENR_ADC1EN);
    assert(SystemCoreClock == 8000000u);

    test_rcc.APB1ENR |= RCC_APB1ENR_USBEN;
    uint32_t cfgr = test_rcc.CFGR;
    assert(clock_stm32f103_configure_system(&c) == CLOCK_STM32F103_IN_USE);
    assert(test_rcc.CFGR == cfgr);

    clear_registers();
    test_rcc.CR = RCC_CR_HSION | RCC_CR_HSIRDY;
    c = reset_config;
    c.hse_enabled = true;
    c.pll_enabled = true;
    c.source = CLOCK_SYS_PLL;
    c.pll_source = CLOCK_PLL_HSE;
    c.pll_multiplier = 9;
    c.apb1_divider = 2;
    c.adc_divider = 6;
    c.flash_wait_states = 2;
    c.flash_prefetch = true;
    /* No hardware sets PRFTBS in this RAM model: Flash status must time out. */
    assert(clock_stm32f103_configure_system(&c) == CLOCK_STM32F103_TIMEOUT);
    assert(SystemCoreClock == HSI_VALUE);

    clear_registers();
    clock_rtc_config_t rtc = {.source = CLOCK_RTC_LSI, .prescaler = 39999, .timeout_iterations = 4};
    test_rcc.BDCR = RCC_BDCR_RTCSEL_LSE | RCC_BDCR_RTCEN;
    assert(clock_stm32f103_configure_rtc(&rtc) == CLOCK_STM32F103_BACKUP_RESET_REQUIRED);
    assert(test_rcc.BDCR == (RCC_BDCR_RTCSEL_LSE | RCC_BDCR_RTCEN));
    rtc.source = CLOCK_RTC_NONE;
    assert(clock_stm32f103_configure_rtc(&rtc) == CLOCK_STM32F103_OK);
    assert(test_rcc.BDCR == RCC_BDCR_RTCSEL_LSE);

    clear_registers();
    clock_iwdg_config_t iwdg = {.divider = 256, .timeout_iterations = 4};
    test_rcc.CSR = RCC_CSR_LSION | RCC_CSR_LSIRDY;
    test_iwdg.RLR = 123;
    assert(clock_stm32f103_configure_iwdg(&iwdg) == CLOCK_STM32F103_OK);
    assert(test_iwdg.PR == 6);
    assert(test_iwdg.KR == 0 && test_iwdg.RLR == 123);
    iwdg.divider = 3;
    assert(clock_stm32f103_configure_iwdg(&iwdg) == CLOCK_STM32F103_INVALID_CONFIG);
    test_iwdg.SR = IWDG_SR_PVU;
    iwdg.divider = 4;
    assert(clock_stm32f103_configure_iwdg(&iwdg) == CLOCK_STM32F103_TIMEOUT);
    assert(test_iwdg.PR == 6);
    puts("Clock runtime register-model tests passed.");
    return 0;
}
