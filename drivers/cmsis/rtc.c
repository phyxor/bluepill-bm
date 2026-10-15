/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "rtc.h"
#include <stdio.h>

#define RTC_LSE_PRESCALER 32765u
#define RTC_INITIAL_CALIBRATION 64u
#define RTC_WAIT_LIMIT 16000000u

// Poll a hardware flag with a bounded wait so a clock failure cannot hang forever.
static bool rtc_wait_for_set(volatile uint32_t *reg, uint32_t mask) {
    for (uint32_t remaining = RTC_WAIT_LIMIT; remaining > 0u; --remaining) {
        if ((*reg & mask) != 0u) {
            return true;
        }
    }

    return false;
}

// Wait until the RTC finishes propagating the previous write to its clock domain.
static bool rtc_wait_write_finished(void) {
    return rtc_wait_for_set(&RTC->CRL, RTC_CRL_RTOFF);
}

// Allow writes to the backup domain, which contains the RTC and backup registers.
static void rtc_enable_backup_writes(void) {
    PWR->CR |= PWR_CR_DBP;
}

// Protect the backup domain again after configuration is complete.
static void rtc_disable_backup_writes(void) {
    PWR->CR &= ~PWR_CR_DBP;
}

bool rtc_synchronize(void) {
    const bool backup_writes_enabled = (PWR->CR & PWR_CR_DBP) != 0u;
    rtc_enable_backup_writes();

    // Refresh the APB-visible registers without changing the RTC configuration.
    RTC->CRL &= ~RTC_CRL_RSF;
    const bool success = rtc_wait_for_set(&RTC->CRL, RTC_CRL_RSF);

    if (!backup_writes_enabled) {
        rtc_disable_backup_writes();
    }
    return success;
}

void rtc_clear_calibration(void) {
    // Remove retained RTC calibration so the prescaler counts uncorrected LSE cycles.
    rtc_enable_backup_writes();
    BKP->RTCCR &= ~BKP_RTCCR_CAL;
    rtc_disable_backup_writes();
}

void rtc_calibration(uint8_t calibration) {
    rtc_enable_backup_writes();
    MODIFY_REG(BKP->RTCCR, BKP_RTCCR_CAL, (uint32_t)calibration & BKP_RTCCR_CAL);
    rtc_disable_backup_writes();
}

// AN2604: divide by 32766 and remove 64 pulses per 2^20 LSE cycles for nominal 1 Hz.
static bool rtc_write_prescaler_1hz(void) {
    if (!rtc_wait_write_finished()) {
        return false;
    }

    RTC->CRL |= RTC_CRL_CNF;
    RTC->PRLH = 0u;
    RTC->PRLL = RTC_LSE_PRESCALER;
    RTC->CRL &= ~RTC_CRL_CNF;

    if (!rtc_wait_write_finished()) {
        return false;
    }
    MODIFY_REG(BKP->RTCCR, BKP_RTCCR_CAL, RTC_INITIAL_CALIBRATION);
    return (BKP->RTCCR & BKP_RTCCR_CAL) == RTC_INITIAL_CALIBRATION;
}

bool rtc_init(void) {
    bool configure_prescaler = false;
    const uint32_t clock_source = RCC->BDCR & RCC_BDCR_RTCSEL;

    // Enable the APB interfaces required to access power and backup-domain registers.
    RCC->APB1ENR |= RCC_APB1ENR_PWREN | RCC_APB1ENR_BKPEN;
    rtc_enable_backup_writes();

    if (clock_source != RCC_BDCR_RTCSEL_LSE) {
        // Reset retained RTC state because RTCSEL cannot change while the domain is configured.
        RCC->BDCR |= RCC_BDCR_BDRST;
        RCC->BDCR &= ~RCC_BDCR_BDRST;
        configure_prescaler = true;
    } else if ((RCC->BDCR & RCC_BDCR_RTCEN) == 0u) {
        configure_prescaler = true;
    }

    // Start the external 32.768 kHz oscillator before selecting it as the RTC source.
    RCC->BDCR |= RCC_BDCR_LSEON;
    if (!rtc_wait_for_set(&RCC->BDCR, RCC_BDCR_LSERDY)) {
        rtc_disable_backup_writes();
        return false;
    }

    // Keep an existing LSE selection unchanged so the battery-backed counter is preserved.
    if (clock_source != RCC_BDCR_RTCSEL_LSE) {
        RCC->BDCR = (RCC->BDCR & ~RCC_BDCR_RTCSEL) | RCC_BDCR_RTCSEL_LSE;
    }
    RCC->BDCR |= RCC_BDCR_RTCEN;

    // Synchronize the APB-visible registers after enabling the RTC clock.
    if (!rtc_synchronize()) {
        rtc_disable_backup_writes();
        return false;
    }

    // Repair a retained prescaler that was configured by older firmware.
    const uint32_t prescaler = ((RTC->PRLH & RTC_PRLH_PRL) << 16u) | (RTC->PRLL & RTC_PRLL_PRL);
    if (prescaler != RTC_LSE_PRESCALER) {
        configure_prescaler = true;
    }

    // Configure one-second ticks for a new, disabled, or incorrectly configured RTC.
    if (configure_prescaler && !rtc_write_prescaler_1hz()) {
        rtc_disable_backup_writes();
        return false;
    }

    rtc_disable_backup_writes();
    return true;
}

bool rtc_set_prescaler_1hz(void) {
    // Temporarily unlock the backup domain for the protected prescaler write.
    rtc_enable_backup_writes();
    const bool success = rtc_write_prescaler_1hz();
    rtc_disable_backup_writes();
    return success;
}

bool rtc_set_second_interrupt(void) {
    // Temporarily unlock the backup domain for the protected control register
    rtc_enable_backup_writes();

    if (!rtc_wait_write_finished()) {
        rtc_disable_backup_writes();
        return false;
    }

    // Cleaning a pending interruption
    RTC->CRL &= ~(RTC_CRL_SECF);

    // Activating Second Interrupt
    RTC->CRH |= RTC_CRH_SECIE;

    const bool success = rtc_wait_write_finished();
    rtc_disable_backup_writes();

    // Unmask the IRQ only after the RTC register update has completed.
    if (success) {
        NVIC_ClearPendingIRQ(RTC_IRQn);
        NVIC_EnableIRQ(RTC_IRQn);
    }

    return success;
}

bool rtc_set_epoch_time(uint32_t epoch_time_sec) {
    // Temporarily unlock the backup domain for the protected counter write.
    rtc_enable_backup_writes();

    if (!rtc_wait_write_finished()) {
        rtc_disable_backup_writes();
        return false;
    }

    RTC->CRL |= RTC_CRL_CNF;
    RTC->CNTH = epoch_time_sec >> 16u;
    RTC->CNTL = epoch_time_sec & 0xFFFFu;
    RTC->CRL &= ~RTC_CRL_CNF;

    const bool success = rtc_wait_write_finished();
    rtc_disable_backup_writes();
    return success;
}

void rtc_clear_second_flag(void) {
    rtc_wait_write_finished();
    rtc_enable_backup_writes();
    RTC->CRL &= ~RTC_CRL_SECF;
    rtc_disable_backup_writes();
}

uint32_t rtc_get_epoch_time(void) {
    uint32_t high_before;
    uint32_t high_after;
    uint32_t low;

    // Repeat the split-register read if the high half changes while reading the low half.
    do {
        high_before = RTC->CNTH & RTC_CNTH_RTC_CNT;
        low = RTC->CNTL & RTC_CNTL_RTC_CNT;
        high_after = RTC->CNTH & RTC_CNTH_RTC_CNT;
    } while (high_before != high_after);

    return (high_after << 16u) | low;
}

void rtc_print_state(void) {
    printf("RTC state: RCC_CFGR=0x%08lx RCC_BDCR=0x%08lx RTC_CRL=0x%04lx\r\n",
           (unsigned long)RCC->CFGR, (unsigned long)RCC->BDCR, (unsigned long)RTC->CRL);
    printf("RTC prescaler: PRLH=0x%04lx PRLL=0x%04lx; nominal HCLK=%lu Hz\r\n",
           (unsigned long)RTC->PRLH, (unsigned long)RTC->PRLL, (unsigned long)SystemCoreClock);
    printf("RTC delivery: counter=%lu CRH=0x%04lx IRQ enabled=%lu pending=%lu PRIMASK=%lu\r\n",
           (unsigned long)rtc_get_epoch_time(), (unsigned long)RTC->CRH,
           (unsigned long)NVIC_GetEnableIRQ(RTC_IRQn), (unsigned long)NVIC_GetPendingIRQ(RTC_IRQn),
           (unsigned long)__get_PRIMASK());
}
