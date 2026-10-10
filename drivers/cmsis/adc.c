/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "adc.h"
#include "clock.h"
#include <stdint.h>

void adc_startup_delay(void) {
    /* Allow the ADC and internal sensor to settle at the current HCLK frequency. */
    for (volatile uint32_t count = 0u; count < 1000u; ++count) {
        __asm volatile("nop");
    }
}

void adc1_clock_init(void) {
    RCC->APB2ENR |= RCC_APB2ENR_ADC1EN;

    /* PCLK2 is divided by two, keeping ADCCLK below 14 MHz. */
    RCC->CFGR &= ~RCC_CFGR_ADCPRE;
    RCC->CFGR |= RCC_CFGR_ADCPRE_DIV2;
}

void pb0_adc_init(void) {
    /* Enable GPIOB for ADC channel 8. */
    RCC->APB2ENR |= RCC_APB2ENR_IOPBEN;

    /* Set PB0 to analog input mode. */
    GPIOB->CRL &= ~(GPIO_CRL_CNF0 | GPIO_CRL_MODE0);

    adc1_clock_init();

    /* Select channel 8 as the first regular conversion. */
    ADC1->SQR3 = (8u << ADC_SQR3_SQ1_Pos);

    /* Set the regular sequence length to one conversion. */
    ADC1->SQR1 = 0u;

    /* Use a long sample time for a simple external sensor. */
    ADC1->SMPR2 = ADC_SMPR2_SMP8;

    /* Select software start and enable the ADC. */
    ADC1->CR2 = ADC_CR2_EXTSEL | ADC_CR2_EXTTRIG | ADC_CR2_ADON;
    adc_startup_delay();

    calibration();
}

void adc1_temperature_init(void) {
    adc1_clock_init();

    /* Select the internal temperature sensor on ADC1 channel 16. */
    ADC1->CR1 = 0u;
    ADC1->SQR1 = 0u;
    ADC1->SQR2 = 0u;
    ADC1->SQR3 = (16u << ADC_SQR3_SQ1_Pos);

    /* 239.5 ADC cycles gives the sensor time to settle. */
    ADC1->SMPR1 = ADC_SMPR1_SMP16 | ADC_SMPR1_SMP17;

    /* TSVREFE enables the internal temperature sensor and VREFINT path. */
    ADC1->CR2 = ADC_CR2_EXTSEL | ADC_CR2_EXTTRIG | ADC_CR2_TSVREFE | ADC_CR2_ADON;
    adc_startup_delay();

    calibration();
}

void calibration(void) {
    ADC1->CR2 |= ADC_CR2_RSTCAL;
    while ((ADC1->CR2 & ADC_CR2_RSTCAL) != 0u) {}

    ADC1->CR2 |= ADC_CR2_CAL;
    while ((ADC1->CR2 & ADC_CR2_CAL) != 0u) {}
}

void start_conversion(void) {
    /* Software trigger with EXTSEL=111. Keep continuous mode for PB0. */
    ADC1->CR2 |= ADC_CR2_CONT | ADC_CR2_EXTTRIG | ADC_CR2_SWSTART;
}

uint32_t adc_read(void) {
    while ((ADC1->SR & ADC_SR_EOC) == 0u) {}

    return ADC1->DR & 0x0FFFu;
}

static uint32_t adc1_channel_read_raw(uint32_t channel) {
    ADC1->SQR3 = channel << ADC_SQR3_SQ1_Pos;
    ADC1->CR2 &= ~ADC_CR2_CONT;
    ADC1->CR2 |= ADC_CR2_ADON;
    ADC1->SR &= ~ADC_SR_EOC;
    ADC1->CR2 |= ADC_CR2_SWSTART;

    while ((ADC1->SR & ADC_SR_EOC) == 0u) {}

    return ADC1->DR & 0x0FFFu;
}

uint32_t adc1_temperature_read_raw(void) {
    /* The temperature sensor is ADC1 channel 16. */
    return adc1_channel_read_raw(16u);
}

uint32_t adc1_channel8_read_raw(void) {
    /* PB0 is ADC1 channel 8. */
    return adc1_channel_read_raw(8u);
}

uint32_t adc1_vrefint_read_raw(void) {
    /* VREFINT is ADC1 channel 17. */
    return adc1_channel_read_raw(17u);
}
