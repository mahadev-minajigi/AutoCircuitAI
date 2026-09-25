# AutoCircuit AI

AutoCircuit AI is an AI-assisted hardware design prototype that converts natural-language hardware requirements into an initial electronic design. The system helps users describe a project in simple English and then generates a basic design workflow that includes component selection, circuit connections, pin mapping, BOM generation, starter firmware, rule-based DRC checks, and a PCB preview.

Live demo: https://auto-circuit-ai.vercel.app/

## Project Goal

The main objective of AutoCircuit AI is to reduce the time and effort needed for early-stage electronic prototyping. Instead of manually designing the entire circuit from scratch, users can describe the requirement and receive a structured starting point for supported hardware scenarios.

This project is designed as a prototype and educational proof-of-concept. It is not a full professional EDA replacement, but it demonstrates how AI-assisted design generation can support beginner-friendly electronics design and rapid concept validation.

## Current Prototype Capabilities

The prototype currently demonstrates the following:

- Natural-language hardware requirement input
- Requirement interpretation for supported use cases
- Component selection for common embedded designs
- Auto-generated circuit connection suggestions
- MCU-to-component pin mapping
- Bill of Materials (BOM) generation
- Rule-based electrical validation using basic DRC checks
- Starter firmware generation
- Simple PCB layout preview

## Example Supported Use Case

Example prompt:

> Design a temperature, humidity and pressure monitoring system using ESP32, BME280 and OLED display.

The current system generates a consistent demo based on this prompt, including:

- ESP32-based design
- BME280 sensor selection
- OLED display integration
- I2C communication mapping
- BOM list with estimated cost
- firmware starter code
- DRC validation output
- PCB preview

## Workflow

User Prompt
→ Requirement Analysis
→ Component Selection
→ Circuit Generation
→ Pin Mapping
→ DRC Validation
→ BOM
→ Firmware
→ PCB Preview

## Project Scope and Limitations

AutoCircuit AI is intentionally focused on the prototype stage. It is best described as:

- AI-assisted hardware design and circuit generation
- Rule-based electrical validation
- Educational and prototype-focused EDA assistance

It does not claim to be a full autonomous professional PCB designer or manufacturing-grade tool. The current system is built to support initial concept generation and learning-oriented hardware design workflows.

## Tech Stack

- React
- TypeScript
- Vite
- CSS-based UI
- Component-driven design interface

## Run Locally

```bash
npm install
npm run dev
```

Then open the local Vite URL in the browser.

## Build

```bash
npm run build
```

## Project Status

This project is a first-review prototype demonstrating the core concept of AI-assisted electronics design generation. The current implementation focuses on clarity, consistency, and a real demo flow that can be shown to reviewers without overstating the project scope.

## Repository

GitHub: https://github.com/mahadev-minajigi/AutoCircuitAI.git

## Live Deployment

https://auto-circuit-ai.vercel.app/
