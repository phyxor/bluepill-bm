// Copyright (C) 2026 Phyxor Microsystems
// SPDX-FileContributor: Pablo Palazon
// SPDX-License-Identifier: BSD-3-Clause

(function (root) {
  "use strict";

  // IRQ names come from stm32f103xb.h. Handler names come from our C startup.
  const names = [
    "WWDG", "PVD", "TAMPER", "RTC", "FLASH", "RCC",
    "EXTI0", "EXTI1", "EXTI2", "EXTI3", "EXTI4",
    "DMA1_Channel1", "DMA1_Channel2", "DMA1_Channel3", "DMA1_Channel4",
    "DMA1_Channel5", "DMA1_Channel6", "DMA1_Channel7", "ADC1_2",
    "USB_HP_CAN1_TX", "USB_LP_CAN1_RX0", "CAN1_RX1", "CAN1_SCE",
    "EXTI9_5", "TIM1_BRK", "TIM1_UP", "TIM1_TRG_COM", "TIM1_CC",
    "TIM2", "TIM3", "TIM4", "I2C1_EV", "I2C1_ER", "I2C2_EV", "I2C2_ER",
    "SPI1", "SPI2", "USART1", "USART2", "USART3", "EXTI15_10", "RTC_Alarm", "USBWakeUp",
  ];
  const routes = names.map((name, irq) => ({
    irq, name: `${name}_IRQn`, vector: irq + 16,
    handler: `${name.replace("CAN1", "CAN")}_IRQHandler`,
  }));
  routes.push({ irq: -14, name: "NonMaskableInt_IRQn", vector: 2, handler: "NMI_Handler" });
  routes.push({ irq: -1, name: "SysTick_IRQn", vector: 15, handler: "SysTick_Handler" });
  const rm = (section, page) => ({ label: `RM0008 ${section}`, file: "stm32f103x8-reference.pdf", page });
  const arm = (section, page) => ({ label: `Cortex-M3 guide ${section}`, file: "arm-cortex-m3-generic-user-guide.pdf", page });
  const events = [];
  function add(peripheral, key, title, condition, irq, flags, enables, service, reference, extra = {}) {
    events.push({ id: `${peripheral}:${key}`, peripheral, title, condition,
      route: routes.find(route => route.irq === irq) || null,
      flags, enables, service, reference, notes: [], setup: [], request: "level", ...extra });
  }

  for (const x of [1, 2, 3]) {
    const p = `USART${x}`;
    const irq = 36 + x;
    const receiveErrors = [`Read ${p}->SR, then read ${p}->DR.`, "Handle the error and any received data."];
    const entries = [
      ["RXNE", "Received data", "A received word enters the data register.", ["CR1.RXNEIE"], [`Read ${p}->DR and store the received word.`]],
      ["TXE", "Transmit register empty", "The data register can accept the next word.", ["CR1.TXEIE"], [`Write the next word to ${p}->DR.`, `If no data remains, clear ${p}->CR1.TXEIE.`]],
      ["TC", "Transmission complete", "The final frame leaves the transmitter.", ["CR1.TCIE"], [`Write 0 to ${p}->SR.TC, preserving other flags.`, `If sending another word, read SR, then write DR instead.`]],
      ["IDLE", "Idle line", "The receiver detects an idle line after reception.", ["CR1.IDLEIE"], [`Read ${p}->SR, then read ${p}->DR.`]],
      ["PE", "Parity error", "The received parity does not match.", ["CR1.PEIE"], receiveErrors],
      ["ORE", "Receive overrun", "A new word arrives before the previous word is read.", ["CR1.RXNEIE OR (CR3.EIE AND CR3.DMAR)"], receiveErrors],
      ["NE", "Noise detected", "The receiver detects noise in the received frame.", ["CR3.EIE", "CR3.DMAR"], receiveErrors],
      ["FE", "Framing error", "The receiver detects an invalid stop bit.", ["CR3.EIE", "CR3.DMAR"], receiveErrors],
      ["LBD", "LIN break detected", "The receiver detects a LIN break.", ["CR2.LBDIE"], [`Write 0 to ${p}->SR.LBD, preserving other flags.`]],
      ["CTS", "CTS input changed", "The clear-to-send input changes state.", ["CR3.CTSIE"], [`Write 0 to ${p}->SR.CTS, preserving other flags.`]],
    ];
    for (const [flag, title, condition, gates, service] of entries) {
      add(p, flag, title, condition, irq, [`${p}->SR.${flag}`], gates.map(g => `${p}->${g}`), service, rm("27.4 and 27.6", 816),
        { setup: [`Enable the ${p} clock. Configure the pins, baud rate, and transmitter or receiver.`] });
    }
  }

  for (const x of [1, 2]) {
    const p = `SPI${x}`;
    for (const [flag, title, gate, condition, service] of [
      ["RXNE", "Received data", "RXNEIE", "A received frame enters the receive buffer.", [`Read ${p}->DR and store the frame.`]],
      ["TXE", "Transmit buffer empty", "TXEIE", "The transmit buffer can accept a frame.", [`Write the next frame to ${p}->DR.`, `If no data remains, clear ${p}->CR2.TXEIE.`]],
      ["OVR", "Receive overrun", "ERRIE", "A new frame arrives before the receive buffer is read.", [`Read ${p}->DR, then read ${p}->SR.`, "Handle the lost frame."]],
      ["MODF", "Master mode fault", "ERRIE", "The NSS input causes a master mode fault.", [`Read ${p}->SR, then write ${p}->CR1 with the required configuration.`]],
      ["CRCERR", "CRC mismatch", "ERRIE", "The received checksum does not match the calculated checksum.", [`Write 0 to ${p}->SR.CRCERR, preserving other flags.`, "Reject or recover the invalid frame."]],
    ]) add(p, flag, title, condition, 34 + x, [`${p}->SR.${flag}`], [`${p}->CR2.${gate}`], service, rm("25.3.10, 25.3.11 and 25.5", 722),
      { setup: [`Enable the ${p} clock. Configure its pins, frame format, clock, and NSS handling.`] });
  }

  for (const x of [1, 2]) {
    const p = `I2C${x}`;
    const irq = x === 1 ? 31 : 33;
    const protocol = [
      ["SB", "Start sent", "The master sends a start condition.", [`Read ${p}->SR1, then write the address to ${p}->DR.`]],
      ["ADDR", "Address sent or matched", "The master address is acknowledged, or a slave address matches.", [`Read ${p}->SR1, then read ${p}->SR2.`]],
      ["ADD10", "10-bit address header sent", "The master sends the first address byte in 10-bit mode.", [`Read ${p}->SR1, then write the second address byte to ${p}->DR.`]],
      ["STOPF", "Stop received", "The slave detects a stop condition.", [`Read ${p}->SR1, then write ${p}->CR1.`]],
      ["BTF", "Byte transfer finished", "A byte transfer completes while the data register needs service.", [`Read ${p}->SR1, then read or write ${p}->DR for the transfer direction.`]],
      ["RXNE", "Received byte", "The receive register contains a byte.", [`Read ${p}->DR.`, "If another byte waits, RXNE can remain set."]],
      ["TXE", "Transmit register empty", "The transmit register can accept a byte.", [`Write the next byte to ${p}->DR.`, `If no data remains, clear ${p}->CR2.ITBUFEN.`]],
    ];
    for (const [flag, title, condition, service] of protocol) {
      const enables = [`${p}->CR2.ITEVTEN`];
      if (["RXNE", "TXE"].includes(flag)) enables.push(`${p}->CR2.ITBUFEN`);
      add(p, flag, title, condition, irq, [`${p}->SR1.${flag}`], enables, service, rm("26.4 and 26.6", 770),
        { notes: ["Follow the transfer sequence for the current master or slave mode. SR1 protocol flags need specific access sequences."] });
    }
    for (const [flag, title, condition] of [
      ["BERR", "Bus error", "A start or stop condition occurs in an invalid position."],
      ["ARLO", "Arbitration lost", "Another master wins bus arbitration."],
      ["AF", "Acknowledge failure", "The other device does not acknowledge."],
      ["OVR", "Overrun or underrun", "The slave cannot service the data register with clock stretching disabled."],
      ["PECERR", "SMBus checksum error", "The received SMBus checksum does not match."],
      ["TIMEOUT", "SMBus timeout", "The SMBus clock exceeds a timeout limit."],
      ["SMBALERT", "SMBus alert", "An SMBus alert or alert response occurs."],
    ]) add(p, flag, title, condition, irq + 1, [`${p}->SR1.${flag}`], [`${p}->CR2.ITERREN`],
      [`Write 0 to ${p}->SR1.${flag}, preserving other error flags.`, "Recover or end the current transfer."], rm("26.4 and 26.6", 770));
  }

  for (const x of [1, 2, 3, 4]) {
    const p = `TIM${x}`;
    const reference = rm(x === 1 ? "14.4" : "15.4", x === 1 ? 292 : 365);
    const irq = x === 1 ? 25 : 26 + x;
    add(p, "UIF", "Counter update", "An enabled update event occurs, such as counter overflow or underflow.", irq,
      [`${p}->SR.UIF`], [`${p}->DIER.UIE`], [`Write 0 to ${p}->SR.UIF, preserving other status flags.`], reference,
      { notes: ["CR1.UDIS and CR1.URS affect update generation. A software update can also set UIF."] });
    add(p, "TIF", "Trigger event", "A configured trigger event occurs.", x === 1 ? 26 : irq,
      [`${p}->SR.TIF`], [`${p}->DIER.TIE`], [`Write 0 to ${p}->SR.TIF, preserving other status flags.`], reference);
    for (let ch = 1; ch <= 4; ch++) {
      add(p, `CC${ch}IF`, `Channel ${ch} capture or compare`, "An input edge is captured, or the counter matches the compare value.", x === 1 ? 27 : irq,
        [`${p}->SR.CC${ch}IF`, `${p}->SR.CC${ch}OF (capture overrun)`], [`${p}->DIER.CC${ch}IE`],
        [`In input capture mode, read ${p}->CCR${ch} to get the captured value and clear CC${ch}IF.`,
          `In compare mode, write 0 to ${p}->SR.CC${ch}IF, preserving other flags.`,
          `If CC${ch}OF is set, handle the lost capture and write 0 to that flag.`], reference,
        { notes: ["Capture overrun has no separate interrupt enable bit."] });
    }
    if (x === 1) {
      add(p, "BIF", "Break input", "The enabled break input becomes active.", 24, ["TIM1->SR.BIF"], ["TIM1->DIER.BIE"],
        ["Handle the output shutdown and remove the break cause.", "Write 0 to TIM1->SR.BIF, preserving other flags."], reference);
      add(p, "COMIF", "Commutation", "A configured commutation event updates the output control bits.", 26, ["TIM1->SR.COMIF"], ["TIM1->DIER.COMIE"],
        ["Write 0 to TIM1->SR.COMIF, preserving other flags."], reference);
    }
  }

  for (let n = 0; n <= 15; n++) {
    const irq = n <= 4 ? 6 + n : n <= 9 ? 23 : 40;
    add("EXTI / GPIO", `line${n}`, `GPIO line ${n} edge`, "The selected GPIO input has a configured rising or falling edge.", irq,
      [`EXTI->PR.PR${n}`], [`EXTI->IMR.MR${n}`], [`Write 1 to EXTI->PR.PR${n}. Write only the serviced bit mask.`], rm("9.4.3 through 9.4.6 and 10.2", 207),
      { setup: [`Enable the GPIO and AFIO clocks. Select a bonded port in AFIO->EXTICR[${Math.floor(n / 4)}].EXTI${n}.`,
        `Set EXTI->RTSR.TR${n} for a rising edge or EXTI->FTSR.TR${n} for a falling edge.`],
      notes: ["GPIO ports with the same pin number share this EXTI line. Select one port.", `EXTI->SWIER.SWIER${n} can also request this interrupt.`] });
  }

  for (let n = 1; n <= 7; n++) {
    for (const [flag, gate, clear, title, condition] of [
      ["TCIF", "TCIE", "CTCIF", "Transfer complete", "The configured transfer count reaches zero."],
      ["HTIF", "HTIE", "CHTIF", "Half transfer", "Half of the configured transfer completes."],
      ["TEIF", "TEIE", "CTEIF", "Transfer error", "A DMA access causes a bus error."],
    ]) add(`DMA1 channel ${n}`, flag, title, condition, 10 + n, [`DMA1->ISR.${flag}${n}`], [`DMA1_Channel${n}->CCR.${gate}`],
      [`Write 1 to DMA1->IFCR.${clear}${n}. Write only the required clear mask.`,
        flag === "TEIF" ? "Handle the error before restarting the channel." : "Process the completed buffer or buffer half."], rm("13.3.6 and 13.4", 280),
      { notes: [`DMA1->IFCR.CGIF${n} clears every flag for this channel.`, "The DMA ISR handles the transfer. The peripheral has its own separate interrupt sources."] });
  }

  for (const x of [1, 2]) {
    for (const [flag, gate, title, condition, service] of [
      ["EOC", "EOCIE", "Regular conversion complete", "A regular ADC conversion completes.", [`Read ADC${x}->DR and store the conversion result.`]],
      ["JEOC", "JEOCIE", "Injected sequence complete", "The injected conversion sequence completes.", [`Read the required ADC${x}->JDR1 through JDR4 results.`, `Write 0 to ADC${x}->SR.JEOC, preserving other flags.`]],
      ["AWD", "AWDIE", "Analog watchdog", "A monitored conversion crosses the configured threshold.", ["Handle the threshold crossing.", `Write 0 to ADC${x}->SR.AWD, preserving other flags.`]],
    ]) add(`ADC${x}`, flag, title, condition, 18, [`ADC${x}->SR.${flag}`], [`ADC${x}->CR1.${gate}`], service, rm("11.11 and 11.12", 236));
  }

  for (const [flag, gate, title, condition] of [
    ["SECF", "SECIE", "Second tick", "The RTC prescaler increments the counter."],
    ["ALRF", "ALRIE", "Alarm, global route", "The RTC counter matches the alarm value."],
    ["OWF", "OWIE", "Counter overflow", "The 32-bit RTC counter overflows."],
  ]) add("RTC", flag, title, condition, 3, [`RTC->CRL.${flag}`], [`RTC->CRH.${gate}`],
    [`Write 0 to RTC->CRL.${flag}, preserving other flags and control fields.`], rm("18.3 and 18.4", 488),
    { notes: ["Enable PWR->CR.DBP for backup-domain writes. Follow RTC->CRL.RTOFF synchronization rules."] });
  add("RTC", "EXTI17", "Alarm, EXTI route", "The RTC alarm signal produces the configured EXTI17 edge.", 41,
    ["RTC->CRL.ALRF", "EXTI->PR.PR17"], ["EXTI->IMR.MR17"],
    ["Write 0 to RTC->CRL.ALRF with the RTC write rules.", "Write 1 to EXTI->PR.PR17."], rm("18.4.2 and 10.2", 488),
    { setup: ["Configure the RTC alarm and the EXTI17 rising edge."], notes: ["ALRIE is not required for the EXTI route. If ALRIE is set, the global RTC route can also request service."] });

  add("PVD", "EXTI16", "Supply threshold crossing", "The voltage detector output has a configured edge.", 1,
    ["EXTI->PR.PR16", "PWR->CSR.PVDO (voltage level)"], ["PWR->CR.PVDE", "EXTI->IMR.MR16"],
    ["Read PWR->CSR.PVDO to determine the voltage level.", "Write 1 to EXTI->PR.PR16."], rm("5.2.2 and 10.2", 70),
    { setup: ["Choose the voltage threshold in PWR->CR.PLS. Configure EXTI16 rising or falling edges."] });
  add("BKP / Tamper", "TIF", "Tamper detected", "The enabled tamper pin detects a tamper event.", 2,
    ["BKP->CSR.TIF", "BKP->CSR.TEF"], ["BKP->CR.TPE", "BKP->CSR.TPIE"],
    ["Write 1 to BKP->CSR.CTI to clear the interrupt.", "Write 1 to BKP->CSR.CTE to clear the event."], rm("6.3.1 and 6.4.4", 84),
    { notes: ["Tamper detection clears backup data registers. Enable backup-domain writes before changing BKP registers."] });

  for (const clock of ["LSI", "LSE", "HSI", "HSE", "PLL"]) {
    add("RCC", `${clock}RDYF`, `${clock} ready`, "The oscillator becomes ready or the PLL locks.", 5,
      [`RCC->CIR.${clock}RDYF`], [`RCC->CIR.${clock}RDYIE`], [`Write 1 to RCC->CIR.${clock}RDYC, preserving the interrupt enable fields.`], rm("7.3.3", 104));
  }
  add("RCC", "CSSF", "HSE clock failure", "The clock security system detects an HSE failure.", -14,
    ["RCC->CIR.CSSF"], ["RCC->CR.CSSON"], ["Handle the clock failure and the switch to HSI.", "Write 1 to RCC->CIR.CSSC, preserving the interrupt enable fields."], rm("7.2.7 and 7.3.3", 97),
    { notes: ["This event uses NMI_Handler, not RCC_IRQHandler. Processor interrupt masks cannot block NMI."] });

  for (const [flag, title, gate, condition] of [
    ["EOP", "Flash operation complete", "EOPIE", "A Flash program or erase operation completes."],
    ["PGERR", "Flash programming error", "ERRIE", "A Flash programming operation fails."],
    ["WRPRTERR", "Flash protection error", "ERRIE", "A write or erase targets protected Flash."],
  ]) add("FLASH", flag, title, condition, 4, [`FLASH->SR.${flag}`], [`FLASH->CR.${gate}`],
    [`Write 1 to FLASH->SR.${flag}. Write only the required clear mask.`, "Check the operation result before continuing."],
    { label: "PM0075, Flash interrupts and registers", url: "https://www.st.com/resource/en/programming_manual/pm0075-stm32f10xxx-flash-memory-microcontrollers-stmicroelectronics.pdf" });

  add("WWDG", "EWIF", "Early warning", "The running window watchdog counter reaches 0x40.", 0,
    ["WWDG->SR.EWIF"], ["WWDG->CFR.EWI"], ["Refresh the watchdog within its valid window if operation must continue.", "Write 0 to WWDG->SR.EWIF."], rm("20.3 and 20.6", 500),
    { notes: ["Once EWI is set, only a hardware reset clears it. Use NVIC_DisableIRQ to block delivery.", "If the watchdog expires, it resets the device."] });
  add("IWDG", "reset", "Watchdog timeout", "The independent watchdog counter expires.", null,
    ["RCC->CSR.IWDGRSTF (after reset)"], ["IWDG->KR.KEY = 0xCCCC (start)"],
    ["Read RCC->CSR.IWDGRSTF after startup to identify the reset cause.", "Write 1 to RCC->CSR.RMVF to clear reset flags."], rm("19.3 and 7.3.10", 494),
    { notes: ["IWDG has no interrupt or ISR. It causes a reset, which runs Reset_Handler.", "Before timeout, write 0xAAAA to IWDG->KR to refresh the counter."] });

  for (const fifo of [0, 1]) {
    for (const [flag, gate, title, condition, service] of [
      ["FMP", "FMPIE", "Message waiting", "A received CAN message enters the FIFO.", ["Read the FIFO mailbox message.", `Write 1 to CAN1->RF${fifo}R.RFOM${fifo} to release that message.`]],
      ["FULL", "FFIE", "FIFO full", "The receive FIFO becomes full.", [`Write 1 to CAN1->RF${fifo}R.FULL${fifo}.`, "Read and release the queued messages."]],
      ["FOVR", "FOVIE", "FIFO overrun", "A message arrives while the receive FIFO is full.", [`Write 1 to CAN1->RF${fifo}R.FOVR${fifo}.`, "Handle the lost message and drain the FIFO."]],
    ]) add("CAN1", `${flag}${fifo}`, `FIFO${fifo}: ${title}`, condition, fifo === 0 ? 20 : 21,
      [`CAN1->RF${fifo}R.${flag}${fifo}`], [`CAN1->IER.${gate}${fifo}`], service, rm("24.8 and 24.9", 672));
  }
  for (let n = 0; n <= 2; n++) add("CAN1", `RQCP${n}`, `Mailbox ${n} transmit complete`, "A transmit request completes successfully, fails, or is aborted.", 19,
    [`CAN1->TSR.RQCP${n}`, `CAN1->TSR.TXOK${n}`, `CAN1->TSR.ALST${n}`, `CAN1->TSR.TERR${n}`], ["CAN1->IER.TMEIE"],
    ["Read the transmit result flags.", `Write 1 to CAN1->TSR.RQCP${n} to clear completion and result flags.`], rm("24.8 and 24.9", 672));
  for (const [flag, gate, title, condition] of [
    ["EWGF", "EWGIE", "Error warning", "The CAN error counters reach the warning level."],
    ["EPVF", "EPVIE", "Error passive", "The controller enters the error-passive state."],
    ["BOFF", "BOFIE", "Bus off", "The controller enters the bus-off state."],
    ["LEC", "LECIE", "Protocol error", "The controller records a CAN protocol error."],
  ]) add("CAN1", flag, title, condition, 22, [`CAN1->MSR.ERRI`, `CAN1->ESR.${flag}`], ["CAN1->IER.ERRIE", `CAN1->IER.${gate}`],
    ["Read CAN1->ESR and handle the error state.", "Write 1 to CAN1->MSR.ERRI.",
      flag === "LEC" ? "Write 0 to CAN1->ESR.LEC to clear the last error code." : "The ESR state flag follows the hardware error state. Software cannot clear it directly."], rm("24.8 and 24.9", 672));
  for (const [flag, gate, title, condition] of [
    ["WKUI", "WKUIE", "Wakeup", "CAN activity wakes the controller."],
    ["SLAKI", "SLKIE", "Sleep acknowledged", "The controller acknowledges entry into sleep mode."],
  ]) add("CAN1", flag, title, condition, 22, [`CAN1->MSR.${flag}`], [`CAN1->IER.${gate}`],
    [`Write 1 to CAN1->MSR.${flag}.`], rm("24.8 and 24.9", 672));

  for (const [flag, gate, title, condition] of [
    ["PMAOVR", "PMAOVRM", "Packet memory overrun", "The USB packet memory cannot service a transfer in time."],
    ["ERR", "ERRM", "USB transaction error", "The USB peripheral detects a transaction error."],
    ["WKUP", "WKUPM", "Wakeup, low-priority route", "USB activity wakes the suspended peripheral."],
    ["SUSP", "SUSPM", "Suspend", "The USB bus remains inactive for the suspend interval."],
    ["RESET", "RESETM", "Bus reset", "The host resets the USB bus."],
    ["SOF", "SOFM", "Start of frame", "A USB start-of-frame packet arrives."],
    ["ESOF", "ESOFM", "Expected frame missing", "An expected start-of-frame packet does not arrive."],
  ]) add("USB", flag, title, condition, 20, [`USB->ISTR.${flag}`], [`USB->CNTR.${gate}`],
    [`Handle the ${flag} event.`, `Write 0 to USB->ISTR.${flag}, preserving other event flags.`], rm("23.3 and 23.5.1", 637));
  for (const [key, irq, title, gates] of [
    ["CTR_LP", 20, "Endpoint transfer, low priority", ["USB->CNTR.CTRM"]],
    ["CTR_HP", 19, "Endpoint transfer, high priority", ["Endpoint configured for isochronous or double-buffer bulk transfers"]],
  ]) add("USB", key, title, "A USB endpoint completes a transaction.", irq,
    ["USB->ISTR.CTR", "USB->EP0R..EP7R.CTR_RX / CTR_TX"], gates,
    ["Use USB->ISTR.EP_ID and DIR to identify the endpoint and transfer direction.", "Process the received packet or completed transmission.",
      "Write 0 to the endpoint CTR_RX or CTR_TX flag with the endpoint register write rules."], rm("23.3 and 23.5.2", 644),
    { notes: ["ISTR.CTR is read-only. Endpoint registers contain toggle-on-write fields. Do not use a generic read-modify-write.",
      ...(irq === 19 ? ["The dedicated endpoint request does not depend on CNTR.CTRM."] : [])] });
  add("USB", "EXTI18", "Wakeup, EXTI route", "The USB wakeup signal produces the configured EXTI18 edge.", 42,
    ["EXTI->PR.PR18", "USB->ISTR.WKUP"], ["EXTI->IMR.MR18"],
    ["Restore the clocks required after suspend.", "Write 1 to EXTI->PR.PR18.", "When servicing USB wakeup, write 0 to USB->ISTR.WKUP."], rm("10.2 and 23.3", 210),
    { setup: ["Configure the EXTI18 rising edge."], notes: ["CNTR.WKUPM controls the separate low-priority USB route."] });
  for (const event of events.filter(e => ["USB", "CAN1"].includes(e.peripheral))) {
    event.notes.push("USB and CAN share packet memory on this device. They cannot operate at the same time.");
  }
  add("SysTick", "wrap", "Counter reaches zero", "The enabled core timer counts down to zero.", -1,
    ["SysTick->CTRL.COUNTFLAG", "SCB->ICSR.PENDSTSET (pending)"], ["SysTick->CTRL.ENABLE", "SysTick->CTRL.TICKINT"],
    ["Update the software tick count or mark the periodic task ready.", "Read SysTick->CTRL or write SysTick->VAL to clear COUNTFLAG if required."], arm("4.4", 159),
    { request: "pulse", notes: ["SysTick has no NVIC enable bit. CTRL.TICKINT controls its interrupt.", "COUNTFLAG is separate from pending. ICSR.PENDSTCLR clears pending, not COUNTFLAG."] });

  const preparation = {
    I2C: "Enable the I2C clock. Configure the pins, bus timing, addresses, and CR1.PE.",
    TIM: "Enable the timer clock. Configure the counter, channels, and trigger or break inputs required for this event.",
    DMA: "Enable RCC->AHBENR.DMA1EN. Configure the disabled channel addresses, transfer count, and data widths before starting it.",
    ADC: "Enable the ADC clock. Configure the input, conversion sequence, sampling time, and any watchdog thresholds. Calibrate the ADC.",
    RTC: "Configure the backup-domain clock and RTC. Enable backup-domain writes and follow RTC register synchronization rules.",
    RCC: "Configure and enable the oscillator or PLL required for this event.",
    FLASH: "Follow the Flash unlock and program or erase sequence in PM0075.",
    WWDG: "Enable the WWDG clock. Configure the watchdog window and counter before starting it.",
    CAN: "Enable the CAN clock. Configure the pins, bus timing, receive filters, and controller mode.",
    USB: "Enable the USB clock with a valid 48 MHz source. Configure the device and endpoint packet buffers.",
    SysTick: "Choose a clock source. Set SysTick->LOAD and clear SysTick->VAL before enabling the timer.",
  };
  for (const event of events) {
    const prefix = Object.keys(preparation).find(key => event.peripheral.startsWith(key));
    if (prefix) event.setup.unshift(preparation[prefix]);
  }

  function defaults() {
    return { sourceEnabled: true, nvicEnabled: true, primask: false, faultmask: false,
      basepri: 0, priority: 8, currentPriority: null, flag: false, pending: false,
      active: false, serviced: false, returned: false };
  }
  function blocked(event, state) {
    if (!event.route) return "This event causes a reset, not an interrupt.";
    if (state.active) return "The ISR is active. Service the event, then return.";
    if (!state.pending) return state.flag ? "The source is disabled. The event flag remains set." : "Trigger an event to set its status flag.";
    if (event.route.irq === -14) return null;
    if (event.route.irq >= 0 && !state.nvicEnabled) return "The NVIC enable bit is clear. The request remains pending.";
    if (state.faultmask) return "FAULTMASK blocks this interrupt.";
    if (state.primask) return "PRIMASK blocks this interrupt.";
    if (state.basepri && state.priority >= state.basepri) return "BASEPRI blocks this priority. The request remains pending.";
    if (state.currentPriority !== null && state.priority >= state.currentPriority) return "The current handler has equal or higher preemption priority.";
    return null;
  }
  function transition(event, state, action, values = {}) {
    const next = { ...state };
    if (!event.route) return next;
    if (action === "configure") {
      // Only configuration controls can change state through this action.
      for (const key of ["sourceEnabled", "nvicEnabled", "primask", "faultmask", "basepri", "priority", "currentPriority"]) {
        if (key in values) next[key] = values[key];
      }
      if (next.flag && next.sourceEnabled && event.request === "level" && !next.active) next.pending = true;
    } else if (action === "trigger") {
      next.flag = true;
      next.serviced = false;
      next.returned = false;
      if (next.sourceEnabled) next.pending = true;
    } else if (action === "enter" && !blocked(event, next)) {
      next.pending = false;
      next.active = true;
      next.returned = false;
    } else if (action === "service" && next.active) {
      next.flag = false;
      next.serviced = true;
    } else if (action === "return" && next.active) {
      next.active = false;
      next.returned = true;
      if (next.flag && next.sourceEnabled && event.request === "level") next.pending = true;
    } else if (action === "clearPending") {
      next.pending = false;
      if (next.flag && next.sourceEnabled && event.request === "level" && !next.active) next.pending = true;
    }
    return next;
  }
  function search(peripheral, query) {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return events.filter(event => {
      const text = [event.peripheral, event.title, event.condition, ...event.flags,
        ...event.enables, event.route?.name, event.route?.handler].join(" ").toLowerCase();
      return (!peripheral || event.peripheral === peripheral) && words.every(word => text.includes(word));
    });
  }

  const api = { routes, events, defaults, blocked, transition, search };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BluePillInterrupts = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
