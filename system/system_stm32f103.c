/*
 * Copyright (C) 2017-2021 STMicroelectronics.
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include "clock_stm32f103.h"
#include "stm32f1xx.h"
#include "system_stm32f1xx.h"

#ifndef HSE_VALUE
#define HSE_VALUE 8000000U
#endif

#ifndef HSI_VALUE
#define HSI_VALUE 8000000U
#endif

/* This variable is updated in three ways:
      1) by calling CMSIS function SystemCoreClockUpdate()
      2) by calling HAL API function HAL_RCC_GetHCLKFreq()
      3) each time HAL_RCC_ClockConfig() is called to configure the system clock frequency
         Note: If you use this function to configure the system clock; then there
               is no need to call the 2 first functions listed above, since SystemCoreClock
               variable is updated automatically.
  */
uint32_t SystemCoreClock = HSI_VALUE;
const uint8_t AHBPrescTable[16U] = {0U, 0U, 0U, 0U, 0U, 0U, 0U, 0U, 1U, 2U, 3U, 4U, 6U, 7U, 8U, 9U};
const uint8_t APBPrescTable[8U] = {0U, 0U, 0U, 0U, 1U, 2U, 3U, 4U};

/**
 * @brief  Setup the microcontroller system
 *         Initialize the Embedded Flash Interface, the PLL and update the
 *         SystemCoreClock variable.
 * @note   This function should be used only after reset.
 * @param  None
 * @retval None
 */
void SystemInit(void) {
    /* The project uses the reset-default 8 MHz HSI clock. */
    SET_BIT(RCC->CR, RCC_CR_HSION);
    WRITE_REG(RCC->CFGR, 0U);
    WRITE_REG(FLASH->ACR, 0U);
}

/**
 * @brief  Update SystemCoreClock variable according to Clock Register Values.
 *         The SystemCoreClock variable contains the core clock (HCLK), it can
 *         be used by the user application to setup the SysTick timer or configure
 *         other parameters.
 *
 * @note   Each time the core clock (HCLK) changes, this function must be called
 *         to update SystemCoreClock variable value. Otherwise, any configuration
 *         based on this variable will be incorrect.
 *
 * @note   - The system frequency computed by this function is not the real
 *           frequency in the chip. It is calculated based on the predefined
 *           constant and the selected clock source:
 *
 *           - If SYSCLK source is HSI, SystemCoreClock will contain the HSI_VALUE(*)
 *
 *           - If SYSCLK source is HSE, SystemCoreClock will contain the HSE_VALUE(**)
 *
 *           - If SYSCLK source is PLL, SystemCoreClock will contain the HSE_VALUE(**)
 *             or HSI_VALUE(*) multiplied by the PLL factors.
 *
 *         (*) HSI_VALUE is a constant defined in stm32f1xx.h file (default value
 *             8 MHz) but the real value may vary depending on the variations
 *             in voltage and temperature.
 *
 *         (**) HSE_VALUE is a constant defined in stm32f1xx.h file (default value
 *              8 MHz or 25 MHz, depending on the product used), user has to ensure
 *              that HSE_VALUE is same as the real frequency of the crystal used.
 *              Otherwise, this function may have wrong result.
 *
 *         - The result of this function could be not correct when using fractional
 *           value for HSE crystal.
 * @param  None
 * @retval None
 */
void SystemCoreClockUpdate(void) {
    uint32_t clock_source = READ_REG(RCC->CFGR);

    switch (clock_source & RCC_CFGR_SWS) {
    case RCC_CFGR_SWS_HSE:
        SystemCoreClock = HSE_VALUE;
        break;

    case RCC_CFGR_SWS_PLL: {
        uint32_t pll_multiplier = ((clock_source & RCC_CFGR_PLLMULL) >> RCC_CFGR_PLLMULL_Pos) + 2U;
        if (pll_multiplier > 16U) {
            pll_multiplier = 16U; /* Both top PLLMULL encodings mean x16. */
        }

        if ((clock_source & RCC_CFGR_PLLSRC) == 0U) {
            SystemCoreClock = (HSI_VALUE / 2U) * pll_multiplier;
        } else if ((clock_source & RCC_CFGR_PLLXTPRE) != 0U) {
            SystemCoreClock = (HSE_VALUE / 2U) * pll_multiplier;
        } else {
            SystemCoreClock = HSE_VALUE * pll_multiplier;
        }
        break;
    }

    case RCC_CFGR_SWS_HSI:
    default:
        SystemCoreClock = HSI_VALUE;
        break;
    }

    SystemCoreClock >>= AHBPrescTable[(clock_source & RCC_CFGR_HPRE) >> RCC_CFGR_HPRE_Pos];
}
