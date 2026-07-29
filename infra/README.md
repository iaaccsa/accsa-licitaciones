# infra

Todo lo relacionado con el despliegue on-prem de Licitaciones en las dos VMs
entregadas por infraestructura ACCSA.

| Documento | VM | Rol |
|-----------|----|-----|
| [`vm-app.md`](vm-app.md) | ACCSA-SerProIA-VM1 (`10.97.0.11`) | Frontend (Next.js) + Backend (FastAPI), en Docker, tras nginx con HTTPS |
| [`vm-services.md`](vm-services.md) | ACCSA-SerProIA-VM2 (`10.97.0.12`) | Capa de servicios (jobs Docker) + Docker Registry privado |
| [`hardening.md`](hardening.md) | Ambas | Las 16 medidas de hardening aplicadas + hallazgos que condicionan el diseño |
| [`github-runner.md`](github-runner.md) | VM2 | Pasos en GitHub para el runner self-hosted + riesgos |
| [`ci.md`](ci.md) | VM2 | Los tres workflows de build, uno por proyecto |
| `scripts/` | Ambas | Idempotentes. Hardening: `harden-base.sh`, `harden-ssh.sh`, `harden-firewall.sh`, `docker-firewall.sh`. Despliegue: `docker-install.sh`, `registry-deploy.sh` y `executor-deploy.sh` (VM2), `app-deploy.sh` (VM1) |
| `vm-credentials.md` | Ambas | **Secreto.** Contrasenas de `root` y `sysadmin`. Ignorado por git, permisos 600 |

## Estado global

| Fase | Estado |
|------|--------|
| 0. Acceso por certificado (SSH key) | Hecho - 2026-07-28 |
| 1. Rotación de credenciales root/sysadmin | Hecho - 2026-07-28 |
| 2. Hardening base + baseline del SO | Hecho - 2026-07-28 (ver `hardening.md`) |
| 3. Ampliación de LVM + LV dedicado a Docker (ambas) | Hecho - 2026-07-28 |
| 4. VM2: Docker + Registry privado | Hecho - 2026-07-28 |
| 5. VM2: runner self-hosted de GitHub | Hecho - 2026-07-28 (registrado y escuchando) |
| 5b. VM2: workflow de build -> registry | Hecho - 2026-07-28 (ver `ci.md`) |
| 6. VM2: runner de jobs (reemplazo de Azure Container Apps Jobs) | Código hecho 2026-07-28, sin desplegar (ver `features/pending/12-ejecutor-jobs-on-prem.md`) |
| 7. VM1: Docker + compose (ui, api) | Script escrito (`scripts/app-deploy.sh`), sin ejecutar. Sin nginx: el TLS lo termina el proxy corporativo |
| 8. Migración de config y e2e | Pendiente |

## Acceso rápido

Requiere VPN (interfaz `utun8`, red `10.97.0.0/28` alcanzable desde `10.97.200.40`).

```bash
ssh vm1-app        # sysadmin@10.97.0.11
ssh vm2-services   # sysadmin@10.97.0.12
```

Alias definidos en `~/.ssh/config` del equipo de desarrollo, clave
`~/.ssh/accsa_vm_ed25519`.

## Decisiones abiertas (bloquean fases posteriores)

1. **Alcance de la migración**: las VMs reemplazan Vercel (UI + API) y Azure
   Container Apps Jobs (servicios), pero Supabase y Qdrant siguen siendo SaaS
   externos. Confirmar.
2. ~~Conectividad GitHub Actions -> VM2~~: resuelto con un **runner self-hosted
   en VM2**. Pasos en `github-runner.md`.
3. **Exposición pública de la UI**: si la app debe ser accesible fuera de la red
   10.97.x hace falta publicación/NAT + certificado TLS.
4. **Restricción por IP en el FortiGate**: el gateway hace SNAT de toda la VPN a
   `10.97.0.1`, así que las VMs no distinguen quién se conecta. Cualquier
   restricción más fina que `10.97.0.0/28` tiene que ser política del Forti.
