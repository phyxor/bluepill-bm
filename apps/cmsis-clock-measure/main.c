/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "clock.h"
#include "rtc.h"
#include "stm32f1xx.h"
#include "uart.h"
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>

/* Cover a full RTC calibration cycle: 2^20 LSE pulses at 32768 Hz. */
/* At 72 MHz, 32 seconds still fit in CYCCNT (2304 million cycles). */
#define MEASUREMENT_SECONDS 32u
#define RTC_SAMPLE_COUNT (MEASUREMENT_SECONDS + 1u)
#define CAPTURE_TIMEOUT_SECONDS (MEASUREMENT_SECONDS + 2u)
#define CLOCK_PROFILE(function) {#function, function}

#ifndef RTC_CALIBRATION
#define RTC_CALIBRATION 64u
#endif

#if RTC_CALIBRATION < 0 || RTC_CALIBRATION > 127
#error "RTC_CALIBRATION must be between 0 and 127."
#endif

typedef struct {
    uint32_t tick;
    uint32_t cycles;
} rtc_sample_t;

static volatile rtc_sample_t rtc_samples[RTC_SAMPLE_COUNT];
static volatile uint32_t rtc_tick;
static volatile uint32_t rtc_sample_count;
static volatile bool rtc_capture_enabled;

static _Noreturn void stop_with_error(const char *message) {
    printf("Error: %s\r\n", message);
    uart1_flush();
    board_led_off();
    while (1) {
        __WFI();
    }
}

void RTC_IRQHandler(void) {
    if ((RTC->CRH & RTC_CRH_SECIE) != 0u && (RTC->CRL & RTC_CRL_SECF) != 0u) {
        /* Timestamp before acknowledging the RTC second interrupt. */
        const uint32_t cycles = DWT->CYCCNT;
        ++rtc_tick;
        if (rtc_capture_enabled && rtc_sample_count < RTC_SAMPLE_COUNT) {
            const uint32_t index = rtc_sample_count;
            rtc_samples[index].tick = rtc_tick;
            rtc_samples[index].cycles = cycles;
            rtc_sample_count = index + 1u;
            if (rtc_sample_count == RTC_SAMPLE_COUNT) {
                rtc_capture_enabled = false;
            }
        }
        rtc_clear_second_flag();
    }
}

static void start_rtc_sampling(void) {
    /* Called with the RTC IRQ disabled, before each clock profile's samples. */
    NVIC_SetPriority(RTC_IRQn, 0u);
    if (!rtc_set_second_interrupt()) {
        rtc_print_state();
        stop_with_error("RTC second interrupt configuration failed.");
    }
}

static bool cycle_counter_init(void) {
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    if ((DWT->CTRL & DWT_CTRL_NOCYCCNT_Msk) != 0u) {
        return false;
    }
    DWT->CYCCNT = 0u;
    DWT->CTRL |= DWT_CTRL_CYCCNTENA_Msk;
    __DSB();
    __ISB();

    const uint32_t before = DWT->CYCCNT;
    __NOP();
    __NOP();
    return DWT->CYCCNT != before;
}

static bool capture_measurement(uint32_t *elapsed_cycles) {
    /* Discard stale requests before arming a new, empty capture buffer. */
    NVIC_DisableIRQ(RTC_IRQn);
    rtc_capture_enabled = false;
    rtc_sample_count = 0u;
    rtc_clear_second_flag();
    NVIC_ClearPendingIRQ(RTC_IRQn);
    rtc_capture_enabled = true;
    const uint32_t wait_start = DWT->CYCCNT;
    NVIC_EnableIRQ(RTC_IRQn);
    const uint32_t timeout_cycles = SystemCoreClock * CAPTURE_TIMEOUT_SECONDS;

    /* Keep the CPU awake: CYCCNT must count throughout the measurement. */
    while (rtc_capture_enabled) {
        if ((uint32_t)(DWT->CYCCNT - wait_start) >= timeout_cycles) {
            /* Recheck completion with the RTC ISR excluded at the deadline. */
            NVIC_DisableIRQ(RTC_IRQn);
            const bool timed_out = rtc_capture_enabled;
            rtc_capture_enabled = false;
            const uint32_t captured = rtc_sample_count;
            NVIC_EnableIRQ(RTC_IRQn);
            if (timed_out) {
                printf("RTC capture timeout: samples=%lu/%u, limit=%u seconds\r\n",
                       (unsigned long)captured, (unsigned int)RTC_SAMPLE_COUNT,
                       (unsigned int)CAPTURE_TIMEOUT_SECONDS);
                rtc_print_state();
                return false;
            }
        }
    }

    /* Capture is disabled, so the ISR no longer writes these samples. */
    for (uint32_t i = 1u; i < RTC_SAMPLE_COUNT; ++i) {
        const uint32_t tick_gap = rtc_samples[i].tick - rtc_samples[i - 1u].tick;
        const uint32_t cycle_gap = rtc_samples[i].cycles - rtc_samples[i - 1u].cycles;
        /* A one-second interval must be within 50% of the nominal clock. */
        if (tick_gap != 1u || cycle_gap < SystemCoreClock / 2u ||
            cycle_gap > SystemCoreClock + SystemCoreClock / 2u) {
            printf("RTC capture gap: sample=%lu tick gap=%lu cycle gap=%lu nominal=%lu\r\n",
                   (unsigned long)i, (unsigned long)tick_gap, (unsigned long)cycle_gap,
                   (unsigned long)SystemCoreClock);
            return false;
        }
    }
    /* Unsigned subtraction handles a CYCCNT wrap between the first and last sample. */
    *elapsed_cycles = rtc_samples[RTC_SAMPLE_COUNT - 1u].cycles - rtc_samples[0].cycles;
    return true;
}

static uint32_t print_measurement(const char *profile_name) {
    uint32_t elapsed_cycles;
    if (!capture_measurement(&elapsed_cycles)) {
        stop_with_error("RTC cycle capture failed.");
    }
    const uint32_t measured_hz = (elapsed_cycles + MEASUREMENT_SECONDS / 2u) / MEASUREMENT_SECONDS;
    const uint32_t absolute_error_hz = measured_hz >= SystemCoreClock
                                           ? measured_hz - SystemCoreClock
                                           : SystemCoreClock - measured_hz;
    /* Percent with four decimal places, without floating-point printf. */
    const uint32_t relative_error_scaled =
        (uint32_t)(((uint64_t)absolute_error_hz * 1000000u + SystemCoreClock / 2u) /
                   SystemCoreClock);
    printf("%s: nominal HCLK %lu Hz, measured HCLK %lu Hz, "
           "absolute error %lu Hz, relative error %lu.%04lu%% (%lu cycles / %u RTC seconds)\r\n",
           profile_name, (unsigned long)SystemCoreClock, (unsigned long)measured_hz,
           (unsigned long)absolute_error_hz, (unsigned long)(relative_error_scaled / 10000u),
           (unsigned long)(relative_error_scaled % 10000u), (unsigned long)elapsed_cycles,
           (unsigned int)MEASUREMENT_SECONDS);
    return measured_hz;
}

static void measure_current_clock(const char *profile_name, uint32_t times) {
    if (times == 0u) {
        return;
    }
    uint32_t minimum_hz = UINT32_MAX;
    uint32_t maximum_hz = 0u;
    uint64_t total_hz = 0u;

    /* Call with a stable clock. Drain UART output before changing that clock. */
    NVIC_DisableIRQ(RTC_IRQn);
    SystemCoreClockUpdate();
    uart1_init();
    if (!rtc_synchronize()) {
        rtc_print_state();
        stop_with_error("RTC synchronization failed before measurement.");
    }
    start_rtc_sampling();

    for (uint32_t i = 0u; i < times; ++i) {
        const uint32_t measured_hz = print_measurement(profile_name);
        total_hz += measured_hz;
        if (measured_hz < minimum_hz) {
            minimum_hz = measured_hz;
        }
        if (measured_hz > maximum_hz) {
            maximum_hz = measured_hz;
        }
    }
    const uint32_t average_hz = (uint32_t)((total_hz + times / 2u) / times);
    const uint32_t absolute_error_hz =
        average_hz >= SystemCoreClock ? average_hz - SystemCoreClock : SystemCoreClock - average_hz;
    const uint32_t relative_error_scaled =
        (uint32_t)(((uint64_t)absolute_error_hz * 1000000u + SystemCoreClock / 2u) /
                   SystemCoreClock);
    printf("%s summary: minimum %lu Hz, maximum %lu Hz, average %lu Hz, "
           "absolute error %lu Hz, relative error %lu.%04lu%%\r\n",
           profile_name, (unsigned long)minimum_hz, (unsigned long)maximum_hz,
           (unsigned long)average_hz, (unsigned long)absolute_error_hz,
           (unsigned long)(relative_error_scaled / 10000u),
           (unsigned long)(relative_error_scaled % 10000u));
    uart1_flush();
}

int main(void) {
    /* SystemInit leaves SYSCLK and HCLK on the reset-default 8 MHz HSI. */
    SystemCoreClockUpdate();
    board_led_init();
    board_led_on();
    uart1_init();
    printf("cmsis-clock-measure: LSE 32768 Hz reference, USART1 115200 baud\r\n");
    printf("Starting LSE and the RTC...\r\n");

    if (!rtc_init()) {
        stop_with_error("LSE startup or RTC initialization failed.");
    }

    NVIC_DisableIRQ(RTC_IRQn);
    rtc_calibration(RTC_CALIBRATION);
    if ((BKP->RTCCR & BKP_RTCCR_CAL) != RTC_CALIBRATION) {
        stop_with_error("RTC calibration configuration failed.");
    }
    printf("RTC calibration set to %u\r\n", (unsigned int)RTC_CALIBRATION);

    if (!cycle_counter_init()) {
        stop_with_error("DWT cycle counter is unavailable or did not start.");
    }

    printf("Measurement times for default SystemClock\r\n");
    measure_current_clock("reset-default HSI 8 MHz", 2u);

    static const struct {
        const char *name;
        clock_status_t (*apply)(void);
    } profiles[] = {
        CLOCK_PROFILE(clock_profile_hse8_8mhz),  CLOCK_PROFILE(clock_profile_hse8_16mhz),
        CLOCK_PROFILE(clock_profile_hse8_32mhz), CLOCK_PROFILE(clock_profile_hse8_48mhz),
        CLOCK_PROFILE(clock_profile_hse8_72mhz), CLOCK_PROFILE(clock_profile_hse8_48mhz),
        CLOCK_PROFILE(clock_profile_hse8_32mhz), CLOCK_PROFILE(clock_profile_hse8_16mhz),
        CLOCK_PROFILE(clock_profile_hse8_8mhz),  CLOCK_PROFILE(clock_profile_hsi8_8mhz),
        CLOCK_PROFILE(clock_profile_hsi8_16mhz), CLOCK_PROFILE(clock_profile_hsi8_32mhz),
        CLOCK_PROFILE(clock_profile_hsi8_48mhz), CLOCK_PROFILE(clock_profile_hsi8_32mhz),
        CLOCK_PROFILE(clock_profile_hsi8_16mhz), CLOCK_PROFILE(clock_profile_hsi8_8mhz),
    };
    for (unsigned int i = 0u; i < sizeof(profiles) / sizeof(profiles[0]); ++i) {
        /* Exclude UART frames and RTC timestamps from the clock transition. */
        printf("Switching clock profile: %s\r\n", profiles[i].name);
        uart1_flush();
        NVIC_DisableIRQ(RTC_IRQn);
        const clock_status_t status = profiles[i].apply();
        SystemCoreClockUpdate();
        uart1_init();
        if (status != CLOCK_OK) {
            printf("Clock profile status: %u\r\n", (unsigned int)status);
            printf("Clock state: RCC_CR=0x%08lx RCC_CFGR=0x%08lx FLASH_ACR=0x%08lx\r\n",
                   (unsigned long)RCC->CR, (unsigned long)RCC->CFGR, (unsigned long)FLASH->ACR);
            stop_with_error("Clock profile configuration failed.");
        }
        measure_current_clock(profiles[i].name, 2u);
    }

    printf("The measurements have finished\r\n");

    board_led_off();

    while (1) {}
}
