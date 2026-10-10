/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "gpio.h"
#include "rtc.h"
#include "stm32f103xb.h"
#include "uart.h"
#include <stdint.h>
#include <stdio.h>

// #define BLINK_DELAY 500

static volatile uint32_t rtc_second = 0;

int main(void) {
    // Initialization
    board_led_init();
    uart1_init();

    // Welcome message
    printf("Welcome to cmsis-rtc app\r\n");

    // Initialize RTC
    if (!rtc_init()) {
        // LSE or RTC synchronization failed
        printf("RTC initialization failed\r\n");
    }

    if (!rtc_set_epoch_time(1789430400u)) {
        printf("RTC setting epoch time failed\r\n");
    }

    // Enabling RTC Second interruption
    if (!rtc_set_second_interrupt()) {
        printf("Failing setting RTC Second interruption\r\n");
    }

    // Turn on board led
    board_led_on();

    uint32_t count = 0;
    while (1) {
        if (rtc_second > 0) {
            rtc_second--;
            count++;
            uint32_t epoch_time = rtc_get_epoch_time();
            printf("Epoch time: %lu - Uptime: %lu\r\n", (unsigned long)epoch_time,
                   (unsigned long)count);
            board_led_toggle();
        }
    }
}

void RTC_IRQHandler(void) {
    if ((RTC->CRH & RTC_CRH_SECIE) && (RTC->CRL & RTC_CRL_SECF)) {
        rtc_clear_second_flag();
        rtc_second++;
    }
}
