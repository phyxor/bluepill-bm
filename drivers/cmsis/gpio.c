/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "gpio.h"

static GPIO_TypeDef *gpio_port(gpio_pin_t pin) {
    if ((unsigned int)pin > PE15) {
        return 0;
    }

    switch ((unsigned int)pin / 16U) {
    case 0:
        return GPIOA;
    case 1:
        return GPIOB;
    case 2:
        return GPIOC;
    case 3:
        return GPIOD;
    case 4:
        return GPIOE;
    default:
        return 0;
    }
}

bool gpio_configure(gpio_pin_t pin, gpio_mode_t mode, gpio_cnf_t cnf) {
    if ((unsigned int)pin > PE15 || (unsigned int)mode > 3U || (unsigned int)cnf > 3U ||
        (mode == GPIO_MODE_INPUT && (unsigned int)cnf == 3U)) {
        return false;
    }

    GPIO_TypeDef *port = gpio_port(pin);
    if (!port) {
        return false;
    }

    uint32_t number = (unsigned int)pin % 16U;
    volatile uint32_t *config = number < 8U ? &port->CRL : &port->CRH;
    uint32_t shift = (number % 8U) * 4U;
    uint32_t value = (uint32_t)mode | ((uint32_t)cnf << 2U);
    *config = (*config & ~(0xFU << shift)) | (value << shift);

    return true;
}

bool gpio_set(gpio_pin_t pin) {
    GPIO_TypeDef *port = gpio_port(pin);
    if (!port) {
        return false;
    }

    port->BSRR = 1U << ((unsigned int)pin % 16U);
    return true;
}

bool gpio_reset(gpio_pin_t pin) {
    GPIO_TypeDef *port = gpio_port(pin);
    if (!port) {
        return false;
    }

    port->BSRR = 1U << (((unsigned int)pin % 16U) + 16U);
    return true;
}

bool gpio_toggle(gpio_pin_t pin) {
    GPIO_TypeDef *port = gpio_port(pin);
    if (!port) {
        return false;
    }

    uint32_t mask = 1U << ((unsigned int)pin % 16U);
    /* Sample the output latch; BSRR leaves other pins' latches untouched. */
    port->BSRR = (port->ODR & mask) ? (mask << 16U) : mask;
    return true;
}

bool gpio_read(gpio_pin_t pin) {
    GPIO_TypeDef *port = gpio_port(pin);
    if (!port) {
        return false;
    }

    return (port->IDR & (1U << ((unsigned int)pin % 16U))) != 0U;
}
