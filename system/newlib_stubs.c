/*
 * Copyright (C) 2026 Phyxor Microsystems
 * SPDX-FileContributor: Pablo Palazon
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/*
 * Minimal Newlib system-call stubs for a bare-metal Cortex-M program.
 *
 * Newlib is the C library used by arm-none-eabi-gcc. Some C library functions
 * expect operating-system services such as files, processes, and heap growth.
 * On bare metal there is no OS, so this file provides the small set of symbols
 * needed to link those features.
 */

#include <errno.h>
#include <stddef.h>
#include <stdint.h>
#include <sys/stat.h>
#include <sys/types.h>

extern uint8_t _end;
extern uint8_t _estack;
extern uint32_t _Min_Stack_Size;

int board_putchar(int ch) __attribute__((weak));
int board_getchar(void) __attribute__((weak));

char *__env[1] = {0};
char **environ = __env;

void *_sbrk(ptrdiff_t incr) {
    static uint8_t *heap_end;
    uint8_t *previous_heap_end;
    const uintptr_t stack_limit = (uintptr_t)&_estack - (uintptr_t)&_Min_Stack_Size;

    if (heap_end == NULL) {
        heap_end = &_end;
    }

    if ((uintptr_t)(heap_end + incr) > stack_limit) {
        errno = ENOMEM;
        return (void *)-1;
    }

    previous_heap_end = heap_end;
    heap_end += incr;

    return previous_heap_end;
}

int _write(int file, char *ptr, int len) {
    (void)file;

    if (board_putchar == NULL) {
        errno = ENOSYS;
        return -1;
    }

    for (int i = 0; i < len; i++) {
        if (board_putchar(ptr[i]) < 0) {
            return -1;
        }
    }

    return len;
}

int _read(int file, char *ptr, int len) {
    (void)file;

    if (board_getchar == NULL) {
        errno = ENOSYS;
        return -1;
    }

    for (int i = 0; i < len; i++) {
        const int ch = board_getchar();

        if (ch < 0) {
            return i;
        }

        ptr[i] = (char)ch;
    }

    return len;
}

int _close(int file) {
    (void)file;
    errno = ENOSYS;
    return -1;
}

int _fstat(int file, struct stat *st) {
    (void)file;
    st->st_mode = S_IFCHR;
    return 0;
}

int _isatty(int file) {
    (void)file;
    return 1;
}

int _lseek(int file, int offset, int whence) {
    (void)file;
    (void)offset;
    (void)whence;
    return 0;
}

int _open(const char *path, int flags, ...) {
    (void)path;
    (void)flags;
    errno = ENOSYS;
    return -1;
}

int _unlink(const char *name) {
    (void)name;
    errno = ENOSYS;
    return -1;
}

int _getpid(void) {
    return 1;
}

int _kill(int pid, int sig) {
    (void)pid;
    (void)sig;
    errno = ENOSYS;
    return -1;
}

void _exit(int status) {
    (void)status;

    while (1) {}
}
