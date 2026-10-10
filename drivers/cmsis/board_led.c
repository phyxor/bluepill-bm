/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "gpio.h"

void board_led_init(void) {
    RCC->APB2ENR |= RCC_APB2ENR_IOPCEN;
    gpio_configure(PC13, GPIO_MODE_OUTPUT_2MHZ, GPIO_CNF_OUTPUT_PUSH_PULL);
}

void board_led_on(void) {
    gpio_set(PC13);
}

void board_led_off(void) {
    gpio_reset(PC13);
}

void board_led_toggle(void) {
    gpio_toggle(PC13);
}
