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
#include <math.h>
#include <stdint.h>
#include <stdio.h>

#define BLINK_DELAY 1000
#define ADC_MAX 4095u
#define DIVIDER_RESISTOR_OHM 10000u
#define SAMPLE_COUNT 64u
#define SH_C1 0.0010222847f
#define SH_C2 0.0002531646f
#define SH_C3 0.0f

typedef struct {
    uint32_t resistance_ohm;
    int32_t temperature_x10;
} ntc_point_t;

/* 10 kOhm NTC, R25=10 kOhm, Beta=3950 K. */
static const ntc_point_t ntc_table[] = {
    {105385u, -200}, {77898u, -150}, {58246u, -100}, {44026u, -50}, {33621u, 0},  {25925u, 50},
    {20175u, 100},   {15837u, 150},  {12535u, 200},  {10000u, 250}, {8037u, 300}, {6506u, 350},
    {5301u, 400},    {4348u, 450},   {3588u, 500},   {2978u, 550},  {2486u, 600}, {2086u, 650},
    {1760u, 700},    {1492u, 750},   {1270u, 800},
};

static uint32_t ntc_resistance_ohm(uint32_t adc_raw) {
    /* HW-498 divider: VDDA -> 10 kOhm -> PB0 -> NTC -> GND. */
    if (adc_raw >= ADC_MAX) {
        return UINT32_MAX;
    }

    return (DIVIDER_RESISTOR_OHM * adc_raw) / (ADC_MAX - adc_raw);
}

static int32_t ntc_temperature_x10(uint32_t resistance_ohm) {
    const uint32_t point_count = sizeof(ntc_table) / sizeof(ntc_table[0]);

    if (resistance_ohm >= ntc_table[0].resistance_ohm) {
        return ntc_table[0].temperature_x10;
    }

    if (resistance_ohm <= ntc_table[point_count - 1u].resistance_ohm) {
        return ntc_table[point_count - 1u].temperature_x10;
    }

    for (uint32_t index = 0u; index < point_count - 1u; ++index) {
        const ntc_point_t *cold = &ntc_table[index];
        const ntc_point_t *hot = &ntc_table[index + 1u];

        if (resistance_ohm <= cold->resistance_ohm && resistance_ohm >= hot->resistance_ohm) {
            const int32_t resistance_delta =
                (int32_t)cold->resistance_ohm - (int32_t)resistance_ohm;
            const int32_t interval_resistance =
                (int32_t)cold->resistance_ohm - (int32_t)hot->resistance_ohm;
            const int32_t interval_temperature = hot->temperature_x10 - cold->temperature_x10;

            return cold->temperature_x10 +
                   (resistance_delta * interval_temperature) / interval_resistance;
        }
    }

    return 0;
}

int main(void) {
    // Initialization
    board_led_init();
    uart1_init();
    pb0_adc_init();

    // Turn off the board led;
    board_led_off();

    // Welcome message
    printf("Welcome to cmsis-adc-temp-ntc app\r\n");

    // Continous loop
    uint32_t count = 0;
    uint32_t sensor_value = 0;
    uint32_t sensor_sum = 0;
    uint32_t resistance_ohm = 0;
    int32_t temperature_x10 = 0;
    int32_t whole_temperature = 0;
    int32_t fraction_temperature = 0;

    float resistance_ohm_f = 0.0;
    float resistance_ohm_f_ln = 0.0;
    float temperature_k_f = 0.0;
    float temperature_c_f = 0.0;
    int32_t temperature_c_x100 = 0;
    uint32_t temperature_c_magnitude = 0u;

    while (1) {
        board_led_toggle();
        sensor_sum = 0u;
        for (uint32_t sample = 0u; sample < SAMPLE_COUNT; ++sample) {
            sensor_sum += adc1_channel8_read_raw();
        }

        sensor_value = sensor_sum / SAMPLE_COUNT;

        // Computing ntc resistance and temperature using fixed point (10th precision)
        resistance_ohm = ntc_resistance_ohm(sensor_value);
        temperature_x10 = ntc_temperature_x10(resistance_ohm);
        whole_temperature = temperature_x10 / 10;
        fraction_temperature = temperature_x10 % 10;
        if (fraction_temperature < 0) {
            fraction_temperature = -fraction_temperature;
        }

        // Computing ntc resistance and temperature using sw float
        resistance_ohm_f = ((float)DIVIDER_RESISTOR_OHM * (float)sensor_value) /
                           ((float)ADC_MAX - (float)sensor_value);
        resistance_ohm_f_ln = logf(resistance_ohm_f);
        // + SH_C3 * resistance_ohm_f_ln * resistance_ohm_f_ln * resistance_ohm_f_ln
        temperature_k_f = 1.0f / (SH_C1 + SH_C2 * resistance_ohm_f_ln);
        temperature_c_f = temperature_k_f - 273.15f;
        temperature_c_x100 =
            (int32_t)(temperature_c_f * 100.0f + (temperature_c_f >= 0.0f ? 0.5f : -0.5f));
        temperature_c_magnitude =
            temperature_c_x100 < 0 ? (uint32_t)(-temperature_c_x100) : (uint32_t)temperature_c_x100;

        printf("Measurement(%lu): ADC: %lu, R_NTC: %lu ohm, "
               "Temperature: table=%ld.%ld C, float=%s%lu.%02lu C\r\n",
               (unsigned long)count, (unsigned long)sensor_value, (unsigned long)resistance_ohm,
               (long)whole_temperature, (long)fraction_temperature,
               temperature_c_x100 < 0 ? "-" : "", (unsigned long)(temperature_c_magnitude / 100u),
               (unsigned long)(temperature_c_magnitude % 100u));
        systick_msec_delay(BLINK_DELAY);
        count++;
    }
}
