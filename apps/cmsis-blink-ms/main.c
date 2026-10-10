/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "board_led.h"
#include "systick.h"

#define BLINK_DELAY 2000

int main(void) {
    board_led_init();
    board_led_off();
    while (1) {
        board_led_toggle();
        systick_msec_delay(BLINK_DELAY);
    }
}
