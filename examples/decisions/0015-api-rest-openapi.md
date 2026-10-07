---
status: accepted
date: 2026-04-08
decision-makers: Eloi, Marie
consulted: Intégrateurs partenaires
tags: [api]
---

# API publique REST décrite en OpenAPI

## Context and Problem Statement

Six mois après le lancement de l'API GraphQL (ADR-0014), les intégrateurs l'utilisent peu : ils demandent des webhooks, des SDK générés et une documentation de référence.

## Decision Drivers

* Adoption par les intégrateurs
* Génération des SDK et de la documentation

## Considered Options

* REST et OpenAPI
* Garder GraphQL et ajouter des webhooks

## Decision Outcome

Chosen option: "REST et OpenAPI", because la spécification OpenAPI produit à la fois la documentation, les SDK et les tests de contrat.

## Pros and Cons of the Options

### REST et OpenAPI

* Good, because outillage standard pour les intégrateurs
* Bad, because l'API GraphQL doit être maintenue six mois de plus

### Garder GraphQL et ajouter des webhooks

* Good, because pas de seconde API à construire
* Bad, because ne répond pas à la demande de SDK
