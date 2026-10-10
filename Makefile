# Copyright (C) 2026 Phyxor Microsystems
# SPDX-FileContributor: Pablo Palazon
#
# SPDX-License-Identifier: BSD-3-Clause

APP ?= bare-blink
PROJECT := bluepill-$(APP)

BUILD_DIR := build
OBJECT_DIR := $(BUILD_DIR)/$(APP)
SYSTEM_DIR := system
APP_DIR := apps/$(APP)
CMSIS_DRIVER_DIR := drivers/cmsis
LINKER_SCRIPT := linker/STM32F103C8TX_FLASH.ld
OPENOCD_CFG := openocd/bluepill.cfg
CMSIS_CORE_INC := vendor/STM32CubeF1/Drivers/CMSIS/Core/Include
CMSIS_DEVICE_INC := vendor/STM32CubeF1/Drivers/CMSIS/Device/ST/STM32F1xx/Include

CC := arm-none-eabi-gcc
OBJCOPY := arm-none-eabi-objcopy
SIZE := arm-none-eabi-size
NM := arm-none-eabi-nm
OBJDUMP := arm-none-eabi-objdump
READELF := arm-none-eabi-readelf
GDB := arm-none-eabi-gdb
OPENOCD := openocd

CPU_FLAGS := -mcpu=cortex-m3 -mthumb
COMMON_FLAGS := $(CPU_FLAGS) -Wall -Wextra -Werror -ffunction-sections -fdata-sections -g3 -O0
CFLAGS := $(COMMON_FLAGS) -std=c11 -Iinclude -MMD -MP
ASFLAGS := $(COMMON_FLAGS) -x assembler-with-cpp
LDFLAGS := $(CPU_FLAGS) -T$(LINKER_SCRIPT) -nostartfiles -Wl,--gc-sections -Wl,-Map=$(BUILD_DIR)/$(PROJECT).map --specs=nano.specs --specs=nosys.specs
LDLIBS := -lm

CMSIS_CFLAGS := -I$(CMSIS_CORE_INC) -I$(CMSIS_DEVICE_INC) -DUSE_CMSIS -DSTM32F103xB

ifneq ($(filter cmsis-%,$(APP)),)
 CFLAGS += $(CMSIS_CFLAGS) -I$(CMSIS_DRIVER_DIR)
else ifeq ($(filter bare-%,$(APP)),)
 $(error Unsupported APP layer '$(APP)': expected bare-* or cmsis-*)
endif

C_SOURCES := $(wildcard $(SYSTEM_DIR)/*.c)
C_SOURCES += $(wildcard $(APP_DIR)/*.c)
ifneq ($(filter cmsis-%,$(APP)),)
C_SOURCES += $(wildcard $(CMSIS_DRIVER_DIR)/*.c)
else
# Bare firmware uses local registers for SystemInit and has no CMSIS dependency.
C_SOURCES := $(filter-out $(SYSTEM_DIR)/system_stm32f103.c,$(C_SOURCES))
C_SOURCES += $(wildcard $(SYSTEM_DIR)/bare/*.c)
endif
ASM_SOURCES :=

ifeq ($(wildcard $(APP_DIR)),)
$(error Unknown APP '$(APP)': expected directory $(APP_DIR))
endif

OBJECTS := $(patsubst %.c,$(OBJECT_DIR)/%.o,$(C_SOURCES))
OBJECTS += $(patsubst %.s,$(OBJECT_DIR)/%.o,$(ASM_SOURCES))
DEPFILES := $(OBJECTS:.o=.d)

ELF := $(BUILD_DIR)/$(PROJECT).elf
BIN := $(BUILD_DIR)/$(PROJECT).bin
HEX := $(BUILD_DIR)/$(PROJECT).hex

.PHONY: all clean flash openocd debug-server debug size nm objdump readelf

all: $(ELF) $(BIN) $(HEX) size

$(ELF): $(OBJECTS) $(LINKER_SCRIPT)
	$(CC) $(OBJECTS) $(LDFLAGS) $(LDLIBS) -o $@

$(OBJECT_DIR)/%.o: %.c
	mkdir -p $(dir $@)
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJECT_DIR)/%.o: %.s
	mkdir -p $(dir $@)
	$(CC) $(ASFLAGS) -c $< -o $@

$(BIN): $(ELF)
	$(OBJCOPY) -O binary $< $@

$(HEX): $(ELF)
	$(OBJCOPY) -O ihex $< $@

size: $(ELF)
	$(SIZE) $<

nm: $(OBJECTS)
	$(NM) -n $(OBJECTS)

objdump: $(ELF)
	$(OBJDUMP) -h $<

readelf: $(ELF)
	$(READELF) -S $<

flash: $(ELF)
	$(OPENOCD) -f $(OPENOCD_CFG) -c "program $(ELF) verify reset exit"

openocd:
	$(OPENOCD) -f $(OPENOCD_CFG)

debug-server: $(ELF)
	$(OPENOCD) -f $(OPENOCD_CFG) \
		-c "program $(ELF) verify" \
		-c "reset halt"

debug: $(ELF)
	$(GDB) $(ELF) -ex "target extended-remote localhost:3333" -ex "monitor reset halt"

clean:
	rm -rf $(BUILD_DIR)

-include $(DEPFILES)
