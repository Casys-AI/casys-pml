# Monitoring Localhost Rebind Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restrict the monitoring stack to localhost-only bindings so observability ports are not exposed on the public interface.

**Architecture:** Keep the existing Docker services and internal bridge networking unchanged, but replace host port publications on `0.0.0.0` with explicit `127.0.0.1` bindings. Public ingress remains limited to `22`, `80`, and `443`, while local access and container-to-container traffic continue to work.

**Tech Stack:** Docker Compose, UFW, nftables, Grafana, Loki, Prometheus, Alloy, Jaeger

---

### Task 1: Rebind monitoring services to localhost

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Update published ports**

Change the published ports for `loki`, `alloy`, `prometheus`, `grafana`, and `jaeger` from wildcard host bindings to `127.0.0.1`.

**Step 2: Preserve internal networking**

Do not change container ports, service names, or the `monitoring` bridge network so existing service discovery continues to work.

### Task 2: Apply and verify

**Files:**
- Modify: `docker-compose.yml`
- Reference: `docs/plans/2026-03-06-monitoring-localhost-rebind.md`

**Step 1: Restart the affected services**

Run Docker Compose to recreate only the monitoring services whose published ports changed.

**Step 2: Verify host listeners**

Confirm the published ports now listen on `127.0.0.1` only and are no longer exposed on public interfaces.

**Step 3: Verify service health**

Check `docker ps` and confirm the monitoring stack is still up.
