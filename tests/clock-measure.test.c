/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */
#include "board_led.h"
#include "clock.h"
#include "rtc.h"
#include "uart.h"
#include <assert.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>

static DWT_Type test_dwt;
static CoreDebug_Type test_debug;
static RTC_TypeDef test_rtc;
static BKP_TypeDef test_bkp;
static bool irq_enabled;
static bool in_handler;
static uint32_t cycle_step;
static uint32_t ticks_remaining;
static uint32_t delayed_sample;
static uint32_t short_sample;
static uint32_t clear_count;
static uint32_t pending_clear_count;
static unsigned calibration_count;
static bool record_output;
static char measurement_output[4096];
static size_t measurement_output_length;
uint32_t SystemCoreClock;

static int measurement_printf(const char *format, ...) {
    va_list args;
    va_start(args, format);
    int length;
    if (record_output) {
        const size_t available = sizeof(measurement_output) - measurement_output_length;
        length = vsnprintf(measurement_output + measurement_output_length, available, format, args);
        assert(length >= 0 && (size_t)length < available);
        measurement_output_length += (size_t)length;
    } else {
        length = vprintf(format, args);
    }
    va_end(args);
    return length;
}

static DWT_Type *dwt_registers(void);
static void disable_rtc_irq(int irq) {
    assert(irq == RTC_IRQn);
    irq_enabled = false;
}
static void enable_rtc_irq(int irq) {
    assert(irq == RTC_IRQn);
    irq_enabled = true;
}
static void clear_pending_irq(int irq) {
    assert(irq == RTC_IRQn);
    ++pending_clear_count;
}
static void set_irq_priority(int irq, uint32_t priority) {
    assert(irq == RTC_IRQn && priority == 0u);
}

#undef DWT
#undef CoreDebug
#undef RTC
#undef BKP
#undef NVIC_DisableIRQ
#undef NVIC_EnableIRQ
#undef NVIC_ClearPendingIRQ
#undef NVIC_SetPriority
#define DWT dwt_registers()
#define CoreDebug (&test_debug)
#define RTC (&test_rtc)
#define BKP (&test_bkp)
#define NVIC_DisableIRQ(IRQ) disable_rtc_irq(IRQ)
#define NVIC_EnableIRQ(IRQ) enable_rtc_irq(IRQ)
#define NVIC_ClearPendingIRQ(IRQ) clear_pending_irq(IRQ)
#define NVIC_SetPriority(IRQ, PRIORITY) set_irq_priority(IRQ, PRIORITY)
/* Replace Cortex-M instructions when compiling the application for the host. */
#undef __DSB
#undef __ISB
#undef __NOP
#undef __WFI
#define __DSB() ((void)0)
#define __ISB() ((void)0)
#define __NOP() (++test_dwt.CYCCNT)
#define __WFI() ((void)0)

#define main firmware_main
#define printf measurement_printf
#include "../apps/cmsis-clock-measure/main.c"
#undef printf
#undef main

void rtc_clear_second_flag(void) {
    ++clear_count;
    test_rtc.CRL &= ~RTC_CRL_SECF;
}

void rtc_print_state(void) {}
void uart1_flush(void) {}
void board_led_on(void) {}
void board_led_toggle(void) {}
void board_led_off(void) {}
void uart1_init(void) {}
void SystemCoreClockUpdate(void) {}

bool rtc_synchronize(void) {
    assert(!irq_enabled);
    return true;
}

bool rtc_set_second_interrupt(void) {
    assert(!irq_enabled);
    test_rtc.CRH |= RTC_CRH_SECIE;
    return true;
}

void rtc_calibration(uint8_t calibration) {
    assert(!irq_enabled && !rtc_capture_enabled);
    assert(calibration_count++ == 0u);
    assert(calibration == RTC_CALIBRATION);
    test_bkp.RTCCR = calibration;
    /* Model longer RTC seconds while the core clock stays fixed. */
    cycle_step = SystemCoreClock + (uint32_t)calibration * 8u;
    ticks_remaining = RTC_SAMPLE_COUNT * 2u;
}

static void deliver_tick(void) {
    test_rtc.CRL |= RTC_CRL_SECF;
    in_handler = true;
    RTC_IRQHandler();
    in_handler = false;
    assert((test_rtc.CRL & RTC_CRL_SECF) == 0u);
}

static DWT_Type *dwt_registers(void) {
    if (!in_handler) {
        uint32_t step = cycle_step;
        if (irq_enabled && ticks_remaining != 0u && delayed_sample != 0u &&
            rtc_sample_count + 1u == delayed_sample) {
            step *= 2u;
        }
        if (irq_enabled && ticks_remaining != 0u && short_sample != 0u &&
            rtc_sample_count + 1u == short_sample) {
            step = 0u;
        }
        test_dwt.CYCCNT += step;
        if (irq_enabled && ticks_remaining != 0u) {
            --ticks_remaining;
            deliver_tick();
        }
    }
    return &test_dwt;
}

static void reset_capture(uint32_t nominal_hz, uint32_t actual_hz, uint32_t ticks) {
    memset(&test_dwt, 0, sizeof(test_dwt));
    memset(&test_debug, 0, sizeof(test_debug));
    memset(&test_rtc, 0, sizeof(test_rtc));
    test_rtc.CRH = RTC_CRH_SECIE;
    test_rtc.CRL = RTC_CRL_SECF;
    rtc_capture_enabled = false;
    rtc_sample_count = 0u;
    rtc_tick = UINT32_MAX - 2u;
    irq_enabled = true;
    in_handler = false;
    cycle_step = actual_hz;
    ticks_remaining = ticks;
    delayed_sample = 0u;
    short_sample = 0u;
    clear_count = 0u;
    pending_clear_count = 0u;
    SystemCoreClock = nominal_hz;
}

static void test_capture(uint32_t nominal_hz, uint32_t actual_hz) {
    reset_capture(nominal_hz, actual_hz, RTC_SAMPLE_COUNT);
    test_dwt.CYCCNT = UINT32_MAX - actual_hz * 2u;
    uint32_t elapsed_cycles = 0u;
    assert(capture_measurement(&elapsed_cycles));
    assert(elapsed_cycles == actual_hz * MEASUREMENT_SECONDS);
    assert(rtc_sample_count == RTC_SAMPLE_COUNT && !rtc_capture_enabled);
    assert(clear_count == RTC_SAMPLE_COUNT + 1u && pending_clear_count == 1u);
    assert(irq_enabled);

    rtc_sample_t saved[RTC_SAMPLE_COUNT];
    for (unsigned i = 0u; i < RTC_SAMPLE_COUNT; ++i)
        saved[i] = rtc_samples[i];
    deliver_tick();
    assert(rtc_sample_count == RTC_SAMPLE_COUNT);
    for (unsigned i = 0u; i < RTC_SAMPLE_COUNT; ++i) {
        assert(rtc_samples[i].tick == saved[i].tick);
        assert(rtc_samples[i].cycles == saved[i].cycles);
    }

    /* Rearming must discard the old buffer and pending interrupt request. */
    ticks_remaining = RTC_SAMPLE_COUNT;
    assert(capture_measurement(&elapsed_cycles));
    assert(elapsed_cycles == actual_hz * MEASUREMENT_SECONDS);
    assert(pending_clear_count == 2u);
}

static void test_timeout(uint32_t ticks) {
    reset_capture(8000000u, 8000000u, ticks);
    uint32_t elapsed_cycles = 123u;
    assert(!capture_measurement(&elapsed_cycles));
    assert(elapsed_cycles == 123u);
    assert(rtc_sample_count == ticks && !rtc_capture_enabled);
    assert(irq_enabled);
    deliver_tick();
    assert(rtc_sample_count == ticks);
}

static void test_configured_calibration(void) {
    reset_capture(8000000u, 8000000u, 0u);
    calibration_count = 0u;
    disable_rtc_irq(RTC_IRQn);
    rtc_calibration(RTC_CALIBRATION);
    measurement_output_length = 0u;
    record_output = true;
    measure_current_clock("test_profile", 2u);
    record_output = false;
    assert(calibration_count == 1u);
    assert(ticks_remaining == 0u);
    assert(test_bkp.RTCCR == RTC_CALIBRATION);
    char label[80];
    snprintf(label, sizeof(label), "test_profile: nominal HCLK");
    const char *first = strstr(measurement_output, label);
    assert(first != NULL);
    const char *second = strstr(first + strlen(label), label);
    assert(second != NULL);
    assert(strstr(second + strlen(label), label) == NULL);
    assert(strstr(measurement_output, "RTC calibration") == NULL);

    char summary[300];
    const unsigned long expected_hz = 8000000u + RTC_CALIBRATION * 8u;
    const unsigned long expected_error_hz = RTC_CALIBRATION * 8u;
    const unsigned long expected_error_scaled = RTC_CALIBRATION;
    snprintf(summary, sizeof(summary),
             "test_profile summary: minimum %lu Hz, maximum %lu Hz, average %lu Hz, "
             "absolute error %lu Hz, relative error %lu.%04lu%%",
             expected_hz, expected_hz, expected_hz, expected_error_hz,
             expected_error_scaled / 10000u, expected_error_scaled % 10000u);
    assert(strstr(measurement_output, summary) != NULL);
}

int main(void) {
    reset_capture(8000000u, 0u, 0u);
    assert(cycle_counter_init());
    test_capture(8000000u, 8051279u);
    test_capture(8000000u, 8000000u);
    test_capture(16000000u, 16000000u);
    test_capture(32000000u, 32000000u);
    test_capture(48000000u, 48000000u);
    test_capture(72000000u, 72000000u);
    test_timeout(0u);
    test_timeout(3u);

    reset_capture(8000000u, 8000000u, RTC_SAMPLE_COUNT);
    delayed_sample = 3u;
    uint32_t elapsed_cycles = 123u;
    assert(!capture_measurement(&elapsed_cycles));
    assert(rtc_sample_count == RTC_SAMPLE_COUNT && !rtc_capture_enabled);
    assert(elapsed_cycles == 123u);

    reset_capture(8000000u, 8000000u, RTC_SAMPLE_COUNT);
    short_sample = 3u;
    assert(!capture_measurement(&elapsed_cycles));
    assert(rtc_sample_count == RTC_SAMPLE_COUNT && !rtc_capture_enabled);
    assert(elapsed_cycles == 123u);

    /* The final capture at the deadline completes instead of reporting a timeout. */
    reset_capture(8000000u, 8000000u, RTC_SAMPLE_COUNT);
    cycle_step =
        (SystemCoreClock * CAPTURE_TIMEOUT_SECONDS + RTC_SAMPLE_COUNT - 1u) / RTC_SAMPLE_COUNT;
    assert(capture_measurement(&elapsed_cycles));
    assert(elapsed_cycles == cycle_step * MEASUREMENT_SECONDS);
    test_configured_calibration();
    puts("RTC capture and configured calibration tests passed.");
}
