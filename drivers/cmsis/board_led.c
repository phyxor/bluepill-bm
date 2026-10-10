/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"

void board_led_init(void) {
    // Enabling GPIO Port C Clock
    RCC->APB2ENR |= RCC_APB2ENR_IOPCEN;

    // Configuring GPIO Port C as general purpose output push-pull (CNF - 00), max
    // speed 2MHz (Mode - 10)
    // 1 - Setting bits 23:20 - 0x0000
    GPIOC->CRH &= ~(GPIO_CRH_MODE13 | GPIO_CRH_CNF13);
    // 2 - Setting bit 21 to 0x1
    GPIOC->CRH |= GPIO_CRH_MODE13_1;
}

void board_led_on(void) {
    // Turn on the LED resetting the value to 0
    GPIOC->BSRR = GPIO_BSRR_BR13;
}

void board_led_off(void) {
    // Turn off the LED setting the value to 1
    GPIOC->BSRR = GPIO_BSRR_BS13;
}

void board_led_toggle(void) {
    GPIOC->ODR ^= GPIO_BSRR_BS13;
}
