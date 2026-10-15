/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
#include "rtc.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static RCC_TypeDef test_rcc;
static PWR_TypeDef test_pwr;
static RTC_TypeDef test_rtc;
static BKP_TypeDef test_bkp;
static bool emulate_synchronization;
static unsigned rtc_accesses;

static RTC_TypeDef *rtc_registers(void) {
    ++rtc_accesses;
    if (rtc_accesses <= 2u) {
        assert((test_pwr.CR & PWR_CR_DBP) != 0u);
    }
    if (rtc_accesses == 2u) {
        /* Hardware sets RSF only after software clears the previous value. */
        assert((test_rtc.CRL & RTC_CRL_RSF) == 0u);
        if (emulate_synchronization) {
            test_rtc.CRL |= RTC_CRL_RSF;
        }
    }
    return &test_rtc;
}

#undef RCC
#undef PWR
#undef RTC
#undef BKP
#define RCC (&test_rcc)
#define PWR (&test_pwr)
#define RTC rtc_registers()
#define BKP (&test_bkp)
/* The host has no Cortex-M interrupt-mask register. */
#define __get_PRIMASK() 0u
#include "../drivers/cmsis/rtc.c"

static void reset_registers(bool writable, bool synchronize) {
    memset(&test_rcc, 0, sizeof(test_rcc));
    memset(&test_pwr, 0, sizeof(test_pwr));
    memset(&test_rtc, 0, sizeof(test_rtc));
    memset(&test_bkp, 0, sizeof(test_bkp));
    test_rcc.APB1ENR = RCC_APB1ENR_PWREN | RCC_APB1ENR_BKPEN;
    test_rcc.BDCR = RCC_BDCR_LSEON | RCC_BDCR_LSERDY | RCC_BDCR_RTCSEL_LSE | RCC_BDCR_RTCEN;
    test_pwr.CR = PWR_CR_PLS_LEV3 | (writable ? PWR_CR_DBP : 0u);
    test_rtc.CRL = RTC_CRL_RSF | RTC_CRL_RTOFF | RTC_CRL_SECF;
    test_rtc.CRH = RTC_CRH_SECIE;
    test_rtc.PRLH = 0u;
    test_rtc.PRLL = 0x7FFFu;
    test_rtc.CNTH = 0x1234u;
    test_rtc.CNTL = 0x5678u;
    emulate_synchronization = synchronize;
    rtc_accesses = 0u;
}

static void test_synchronization(bool writable, bool synchronize) {
    reset_registers(writable, synchronize);
    const uint32_t saved_pwr = test_pwr.CR;
    const uint32_t saved_clock = test_rcc.BDCR;
    const uint32_t saved_apb = test_rcc.APB1ENR;

    assert(rtc_synchronize() == synchronize);
    assert(test_pwr.CR == saved_pwr);
    assert(test_rcc.BDCR == saved_clock);
    assert(test_rcc.APB1ENR == saved_apb);
    assert(test_rtc.CRH == RTC_CRH_SECIE);
    assert(test_rtc.PRLH == 0u && test_rtc.PRLL == 0x7FFFu);
    assert(test_rtc.CNTH == 0x1234u && test_rtc.CNTL == 0x5678u);
    assert(test_rtc.CRL == (RTC_CRL_RTOFF | RTC_CRL_SECF | (synchronize ? RTC_CRL_RSF : 0u)));
}

static void test_calibration(void) {
    static const uint8_t values[] = {127u, 64u, 0u, 64u, 127u, 0u, 255u, 128u};
    static const uint8_t expected[] = {127u, 64u, 0u, 64u, 127u, 0u, 127u, 0u};
    for (unsigned output_enabled = 0u; output_enabled < 2u; ++output_enabled) {
        reset_registers(false, true);
        const uint32_t other_bits = output_enabled ? BKP_RTCCR_CCO : 0u;
        const uint32_t saved_pwr = test_pwr.CR;
        test_bkp.RTCCR = other_bits;
        for (unsigned i = 0u; i < sizeof(values) / sizeof(values[0]); ++i) {
            rtc_calibration(values[i]);
            assert(test_bkp.RTCCR == (other_bits | expected[i]));
            assert(test_pwr.CR == saved_pwr);
            assert(rtc_accesses == 0u);
        }
        rtc_calibration(127u);
        rtc_clear_calibration();
        assert(test_bkp.RTCCR == other_bits);
    }
}

static void test_initial_configuration(void) {
    /* A new backup domain starts with the AN2604 divider and midpoint calibration. */
    reset_registers(false, true);
    test_rcc.BDCR = RCC_BDCR_LSERDY;
    test_rtc.PRLL = 0u;
    test_rtc.CNTH = 0u;
    test_rtc.CNTL = 0u;
    assert(rtc_init());
    assert(test_rtc.PRLH == 0u && test_rtc.PRLL == 32765u);
    assert((test_bkp.RTCCR & BKP_RTCCR_CAL) == 64u);
    assert(test_rtc.CNTH == 0u && test_rtc.CNTL == 0u);
    assert((test_pwr.CR & PWR_CR_DBP) == 0u);

    /* Repair the old divider, or configure a disabled RTC, without losing time. */
    for (unsigned disabled = 0u; disabled < 2u; ++disabled) {
        reset_registers(false, true);
        if (disabled) {
            test_rcc.BDCR &= ~RCC_BDCR_RTCEN;
            test_rtc.PRLL = 32765u;
        }
        test_bkp.RTCCR = BKP_RTCCR_CCO | 19u;
        assert(rtc_init());
        assert(test_rtc.PRLH == 0u && test_rtc.PRLL == 32765u);
        assert(test_bkp.RTCCR == (BKP_RTCCR_CCO | 64u));
        assert(test_rtc.CNTH == 0x1234u && test_rtc.CNTL == 0x5678u);
        assert((test_pwr.CR & PWR_CR_DBP) == 0u);
    }

    /* Keep a user calibration when the retained prescaler is already correct. */
    reset_registers(false, true);
    test_rtc.PRLL = 32765u;
    test_bkp.RTCCR = BKP_RTCCR_CCO | 19u;
    assert(rtc_init());
    assert(test_bkp.RTCCR == (BKP_RTCCR_CCO | 19u));
    assert(test_rtc.CNTH == 0x1234u && test_rtc.CNTL == 0x5678u);

    reset_registers(false, true);
    test_rtc.CRL &= ~RTC_CRL_RTOFF;
    test_bkp.RTCCR = 19u;
    assert(!rtc_init());
    assert(test_rtc.PRLL == 32767u && test_bkp.RTCCR == 19u);
    assert((test_pwr.CR & PWR_CR_DBP) == 0u);

    reset_registers(false, true);
    assert(rtc_synchronize());
    test_bkp.RTCCR = BKP_RTCCR_CCO | 127u;
    assert(rtc_set_prescaler_1hz());
    assert(test_rtc.PRLH == 0u && test_rtc.PRLL == 32765u);
    assert(test_bkp.RTCCR == (BKP_RTCCR_CCO | 64u));
    assert((test_pwr.CR & PWR_CR_DBP) == 0u);
}

int main(void) {
    test_initial_configuration();
    test_calibration();
    test_synchronization(false, true);
    test_synchronization(true, true);
    test_synchronization(false, false);
    test_synchronization(true, false);

    reset_registers(false, true);
    assert(rtc_init());
    assert(rtc_accesses >= 2u);
    assert(test_rtc.CNTH == 0x1234u && test_rtc.CNTL == 0x5678u);
    assert((test_pwr.CR & PWR_CR_DBP) == 0u);

    reset_registers(false, false);
    assert(!rtc_init());
    assert((test_pwr.CR & PWR_CR_DBP) == 0u);
    puts("RTC synchronization and calibration tests passed.");
}
