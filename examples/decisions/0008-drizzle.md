---
status: accepted
date: 2026-09-15
decision-makers: Marie, Karim
tags: [backend]
---

# Accès aux données avec Drizzle

## Context and Problem Statement

TypeORM (ADR-0007) ne fournit pas un typage suffisant des requêtes et freine les migrations.

## Considered Options

* Drizzle ORM
* Prisma
* Kysely

## Decision Outcome

Chosen options: "Drizzle ORM" and "Kysely", because Drizzle pour le schéma et les migrations, Kysely pour les requêtes analytiques.

## Pros and Cons of the Options

### Drizzle ORM

* Good, because schéma en TypeScript, migrations générées

### Prisma

* Good, because outillage mature
* Bad, because moteur de requêtes séparé

### Kysely

* Good, because constructeur de requêtes entièrement typé
