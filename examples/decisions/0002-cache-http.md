---
status: proposed
date: 2026-09-20
decision-makers: Eloi, Karim
tags: [backend, performance]
---

# Stratégie de cache des réponses HTTP

## Context and Problem Statement

Les pages catalogue représentent 70 % du trafic et sont recalculées à chaque requête. Le temps de réponse médian dépasse 600 ms aux heures de pointe.

Nous voulons diviser ce temps par trois sans complexifier l'invalidation des données produits.

## Decision Drivers

* Temps de réponse médian sous 200 ms
* Invalidation simple à la mise à jour d'un produit

## Considered Options

* Cache applicatif Redis
* CDN avec stale-while-revalidate
* Statu quo et optimisation SQL

## Pros and Cons of the Options

### Cache applicatif Redis

Mise en cache des fragments calculés, invalidation explicite à la mise à jour d'un produit.

* Good, because contrôle fin, invalidation précise
* Bad, because code d'invalidation à maintenir

### CDN avec stale-while-revalidate

En-têtes Cache-Control adaptés et purge par tag côté CDN.

* Good, because aucune infra à opérer, gain mondial
* Bad, because données potentiellement périmées quelques secondes

### Statu quo et optimisation SQL

Index manquants et requêtes N+1 corrigées avant toute couche de cache.

* Good, because traite la cause, pas le symptôme
* Bad, because gain incertain
