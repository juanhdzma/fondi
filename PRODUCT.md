# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Members of a private family investment pool review performance and ownership. An administrator records valuations, contributions, withdrawals, and participant changes.

## Product Purpose

Fondi makes a shared investment fund understandable at a glance: its current value, share price, accumulated return, each participant's ownership, and the history behind those figures.

## Positioning

It applies a mutual-fund share model to a small private pool, so contributions and withdrawals preserve each participant's proportional ownership without manual gain splitting.

## Operating Context

Participants primarily check the dashboard on phones. The administrator uses the same interface for occasional data entry and export or restore operations.

## Capabilities and Constraints

- The frontend is a responsive vanilla JavaScript dashboard backed by the existing HTTP API.
- Financial writes are append-only and some operations are destructive, so previews, validation, and confirmations must remain prominent.
- USD is the source currency; COP values and TRM provide local context.
- This redesign may change only the UI. Backend behavior and API contracts stay unchanged.

## Brand Commitments

- Product name: Fondi.
- Preserve the existing app icon.
- The interface should feel modern, calm, and materially Apple-like without imitating a specific Apple product.
- UI copy remains concise Spanish with no decorative emoji.

## Evidence on Hand

- Real interface copy and workflows live in `index.html` and `src/`.
- Representative desktop and mobile captures live in `docs/screenshots/`.
- No marketing claims, public customer proof, or finished brand system should be invented.

## Product Principles

- Make the fund's current state understandable within seconds.
- Keep financial data visually stable and easy to compare.
- Show the common read path first and keep administration explicit.
- Preserve agency and caution around irreversible writes.
- Prefer native web controls, direct labels, and accessible interaction.

## Accessibility & Inclusion

Keyboard navigation, visible focus, semantic labels, 44px touch targets, reduced motion, reduced transparency, and increased contrast preferences must remain supported.
