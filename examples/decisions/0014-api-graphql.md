---
status: superseded by ADR-0015
date: 2026-04-08
decision-makers: Eloi, Marie
tags: [api]
---

# API publique en GraphQL

## Context and Problem Statement

Les intégrateurs demandent une API publique pour lire les commandes et les catalogues. Quel style d'API leur proposer ?

## Considered Options

* GraphQL
* REST

## Decision Outcome

Superseded by ADR-0015, because les intégrateurs ont massivement demandé des webhooks et une documentation OpenAPI.

## Pros and Cons of the Options

### GraphQL

* Good, because les clients choisissent les champs dont ils ont besoin
* Bad, because cache HTTP et limitation de débit plus difficiles

### REST

* Good, because familier pour tous les intégrateurs
* Bad, because plusieurs appels pour reconstituer une commande complète
