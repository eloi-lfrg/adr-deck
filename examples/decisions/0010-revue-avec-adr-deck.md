---
status: proposed
date: 2026-10-07
decision-makers: Eloi, Marie
consulted: Karim
informed: Engineering team
tags: [outillage]
---

# Review our ADRs with ADR Deck

## Context and Problem Statement

Our ADRs are Markdown files in the repository. Reviewing them as a team is tedious: someone scrolls through files during the meeting, decisions are noted elsewhere, then copied back into the files by hand — or forgotten. How do we review ADRs together and record each decision where it belongs?

## Decision Drivers

* Decisions written straight into the MADR files, nothing to copy afterwards
* A meeting that keeps its pace: one ADR at a time, readable when the screen is shared
* No server, account or database to maintain

## Considered Options

* ADR Deck
* Pull request reviews
* Shared document during the meeting

## Decision Outcome

Chosen option: "ADR Deck", because it records each decision in the file during the meeting.

## Pros and Cons of the Options

### ADR Deck

A local web app run from the repository: one ADR per slide, one decision per click.

* Good, because the decision, its date and its justification are written in the MADR file
* Good, because it runs locally, on the files themselves
* Bad, because everyone who leads a review needs Node.js and `npm run install:global`

### Pull request reviews

* Good, because the review stays in the usual tooling
* Bad, because a thread of comments is not a meeting: decisions drag on

### Shared document during the meeting

* Good, because anyone can follow without installing anything
* Bad, because the decisions must then be copied back into the ADR files
