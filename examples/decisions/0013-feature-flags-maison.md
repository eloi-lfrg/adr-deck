---
status: rejected
date: 2025-09-03
decision-makers: Karim
consulted: Marie
tags: [infra, outillage]
---

# Build an in-house feature flag service

## Context and Problem Statement

Continuous deployment (ADR-0012) relies on feature flags. Flags currently live in environment variables and changing one requires a redeploy. Should we build our own flag service?

## Considered Options

* In-house service
* Hosted open source (Unleash)

## Decision Outcome

Rejected, because Unleash covers our needs and maintaining a flag service is not our job.

## Pros and Cons of the Options

### In-house service

* Good, because tailored to our deployment
* Bad, because one more critical service to run and secure

### Hosted open source (Unleash)

* Good, because SDKs for every language we use
* Bad, because one more dependency in the infrastructure
