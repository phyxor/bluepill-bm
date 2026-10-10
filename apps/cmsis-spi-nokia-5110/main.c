/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "systick.h"
#include "uart.h"
#include "spi1_nokia_5110.h"
#include <stdint.h>
#include <stdio.h>

#define BLINK_DELAY 1000

int main(void) {
    // Initialization
    board_led_init();
    uart1_init();
    spi1_n5110_init();
    spi1_n5110_reset();
    spi1_n5110_config();
    spi1_n5110_start();

    // Welcome message
    printf("Welcome to cmsis-spi-nokia-5110 app\r\n");

    // uint32_t count = 0;
    while (1) {
        board_led_on();
        // Enable lcd display
        spi1_n5110_send_command(N5110_CMD_DISPLAY_ALL_ON);
        systick_msec_delay(BLINK_DELAY);

        board_led_off();
        spi1_n5110_send_command(N5110_CMD_DISPLAY_BLANK);
        systick_msec_delay(BLINK_DELAY);
        // count++;
    }
}
