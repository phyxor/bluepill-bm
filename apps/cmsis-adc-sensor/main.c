/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "systick.h"
#include "uart.h"
#include "adc.h"
#include <stdint.h>
#include <stdio.h>

#define BLINK_DELAY 1000

int main(void) {
    // Initialization
    board_led_init();
    uart1_init();
    pb0_adc_init();

    // Turn off the board led;
    board_led_off();

    // Start ADC conversion
    start_conversion();

    // Welcome message
    printf("Welcome to cmsis-adc-sensor app\n");

    // Continous loop
    uint32_t count = 0;
    uint32_t sensor_value = 0;
    while (1) {
        board_led_toggle();
        sensor_value = adc_read();
        printf("Sensor measurement(%ld): %ld\r\n", (long)count, (long)sensor_value);
        systick_msec_delay(BLINK_DELAY);
        count++;
    }
}
