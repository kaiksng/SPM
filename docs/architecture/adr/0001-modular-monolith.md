# ADR 0001: Use a modular monolith

- Status: Accepted (amended: the Next.js choice was superseded, see below)
- Date: 2026-09-06

## Decision

Build one application, organised into feature modules, backed by one Supabase project.

> **Amendment:** this ADR originally named a single Next.js application. The team later split the delivery layer into a React + Vite single-page app (`apps/frontend`) and a thin Express API (`apps/backend`) in one pnpm monorepo with a shared package (`packages/shared`). The modular-monolith decision itself stands: one codebase, one database, no network-separated services. See [System architecture](../README.md).

## Why

The six-person team has four short sprints. A modular monolith keeps deployment, transactions, debugging, and local setup simple while still separating business capabilities. Microservices would add network contracts, infrastructure, and distributed failure modes without product value at this stage.

## Consequences

Features must respect module boundaries and avoid placing business logic in pages. A module can be extracted later only if scale or ownership proves that separation is needed.
