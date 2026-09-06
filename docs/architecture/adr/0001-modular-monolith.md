# ADR 0001: Use a modular monolith

- Status: Accepted
- Date: 2026-09-06

## Decision

Build one Next.js application, organised into feature modules, backed by one Supabase project.

## Why

The six-person team has four short sprints. A modular monolith keeps deployment, transactions, debugging, and local setup simple while still separating business capabilities. Microservices would add network contracts, infrastructure, and distributed failure modes without product value at this stage.

## Consequences

Features must respect module boundaries and avoid placing business logic in pages. A module can be extracted later only if scale or ownership proves that separation is needed.
