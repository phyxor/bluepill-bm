/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "stm32f103xb.h"
#include "standby_mode.h"
#include "gpio_exti.h"
#include "uart.h"
#include "systick.h"
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

#define BLINK_DELAY 200

static void check_reset_source(void);

int main(void) {
    board_led_init();
    board_led_on();
    uart1_init();
    pb15_exti_init();

    printf("Initializing cmsis-standby\r\n");

    // Wake up pin init
    wakeup_pin_init();

    // Check reset source
    check_reset_source();

    while (1) {
        board_led_toggle();
        systick_msec_delay(BLINK_DELAY);
    }
}

static void check_reset_source(void) {
    // Enable clock access to PWR
    RCC->APB1ENR |= RCC_APB1ENR_PWREN;

    if ((PWR->CSR & PWR_CSR_SBF) == PWR_CSR_SBF) {
        // Clear Standby flag
        PWR->CR |= PWR_CR_CSBF;

        printf("System resume from Standby ....\r\n");

        // Wait for wakeup pin to be released
        while (get_wakeup_pin_state() == 0) {}
    }

    // Check and clear Wakeup flag
    if ((PWR->CSR & PWR_CSR_WUF) == PWR_CSR_WUF) {
        PWR->CR |= PWR_CR_CWUF;
    }
}

void EXTI15_10_IRQHandler(void) {
    if (EXTI->PR & EXTI_PR_PIF15) {
        EXTI->IMR &= ~EXTI_IMR_IM15;
        EXTI->PR = EXTI_PR_PIF15;
        standby_wakeup_pin_setup();
    }
}
