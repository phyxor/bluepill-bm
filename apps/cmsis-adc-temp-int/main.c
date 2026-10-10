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

#define TEMP_VREFINT_NOMINAL_MV 1200u
#define TEMP_SENSOR_V25_MV 1400      // Min 1.34, Typ 1.40 and max 1.52
#define TEMP_SENSOR_AVG_SLOPE_X10 42 // Min 4.0, Typ 4.2, and Max 4.6
#define ADC_MAX 4095u
#define SAMPLE_COUNT 64u

int main(void) {
    // Initialization
    board_led_init();
    uart1_init();
    adc1_temperature_init();

    // Turn off the board led;
    board_led_off();

    // Welcome message
    printf("Welcome to cmsis-adc-temp-int app\r\n");

    // Continous loop
    uint32_t raw_temp = 0;
    uint32_t raw_vrefint = 0;
    uint32_t sum_temp = 0;
    uint32_t sum_vrefint = 0;
    uint32_t vsense_mv = 0;
    uint32_t vdda_mv = 0;
    int32_t temp_celsius_x10 = 0;
    int32_t whole = 0;
    int32_t fraction = 0;
    while (1) {
        board_led_toggle();
        sum_vrefint = 0;
        for (uint32_t sample = 0; sample < SAMPLE_COUNT; ++sample) {
            sum_vrefint += adc1_vrefint_read_raw();
        }
        raw_vrefint = sum_vrefint / SAMPLE_COUNT;

        sum_temp = 0;
        for (uint32_t sample = 0; sample < SAMPLE_COUNT; ++sample) {
            sum_temp += adc1_temperature_read_raw();
        }
        raw_temp = sum_temp / SAMPLE_COUNT;

        vdda_mv = TEMP_VREFINT_NOMINAL_MV * ADC_MAX / raw_vrefint;
        vsense_mv = raw_temp * vdda_mv / ADC_MAX;

        // Store temperature in tenths of a degree Celsius.
        temp_celsius_x10 =
            ((TEMP_SENSOR_V25_MV - (int32_t)vsense_mv) * 100 / TEMP_SENSOR_AVG_SLOPE_X10) + 250;
        whole = temp_celsius_x10 / 10;
        fraction = temp_celsius_x10 % 10;

        if (fraction < 0) {
            fraction = -fraction;
        }
        printf("Raw: %lu, VREFINT: %lu, VDDA: %lu mV, Vsense: %lu mV, "
               "Celsius: %ld.%ld\r\n",
               (unsigned long)raw_temp, (unsigned long)raw_vrefint, (unsigned long)vdda_mv,
               (unsigned long)vsense_mv, (long)whole, (long)fraction);
        systick_msec_delay(BLINK_DELAY);
    }
}
