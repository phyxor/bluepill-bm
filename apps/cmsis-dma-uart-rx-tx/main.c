/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "stm32f103xb.h"
#include "systick.h"
#include "dma_uart.h"
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define BLINK_DELAY 1000u

extern char uart_data_buffer[UART_DATA_BUFF_SIZE];
char msg_buff[150] = {'\0'};

uint8_t g_rx_cmplt;
uint8_t g_tx_cmplt;
uint8_t g_uart_cmplt;

int main(void) {
    board_led_init();
    board_led_on();

    // Initialize uart
    uart1_rx_tx_init();

    // DMA initialization
    dma1_init();

    // Enable UART RX configuration
    dma1_channel5_uart_rx_config();

    // Initializing
    sprintf(msg_buff, "Initialization... OK\r\n");
    dma1_channel4_uart_tx_config((uint32_t)msg_buff, strlen(msg_buff));

    while (!g_tx_cmplt) {}

    while (1) {
        if (g_rx_cmplt) {
            sprintf(msg_buff, "Message received : %s \r\n", uart_data_buffer);
            g_rx_cmplt = 0;
            g_tx_cmplt = 0;
            g_uart_cmplt = 0;
            dma1_channel4_uart_tx_config((uint32_t)msg_buff, strlen(msg_buff));
            while (!g_tx_cmplt) {}
        }
    }
}

void DMA1_Channel4_IRQHandler(void) {
    if ((DMA1->ISR) & DMA_ISR_TCIF4) {
        g_tx_cmplt = 1;
        // Clear the flag
        DMA1->IFCR |= DMA_IFCR_CTCIF4;
    }
}

void DMA1_Channel5_IRQHandler(void) {
    if ((DMA1->ISR) & DMA_ISR_TCIF4) {
        g_rx_cmplt = 1;
        // Clear the flag
        DMA1->IFCR |= DMA_IFCR_CTCIF5;
    }
}

void USART1_IRQHandler(void) {
    g_uart_cmplt = 1;
    USART1->SR &= ~USART_SR_TC;
}
