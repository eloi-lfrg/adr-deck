---
status: accepted
date: 2025-05-20
decision-makers: Karim, Eloi
informed: Équipe support
tags: [infra]
---

# Déploiement continu depuis la branche principale

## Context and Problem Statement

Les mises en production ont lieu une fois par mois, le jeudi soir. Chaque livraison regroupe une quarantaine de changements : un incident est long à diagnostiquer et les retours en arrière sont risqués.

## Decision Drivers

* Réduire la taille des livraisons
* Pouvoir revenir en arrière en quelques minutes

## Considered Options

* Déploiement continu
* Livraison hebdomadaire

## Decision Outcome

Chosen option: "Déploiement continu", because les tests de bout en bout sont désormais assez fiables pour bloquer une livraison défectueuse.

### Confirmation

La revue trimestrielle des incidents vérifie qu'aucune mise en production n'a contourné le pipeline.

## Pros and Cons of the Options

### Déploiement continu

Chaque fusion sur `main` part en production après les tests, derrière des feature flags pour les changements visibles.

* Good, because des livraisons petites et faciles à annuler
* Bad, because impose des feature flags pour les fonctionnalités longues

### Livraison hebdomadaire

* Good, because un rythme connu du support
* Bad, because les livraisons restent groupées
