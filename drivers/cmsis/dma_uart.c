/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "dma_uart.h"
#include "clock_stm32f103.h"
#include "stm32f1xx.h"
#include "uart.h"
#include <stdint.h>

#define UART1_DMA_BAUDRATE 115200u

uint8_t uart_data_buffer[UART_DATA_BUFF_SIZE];

void uart1_rx_tx_init(void) {
    // Enable GPIOA clock in the APB2 peripherials
    RCC->APB2ENR |= RCC_APB2ENR_IOPAEN;

    // Set mode to Alternative functions on corresponds GPIOA pins
    // 1 - Reseting to 0 from bit 19:0 from port 8 to 12
    GPIOA->CRH &= ~(0x000FFFFF);
    // PA8: CK - Output push-pull (CNF: 10, Mode: 11)
    GPIOA->CRH |= (GPIO_CRH_CNF8_0 | GPIO_CRH_MODE8);
    // PA9: TX - Output push-pull (CNF: 10, Mode: 11)
    GPIOA->CRH |= (GPIO_CRH_CNF9_1 | GPIO_CRH_MODE9);
    // PA10: RX - Floating input (CNF: 01, Mode: 00),
    GPIOA->CRH |= (GPIO_CRH_CNF10_0);
    // PA11: CTS - Floating input (CNF: 01, Mode: 00),
    GPIOA->CRH |= (GPIO_CRH_CNF11_0);
    // PA12: RTS - Output push-pull (CNF: 10, Mode: 11)
    GPIOA->CRH |= (GPIO_CRH_CNF12_1 | GPIO_CRH_MODE12);

    // Enable clock access to USART (Using GPIOA pins)
    RCC->APB2ENR |= RCC_APB2ENR_USART1EN;

    // Configure uart baudrate
    USART1->BRR = compute_uart_bd(clock_stm32f103_get_pclk2_hz(), UART1_DMA_BAUDRATE);

    // Select to use DMA for TX and RX
    USART1->CR3 = (USART_CR3_DMAR | USART_CR3_DMAT);

    // Enable and configure transfer direction (TX and RX)
    USART1->CR1 = (USART_CR1_UE | USART_CR1_TE | USART_CR1_RE);

    // Clear TC (Transmission complete) flag
    USART1->SR &= ~(USART_SR_TC);

    // Enable TCIE (Transmission Complete Interrupt Enable)
    USART1->CR1 |= USART_CR1_TCIE;

    // Enable USART Module
    USART1->CR1 |= USART_CR1_UE;

    // Enable USART 2 interrupt in the NVIC
    NVIC_EnableIRQ(USART1_IRQn);
}

void dma1_init(void) {
    // Enable clock access to DMA
    RCC->AHBENR |= RCC_AHBENR_DMA1EN;

    // Enable DMA Channel 4 (USART 1 TX) / Channel 5 (USART RX)
    NVIC_EnableIRQ(DMA1_Channel4_IRQn);
    NVIC_EnableIRQ(DMA1_Channel5_IRQn);
}

void dma1_channel5_uart_rx_config(void) {
    // Disable DMA Channel to configure it
    DMA1_Channel5->CCR &= ~DMA_CCR_EN;

    // Wailt until DMA Channel is disabled
    while ((DMA1_Channel5->CCR & DMA_CCR_EN)) {}

    // Clear interrupt flags for Channel 5
    DMA1->IFCR = DMA_IFCR_CGIF5 | DMA_IFCR_CTEIF5 | DMA_IFCR_CHTIF5 | DMA_IFCR_CTCIF5;

    // Set MSIZE to byte (8bits)
    DMA1_Channel5->CCR &= ~(DMA_CCR_MSIZE);

    // Set PSIZE to byte (8bits)
    DMA1_Channel5->CCR &= ~(DMA_CCR_PSIZE);

    // Set peripheral address
    DMA1_Channel5->CPAR = (uint32_t)(&(USART1->DR));

    // Set memory address
    DMA1_Channel5->CMAR = (uint32_t)(&uart_data_buffer);

    // Set number of transactions
    DMA1_Channel5->CNDTR = (uint16_t)UART_DATA_BUFF_SIZE;

    // Enable memory addr increment
    DMA1_Channel5->CCR |= DMA_CCR_MINC;

    // Enable transfer complete interruption
    DMA1_Channel5->CCR |= DMA_CCR_TCIE;

    // Enable Circular mode
    DMA1_Channel5->CCR |= DMA_CCR_CIRC;

    // Set Direction from peripherial to memory
    DMA1_Channel5->CCR &= ~(DMA_CCR_DIR);

    // Enable DMA Stream
    DMA1_Channel5->CCR |= DMA_CCR_EN;

    // Enable DMA Channel 5 Interrupt NVIC
    // NVIC_EnableIRQ(DMA1_Channel5_IRQn);
}

void dma1_channel4_uart_tx_config(uint32_t msg_to_snd, uint32_t msg_len) {
    // Disable DMA Channel to configure it
    DMA1_Channel4->CCR &= ~DMA_CCR_EN;

    // Wailt until DMA Channel is disabled
    while ((DMA1_Channel4->CCR & DMA_CCR_EN)) {}

    // Clear interrupt flags for Channel 4
    DMA1->IFCR = DMA_IFCR_CGIF4 | DMA_IFCR_CTEIF4 | DMA_IFCR_CHTIF4 | DMA_IFCR_CTCIF4;

    // Set MSIZE to byte (8bits)
    DMA1_Channel4->CCR &= ~(DMA_CCR_MSIZE);

    // Set PSIZE to byte (8bits)
    DMA1_Channel4->CCR &= ~(DMA_CCR_PSIZE);

    // Set peripheral address
    DMA1_Channel4->CPAR = (uint32_t)(&(USART1->DR));

    // Set memory address
    // DMA1_Channel4->CMAR = (uint32_t)(&msg_to_snd);
    DMA1_Channel4->CMAR = msg_to_snd;

    // Set number of transactions
    // DMA1_Channel4->CNDTR = (uint16_t)msg_len;
    DMA1_Channel4->CNDTR = msg_len;

    // Enable memory addr increment
    DMA1_Channel4->CCR |= DMA_CCR_MINC;

    // Enable transfer complete interruption
    DMA1_Channel4->CCR |= DMA_CCR_TCIE;

    // Disable Circular mode
    DMA1_Channel4->CCR &= ~DMA_CCR_CIRC;

    // Set Direction from Memory to peripheral
    DMA1_Channel4->CCR |= DMA_CCR_DIR;

    // Enable DMA Stream
    DMA1_Channel4->CCR |= DMA_CCR_EN;

    // The DMA Channel 4 has been configured on dma1_init();
}
