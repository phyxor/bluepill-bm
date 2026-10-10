/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "stm32f103xb.h"
#include "dma_mem2mem.h"
#include "uart.h"
#include "systick.h"
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define BUFFER_SIZE 5
#define BLINK_DELAY 200

uint16_t sensor_data_arr[BUFFER_SIZE] = {892, 731, 123, 90, 23};
uint16_t temp_data_arr[BUFFER_SIZE];

volatile uint8_t g_transfer_cmplt;
volatile uint8_t g_transfer_error;

int main(void) {
    board_led_init();
    board_led_on();
    uart1_init();

    printf("Initializing cmsis-dma-mem2mem\r\n");

    g_transfer_cmplt = 0;
    g_transfer_error = 0;

    dma1_mem2mem_config();

    dma_transfer_start((uint32_t)sensor_data_arr, (uint32_t)temp_data_arr, BUFFER_SIZE);

    // Wait until transfer complete
    while (!(g_transfer_cmplt | g_transfer_error)) {}

    if (g_transfer_cmplt) {
        for (int i = 0; i < BUFFER_SIZE; i++) {
            printf("Temp Buffer[%d]: %d\r\n", i, temp_data_arr[i]);
        }
    }
    if (g_transfer_error) {
        printf("There's been an error in the transfer\r\n");
    }

    g_transfer_cmplt = 0;
    g_transfer_error = 0;

    while (1) {
        board_led_toggle();
        systick_msec_delay(BLINK_DELAY);
    }
}

void DMA1_Channel2_IRQHandler(void) {
    // Check Complete flag
    if ((DMA1->ISR) & DMA_ISR_TCIF2) {
        g_transfer_cmplt = 1;
        // Clear the flag
        DMA1->IFCR |= DMA_IFCR_CTCIF2;
    }
    // Check Error flag
    if ((DMA1->ISR) & DMA_ISR_TEIF2) {
        board_led_off();
        // Clear the flag
        DMA1->IFCR |= DMA_IFCR_CTEIF2;
    }
}
