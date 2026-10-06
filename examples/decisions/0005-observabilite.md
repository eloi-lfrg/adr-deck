---
status: deferred
date: 2026-10-01
next-review: 2026-11-15
decision-makers: Karim
tags: [infra]
---

# Plateforme d'observabilité

## Context and Problem Statement

Les journaux, métriques et traces sont dispersés entre trois outils. Le contrat de l'outil de traces arrive à échéance en décembre.

## Considered Options

* Grafana Cloud (LGTM)
* Datadog
* OpenTelemetry et stack auto-hébergée

## Decision Outcome

Deferred, because attendre les devis des deux éditeurs.

## Pros and Cons of the Options

### Grafana Cloud (LGTM)

* Good, because tarification à l'usage

### Datadog

* Good, because produit complet, peu d'intégration
* Bad, because coût élevé à notre volume

### OpenTelemetry et stack auto-hébergée

* Good, because aucune dépendance éditeur
* Bad, because une équipe à mobiliser pour l'opérer
