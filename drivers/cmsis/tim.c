/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "tim.h"
#include "clock.h"
#include "stm32f1xx.h"

/* A 10 kHz counter keeps the 16-bit prescaler in range even at 72 MHz. */
#define TIM_PRESCALER_HZ 10000u
#define TIM_ARR_1HZ (TIM_PRESCALER_HZ - 1u)

void tim2_1hz_init(void) {
    // Enable TIM2 on APB1 peripherial bus
    RCC->APB1ENR |= RCC_APB1ENR_TIM2EN;

    // Set prescaler value
    TIM2->PSC = (clock_get_tim_hz(CLOCK_TIM2) / TIM_PRESCALER_HZ) - 1u;

    // Set auto-reload value
    TIM2->ARR = TIM_ARR_1HZ;

    // Clear counter
    TIM2->CNT = 0;

    // Load the buffered prescaler before starting the first period
    TIM2->EGR = TIM_EGR_UG;
    TIM2->SR &= ~TIM_SR_UIF;

    // Enable timer
    TIM2->CR1 = TIM_CR1_CEN;
}

void tim2_wait_uif(void) {
    // Wait for UIF
    while (!(TIM2->SR & TIM_SR_UIF)) {}

    // Clear UIF
    TIM2->SR &= ~(TIM_SR_UIF);
}
