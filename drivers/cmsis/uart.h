/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#ifndef UART_H
#define UART_H

#include "stm32f1xx.h"

void uart1_init(void);
// Requires initialized USART1. Flushes stdout and waits for transmission to finish.
void uart1_flush(void);
void uart2_init(void);
uint16_t compute_uart_bd(uint32_t periph_clk, uint32_t baudrate);

#endif /* UART_H */
