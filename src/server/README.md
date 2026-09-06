# Shared server code

This directory contains backend concerns shared across multiple product features, including authentication, authorization helpers, audit behaviour, and normalized application errors.

Feature-specific reads and writes remain in `src/features/<feature>/queries` and `src/features/<feature>/actions`. Files in this directory must be marked `server-only` whenever importing credentials or privileged infrastructure.
