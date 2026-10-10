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
SysTick_Type test_systick;

static bool emulate_sysclk;
static bool emulate_oscillators;
static uint32_t stalled_ready_mask;
static uint32_t sysclk_writes[32];
static unsigned sysclk_write_count;

void test_modify_register(volatile uint32_t *reg, uint32_t clear, uint32_t set) {
    *reg = (*reg & ~clear) | set;
    if (emulate_oscillators && reg == &test_rcc.CR) {
        static const uint32_t on[] = {RCC_CR_HSION, RCC_CR_HSEON, RCC_CR_PLLON};
        static const uint32_t ready[] = {RCC_CR_HSIRDY, RCC_CR_HSERDY, RCC_CR_PLLRDY};
        for (unsigned i = 0; i < sizeof(on) / sizeof(on[0]); ++i) {
            if ((*reg & on[i]) != 0u && (stalled_ready_mask & ready[i]) == 0u) {
                *reg |= ready[i];
            } else {
                *reg &= ~ready[i];
            }
        }
    }
    if (emulate_oscillators && reg == &test_flash.ACR) {
        if ((*reg & FLASH_ACR_PRFTBE) != 0u) {
            *reg |= FLASH_ACR_PRFTBS;
        } else {
            *reg &= ~FLASH_ACR_PRFTBS;
        }
    }
    if (emulate_sysclk && reg == &test_rcc.CFGR) {
        if ((clear & (RCC_CFGR_SW | RCC_CFGR_HPRE | RCC_CFGR_PPRE1 | RCC_CFGR_PPRE2 |
                      RCC_CFGR_ADCPRE)) != 0u) {
            assert((test_flash.ACR & FLASH_ACR_LATENCY) == 2u);
        }
        uint32_t sw = (*reg & RCC_CFGR_SW) >> RCC_CFGR_SW_Pos;
        *reg = (*reg & ~RCC_CFGR_SWS) | (sw << RCC_CFGR_SWS_Pos);
        assert(sysclk_write_count < sizeof(sysclk_writes) / sizeof(sysclk_writes[0]));
        sysclk_writes[sysclk_write_count++] = *reg;
        /* Every intermediate state must keep APB1 and ADC within limits. */
        uint32_t saved_core = SystemCoreClock;
        SystemCoreClockUpdate();
        assert(clock_stm32f103_get_pclk1_hz() <= 36000000u);
        assert(clock_stm32f103_get_adc_hz() <= 14000000u);
        SystemCoreClock = saved_core;
    }
}

static void clear_registers(void) {
    emulate_sysclk = false;
    emulate_oscillators = false;
    stalled_ready_mask = 0u;
    sysclk_write_count = 0;
    memset(&test_rcc, 0, sizeof(test_rcc));
    memset(&test_flash, 0, sizeof(test_flash));
    memset(&test_pwr, 0, sizeof(test_pwr));
    memset(&test_rtc, 0, sizeof(test_rtc));
    memset(&test_iwdg, 0, sizeof(test_iwdg));
    memset(&test_systick, 0, sizeof(test_systick));
    SystemCoreClock = HSI_VALUE;
}

static void test_clock_queries(void) {
    /* All APB encodings, including the four encodings for divide-by-one. */
    static const uint8_t apb_dividers[] = {1, 1, 1, 1, 2, 4, 8, 16};
    static const uint8_t adc_dividers[] = {2, 4, 6, 8};
    clear_registers();
    assert(clock_stm32f103_get_pclk1_hz() == 8000000u);
    assert(clock_stm32f103_get_pclk2_hz() == 8000000u);
    assert(clock_stm32f103_get_apb1_timer_hz() == 8000000u);
    assert(clock_stm32f103_get_apb2_timer_hz() == 8000000u);
    assert(clock_stm32f103_get_adc_hz() == 4000000u);
    for (unsigned timer = CLOCK_TIM1; timer <= CLOCK_TIM4; ++timer) {
        assert(clock_stm32f103_get_tim_hz((clock_timer_t)timer) == 8000000u);
    }
    assert(clock_stm32f103_get_tim_hz((clock_timer_t)0) == 0u);
    assert(clock_stm32f103_get_tim_hz((clock_timer_t)-1) == 0u);
    assert(clock_stm32f103_get_tim_hz((clock_timer_t)5) == 0u);
    assert(clock_stm32f103_get_tim_hz((clock_timer_t)257) == 0u);

    /* HCLK is already AHB-divided: the queries must not divide it again. */
    uint32_t pll = RCC_CFGR_SWS_PLL | RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL9 | RCC_CFGR_HPRE_DIV2;
    for (unsigned apb1 = 0; apb1 < 8; ++apb1) {
        for (unsigned apb2 = 0; apb2 < 8; ++apb2) {
            for (unsigned adc = 0; adc < 4; ++adc) {
                uint32_t cfgr = pll | (apb1 << RCC_CFGR_PPRE1_Pos) | (apb2 << RCC_CFGR_PPRE2_Pos) |
                                (adc << RCC_CFGR_ADCPRE_Pos);
                test_rcc.CFGR = cfgr;
                SystemCoreClockUpdate();
                assert(SystemCoreClock == 36000000u);
                uint32_t pclk1 = 36000000u / apb_dividers[apb1];
                uint32_t pclk2 = 36000000u / apb_dividers[apb2];
                assert(clock_stm32f103_get_pclk1_hz() == pclk1);
                assert(clock_stm32f103_get_pclk2_hz() == pclk2);
                assert(clock_stm32f103_get_apb1_timer_hz() ==
                       (apb_dividers[apb1] == 1 ? pclk1 : 2u * pclk1));
                assert(clock_stm32f103_get_apb2_timer_hz() ==
                       (apb_dividers[apb2] == 1 ? pclk2 : 2u * pclk2));
                assert(clock_stm32f103_get_tim_hz(CLOCK_TIM1) ==
                       (apb_dividers[apb2] == 1 ? pclk2 : 2u * pclk2));
                for (unsigned timer = CLOCK_TIM2; timer <= CLOCK_TIM4; ++timer) {
                    assert(clock_stm32f103_get_tim_hz((clock_timer_t)timer) ==
                           (apb_dividers[apb1] == 1 ? pclk1 : 2u * pclk1));
                }
                assert(clock_stm32f103_get_adc_hz() == pclk2 / adc_dividers[adc]);
                assert(test_rcc.CFGR == cfgr);
                assert(test_rcc.APB1ENR == 0 && test_rcc.APB2ENR == 0);
                assert(SystemCoreClock == 36000000u);
            }
        }
    }

    test_rcc.CFGR = RCC_CFGR_SWS_PLL | RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL6 | RCC_CFGR_PPRE1_DIV2 |
                    RCC_CFGR_ADCPRE_DIV4;
    SystemCoreClockUpdate();
    assert(SystemCoreClock == 48000000u);
    assert(clock_stm32f103_get_pclk1_hz() == 24000000u);
    assert(clock_stm32f103_get_pclk2_hz() == 48000000u);
    assert(clock_stm32f103_get_apb1_timer_hz() == 48000000u);
    assert(clock_stm32f103_get_apb2_timer_hz() == 48000000u);
    assert(clock_stm32f103_get_adc_hz() == 12000000u);

    test_rcc.CFGR = RCC_CFGR_SWS_PLL | RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL9 | RCC_CFGR_PPRE1_DIV2 |
                    RCC_CFGR_ADCPRE_DIV6;
    SystemCoreClockUpdate();
    assert(SystemCoreClock == 72000000u);
    assert(clock_stm32f103_get_pclk1_hz() == 36000000u);
    assert(clock_stm32f103_get_pclk2_hz() == 72000000u);
    assert(clock_stm32f103_get_apb1_timer_hz() == 72000000u);
    assert(clock_stm32f103_get_apb2_timer_hz() == 72000000u);
    assert(clock_stm32f103_get_adc_hz() == 12000000u);
}

static void test_oscillator_operations(void) {
    static const struct {
        clock_stm32f103_status_t (*enable)(void);
        clock_stm32f103_status_t (*disable)(void);
        volatile uint32_t *reg;
        uint32_t on;
        uint32_t ready;
        uint32_t preserved;
    } oscillators[] = {
        {clock_stm32f103_enable_hsi, clock_stm32f103_disable_hsi, &test_rcc.CR, RCC_CR_HSION,
         RCC_CR_HSIRDY, 16u << RCC_CR_HSITRIM_Pos},
        {clock_stm32f103_enable_hse, clock_stm32f103_disable_hse, &test_rcc.CR, RCC_CR_HSEON,
         RCC_CR_HSERDY, RCC_CR_HSEBYP},
        {clock_stm32f103_enable_lsi, clock_stm32f103_disable_lsi, &test_rcc.CSR, RCC_CSR_LSION,
         RCC_CSR_LSIRDY, RCC_CSR_PINRSTF},
        {clock_stm32f103_enable_lse, clock_stm32f103_disable_lse, &test_rcc.BDCR, RCC_BDCR_LSEON,
         RCC_BDCR_LSERDY, RCC_BDCR_LSEBYP | RCC_BDCR_RTCSEL_LSI},
    };
    for (unsigned i = 0; i < sizeof(oscillators) / sizeof(oscillators[0]); ++i) {
        clear_registers();
        /* Move SYSCLK away from HSI for its disable tests. */
        if (i == 0) {
            test_rcc.CFGR = RCC_CFGR_SW_HSE | RCC_CFGR_SWS_HSE;
        }
        test_rcc.APB1ENR = RCC_APB1ENR_TIM2EN;
        test_rtc.PRLL = 123u;
        uint32_t cfgr = test_rcc.CFGR;
        *oscillators[i].reg = oscillators[i].preserved;

        /* RAM never raises RDY: enabling must time out and retain the request. */
        assert(oscillators[i].enable() == CLOCK_STM32F103_TIMEOUT);
        assert(*oscillators[i].reg == (oscillators[i].preserved | oscillators[i].on));
        *oscillators[i].reg |= oscillators[i].ready;
        assert(oscillators[i].enable() == CLOCK_STM32F103_OK);
        assert(oscillators[i].enable() == CLOCK_STM32F103_OK);

        /* RAM never clears RDY, also modeling LSI held on by an active IWDG. */
        assert(oscillators[i].disable() == CLOCK_STM32F103_TIMEOUT);
        assert(*oscillators[i].reg == (oscillators[i].preserved | oscillators[i].ready));
        *oscillators[i].reg &= ~oscillators[i].ready;
        assert(oscillators[i].disable() == CLOCK_STM32F103_OK);
        assert(oscillators[i].disable() == CLOCK_STM32F103_OK);
        assert(*oscillators[i].reg == oscillators[i].preserved);
        assert(test_rcc.CFGR == cfgr);
        assert(SystemCoreClock == HSI_VALUE);
        assert(test_rtc.PRLL == 123u);
        if (i == 3) {
            assert(test_rcc.APB1ENR ==
                   (RCC_APB1ENR_TIM2EN | RCC_APB1ENR_PWREN | RCC_APB1ENR_BKPEN));
            assert((test_pwr.CR & PWR_CR_DBP) != 0u);
        } else {
            assert(test_rcc.APB1ENR == RCC_APB1ENR_TIM2EN);
            assert(test_pwr.CR == 0u);
        }
    }
}

static void test_oscillator_dependencies(void) {
    static const struct {
        clock_stm32f103_status_t (*disable)(void);
        uint32_t cr;
        uint32_t cfgr;
        uint32_t bdcr;
    } cases[] = {
        {clock_stm32f103_disable_hsi, RCC_CR_HSION, 0, 0},
        {clock_stm32f103_disable_hsi, RCC_CR_HSION, RCC_CFGR_SW_HSE, 0},
        {clock_stm32f103_disable_hsi, RCC_CR_HSION, RCC_CFGR_SWS_HSE, 0},
        {clock_stm32f103_disable_hsi, RCC_CR_HSION | RCC_CR_PLLON,
         RCC_CFGR_SW_HSE | RCC_CFGR_SWS_HSE, 0},
        {clock_stm32f103_disable_hsi, RCC_CR_HSION | RCC_CR_PLLRDY,
         RCC_CFGR_SW_HSE | RCC_CFGR_SWS_HSE, 0},
        {clock_stm32f103_disable_hsi, RCC_CR_HSION, RCC_CFGR_SW_PLL | RCC_CFGR_SWS_HSE, 0},
        {clock_stm32f103_disable_hsi, RCC_CR_HSION,
         RCC_CFGR_SW_HSE | RCC_CFGR_SWS_HSE | RCC_CFGR_MCO_HSI, 0},
        {clock_stm32f103_disable_hse, RCC_CR_HSEON, RCC_CFGR_SW_HSE, 0},
        {clock_stm32f103_disable_hse, RCC_CR_HSEON, RCC_CFGR_SWS_HSE, 0},
        {clock_stm32f103_disable_hse, RCC_CR_HSEON | RCC_CR_PLLON, RCC_CFGR_PLLSRC, 0},
        {clock_stm32f103_disable_hse, RCC_CR_HSEON | RCC_CR_PLLRDY, RCC_CFGR_PLLSRC, 0},
        {clock_stm32f103_disable_hse, RCC_CR_HSEON, RCC_CFGR_PLLSRC | RCC_CFGR_SW_PLL, 0},
        {clock_stm32f103_disable_hse, RCC_CR_HSEON | RCC_CR_CSSON, 0, 0},
        {clock_stm32f103_disable_hse, RCC_CR_HSEON, RCC_CFGR_MCO_HSE, 0},
        {clock_stm32f103_disable_hse, RCC_CR_HSEON, 0, RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL_HSE},
        {clock_stm32f103_disable_lsi, 0, 0, RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL_LSI},
        {clock_stm32f103_disable_lse, 0, 0, RCC_BDCR_LSEON | RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL_LSE},
    };
    for (unsigned i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i) {
        clear_registers();
        test_rcc.CR = cases[i].cr;
        test_rcc.CFGR = cases[i].cfgr;
        test_rcc.BDCR = cases[i].bdcr;
        test_rcc.CSR = RCC_CSR_LSION;
        assert(cases[i].disable() == CLOCK_STM32F103_IN_USE);
        assert(test_rcc.CR == cases[i].cr);
        assert(test_rcc.CFGR == cases[i].cfgr);
        assert(test_rcc.BDCR == cases[i].bdcr);
        assert(test_rcc.CSR == RCC_CSR_LSION);
        assert(test_rcc.APB1ENR == 0 && test_pwr.CR == 0);
    }

    /* An enabled PLL must only block disabling its own input oscillator. */
    clear_registers();
    test_rcc.CR = RCC_CR_HSION | RCC_CR_PLLON;
    test_rcc.CFGR = RCC_CFGR_PLLSRC | RCC_CFGR_SW_PLL | RCC_CFGR_SWS_PLL;
    assert(clock_stm32f103_disable_hsi() == CLOCK_STM32F103_OK);
    assert(test_rcc.CR == RCC_CR_PLLON);

    test_rcc.CR = RCC_CR_HSEON | RCC_CR_PLLON;
    test_rcc.CFGR = RCC_CFGR_SW_PLL | RCC_CFGR_SWS_PLL;
    assert(clock_stm32f103_disable_hse() == CLOCK_STM32F103_OK);
    assert(test_rcc.CR == RCC_CR_PLLON);
}

static void test_pll_operations(void) {
    static const struct {
        clock_pll_source_t source;
        clock_pll_hse_divider_t divider;
        clock_pll_multiplier_t multiplier;
        uint32_t hz;
    } configs[] = {
        {CLOCK_PLL_HSI_DIV2, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL4, 16000000u},
        {CLOCK_PLL_HSI_DIV2, CLOCK_PLL_HSE_DIV2, CLOCK_PLL_MUL16, 64000000u},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL2, 16000000u},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL6, 48000000u},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL9, 72000000u},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV2, CLOCK_PLL_MUL4, 16000000u},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV2, CLOCK_PLL_MUL12, 48000000u},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV2, CLOCK_PLL_MUL16, 64000000u},
    };
    uint32_t mask = RCC_CFGR_PLLSRC | RCC_CFGR_PLLXTPRE | RCC_CFGR_PLLMULL;
    uint32_t preserved = RCC_CFGR_PPRE1_DIV4 | RCC_CFGR_PPRE2_DIV2 | RCC_CFGR_ADCPRE_DIV8 |
                         RCC_CFGR_USBPRE | RCC_CFGR_MCO_HSI;
    for (unsigned i = 0; i < sizeof(configs) / sizeof(configs[0]); ++i) {
        clear_registers();
        test_rcc.CR = RCC_CR_HSION | RCC_CR_HSIRDY | RCC_CR_HSEON | RCC_CR_HSERDY | RCC_CR_HSEBYP;
        test_rcc.CFGR = preserved | mask;
        test_flash.ACR = 2u;
        /* RAM cannot raise PLLRDY, but programming must reach the lock wait. */
        assert(clock_stm32f103_enable_pll(configs[i].source, configs[i].divider,
                                          configs[i].multiplier) == CLOCK_STM32F103_TIMEOUT);
        assert((test_rcc.CR & RCC_CR_PLLON) != 0u);
        assert((test_rcc.CR & RCC_CR_HSEBYP) != 0u);
        assert((test_rcc.CFGR & ~mask) == preserved);
        assert(test_flash.ACR == 2u);
        assert(SystemCoreClock == HSI_VALUE);
        if (configs[i].source == CLOCK_PLL_HSE) {
            assert((test_rcc.CFGR & RCC_CFGR_PLLSRC) != 0u);
            assert(((test_rcc.CFGR & RCC_CFGR_PLLXTPRE) != 0u) ==
                   (configs[i].divider == CLOCK_PLL_HSE_DIV2));
        } else {
            assert((test_rcc.CFGR & (RCC_CFGR_PLLSRC | RCC_CFGR_PLLXTPRE)) == 0u);
        }
        uint32_t cfgr = test_rcc.CFGR;
        uint32_t cr = test_rcc.CR;
        assert(clock_stm32f103_enable_pll(configs[i].source, configs[i].divider,
                                          configs[i].multiplier) == CLOCK_STM32F103_IN_USE);
        assert(test_rcc.CFGR == cfgr && test_rcc.CR == cr);

        /* Model PLL becoming the active source to verify the programmed frequency. */
        test_rcc.CFGR |= RCC_CFGR_SWS_PLL;
        SystemCoreClockUpdate();
        assert(SystemCoreClock == configs[i].hz);
        test_rcc.CFGR = cfgr;
        SystemCoreClockUpdate();

        test_rcc.CR |= RCC_CR_PLLRDY;
        assert(clock_stm32f103_disable_pll() == CLOCK_STM32F103_TIMEOUT);
        assert((test_rcc.CR & RCC_CR_PLLON) == 0u);
        test_rcc.CR &= ~RCC_CR_PLLRDY;
        assert(clock_stm32f103_disable_pll() == CLOCK_STM32F103_OK);
        assert(clock_stm32f103_disable_pll() == CLOCK_STM32F103_OK);
        assert(test_rcc.CR == (cr & ~RCC_CR_PLLON));
        assert(test_rcc.CFGR == cfgr);
    }

    /* The other oscillator being enabled cannot satisfy the selected source. */
    for (unsigned source = CLOCK_PLL_HSI_DIV2; source <= CLOCK_PLL_HSE; ++source) {
        clear_registers();
        uint32_t other =
            source == CLOCK_PLL_HSE ? RCC_CR_HSION | RCC_CR_HSIRDY : RCC_CR_HSEON | RCC_CR_HSERDY;
        test_rcc.CR = other;
        test_rcc.CFGR = preserved;
        assert(clock_stm32f103_enable_pll((clock_pll_source_t)source, CLOCK_PLL_HSE_DIV1,
                                          CLOCK_PLL_MUL6) == CLOCK_STM32F103_INVALID_CONFIG);
        assert(test_rcc.CR == other);
        assert(test_rcc.CFGR == preserved);

        /* ON without RDY is enabled: only the PLL lock wait can time out. */
        uint32_t selected = source == CLOCK_PLL_HSE ? RCC_CR_HSEON : RCC_CR_HSION;
        test_rcc.CR |= selected;
        assert(clock_stm32f103_enable_pll((clock_pll_source_t)source, CLOCK_PLL_HSE_DIV1,
                                          CLOCK_PLL_MUL6) == CLOCK_STM32F103_TIMEOUT);
        assert(test_rcc.CR == (other | selected | RCC_CR_PLLON));
    }
}

static void test_pll_validation(void) {
    static const struct {
        clock_pll_source_t source;
        clock_pll_hse_divider_t divider;
        clock_pll_multiplier_t multiplier;
    } invalid[] = {
        {(clock_pll_source_t)-1, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL6},
        {(clock_pll_source_t)2, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL6},
        {CLOCK_PLL_HSE, (clock_pll_hse_divider_t)0, CLOCK_PLL_MUL6},
        {CLOCK_PLL_HSE, (clock_pll_hse_divider_t)3, CLOCK_PLL_MUL6},
        {CLOCK_PLL_HSE, (clock_pll_hse_divider_t)-1, CLOCK_PLL_MUL6},
        {CLOCK_PLL_HSE, (clock_pll_hse_divider_t)257, CLOCK_PLL_MUL6},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, (clock_pll_multiplier_t)1},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, (clock_pll_multiplier_t)17},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, (clock_pll_multiplier_t)-1},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, (clock_pll_multiplier_t)262},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL10},
        {CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV2, CLOCK_PLL_MUL2},
        {CLOCK_PLL_HSI_DIV2, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL3},
    };
    for (unsigned i = 0; i < sizeof(invalid) / sizeof(invalid[0]); ++i) {
        clear_registers();
        test_rcc.CR = RCC_CR_HSION | RCC_CR_HSEON;
        assert(clock_stm32f103_enable_pll(invalid[i].source, invalid[i].divider,
                                          invalid[i].multiplier) == CLOCK_STM32F103_INVALID_CONFIG);
        assert(test_rcc.CR == (RCC_CR_HSION | RCC_CR_HSEON) && test_rcc.CFGR == 0);
    }

    static const uint32_t consumers[] = {
        RCC_CFGR_SW_PLL,
        RCC_CFGR_SWS_PLL,
        RCC_CFGR_MCO_PLLCLK_DIV2,
        0, /* Enabled USB is a consumer independently of SYSCLK and MCO. */
    };
    for (unsigned i = 0; i < sizeof(consumers) / sizeof(consumers[0]); ++i) {
        clear_registers();
        test_rcc.CR = RCC_CR_HSEON;
        test_rcc.CFGR = consumers[i];
        if (consumers[i] == 0) {
            test_rcc.APB1ENR = RCC_APB1ENR_USBEN;
        }
        assert(clock_stm32f103_enable_pll(CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL9) ==
               CLOCK_STM32F103_IN_USE);
        assert(test_rcc.CR == RCC_CR_HSEON && test_rcc.CFGR == consumers[i]);
        test_rcc.CR = RCC_CR_PLLON | RCC_CR_PLLRDY;
        assert(clock_stm32f103_disable_pll() == CLOCK_STM32F103_IN_USE);
        assert(test_rcc.CR == (RCC_CR_PLLON | RCC_CR_PLLRDY));
        assert(test_rcc.CFGR == consumers[i]);
    }

    clear_registers();
    test_rcc.CR = RCC_CR_HSEON | RCC_CR_PLLRDY;
    assert(clock_stm32f103_enable_pll(CLOCK_PLL_HSE, CLOCK_PLL_HSE_DIV1, CLOCK_PLL_MUL9) ==
           CLOCK_STM32F103_IN_USE);
    assert(test_rcc.CR == (RCC_CR_HSEON | RCC_CR_PLLRDY) && test_rcc.CFGR == 0);
}

static void test_sysclk_selection(void) {
    static const clock_ahb_divider_t ahb[] = {
        CLOCK_AHB_DIV1,  CLOCK_AHB_DIV2,   CLOCK_AHB_DIV4,   CLOCK_AHB_DIV8,   CLOCK_AHB_DIV16,
        CLOCK_AHB_DIV64, CLOCK_AHB_DIV128, CLOCK_AHB_DIV256, CLOCK_AHB_DIV512,
    };
    static const clock_apb_divider_t apb[] = {
        CLOCK_APB_DIV1, CLOCK_APB_DIV2, CLOCK_APB_DIV4, CLOCK_APB_DIV8, CLOCK_APB_DIV16,
    };
    static const clock_adc_divider_t adc[] = {
        CLOCK_ADC_DIV2,
        CLOCK_ADC_DIV4,
        CLOCK_ADC_DIV6,
        CLOCK_ADC_DIV8,
    };
    for (unsigned a = 0; a < sizeof(ahb) / sizeof(ahb[0]); ++a) {
        for (unsigned b = 0; b < sizeof(apb) / sizeof(apb[0]); ++b) {
            for (unsigned c = 0; c < sizeof(apb) / sizeof(apb[0]); ++c) {
                for (unsigned d = 0; d < sizeof(adc) / sizeof(adc[0]); ++d) {
                    clear_registers();
                    test_rcc.CR = RCC_CR_HSION | RCC_CR_HSIRDY;
                    test_flash.ACR = FLASH_ACR_PRFTBS | FLASH_ACR_HLFCYA;
                    assert(clock_stm32f103_select_sysclk(CLOCK_SYS_HSI, ahb[a], apb[b], apb[c],
                                                         adc[d]) == CLOCK_STM32F103_OK);
                    assert(SystemCoreClock == 8000000u / ahb[a]);
                    assert(clock_stm32f103_get_pclk1_hz() == SystemCoreClock / apb[b]);
                    assert(clock_stm32f103_get_pclk2_hz() == SystemCoreClock / apb[c]);
                    assert(clock_stm32f103_get_adc_hz() == SystemCoreClock / apb[c] / adc[d]);
                    assert(test_rcc.APB2ENR == 0u);
                    assert(test_rcc.CR == (RCC_CR_HSION | RCC_CR_HSIRDY));
                    assert((test_flash.ACR & FLASH_ACR_LATENCY) == 0u);
                    assert((test_flash.ACR & FLASH_ACR_PRFTBE) != 0u);
                    assert((test_flash.ACR & FLASH_ACR_HLFCYA) == 0u);
                }
            }
        }
    }

    /* Model real switches in both directions; check all intermediate bus clocks. */
    for (unsigned source = CLOCK_SYS_HSI; source <= CLOCK_SYS_PLL; ++source) {
        clear_registers();
        uint32_t cr = RCC_CR_HSION | RCC_CR_HSIRDY | RCC_CR_HSEON | RCC_CR_HSERDY | RCC_CR_PLLON |
                      RCC_CR_PLLRDY;
        uint32_t preserved =
            RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL9 | RCC_CFGR_USBPRE | RCC_CFGR_MCO_HSI;
        test_rcc.CR = cr;
        test_rcc.CFGR = preserved;
        if (source != CLOCK_SYS_PLL) {
            test_rcc.CFGR |=
                RCC_CFGR_SW_PLL | RCC_CFGR_SWS_PLL | RCC_CFGR_PPRE1_DIV2 | RCC_CFGR_ADCPRE_DIV6;
        }
        test_flash.ACR = 2u | FLASH_ACR_PRFTBS | FLASH_ACR_PRFTBE;
        test_rcc.APB1ENR = RCC_APB1ENR_USBEN;
        SystemCoreClockUpdate();
        emulate_sysclk = true;
        clock_apb_divider_t apb1 = source == CLOCK_SYS_PLL ? CLOCK_APB_DIV2 : CLOCK_APB_DIV1;
        clock_adc_divider_t adc_divider = source == CLOCK_SYS_PLL ? CLOCK_ADC_DIV6 : CLOCK_ADC_DIV2;
        assert(clock_stm32f103_select_sysclk((clock_system_source_t)source, CLOCK_AHB_DIV1, apb1,
                                             CLOCK_APB_DIV1, adc_divider) == CLOCK_STM32F103_OK);
        emulate_sysclk = false;
        assert(SystemCoreClock == (source == CLOCK_SYS_PLL ? 72000000u : 8000000u));
        assert(test_rcc.CR == cr);
        assert(test_rcc.APB1ENR == RCC_APB1ENR_USBEN);
        uint32_t changed = RCC_CFGR_SW | RCC_CFGR_SWS | RCC_CFGR_HPRE | RCC_CFGR_PPRE1 |
                           RCC_CFGR_PPRE2 | RCC_CFGR_ADCPRE;
        assert((test_rcc.CFGR & ~changed) == preserved);
        assert(clock_stm32f103_get_adc_hz() == (source == CLOCK_SYS_PLL ? 12000000u : 4000000u));
        assert(test_rcc.APB2ENR == 0u);
        assert((test_flash.ACR & FLASH_ACR_LATENCY) == (source == CLOCK_SYS_PLL ? 2u : 0u));
        assert(sysclk_write_count == 3u);
        assert((sysclk_writes[1] &
                (RCC_CFGR_HPRE | RCC_CFGR_PPRE1 | RCC_CFGR_PPRE2 | RCC_CFGR_ADCPRE)) ==
               (RCC_CFGR_HPRE_DIV2 | RCC_CFGR_PPRE1_DIV16 | RCC_CFGR_PPRE2_DIV16 |
                RCC_CFGR_ADCPRE_DIV8));
    }

    clear_registers();
    test_rcc.CR =
        RCC_CR_HSION | RCC_CR_HSIRDY | RCC_CR_HSEON | RCC_CR_HSERDY | RCC_CR_PLLON | RCC_CR_PLLRDY;
    test_rcc.CFGR = RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL6;
    test_flash.ACR = FLASH_ACR_PRFTBS;
    emulate_sysclk = true;
    assert(clock_stm32f103_select_sysclk(CLOCK_SYS_PLL, CLOCK_AHB_DIV1, CLOCK_APB_DIV2,
                                         CLOCK_APB_DIV1, CLOCK_ADC_DIV4) == CLOCK_STM32F103_OK);
    emulate_sysclk = false;
    assert(SystemCoreClock == 48000000u);
    assert(clock_stm32f103_get_adc_hz() == 12000000u);
    assert((test_flash.ACR & FLASH_ACR_LATENCY) == 1u);

    /* The alternate x16 encoding must also update SystemCoreClock correctly. */
    clear_registers();
    test_rcc.CR = RCC_CR_HSION | RCC_CR_HSIRDY | RCC_CR_PLLON | RCC_CR_PLLRDY;
    test_rcc.CFGR = RCC_CFGR_PLLMULL | RCC_CFGR_ADCPRE_DIV6;
    test_flash.ACR = FLASH_ACR_PRFTBS;
    emulate_sysclk = true;
    assert(clock_stm32f103_select_sysclk(CLOCK_SYS_PLL, CLOCK_AHB_DIV1, CLOCK_APB_DIV2,
                                         CLOCK_APB_DIV1, CLOCK_ADC_DIV6) == CLOCK_STM32F103_OK);
    emulate_sysclk = false;
    assert(SystemCoreClock == 64000000u);
}

static void test_sysclk_errors(void) {
    static const struct {
        clock_system_source_t source;
        clock_ahb_divider_t ahb;
        clock_apb_divider_t apb1;
        clock_apb_divider_t apb2;
        clock_adc_divider_t adc;
    } invalid[] = {
        {(clock_system_source_t)-1, CLOCK_AHB_DIV1, CLOCK_APB_DIV1, CLOCK_APB_DIV1, CLOCK_ADC_DIV2},
        {(clock_system_source_t)3, CLOCK_AHB_DIV1, CLOCK_APB_DIV1, CLOCK_APB_DIV1, CLOCK_ADC_DIV2},
        {CLOCK_SYS_HSI, (clock_ahb_divider_t)0, CLOCK_APB_DIV1, CLOCK_APB_DIV1, CLOCK_ADC_DIV2},
        {CLOCK_SYS_HSI, (clock_ahb_divider_t)32, CLOCK_APB_DIV1, CLOCK_APB_DIV1, CLOCK_ADC_DIV2},
        {CLOCK_SYS_HSI, (clock_ahb_divider_t)65537, CLOCK_APB_DIV1, CLOCK_APB_DIV1, CLOCK_ADC_DIV2},
        {CLOCK_SYS_HSI, CLOCK_AHB_DIV1, (clock_apb_divider_t)3, CLOCK_APB_DIV1, CLOCK_ADC_DIV2},
        {CLOCK_SYS_HSI, CLOCK_AHB_DIV1, CLOCK_APB_DIV1, (clock_apb_divider_t)-1, CLOCK_ADC_DIV2},
        {CLOCK_SYS_HSI, CLOCK_AHB_DIV1, CLOCK_APB_DIV1, CLOCK_APB_DIV1, (clock_adc_divider_t)0},
        {CLOCK_SYS_HSI, CLOCK_AHB_DIV1, CLOCK_APB_DIV1, CLOCK_APB_DIV1, (clock_adc_divider_t)3},
        {CLOCK_SYS_HSI, CLOCK_AHB_DIV1, CLOCK_APB_DIV1, CLOCK_APB_DIV1, (clock_adc_divider_t)-1},
        {CLOCK_SYS_HSI, CLOCK_AHB_DIV1, CLOCK_APB_DIV1, CLOCK_APB_DIV1, (clock_adc_divider_t)258},
        {CLOCK_SYS_PLL, CLOCK_AHB_DIV1, CLOCK_APB_DIV1, CLOCK_APB_DIV1, CLOCK_ADC_DIV6}, /* APB1 */
        {CLOCK_SYS_PLL, CLOCK_AHB_DIV1, CLOCK_APB_DIV2, CLOCK_APB_DIV1, CLOCK_ADC_DIV2}, /* ADC */
        {CLOCK_SYS_PLL, CLOCK_AHB_DIV1, CLOCK_APB_DIV2, CLOCK_APB_DIV1, CLOCK_ADC_DIV4}, /* ADC */
    };
    for (unsigned i = 0; i < sizeof(invalid) / sizeof(invalid[0]); ++i) {
        clear_registers();
        uint32_t cr = RCC_CR_HSION | RCC_CR_HSIRDY | RCC_CR_HSEON | RCC_CR_PLLON;
        test_rcc.CR = cr;
        test_rcc.CFGR = RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL9;
        uint32_t cfgr = test_rcc.CFGR;
        assert(clock_stm32f103_select_sysclk(invalid[i].source, invalid[i].ahb, invalid[i].apb1,
                                             invalid[i].apb2,
                                             invalid[i].adc) == CLOCK_STM32F103_INVALID_CONFIG);
        assert(test_rcc.CR == cr && test_rcc.CFGR == cfgr && test_flash.ACR == 0);
    }
    for (unsigned source = CLOCK_SYS_HSI; source <= CLOCK_SYS_PLL; ++source) {
        clear_registers();
        assert(clock_stm32f103_select_sysclk((clock_system_source_t)source, CLOCK_AHB_DIV1,
                                             CLOCK_APB_DIV1, CLOCK_APB_DIV1,
                                             CLOCK_ADC_DIV2) == CLOCK_STM32F103_INVALID_CONFIG);
        assert(test_rcc.CR == 0 && test_rcc.CFGR == 0 && test_flash.ACR == 0);
    }

    clear_registers();
    test_rcc.CR = RCC_CR_PLLON | RCC_CR_PLLRDY;
    test_rcc.CFGR = RCC_CFGR_PLLMULL6;
    assert(clock_stm32f103_select_sysclk(CLOCK_SYS_PLL, CLOCK_AHB_DIV1, CLOCK_APB_DIV1,
                                         CLOCK_APB_DIV1,
                                         CLOCK_ADC_DIV2) == CLOCK_STM32F103_INVALID_CONFIG);
    assert(test_rcc.CR == (RCC_CR_PLLON | RCC_CR_PLLRDY));
    assert(test_rcc.CFGR == RCC_CFGR_PLLMULL6 && test_flash.ACR == 0);

    clear_registers();
    test_rcc.CR = RCC_CR_HSION;
    assert(clock_stm32f103_select_sysclk(CLOCK_SYS_HSI, CLOCK_AHB_DIV1, CLOCK_APB_DIV1,
                                         CLOCK_APB_DIV1,
                                         CLOCK_ADC_DIV2) == CLOCK_STM32F103_TIMEOUT);
    assert(test_rcc.CR == RCC_CR_HSION && test_rcc.CFGR == 0 && test_flash.ACR == 0);
    test_rcc.CR |= RCC_CR_HSIRDY;
    test_rcc.CFGR = RCC_CFGR_SW_HSE;
    assert(clock_stm32f103_select_sysclk(CLOCK_SYS_HSI, CLOCK_AHB_DIV1, CLOCK_APB_DIV1,
                                         CLOCK_APB_DIV1, CLOCK_ADC_DIV2) == CLOCK_STM32F103_IN_USE);
    assert(test_rcc.CFGR == RCC_CFGR_SW_HSE && test_flash.ACR == 0);
    test_rcc.CFGR = 0;
    /* Without PRFTBS in RAM, stop before any bus/source changes. */
    assert(clock_stm32f103_select_sysclk(CLOCK_SYS_HSI, CLOCK_AHB_DIV1, CLOCK_APB_DIV1,
                                         CLOCK_APB_DIV1,
                                         CLOCK_ADC_DIV2) == CLOCK_STM32F103_TIMEOUT);
    assert(test_rcc.CFGR == 0 && SystemCoreClock == HSI_VALUE);

    test_flash.ACR |= FLASH_ACR_PRFTBS;
    test_rcc.CR |= RCC_CR_HSEON | RCC_CR_HSERDY;
    /* No emulation: SWS never changes, so report the active HSI / 2 clock. */
    assert(clock_stm32f103_select_sysclk(CLOCK_SYS_HSE, CLOCK_AHB_DIV1, CLOCK_APB_DIV1,
                                         CLOCK_APB_DIV1,
                                         CLOCK_ADC_DIV2) == CLOCK_STM32F103_TIMEOUT);
    assert(SystemCoreClock == HSI_VALUE / 2u);
    assert((test_rcc.CFGR & RCC_CFGR_SW) == RCC_CFGR_SW_HSE);
    assert((test_rcc.CFGR & RCC_CFGR_SWS) == RCC_CFGR_SWS_HSI);
}

static void test_usb_clock_selection(void) {
    static const struct {
        uint32_t pll_bits;
        uint32_t usbpre;
    } configs[] = {
        {RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL6, RCC_CFGR_USBPRE},
        {RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL9, 0u},
        {RCC_CFGR_PLLSRC | RCC_CFGR_PLLXTPRE | RCC_CFGR_PLLMULL12, RCC_CFGR_USBPRE},
        {RCC_CFGR_PLLMULL12, RCC_CFGR_USBPRE},
    };
    for (unsigned i = 0; i < sizeof(configs) / sizeof(configs[0]); ++i) {
        clear_registers();
        uint32_t cr = RCC_CR_HSION | RCC_CR_HSIRDY | RCC_CR_HSEON | RCC_CR_HSERDY | RCC_CR_PLLON |
                      RCC_CR_PLLRDY;
        uint32_t cfgr = configs[i].pll_bits | RCC_CFGR_SW_HSE | RCC_CFGR_SWS_HSE |
                        RCC_CFGR_HPRE_DIV2 | RCC_CFGR_PPRE1_DIV4 | RCC_CFGR_PPRE2_DIV2 |
                        RCC_CFGR_ADCPRE_DIV6 | RCC_CFGR_MCO_HSE;
        uint32_t wrong = configs[i].usbpre == 0u ? RCC_CFGR_USBPRE : 0u;
        test_rcc.CR = cr;
        test_rcc.CFGR = cfgr | wrong;
        test_rcc.APB1ENR = RCC_APB1ENR_TIM2EN;
        test_rcc.APB2ENR = RCC_APB2ENR_ADC1EN;
        SystemCoreClockUpdate();
        uint32_t core = SystemCoreClock;
        assert(clock_stm32f103_select_usb_clock() == CLOCK_STM32F103_OK);
        assert(test_rcc.CFGR == (cfgr | configs[i].usbpre));
        assert(test_rcc.CR == cr);
        assert(test_rcc.APB1ENR == RCC_APB1ENR_TIM2EN);
        assert(test_rcc.APB2ENR == RCC_APB2ENR_ADC1EN);
        assert(SystemCoreClock == core && test_flash.ACR == 0u);
        assert(clock_stm32f103_select_usb_clock() == CLOCK_STM32F103_OK);

        /* An active USB peripheral permits validation, but no divider change. */
        test_rcc.APB1ENR |= RCC_APB1ENR_USBEN;
        assert(clock_stm32f103_select_usb_clock() == CLOCK_STM32F103_OK);
        assert(test_rcc.CFGR == (cfgr | configs[i].usbpre));
        test_rcc.CFGR = cfgr | wrong;
        assert(clock_stm32f103_select_usb_clock() == CLOCK_STM32F103_IN_USE);
        assert(test_rcc.CFGR == (cfgr | wrong) && test_rcc.CR == cr);

        /* An enabled but unlocked PLL cannot change USBPRE. */
        test_rcc.APB1ENR &= ~RCC_APB1ENR_USBEN;
        test_rcc.CR &= ~RCC_CR_PLLRDY;
        assert(clock_stm32f103_select_usb_clock() == CLOCK_STM32F103_TIMEOUT);
        assert(test_rcc.CFGR == (cfgr | wrong));
        assert(test_rcc.CR == (cr & ~RCC_CR_PLLRDY));

        test_rcc.CR = cr & ~RCC_CR_PLLON;
        assert(clock_stm32f103_select_usb_clock() == CLOCK_STM32F103_INVALID_CONFIG);
        assert(test_rcc.CFGR == (cfgr | wrong));
        assert(test_rcc.CR == (cr & ~RCC_CR_PLLON));

        uint32_t input_on =
            (configs[i].pll_bits & RCC_CFGR_PLLSRC) != 0u ? RCC_CR_HSEON : RCC_CR_HSION;
        test_rcc.CR = cr & ~input_on;
        assert(clock_stm32f103_select_usb_clock() == CLOCK_STM32F103_INVALID_CONFIG);
        assert(test_rcc.CFGR == (cfgr | wrong) && test_rcc.CR == (cr & ~input_on));
    }

    static const uint32_t invalid[] = {
        RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL2,                      /* 16 MHz */
        RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL4,                      /* 32 MHz */
        RCC_CFGR_PLLSRC | RCC_CFGR_PLLXTPRE | RCC_CFGR_PLLMULL9,  /* 36 MHz */
        RCC_CFGR_PLLSRC | RCC_CFGR_PLLXTPRE | RCC_CFGR_PLLMULL16, /* 64 MHz */
        RCC_CFGR_PLLMULL6,                                        /* HSI / 2 x 6: 24 MHz */
        RCC_CFGR_PLLMULL, /* Alternate HSI / 2 x 16 encoding: 64 MHz */
    };
    for (unsigned i = 0; i < sizeof(invalid) / sizeof(invalid[0]); ++i) {
        clear_registers();
        uint32_t cr = RCC_CR_HSION | RCC_CR_HSEON | RCC_CR_PLLON | RCC_CR_PLLRDY;
        test_rcc.CR = cr;
        test_rcc.CFGR = invalid[i] | RCC_CFGR_USBPRE;
        assert(clock_stm32f103_select_usb_clock() == CLOCK_STM32F103_INVALID_CONFIG);
        assert(test_rcc.CR == cr && test_rcc.CFGR == (invalid[i] | RCC_CFGR_USBPRE));
        assert(test_rcc.APB1ENR == 0u && SystemCoreClock == HSI_VALUE);
    }
}

static void assert_hse8_profile(uint32_t hz) {
    assert(SystemCoreClock == hz);
    assert(clock_stm32f103_get_pclk1_hz() == hz / 2u);
    assert(clock_stm32f103_get_pclk2_hz() == hz);
    assert(clock_stm32f103_get_apb1_timer_hz() == hz);
    assert(clock_stm32f103_get_apb2_timer_hz() == hz);
    assert(clock_stm32f103_get_adc_hz() == 12000000u);
    assert((test_rcc.CFGR & RCC_CFGR_SWS) == RCC_CFGR_SWS_PLL);
    assert((test_rcc.CFGR & RCC_CFGR_PLLSRC) != 0u);
    assert((test_rcc.CFGR & RCC_CFGR_PLLXTPRE) == 0u);
    assert((test_rcc.CFGR & RCC_CFGR_USBPRE) == (hz == 48000000u ? RCC_CFGR_USBPRE : 0u));
    assert((test_flash.ACR & FLASH_ACR_LATENCY) == (hz == 72000000u ? 2u : 1u));
    assert((test_flash.ACR & FLASH_ACR_PRFTBE) != 0u);
    uint32_t cr =
        RCC_CR_HSION | RCC_CR_HSIRDY | RCC_CR_HSEON | RCC_CR_HSERDY | RCC_CR_PLLON | RCC_CR_PLLRDY;
    assert((test_rcc.CR & cr) == cr);
}

static void test_hse8_profiles(void) {
    static const struct {
        clock_stm32f103_status_t (*apply)(void);
        uint32_t hz;
    } profiles[] = {
        {clock_stm32f103_profile_hse8_72mhz, 72000000u},
        {clock_stm32f103_profile_hse8_48mhz, 48000000u},
    };
    for (unsigned i = 0; i < sizeof(profiles) / sizeof(profiles[0]); ++i) {
        for (unsigned start = 0; start < 3; ++start) {
            clear_registers();
            test_rcc.CR = RCC_CR_HSION | RCC_CR_HSIRDY;
            if (start == 1) {
                test_rcc.CR |= RCC_CR_PLLON | RCC_CR_PLLRDY;
                test_rcc.CFGR = RCC_CFGR_SW_PLL | RCC_CFGR_SWS_PLL | RCC_CFGR_PLLMULL16 |
                                RCC_CFGR_PPRE1_DIV2 | RCC_CFGR_ADCPRE_DIV6;
                test_flash.ACR = 2u | FLASH_ACR_PRFTBE | FLASH_ACR_PRFTBS;
            } else if (start == 2) {
                test_rcc.CR = RCC_CR_HSEON | RCC_CR_HSERDY;
                test_rcc.CFGR = RCC_CFGR_SW_HSE | RCC_CFGR_SWS_HSE;
            }
            test_rcc.APB1ENR = RCC_APB1ENR_TIM2EN;
            test_rcc.APB2ENR = RCC_APB2ENR_ADC1EN;
            test_rcc.BDCR = RCC_BDCR_LSEON | RCC_BDCR_LSERDY | RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL_LSE;
            test_rcc.CSR = RCC_CSR_LSION | RCC_CSR_LSIRDY;
            test_rtc.PRLL = 32767u;
            SystemCoreClockUpdate();
            emulate_sysclk = true;
            emulate_oscillators = true;
            assert(profiles[i].apply() == CLOCK_STM32F103_OK);
            assert_hse8_profile(profiles[i].hz);
            /* Reapplication and switching to the other profile must also work. */
            sysclk_write_count = 0;
            assert(profiles[i].apply() == CLOCK_STM32F103_OK);
            assert_hse8_profile(profiles[i].hz);
            sysclk_write_count = 0;
            assert(profiles[1u - i].apply() == CLOCK_STM32F103_OK);
            assert_hse8_profile(profiles[1u - i].hz);
            assert(test_rcc.APB1ENR == RCC_APB1ENR_TIM2EN);
            assert(test_rcc.APB2ENR == RCC_APB2ENR_ADC1EN);
            assert(test_rcc.BDCR ==
                   (RCC_BDCR_LSEON | RCC_BDCR_LSERDY | RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL_LSE));
            assert(test_rcc.CSR == (RCC_CSR_LSION | RCC_CSR_LSIRDY));
            assert(test_rtc.PRLL == 32767u);
        }

        /* Preflight failures must not change oscillator or clock registers. */
        for (unsigned dependency = 0; dependency < 3; ++dependency) {
            clear_registers();
            uint32_t cfgr = dependency == 1   ? RCC_CFGR_MCO_PLLCLK_DIV2
                            : dependency == 2 ? RCC_CFGR_SW_HSE
                                              : 0u;
            test_rcc.CFGR = cfgr;
            if (dependency == 0) {
                test_rcc.APB1ENR = RCC_APB1ENR_USBEN;
            }
            assert(profiles[i].apply() == CLOCK_STM32F103_IN_USE);
            assert(test_rcc.CR == 0u && test_rcc.CFGR == cfgr && test_flash.ACR == 0u);
        }

        static const uint32_t stalled[] = {RCC_CR_HSIRDY, RCC_CR_HSERDY, RCC_CR_PLLRDY};
        for (unsigned stage = 0; stage < sizeof(stalled) / sizeof(stalled[0]); ++stage) {
            clear_registers();
            emulate_sysclk = true;
            emulate_oscillators = true;
            stalled_ready_mask = stalled[stage];
            assert(profiles[i].apply() == CLOCK_STM32F103_TIMEOUT);
            assert(SystemCoreClock == HSI_VALUE);
            assert((test_rcc.CFGR & RCC_CFGR_SW) == RCC_CFGR_SW_HSI);
            if (stage < 2) {
                assert((test_rcc.CR & RCC_CR_PLLON) == 0u);
            } else {
                assert((test_rcc.CR & RCC_CR_PLLON) != 0u);
                assert((test_rcc.CR & RCC_CR_PLLRDY) == 0u);
            }
        }
    }
}

static void test_system_configs(void) {
    static const struct {
        clock_system_config_t config;
        uint32_t hclk;
        uint32_t pclk1;
        uint32_t pclk2;
        uint32_t adc;
    } cases[] = {
        {{.source = CLOCK_SYS_HSI,
          .ahb_divider = CLOCK_AHB_DIV1,
          .apb1_divider = CLOCK_APB_DIV1,
          .apb2_divider = CLOCK_APB_DIV1,
          .adc_divider = CLOCK_ADC_DIV2},
         8000000u,
         8000000u,
         8000000u,
         4000000u},
        {{.source = CLOCK_SYS_HSE,
          .ahb_divider = CLOCK_AHB_DIV1,
          .apb1_divider = CLOCK_APB_DIV1,
          .apb2_divider = CLOCK_APB_DIV1,
          .adc_divider = CLOCK_ADC_DIV2},
         8000000u,
         8000000u,
         8000000u,
         4000000u},
        {{.source = CLOCK_SYS_PLL,
          .pll_source = CLOCK_PLL_HSI_DIV2,
          .multiplier = CLOCK_PLL_MUL16,
          .ahb_divider = CLOCK_AHB_DIV1,
          .apb1_divider = CLOCK_APB_DIV2,
          .apb2_divider = CLOCK_APB_DIV1,
          .adc_divider = CLOCK_ADC_DIV6},
         64000000u,
         32000000u,
         64000000u,
         10666666u},
        {{.source = CLOCK_SYS_PLL,
          .pll_source = CLOCK_PLL_HSE,
          .hse_divider = CLOCK_PLL_HSE_DIV2,
          .multiplier = CLOCK_PLL_MUL12,
          .ahb_divider = CLOCK_AHB_DIV1,
          .apb1_divider = CLOCK_APB_DIV2,
          .apb2_divider = CLOCK_APB_DIV1,
          .adc_divider = CLOCK_ADC_DIV4},
         48000000u,
         24000000u,
         48000000u,
         12000000u},
        {{.source = CLOCK_SYS_PLL,
          .pll_source = CLOCK_PLL_HSE,
          .hse_divider = CLOCK_PLL_HSE_DIV1,
          .multiplier = CLOCK_PLL_MUL9,
          .ahb_divider = CLOCK_AHB_DIV1,
          .apb1_divider = CLOCK_APB_DIV2,
          .apb2_divider = CLOCK_APB_DIV1,
          .adc_divider = CLOCK_ADC_DIV6},
         72000000u,
         36000000u,
         72000000u,
         12000000u},
        {{.source = CLOCK_SYS_PLL,
          .pll_source = CLOCK_PLL_HSI_DIV2,
          .multiplier = CLOCK_PLL_MUL16,
          .ahb_divider = CLOCK_AHB_DIV2,
          .apb1_divider = CLOCK_APB_DIV4,
          .apb2_divider = CLOCK_APB_DIV2,
          .adc_divider = CLOCK_ADC_DIV4},
         32000000u,
         8000000u,
         16000000u,
         4000000u},
    };
    for (unsigned i = 0; i < sizeof(cases) / sizeof(cases[0]); ++i) {
        for (unsigned start = 0; start < 2; ++start) {
            clear_registers();
            emulate_sysclk = true;
            emulate_oscillators = true;
            if (start == 1) {
                assert(clock_stm32f103_profile_hse8_72mhz() == CLOCK_STM32F103_OK);
            } else {
                /* HSI-based configurations must not need HSE startup. */
                if (cases[i].config.source == CLOCK_SYS_HSI ||
                    (cases[i].config.source == CLOCK_SYS_PLL &&
                     cases[i].config.pll_source == CLOCK_PLL_HSI_DIV2)) {
                    stalled_ready_mask = RCC_CR_HSERDY;
                }
            }
            test_rcc.CFGR |= RCC_CFGR_USBPRE;
            test_rcc.APB1ENR = RCC_APB1ENR_TIM2EN;
            test_rcc.APB2ENR = RCC_APB2ENR_ADC1EN;
            test_systick.CTRL = SysTick_CTRL_TICKINT_Msk;
            test_systick.LOAD = 999u;
            test_systick.VAL = 123u;
            test_rcc.BDCR = RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL_LSE;
            test_rcc.CSR = RCC_CSR_LSION | RCC_CSR_LSIRDY;
            sysclk_write_count = 0;
            assert(clock_stm32f103_apply_system_config(&cases[i].config) == CLOCK_STM32F103_OK);
            assert(SystemCoreClock == cases[i].hclk);
            assert(clock_stm32f103_get_pclk1_hz() == cases[i].pclk1);
            assert(clock_stm32f103_get_pclk2_hz() == cases[i].pclk2);
            assert(clock_stm32f103_get_adc_hz() == cases[i].adc);
            assert((test_rcc.CFGR & RCC_CFGR_SWS) ==
                   ((uint32_t)cases[i].config.source << RCC_CFGR_SWS_Pos));
            assert(((test_rcc.CR & RCC_CR_PLLON) != 0u) ==
                   (cases[i].config.source == CLOCK_SYS_PLL));
            assert((test_rcc.CR & RCC_CR_HSION) != 0u);
            assert((test_rcc.CFGR & RCC_CFGR_USBPRE) != 0u);
            assert(test_rcc.APB1ENR == RCC_APB1ENR_TIM2EN);
            assert(test_rcc.APB2ENR == RCC_APB2ENR_ADC1EN);
            assert(test_rcc.BDCR == (RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL_LSE));
            assert(test_rcc.CSR == (RCC_CSR_LSION | RCC_CSR_LSIRDY));
            assert(test_systick.CTRL == SysTick_CTRL_TICKINT_Msk);
            assert(test_systick.LOAD == 999u && test_systick.VAL == 123u);
            sysclk_write_count = 0;
            assert(clock_stm32f103_apply_system_config(&cases[i].config) == CLOCK_STM32F103_OK);
            assert(SystemCoreClock == cases[i].hclk);
        }
    }
}

static void assert_invalid_system_config(const clock_system_config_t *config) {
    clear_registers();
    test_rcc.CR =
        RCC_CR_HSION | RCC_CR_HSIRDY | RCC_CR_HSEON | RCC_CR_HSERDY | RCC_CR_PLLON | RCC_CR_PLLRDY;
    test_rcc.CFGR = RCC_CFGR_SW_PLL | RCC_CFGR_SWS_PLL | RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL9 |
                    RCC_CFGR_PPRE1_DIV2 | RCC_CFGR_ADCPRE_DIV6;
    test_flash.ACR = 2u | FLASH_ACR_PRFTBE | FLASH_ACR_PRFTBS;
    SystemCoreClockUpdate();
    uint32_t cr = test_rcc.CR;
    uint32_t cfgr = test_rcc.CFGR;
    uint32_t flash = test_flash.ACR;
    assert(clock_stm32f103_apply_system_config(config) == CLOCK_STM32F103_INVALID_CONFIG);
    assert(test_rcc.CR == cr && test_rcc.CFGR == cfgr && test_flash.ACR == flash);
    assert(SystemCoreClock == 72000000u);
}

static void test_system_config_validation(void) {
    static const clock_system_config_t valid = {
        .source = CLOCK_SYS_PLL,
        .pll_source = CLOCK_PLL_HSE,
        .hse_divider = CLOCK_PLL_HSE_DIV1,
        .multiplier = CLOCK_PLL_MUL9,
        .ahb_divider = CLOCK_AHB_DIV1,
        .apb1_divider = CLOCK_APB_DIV2,
        .apb2_divider = CLOCK_APB_DIV1,
        .adc_divider = CLOCK_ADC_DIV6,
    };
    assert_invalid_system_config(0);
    clock_system_config_t c = valid;
    c.source = (clock_system_source_t)-1;
    assert_invalid_system_config(&c);
    c = valid;
    c.ahb_divider = (clock_ahb_divider_t)65537;
    assert_invalid_system_config(&c);
    c = valid;
    c.apb1_divider = (clock_apb_divider_t)3;
    assert_invalid_system_config(&c);
    c = valid;
    c.apb2_divider = (clock_apb_divider_t)-1;
    assert_invalid_system_config(&c);
    c = valid;
    c.adc_divider = (clock_adc_divider_t)0;
    assert_invalid_system_config(&c);
    c = valid;
    c.pll_source = (clock_pll_source_t)2;
    assert_invalid_system_config(&c);
    c = valid;
    c.hse_divider = (clock_pll_hse_divider_t)0;
    assert_invalid_system_config(&c);
    c = valid;
    c.multiplier = (clock_pll_multiplier_t)-1;
    assert_invalid_system_config(&c);
    c = valid;
    c.multiplier = CLOCK_PLL_MUL10; /* PLL above 72 MHz. */
    assert_invalid_system_config(&c);
    c = valid;
    c.hse_divider = CLOCK_PLL_HSE_DIV2;
    c.multiplier = CLOCK_PLL_MUL2; /* PLL below 16 MHz. */
    assert_invalid_system_config(&c);
    c = valid;
    c.apb1_divider = CLOCK_APB_DIV1; /* APB1 above 36 MHz. */
    assert_invalid_system_config(&c);
    c = valid;
    c.adc_divider = CLOCK_ADC_DIV4; /* ADC above 14 MHz. */
    assert_invalid_system_config(&c);

    /* Direct sources ignore even invalid PLL fields. */
    clear_registers();
    emulate_sysclk = true;
    emulate_oscillators = true;
    c.source = CLOCK_SYS_HSI;
    c.pll_source = (clock_pll_source_t)-1;
    c.hse_divider = (clock_pll_hse_divider_t)-1;
    c.multiplier = (clock_pll_multiplier_t)-1;
    assert(clock_stm32f103_apply_system_config(&c) == CLOCK_STM32F103_OK);
    assert(SystemCoreClock == HSI_VALUE && (test_rcc.CR & RCC_CR_PLLON) == 0u);
}

static void test_reset_profile(void) {
    for (unsigned start = 0; start < 4; ++start) {
        clear_registers();
        emulate_sysclk = true;
        emulate_oscillators = true;
        if (start == 1) {
            assert(clock_stm32f103_profile_hse8_48mhz() == CLOCK_STM32F103_OK);
        } else if (start == 2) {
            assert(clock_stm32f103_profile_hse8_72mhz() == CLOCK_STM32F103_OK);
        } else if (start == 3) {
            const clock_system_config_t config = {
                .source = CLOCK_SYS_PLL,
                .pll_source = CLOCK_PLL_HSI_DIV2,
                .multiplier = CLOCK_PLL_MUL16,
                .ahb_divider = CLOCK_AHB_DIV1,
                .apb1_divider = CLOCK_APB_DIV2,
                .apb2_divider = CLOCK_APB_DIV1,
                .adc_divider = CLOCK_ADC_DIV6,
            };
            assert(clock_stm32f103_apply_system_config(&config) == CLOCK_STM32F103_OK);
        }
        test_rcc.CFGR |= RCC_CFGR_MCO_HSI;
        test_rcc.APB1ENR = RCC_APB1ENR_TIM2EN;
        test_rcc.APB2ENR = RCC_APB2ENR_ADC1EN;
        test_rcc.BDCR = RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL_LSE;
        test_rcc.CSR = RCC_CSR_LSION | RCC_CSR_LSIRDY;
        test_systick.CTRL = SysTick_CTRL_CLKSOURCE_Msk;
        test_systick.LOAD = 999u;
        uint32_t hse = test_rcc.CR & (RCC_CR_HSEON | RCC_CR_HSERDY);
        for (unsigned repeat = 0; repeat < 2; ++repeat) {
            sysclk_write_count = 0;
            assert(clock_stm32f103_profile_reset() == CLOCK_STM32F103_OK);
            assert(SystemCoreClock == HSI_VALUE);
            assert(clock_stm32f103_get_pclk1_hz() == HSI_VALUE);
            assert(clock_stm32f103_get_pclk2_hz() == HSI_VALUE);
            assert(clock_stm32f103_get_adc_hz() == HSI_VALUE / 2u);
            /* All source, multiplier, and divider fields have reset encodings. */
            assert(test_rcc.CFGR == RCC_CFGR_MCO_HSI);
            assert((test_rcc.CR & (RCC_CR_PLLON | RCC_CR_PLLRDY)) == 0u);
            assert((test_rcc.CR & (RCC_CR_HSION | RCC_CR_HSIRDY)) ==
                   (RCC_CR_HSION | RCC_CR_HSIRDY));
            assert((test_rcc.CR & (RCC_CR_HSEON | RCC_CR_HSERDY)) == hse);
            assert((test_flash.ACR & FLASH_ACR_LATENCY) == 0u);
            assert(test_rcc.APB1ENR == RCC_APB1ENR_TIM2EN);
            assert(test_rcc.APB2ENR == RCC_APB2ENR_ADC1EN);
            assert(test_rcc.BDCR == (RCC_BDCR_RTCEN | RCC_BDCR_RTCSEL_LSE));
            assert(test_rcc.CSR == (RCC_CSR_LSION | RCC_CSR_LSIRDY));
            assert(test_systick.CTRL == SysTick_CTRL_CLKSOURCE_Msk && test_systick.LOAD == 999u);
        }
    }

    clear_registers();
    test_rcc.APB1ENR = RCC_APB1ENR_USBEN;
    assert(clock_stm32f103_profile_reset() == CLOCK_STM32F103_IN_USE);
    assert(test_rcc.CR == 0u && test_rcc.CFGR == 0u && test_flash.ACR == 0u);
    test_rcc.APB1ENR = 0u;
    test_rcc.CFGR = RCC_CFGR_MCO_PLLCLK_DIV2;
    assert(clock_stm32f103_profile_reset() == CLOCK_STM32F103_IN_USE);
    assert(test_rcc.CR == 0u && test_rcc.CFGR == RCC_CFGR_MCO_PLLCLK_DIV2);
}

static void test_systick_clock(void) {
    static const struct {
        uint32_t cfgr;
        uint32_t hclk;
        uint32_t divided;
    } clocks[] = {
        {0u, 8000000u, 1000000u},
        {RCC_CFGR_SWS_PLL | RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL6, 48000000u, 6000000u},
        {RCC_CFGR_SWS_PLL | RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL9, 72000000u, 9000000u},
        {RCC_CFGR_SWS_PLL | RCC_CFGR_PLLSRC | RCC_CFGR_PLLMULL9 | RCC_CFGR_HPRE_DIV2, 36000000u,
         4500000u},
    };
    for (unsigned i = 0; i < sizeof(clocks) / sizeof(clocks[0]); ++i) {
        clear_registers();
        test_rcc.CFGR = clocks[i].cfgr;
        SystemCoreClockUpdate();
        assert(SystemCoreClock == clocks[i].hclk);
        test_systick.LOAD = 999u;
        test_systick.VAL = 123u;
        assert(clock_stm32f103_get_systick_hz() == clocks[i].divided);
        test_systick.CTRL = SysTick_CTRL_TICKINT_Msk;
        assert(clock_stm32f103_select_systick_source(CLOCK_SYSTICK_HCLK) == CLOCK_STM32F103_OK);
        assert(test_systick.CTRL == (SysTick_CTRL_TICKINT_Msk | SysTick_CTRL_CLKSOURCE_Msk));
        assert(clock_stm32f103_get_systick_hz() == clocks[i].hclk);
        assert(clock_stm32f103_select_systick_source(CLOCK_SYSTICK_HCLK_DIV8) ==
               CLOCK_STM32F103_OK);
        assert(test_systick.CTRL == SysTick_CTRL_TICKINT_Msk);
        assert(clock_stm32f103_get_systick_hz() == clocks[i].divided);
        assert(test_systick.LOAD == 999u && test_systick.VAL == 123u);
        assert(test_rcc.CFGR == clocks[i].cfgr && SystemCoreClock == clocks[i].hclk);
        assert(test_rcc.CR == 0u && test_rcc.APB1ENR == 0u && test_rcc.APB2ENR == 0u);

        /* Queries report the input clock even when the counter is running. */
        test_systick.CTRL |= SysTick_CTRL_ENABLE_Msk;
        assert(clock_stm32f103_get_systick_hz() == clocks[i].divided);
        assert(clock_stm32f103_select_systick_source(CLOCK_SYSTICK_HCLK_DIV8) ==
               CLOCK_STM32F103_OK);
        assert(clock_stm32f103_select_systick_source(CLOCK_SYSTICK_HCLK) == CLOCK_STM32F103_IN_USE);
        assert(test_systick.CTRL == (SysTick_CTRL_ENABLE_Msk | SysTick_CTRL_TICKINT_Msk));
        test_systick.CTRL |= SysTick_CTRL_CLKSOURCE_Msk;
        assert(clock_stm32f103_get_systick_hz() == clocks[i].hclk);
        assert(clock_stm32f103_select_systick_source(CLOCK_SYSTICK_HCLK) == CLOCK_STM32F103_OK);
        assert(clock_stm32f103_select_systick_source(CLOCK_SYSTICK_HCLK_DIV8) ==
               CLOCK_STM32F103_IN_USE);
        assert(test_systick.CTRL ==
               (SysTick_CTRL_ENABLE_Msk | SysTick_CTRL_TICKINT_Msk | SysTick_CTRL_CLKSOURCE_Msk));
        assert(test_systick.LOAD == 999u && test_systick.VAL == 123u);
    }

    clear_registers();
    assert(clock_stm32f103_select_systick_source(CLOCK_SYSTICK_HCLK) == CLOCK_STM32F103_OK);
    assert(test_systick.CTRL == SysTick_CTRL_CLKSOURCE_Msk);
    assert(clock_stm32f103_select_systick_source(CLOCK_SYSTICK_HCLK_DIV8) == CLOCK_STM32F103_OK);
    assert(test_systick.CTRL == 0u);
    static const clock_systick_source_t invalid[] = {
        (clock_systick_source_t)-1,
        (clock_systick_source_t)2,
        (clock_systick_source_t)256,
    };
    for (unsigned i = 0; i < sizeof(invalid) / sizeof(invalid[0]); ++i) {
        assert(clock_stm32f103_select_systick_source(invalid[i]) == CLOCK_STM32F103_INVALID_CONFIG);
        assert(test_systick.CTRL == 0u && test_systick.LOAD == 0u && test_systick.VAL == 0u);
    }
}

int main(void) {
    test_clock_queries();
    test_oscillator_operations();
    test_oscillator_dependencies();
    test_pll_operations();
    test_pll_validation();
    test_sysclk_selection();
    test_sysclk_errors();
    test_usb_clock_selection();
    test_hse8_profiles();
    test_system_configs();
    test_system_config_validation();
    test_reset_profile();
    test_systick_clock();
    puts("Clock runtime register-model tests passed.");
    return 0;
}
