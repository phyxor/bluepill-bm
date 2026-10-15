/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#ifndef RTC_H
#define RTC_H

#include <stdbool.h>
#include <stdint.h>
#include "stm32f1xx.h"

// Initialize divider 32766 and CAL 64 when configuring or repairing the prescaler.
bool rtc_init(void);
// Requires a running RTC and enabled PWR/BKP APB1 clocks. Preserves DBP.
// Returns false if the registers do not synchronize before the wait limit.
bool rtc_synchronize(void);
void rtc_clear_calibration(void);
// Replace the calibration value using all seven CAL bits (0-127).
void rtc_calibration(uint8_t calibration);
// Set prescaler load 32765 and CAL 64 for nominal 1 Hz from a 32768 Hz LSE.
bool rtc_set_prescaler_1hz(void);
bool rtc_set_epoch_time(uint32_t epoch_time_sec);
uint32_t rtc_get_epoch_time(void);
bool rtc_set_second_interrupt(void);
void rtc_clear_second_flag(void);
void rtc_print_state(void);

#endif /* end of include guard: RTC_H */
