---
status: accepted
date: 2025-02-12
decision-makers: Marie
consulted: Eloi
tags: [outillage, front]
---

# Enable TypeScript strict mode in every package

## Context and Problem Statement

Half of our packages compile with `strict: false`. Bugs caused by `undefined` values reach production regularly, and type errors fixed in one package come back through another. Should strict mode become the rule?

## Decision Drivers

* Fewer runtime errors on `null` and `undefined`
* Migration effort for the existing code

## Considered Options

* Strict mode everywhere
* Strict mode for new packages only

## Decision Outcome

Chosen option: "Strict mode everywhere", because the migration took less than two days on a trial package.

### Consequences

* Good, because `noUncheckedIndexedAccess` caught three real bugs during the trial
* Bad, because some legacy modules carry `// @ts-expect-error` until they are rewritten

### Confirmation

CI fails when a package `tsconfig.json` does not extend the strict base configuration.

## Pros and Cons of the Options

### Strict mode everywhere

* Good, because one set of rules for the whole codebase
* Bad, because the migration blocks other work for a few days

### Strict mode for new packages only

* Good, because no migration
* Bad, because shared types stay loose
