/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "uart.h"
#include "clock.h"
#include "stm32f1xx.h"
#include <stdint.h>
#include <stdio.h>
#define DBG_UART_BAUDRATE 115200

static void uart1_write(int ch);

int board_putchar(int ch) {
    uart1_write(ch);
    return ch;
}

void uart1_flush(void) {
    fflush(stdout);
    // Finish the last frame after stdout sends its buffered bytes to USART1.
    while ((USART1->SR & USART_SR_TC) == 0u) {}
}

uint16_t compute_uart_bd(uint32_t periph_clk, uint32_t baudrate) {
    return ((periph_clk + (baudrate / 2U)) / baudrate);
}

void uart1_init(void) {
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
    USART1->BRR = compute_uart_bd(clock_get_pclk2_hz(), DBG_UART_BAUDRATE);

    // Enable and configure transfer direction (Only transmitter enable)
    USART1->CR1 = (USART_CR1_UE | USART_CR1_TE);
}

void uart2_init(void) {
    // Enable GPIOA clock in the APB2 peripherials
    RCC->APB2ENR |= RCC_APB2ENR_IOPAEN;

    // Set mode to Alternative functions on corresponds GPIOA pins
    // 1 - Reseting to 0 from bit 19:0
    GPIOA->CRL &= ~(0x000FFFFF);
    // PA0: CTS2 - Floating input (CNF: 01, Mode: 00),
    GPIOA->CRL |= (GPIO_CRL_CNF0_0);
    // PA1: RTS2 - Output push-pull (CNF: 10, Mode: 11)
    GPIOA->CRL |= (GPIO_CRL_CNF1_1 | GPIO_CRL_MODE1);
    // PA2: TX2 - Output push-pull (CNF: 10, Mode: 11)
    GPIOA->CRL |= (GPIO_CRL_CNF2_1 | GPIO_CRL_MODE2);
    // PA3: RX2 - Floating input (CNF: 01, Mode: 00),
    GPIOA->CRL |= (GPIO_CRL_CNF3_0);
    // PA4: CK2 - Output push-pull (CNF: 10, Mode: 11)
    GPIOA->CRL |= (GPIO_CRL_CNF4_1 | GPIO_CRL_MODE4);

    // Enable clock access to USART2 (Using GPIOA pins)
    RCC->APB1ENR |= RCC_APB1ENR_USART2EN;

    // Configure uart baudrate
    USART2->BRR = compute_uart_bd(clock_get_pclk1_hz(), DBG_UART_BAUDRATE);

    // Enable and configure transfer direction (Only transmitter enable)
    USART2->CR1 = (USART_CR1_UE | USART_CR1_TE);
}

static void uart1_write(int ch) {
    // Make sure transmit data register is empty
    while (!(USART1->SR & USART_SR_TXE)) {}

    // Write to transmit dat register
    USART1->DR = (ch & 0xFF); // Write the LSB Byte
}

// static void uart2_write(int ch) {
//     // Make sure transmit data register is empty
//     while (!(USART2->SR & USART_SR_TXE)) {
//     }
//
//     // Write to transmit dat register
//     USART2->DR = (ch & 0xFF); // Write the LSB Byte
// }
