---
status: proposed
date: 2026-09-30
decision-makers: Eloi, Marie
tags: [api]
---

# Format des identifiants publics

## Contexte et problématique

Les API exposent aujourd'hui les identifiants auto-incrémentés de la base, ce qui révèle des volumes et facilite l'énumération.

## Options envisagées

* UUID v7
* ULID
* Identifiants préfixés (`usr_…`)

## Avantages et inconvénients des options

### UUID v7

* Bon, car standard et triable dans le temps
* Mauvais, car long dans les URL

### ULID

* Bon, car court et triable
* Mauvais, car moins répandu dans nos bibliothèques

### Identifiants préfixés (`usr_…`)

Inspiré des API Stripe.

* Bon, car le type de ressource est lisible
* Mauvais, car format maison à documenter
