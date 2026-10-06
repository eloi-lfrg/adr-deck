---
status: rejected
date: 2026-10-02
decision-makers: Eloi
tags: [outillage]
---

# Passage en monorepo

## Context and Problem Statement

Douze dépôts partagent des bibliothèques communes ; chaque montée de version demande une dizaine de pull requests.

## Considered Options

* Monorepo avec Nx
* Statu quo avec Renovate

## Decision Outcome

Rejected, because le coût de migration de la CI est trop élevé ce trimestre.

## Pros and Cons of the Options

### Monorepo avec Nx

* Good, because modifications atomiques entre projets
* Bad, because migration lourde de la CI

### Statu quo avec Renovate

* Good, because aucun changement d'organisation
* Bad, because les montées de version restent fragmentées
