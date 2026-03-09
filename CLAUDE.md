# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Crosspoint Vocabulary Builder** is a UI/UX design and development project to create a vocabulary builder and dictionary tool for the [Crosspoint Reader](https://github.com/crosspoint-reader/crosspoint-reader) — an open-source firmware for the Xteink X4 e-paper device.

Crosspoint's SCOPE.md explicitly includes **"Reference Tools: Local dictionary lookup — providing quick, offline definitions to enhance comprehension without breaking focus"** as an in-scope feature. This project designs and prototypes that feature.

## Crosspoint Hardware Constraints

The Xteink X4 runs an **ESP32-C3** microcontroller with severe resource limits that must inform all design decisions:

- ~380KB usable RAM
- Single-core CPU
- E-paper display (slow refresh, no color, no animations)
- SD card for storage/caching
- No persistent internet connection (WiFi is used briefly for book uploads and OTA updates)
- Battery-powered — efficiency matters

The firmware is written in C/C++ (85%/14%) and built with PlatformIO (`pio run --target upload`).

## Design Principles

1. **Offline-first** — Dictionary data must work entirely from local storage (SD card). No cloud lookups.
2. **Minimal RAM footprint** — Follow Crosspoint's caching pattern: process data and store results on SD card in a `.crosspoint/` directory structure, load only what's needed.
3. **Non-disruptive** — Dictionary lookup should enhance reading without breaking focus. Quick in, quick out.
4. **E-ink friendly** — Design for binary (black/white) display, no animations, minimal full-screen refreshes. Every UI element must be legible at e-paper resolution.
5. **Consistent with Crosspoint UX** — Match existing navigation patterns, button mappings, and UI conventions from the reader.

## Project Scope

### What We're Building
- Dictionary lookup UI — word selection → definition display flow
- Vocabulary list — save/review looked-up words
- Dictionary data format — compact, SD-card-friendly format for offline dictionaries
- Integration design — how this feature fits into Crosspoint's existing reading UI

### What We're NOT Building
- The Crosspoint firmware itself
- Online/cloud dictionary services
- Complex annotation or note-taking (explicitly out-of-scope per Crosspoint)
- Flashcard or spaced-repetition systems (keep it focused on the reading experience)

## User Context

The project owner is a UI/UX designer, not a programmer. Claude should:
- Explain technical decisions clearly and without jargon
- Provide complete, working code — not snippets that assume existing knowledge
- Prefer simple, proven approaches over clever abstractions
- When building prototypes or tools, include clear instructions for running them
- Flag when something requires hardware testing vs. what can be validated in a browser/emulator

## Key References

- Crosspoint GitHub: https://github.com/crosspoint-reader/crosspoint-reader
- Crosspoint scope document: `SCOPE.md` in the Crosspoint repo
- Crosspoint user guide: `USER_GUIDE.md` in the Crosspoint repo
- Crosspoint file formats: `docs/file-formats.md` in the Crosspoint repo
- Crosspoint caching pattern: `.crosspoint/epub_[hash]/` directory structure on SD card
