---
status: proposed
date: 2026-09-24
decision-makers: Marie, Karim
tags: [sécurité]
---

# Authentification des API internes

## Context and Problem Statement

Les services internes s'appellent aujourd'hui sans authentification, protégés par le seul réseau privé. Un audit demande une authentification de service à service.

## Considered Options

* mTLS via le service mesh
* Jetons JWT signés par un fournisseur interne

## Decision Outcome

Chosen option: "mTLS via le service mesh", because le mesh est déjà déployé sur tous les clusters.

## Pros and Cons of the Options

### mTLS via le service mesh

* Good, because transparent pour le code applicatif
* Bad, because dépendance forte au mesh

### Jetons JWT signés par un fournisseur interne

* Good, because portable hors du mesh
* Bad, because rotation des clés à gérer dans chaque service
