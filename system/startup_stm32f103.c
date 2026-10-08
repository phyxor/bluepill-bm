/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#include <stdint.h>

#ifdef USE_CMSIS
#include "system_stm32f1xx.h"
#endif

extern uint32_t _estack;
extern uint32_t _sidata;
extern uint32_t _sdata;
extern uint32_t _edata;
extern uint32_t _sbss;
extern uint32_t _ebss;

void Reset_Handler(void);
void Default_Handler(void);
void SystemInit(void);
int main(void);

#define DEFAULT_HANDLER(name) void name(void) __attribute__((weak, alias("Default_Handler")))

DEFAULT_HANDLER(NMI_Handler);
DEFAULT_HANDLER(HardFault_Handler);
DEFAULT_HANDLER(MemManage_Handler);
DEFAULT_HANDLER(BusFault_Handler);
DEFAULT_HANDLER(UsageFault_Handler);
DEFAULT_HANDLER(SVC_Handler);
DEFAULT_HANDLER(DebugMon_Handler);
DEFAULT_HANDLER(PendSV_Handler);
DEFAULT_HANDLER(SysTick_Handler);

DEFAULT_HANDLER(WWDG_IRQHandler);
DEFAULT_HANDLER(PVD_IRQHandler);
DEFAULT_HANDLER(TAMPER_IRQHandler);
DEFAULT_HANDLER(RTC_IRQHandler);
DEFAULT_HANDLER(FLASH_IRQHandler);
DEFAULT_HANDLER(RCC_IRQHandler);
DEFAULT_HANDLER(EXTI0_IRQHandler);
DEFAULT_HANDLER(EXTI1_IRQHandler);
DEFAULT_HANDLER(EXTI2_IRQHandler);
DEFAULT_HANDLER(EXTI3_IRQHandler);
DEFAULT_HANDLER(EXTI4_IRQHandler);
DEFAULT_HANDLER(DMA1_Channel1_IRQHandler);
DEFAULT_HANDLER(DMA1_Channel2_IRQHandler);
DEFAULT_HANDLER(DMA1_Channel3_IRQHandler);
DEFAULT_HANDLER(DMA1_Channel4_IRQHandler);
DEFAULT_HANDLER(DMA1_Channel5_IRQHandler);
DEFAULT_HANDLER(DMA1_Channel6_IRQHandler);
DEFAULT_HANDLER(DMA1_Channel7_IRQHandler);
DEFAULT_HANDLER(ADC1_2_IRQHandler);
DEFAULT_HANDLER(USB_HP_CAN_TX_IRQHandler);
DEFAULT_HANDLER(USB_LP_CAN_RX0_IRQHandler);
DEFAULT_HANDLER(CAN_RX1_IRQHandler);
DEFAULT_HANDLER(CAN_SCE_IRQHandler);
DEFAULT_HANDLER(EXTI9_5_IRQHandler);
DEFAULT_HANDLER(TIM1_BRK_IRQHandler);
DEFAULT_HANDLER(TIM1_UP_IRQHandler);
DEFAULT_HANDLER(TIM1_TRG_COM_IRQHandler);
DEFAULT_HANDLER(TIM1_CC_IRQHandler);
DEFAULT_HANDLER(TIM2_IRQHandler);
DEFAULT_HANDLER(TIM3_IRQHandler);
DEFAULT_HANDLER(TIM4_IRQHandler);
DEFAULT_HANDLER(I2C1_EV_IRQHandler);
DEFAULT_HANDLER(I2C1_ER_IRQHandler);
DEFAULT_HANDLER(I2C2_EV_IRQHandler);
DEFAULT_HANDLER(I2C2_ER_IRQHandler);
DEFAULT_HANDLER(SPI1_IRQHandler);
DEFAULT_HANDLER(SPI2_IRQHandler);
DEFAULT_HANDLER(USART1_IRQHandler);
DEFAULT_HANDLER(USART2_IRQHandler);
DEFAULT_HANDLER(USART3_IRQHandler);
DEFAULT_HANDLER(EXTI15_10_IRQHandler);
DEFAULT_HANDLER(RTC_Alarm_IRQHandler);
DEFAULT_HANDLER(USBWakeUp_IRQHandler);

const uint32_t g_pfnVectors[] __attribute__((section(".isr_vector"), used)) = {
    (uint32_t)&_estack,
    (uint32_t)&Reset_Handler,
    (uint32_t)&NMI_Handler,
    (uint32_t)&HardFault_Handler,
    (uint32_t)&MemManage_Handler,
    (uint32_t)&BusFault_Handler,
    (uint32_t)&UsageFault_Handler,
    0u,
    0u,
    0u,
    0u,
    (uint32_t)&SVC_Handler,
    (uint32_t)&DebugMon_Handler,
    0u,
    (uint32_t)&PendSV_Handler,
    (uint32_t)&SysTick_Handler,
    (uint32_t)&WWDG_IRQHandler,
    (uint32_t)&PVD_IRQHandler,
    (uint32_t)&TAMPER_IRQHandler,
    (uint32_t)&RTC_IRQHandler,
    (uint32_t)&FLASH_IRQHandler,
    (uint32_t)&RCC_IRQHandler,
    (uint32_t)&EXTI0_IRQHandler,
    (uint32_t)&EXTI1_IRQHandler,
    (uint32_t)&EXTI2_IRQHandler,
    (uint32_t)&EXTI3_IRQHandler,
    (uint32_t)&EXTI4_IRQHandler,
    (uint32_t)&DMA1_Channel1_IRQHandler,
    (uint32_t)&DMA1_Channel2_IRQHandler,
    (uint32_t)&DMA1_Channel3_IRQHandler,
    (uint32_t)&DMA1_Channel4_IRQHandler,
    (uint32_t)&DMA1_Channel5_IRQHandler,
    (uint32_t)&DMA1_Channel6_IRQHandler,
    (uint32_t)&DMA1_Channel7_IRQHandler,
    (uint32_t)&ADC1_2_IRQHandler,
    (uint32_t)&USB_HP_CAN_TX_IRQHandler,
    (uint32_t)&USB_LP_CAN_RX0_IRQHandler,
    (uint32_t)&CAN_RX1_IRQHandler,
    (uint32_t)&CAN_SCE_IRQHandler,
    (uint32_t)&EXTI9_5_IRQHandler,
    (uint32_t)&TIM1_BRK_IRQHandler,
    (uint32_t)&TIM1_UP_IRQHandler,
    (uint32_t)&TIM1_TRG_COM_IRQHandler,
    (uint32_t)&TIM1_CC_IRQHandler,
    (uint32_t)&TIM2_IRQHandler,
    (uint32_t)&TIM3_IRQHandler,
    (uint32_t)&TIM4_IRQHandler,
    (uint32_t)&I2C1_EV_IRQHandler,
    (uint32_t)&I2C1_ER_IRQHandler,
    (uint32_t)&I2C2_EV_IRQHandler,
    (uint32_t)&I2C2_ER_IRQHandler,
    (uint32_t)&SPI1_IRQHandler,
    (uint32_t)&SPI2_IRQHandler,
    (uint32_t)&USART1_IRQHandler,
    (uint32_t)&USART2_IRQHandler,
    (uint32_t)&USART3_IRQHandler,
    (uint32_t)&EXTI15_10_IRQHandler,
    (uint32_t)&RTC_Alarm_IRQHandler,
    (uint32_t)&USBWakeUp_IRQHandler,
};

void Default_Handler(void) {
    // Engaging in an infinite loop effectively prevents the program from
    // proceeding into an undefined state following such an event
    while (1) {}
}

void Reset_Handler(void) {
    SystemInit();

    uint32_t *p_src_mem = &_sidata;
    uint32_t *p_dest_mem = &_sdata;

    // Copy the data content from FLASH to SRAM
    while (p_dest_mem < &_edata) {
        *p_dest_mem++ = *p_src_mem++;
    }

    // Initialize to 0 all .sbss section in the SRAM
    p_dest_mem = &_sbss;
    while (p_dest_mem < &_ebss) {
        *p_dest_mem++ = 0;
    }

#ifdef USE_CMSIS
    SystemCoreClockUpdate();
#endif

    main();

    while (1) {}
}
