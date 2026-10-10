/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "systick.h"
#include "uart.h"
#include <stdint.h>
#include <stdio.h>

#define BLINK_DELAY 1000

int main(void) {
    // Initialization
    board_led_init();
    uart1_init();

    // Turn off the board led;
    board_led_off();
    uint32_t count = 0;
    while (1) {
        printf("Hello from STM32 (%ld)...\r\n", (long)count);
        board_led_toggle();
        systick_msec_delay(BLINK_DELAY);
        count++;
    }
}
