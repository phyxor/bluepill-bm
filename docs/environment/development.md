<!--
Copyright (C) 2026 Phyxor Microsystems
SPDX-FileContributor: Pablo Palazon

SPDX-License-Identifier: BSD-3-Clause
-->

# Development Environment

This page describes the tools I use and the tools this project requires. I
chose open-source, well-known tools to develop my own embedded workflow and
avoid vendor lock-in. This approach also lets me use the same workflow with
different development boards or computers.

## Personal tool preferences

I use [Arch Linux](https://archlinux.org) as my main operating system. This
Linux distribution contains the latest application versions and lets me
customize my system as I like. I've been using it for more than 10 years, and I
think it's the best Linux distribution ever built. I keep my configuration in a
[dotfiles](https://github.com/ppalazon/dotfiles) repository if you are
interested in it.

To edit this project, I use [Neovim](https://neovim.io). It is a very
sophisticated editor, but it can be tricky to learn from scratch. You can adapt
it to your workflow by modifying the configuration files or using well-made
plugins. I have shared my
[Neovim configuration](https://github.com/ppalazon/nvim) if you are interested
in it too.

I also use [OpenCode](https://opencode.ai), which provides an agent harness for
large language models (LLMs). I do not let an AI agent do all the work, but I
do not think I could learn all the necessary embedded-programming concepts
without LLMs. I write some code myself to understand where I can introduce
abstractions instead of copying and pasting as an LLM might.

I use [Herdr](https://herdr.dev) as a terminal multiplexer that keeps my
workspaces and code agents in the same terminal. When developing an embedded
application, I often need several related terminals for one workspace. Those
terminals can become difficult to manage across projects because I cannot tell
which process belongs to a specific workspace. Herdr keeps them under control.

## Project tool requirements

One of the most important tools for an embedded project is the toolchain. This
board uses an ARM Cortex-M3 microcontroller. We need specific tools to
cross-compile applications on an x86 computer. I installed the
`arm-none-eabi-*` packages from the Arch repository. They target the ARM
Embedded Application Binary Interface (EABI); `none` indicates that the target
has no operating system (Bare Metal).

To connect to the board and flash it, I use
[Open On-Chip Debugger (OpenOCD)](https://openocd.org/). Once you've built the
`ELF` file using the toolchains for ARM, you can copy it to the Flash memory of
the microcontroller. OpenOCD detects the ST-Link V2 device that actually
programs the board.

I use Python packages such as `mkdocs` for documentation, but I do not install
them as system packages. I prefer to use a Python virtual environment with
specific versions. To control this environment, I use
[mise](https://mise.jdx.dev) that lets me define tool versions, environment
variables in a single `mise.toml` file.
