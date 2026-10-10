/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"

#define LED_PIN 13u
#define BLINK_DELAY 800000u

static void delay(volatile uint32_t count) {
    while (count-- > 0u) {
        /* Keep the CPU busy for one instruction so the loop is not optimized away.
         */
        __asm volatile("nop");
    }
}

int main(void) {
    board_led_init();
    board_led_off();
    while (1) {
        board_led_toggle();
        delay(BLINK_DELAY);
    }
}
