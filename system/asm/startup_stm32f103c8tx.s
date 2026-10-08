/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/*
 * Reference assembly startup implementation for STM32F103C8T6 / Cortex-M3.
 *
 * The active startup file used by the build is:
 *
 *   system/startup_stm32f103.c
 *
 * Keep this file in sync with the C startup file when changing:
 *
 * - vector table order
 * - Reset_Handler behavior
 * - linker symbols used for .data/.bss initialization
 * - default interrupt handler behavior
 *
 * This file lives under system/asm/ as a learning/reference version of the same
 * startup flow. It is not linked by the current Makefile.
 *
 * This file follows the standard Cortex-M startup pattern:
 *
 * - Vector table entry 0 contains the initial stack pointer.
 * - Vector table entry 1 contains Reset_Handler.
 * - Reset_Handler prepares RAM before calling main().
 * - Interrupt handlers are weak aliases to Default_Handler unless the
 *   application provides real handlers.
 *
 * The interrupt vector order follows the STM32F103 medium-density device layout.
 * The linker symbols used here are defined in linker/STM32F103C8TX_FLASH.ld:
 *
 * - _estack: top of RAM, used as initial stack pointer
 * - _sidata: source address in flash for initialized .data values
 * - _sdata: start of .data in RAM
 * - _edata: end of .data in RAM
 * - _sbss: start of .bss in RAM
 * - _ebss: end of .bss in RAM
 *
 * This is intentionally minimal for learning bare-metal startup code. A vendor
 * CMSIS startup file can be used later if exact ST naming/coverage is preferred.
 */

.syntax unified
.cpu cortex-m3
.thumb

.global g_pfnVectors
.global Default_Handler

.word _sidata
.word _sdata
.word _edata
.word _sbss
.word _ebss

.section .text.Reset_Handler
.weak Reset_Handler
.thumb_func
.type Reset_Handler, %function
Reset_Handler:
  /* Set the stack pointer from the linker-provided top-of-RAM symbol. */
  ldr r0, =_estack
  mov sp, r0

  /* Optional system setup hook. Our current implementation keeps default HSI. */
  bl SystemInit

  /* Copy initialized global/static variables from flash to RAM. */
  ldr r0, =_sdata
  ldr r1, =_edata
  ldr r2, =_sidata
  movs r3, #0
  b 2f
1:
  ldr r4, [r2, r3]
  str r4, [r0, r3]
  adds r3, r3, #4
2:
  adds r4, r0, r3
  cmp r4, r1
  bcc 1b

  /* Zero uninitialized global/static variables in .bss. */
  ldr r2, =_sbss
  ldr r4, =_ebss
  movs r3, #0
  b 4f
3:
  str r3, [r2]
  adds r2, r2, #4
4:
  cmp r2, r4
  bcc 3b

  /* Enter the C application. If main returns, stay in an infinite loop. */
  bl main

5:
  b 5b

.size Reset_Handler, .-Reset_Handler

.section .text.Default_Handler,"ax",%progbits
.thumb_func
Default_Handler:
  b Default_Handler
.size Default_Handler, .-Default_Handler

/* Vector table. The linker script places .isr_vector at the start of flash. */
.section .isr_vector,"a",%progbits
.type g_pfnVectors, %object
g_pfnVectors:
  .word _estack
  .word Reset_Handler
  .word NMI_Handler
  .word HardFault_Handler
  .word MemManage_Handler
  .word BusFault_Handler
  .word UsageFault_Handler
  .word 0
  .word 0
  .word 0
  .word 0
  .word SVC_Handler
  .word DebugMon_Handler
  .word 0
  .word PendSV_Handler
  .word SysTick_Handler
  .word WWDG_IRQHandler
  .word PVD_IRQHandler
  .word TAMPER_IRQHandler
  .word RTC_IRQHandler
  .word FLASH_IRQHandler
  .word RCC_IRQHandler
  .word EXTI0_IRQHandler
  .word EXTI1_IRQHandler
  .word EXTI2_IRQHandler
  .word EXTI3_IRQHandler
  .word EXTI4_IRQHandler
  .word DMA1_Channel1_IRQHandler
  .word DMA1_Channel2_IRQHandler
  .word DMA1_Channel3_IRQHandler
  .word DMA1_Channel4_IRQHandler
  .word DMA1_Channel5_IRQHandler
  .word DMA1_Channel6_IRQHandler
  .word DMA1_Channel7_IRQHandler
  .word ADC1_2_IRQHandler
  .word USB_HP_CAN_TX_IRQHandler
  .word USB_LP_CAN_RX0_IRQHandler
  .word CAN_RX1_IRQHandler
  .word CAN_SCE_IRQHandler
  .word EXTI9_5_IRQHandler
  .word TIM1_BRK_IRQHandler
  .word TIM1_UP_IRQHandler
  .word TIM1_TRG_COM_IRQHandler
  .word TIM1_CC_IRQHandler
  .word TIM2_IRQHandler
  .word TIM3_IRQHandler
  .word TIM4_IRQHandler
  .word I2C1_EV_IRQHandler
  .word I2C1_ER_IRQHandler
  .word I2C2_EV_IRQHandler
  .word I2C2_ER_IRQHandler
  .word SPI1_IRQHandler
  .word SPI2_IRQHandler
  .word USART1_IRQHandler
  .word USART2_IRQHandler
  .word USART3_IRQHandler
  .word EXTI15_10_IRQHandler
  .word RTC_Alarm_IRQHandler
  .word USBWakeUp_IRQHandler
.size g_pfnVectors, .-g_pfnVectors

/*
 * Give every handler a weak default implementation. Defining a function with the
 * same name elsewhere overrides the alias.
 */
.macro weak_alias name
  .weak \name
  .thumb_set \name, Default_Handler
.endm

weak_alias NMI_Handler
weak_alias HardFault_Handler
weak_alias MemManage_Handler
weak_alias BusFault_Handler
weak_alias UsageFault_Handler
weak_alias SVC_Handler
weak_alias DebugMon_Handler
weak_alias PendSV_Handler
weak_alias SysTick_Handler
weak_alias WWDG_IRQHandler
weak_alias PVD_IRQHandler
weak_alias TAMPER_IRQHandler
weak_alias RTC_IRQHandler
weak_alias FLASH_IRQHandler
weak_alias RCC_IRQHandler
weak_alias EXTI0_IRQHandler
weak_alias EXTI1_IRQHandler
weak_alias EXTI2_IRQHandler
weak_alias EXTI3_IRQHandler
weak_alias EXTI4_IRQHandler
weak_alias DMA1_Channel1_IRQHandler
weak_alias DMA1_Channel2_IRQHandler
weak_alias DMA1_Channel3_IRQHandler
weak_alias DMA1_Channel4_IRQHandler
weak_alias DMA1_Channel5_IRQHandler
weak_alias DMA1_Channel6_IRQHandler
weak_alias DMA1_Channel7_IRQHandler
weak_alias ADC1_2_IRQHandler
weak_alias USB_HP_CAN_TX_IRQHandler
weak_alias USB_LP_CAN_RX0_IRQHandler
weak_alias CAN_RX1_IRQHandler
weak_alias CAN_SCE_IRQHandler
weak_alias EXTI9_5_IRQHandler
weak_alias TIM1_BRK_IRQHandler
weak_alias TIM1_UP_IRQHandler
weak_alias TIM1_TRG_COM_IRQHandler
weak_alias TIM1_CC_IRQHandler
weak_alias TIM2_IRQHandler
weak_alias TIM3_IRQHandler
weak_alias TIM4_IRQHandler
weak_alias I2C1_EV_IRQHandler
weak_alias I2C1_ER_IRQHandler
weak_alias I2C2_EV_IRQHandler
weak_alias I2C2_ER_IRQHandler
weak_alias SPI1_IRQHandler
weak_alias SPI2_IRQHandler
weak_alias USART1_IRQHandler
weak_alias USART2_IRQHandler
weak_alias USART3_IRQHandler
weak_alias EXTI15_10_IRQHandler
weak_alias RTC_Alarm_IRQHandler
weak_alias USBWakeUp_IRQHandler
