/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#ifndef GPIO_H_
#define GPIO_H_

#include <stdbool.h>
#include "stm32f1xx.h"

/* Each group of 16 values identifies a port; the low four bits select a pin.
 * Names cover the device header's ports. Bonded pins depend on the package.
 */
typedef enum {
    PA0 = 0,
    PA1,
    PA2,
    PA3,
    PA4,
    PA5,
    PA6,
    PA7,
    PA8,
    PA9,
    PA10,
    PA11,
    PA12,
    PA13,
    PA14,
    PA15,
    PB0 = 16,
    PB1,
    PB2,
    PB3,
    PB4,
    PB5,
    PB6,
    PB7,
    PB8,
    PB9,
    PB10,
    PB11,
    PB12,
    PB13,
    PB14,
    PB15,
    PC0 = 32,
    PC1,
    PC2,
    PC3,
    PC4,
    PC5,
    PC6,
    PC7,
    PC8,
    PC9,
    PC10,
    PC11,
    PC12,
    PC13,
    PC14,
    PC15,
    PD0 = 48,
    PD1,
    PD2,
    PD3,
    PD4,
    PD5,
    PD6,
    PD7,
    PD8,
    PD9,
    PD10,
    PD11,
    PD12,
    PD13,
    PD14,
    PD15,
    PE0 = 64,
    PE1,
    PE2,
    PE3,
    PE4,
    PE5,
    PE6,
    PE7,
    PE8,
    PE9,
    PE10,
    PE11,
    PE12,
    PE13,
    PE14,
    PE15
} gpio_pin_t;

/* MODE bits select input or the maximum output speed. */
typedef enum {
    GPIO_MODE_INPUT = 0,
    GPIO_MODE_OUTPUT_10MHZ = 1,
    GPIO_MODE_OUTPUT_2MHZ = 2,
    GPIO_MODE_OUTPUT_50MHZ = 3
} gpio_mode_t;

/* CNF bits have different meanings for input and output modes. */
typedef enum {
    GPIO_CNF_INPUT_ANALOG = 0,
    GPIO_CNF_INPUT_FLOATING = 1,
    GPIO_CNF_INPUT_PULL = 2,
    GPIO_CNF_OUTPUT_PUSH_PULL = 0,
    GPIO_CNF_OUTPUT_OPEN_DRAIN = 1,
    GPIO_CNF_OUTPUT_AF_PUSH_PULL = 2,
    GPIO_CNF_OUTPUT_AF_OPEN_DRAIN = 3
} gpio_cnf_t;

/* Replace the pin's MODE/CNF bits. The caller must enable the port clock first.
 * Return false for invalid values (input CNF=3 is reserved), without writes.
 * For input pull mode, ODR=1 selects pull-up and ODR=0 selects pull-down;
 * the caller sets that bit through BSRR. AF mapping is configured separately.
 * Serialize calls with other code that modifies the same port's CRL/CRH.
 */
bool gpio_configure(gpio_pin_t pin, gpio_mode_t mode, gpio_cnf_t cnf);

/* The caller must enable the port clock before any of these operations.
 * Set/reset/toggle update the output latch and return false for invalid pins.
 * Toggle samples ODR before writing BSRR; serialize changes to the same pin.
 */
bool gpio_set(gpio_pin_t pin);
bool gpio_reset(gpio_pin_t pin);
bool gpio_toggle(gpio_pin_t pin);

/* Lock the pin's MODE/CNF bits in CRL/CRH until the next reset. ODR/BSRR
 * output writes still work. The port has a single lock sequence: once any pin
 * is locked, LCKR is frozen and no further pins on that port can be locked.
 * Return true if the pin is locked, false for an invalid pin or lock failure.
 */
bool gpio_lock(gpio_pin_t pin);

/* Read the input level from IDR: true for high, false for low or invalid pin. */
bool gpio_read(gpio_pin_t pin);

#endif /* GPIO_H_ */
