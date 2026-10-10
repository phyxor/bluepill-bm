/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "systick.h"
#include "dma_adc.h"
#include "uart.h"
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define BLINK_DELAY 1000u

extern uint16_t adc_raw_data[ADC_BUFFER_SAMPLES];

int main(void) {
    board_led_init();
    board_led_on();

    // Initialize uart
    uart1_init();

    // DMA initialization
    dma_adc_mem_init();

    while (1) {
        board_led_toggle();
        for (size_t i = 0; i < ADC_BUFFER_SAMPLES; i++) {
            printf("Value sensor %d: %ld\r\n", i, (long)adc_raw_data[i]);
        }
        systick_msec_delay(BLINK_DELAY);
    }
}
