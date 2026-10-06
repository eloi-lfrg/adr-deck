---
status: accepted
date: 2026-10-05
decision-makers: Eloi, Marie
tags: [backend, infra]
---

# Choix de la file de messages

## Context and Problem Statement

Les traitements asynchrones passent aujourd'hui par des tâches cron. Nous avons besoin de reprises sur erreur et de visibilité.

## Considered Options

* PostgreSQL comme file (pg-boss)
* RabbitMQ

## Decision Outcome

Chosen option: "PostgreSQL comme file (pg-boss)", because suffisant pour nos volumes ; on réévalue à 5 000 jobs/min.

### Consequences

* Good, because aucune infrastructure supplémentaire.
* Bad, because le débit plafonne au-delà de quelques milliers de jobs par minute.

## Pros and Cons of the Options

### PostgreSQL comme file (pg-boss)

Réutilise la base existante, pas de nouveau service.

* Good, because zéro infra en plus, transactions partagées
* Bad, because débit limité au-delà de quelques milliers de jobs/min

### RabbitMQ

Broker dédié, éprouvé.

* Good, because débit, routage riche
* Bad, because un service de plus à opérer
