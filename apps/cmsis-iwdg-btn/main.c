/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "gpio_exti.h"
#include "systick.h"
#include "stm32f103xb.h"
#include "uart.h"
#include "iwdg.h"
#include <stdint.h>
#include <stdio.h>

#define DEBOUNCE_DELAY_MS 20u
#define BLINK_DELAY 200u

static volatile uint32_t button_pending = 0u;
static volatile uint32_t count = 0u;

static void btn_callback(void);

static void check_reset_source(void);

int main(void) {
    board_led_init();
    uart1_init();
    pb15_exti_init();

    printf("Welcome to app cmsis-iwdg-btn\r\n");

    board_led_on();

    // Find reset source
    check_reset_source();

    // Initilize IWDG
    printf("Initializing IWDG\r\n");
    iwdg_init();

    printf("Press btn before watchdog happens\r\n");
    while (1) {
        if (button_pending == 0u) {
            continue;
        }

        systick_msec_delay(DEBOUNCE_DELAY_MS);
        if ((GPIOB->IDR & GPIO_IDR_IDR15) == 0u) {
            btn_callback();
        }

        /* Keep EXTI masked until the button has been released for 20 ms. */
        do {
            while ((GPIOB->IDR & GPIO_IDR_IDR15) == 0u) {}
            systick_msec_delay(DEBOUNCE_DELAY_MS);
        } while ((GPIOB->IDR & GPIO_IDR_IDR15) == 0u);

        // Mask again the interruption
        EXTI->PR = EXTI_PR_PIF15;
        button_pending = 0u;
        EXTI->IMR |= EXTI_IMR_IM15;
    }
}

static void btn_callback(void) {
    // Refresh IWDG down-counter to default value
    iwdg_refresh();
    count++;
    printf("BTN Pressed %ld\r\n", (long)count);
    board_led_toggle();
}

void EXTI15_10_IRQHandler(void) {
    if (EXTI->PR & EXTI_PR_PIF15) {
        EXTI->IMR &= ~EXTI_IMR_IM15;
        EXTI->PR = EXTI_PR_PIF15;
        button_pending = 1u;
    }
}

static void check_reset_source() {
    // Chech if the Reset flag is present
    if ((RCC->CSR & RCC_CSR_IWDGRSTF) != 0) {
        // Clear IWDG Reset flag
        RCC->CSR = RCC_CSR_RMVF;

        // Turn led on
        board_led_on();
        printf("RESET was caused by IWDG, waiting for pressing button ...\r\n");

        // Wait until the button is pressed, blinking the led
        while (button_pending != 1) {
            systick_msec_delay(BLINK_DELAY);
            board_led_toggle();
        }
        printf("Starting after IWDG Reset\r\n");
        board_led_on();

        // Mask again the exti interruption for button
        EXTI->PR = EXTI_PR_PIF15;
        button_pending = 0u;
        EXTI->IMR |= EXTI_IMR_IM15;
    }
}
