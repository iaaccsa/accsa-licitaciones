# Feature 09 — Espacio independiente para UTE (proyecto Supabase separado)

Cubre ToDo item **19** ("Preparación de script de migración para crear un espacio
independiente para UTE...").

Complejidad: **alta** (infra + script de clonado de esquema + coordinación de
3 proyectos). Es la tarea más grande de la tanda.

---

## Estado actual

- Todo el sistema apunta a un único proyecto Supabase (`yeawvnrvnnbuiejvrzbt`):
  - API: `SUPABASE_URL` / `SUPABASE_KEY`.
  - Services: cada uno usa la API (no Supabase directo, salvo storage).
  - UI: `NEXT_PUBLIC_SUPABASE_URL` + claves (auth + storage).
- Tablas canónicas: `analyses`, `files`, `proposals`, `events`, `workflow_steps`,
  `workflow_phases`, `requirements`/`analysis_requirements`, `compliance_results`/
  `analysis_compliance_matrix`, `admissibility_requirements`,
  `admissibility_results`, `app_settings`, `service_prompts`, `ai_pricing`,
  `ai_usage`, `audit_logs`, `model_tiers`, vistas (`analyses_view`), triggers
  (audit append-only), RLS, enums.

## Decisión cerrada (encuesta)

**Proyecto Supabase separado**: una instancia/proyecto Supabase **nuevo y
aislado** para UTE. El script **clona el esquema (DDL)**: tablas, enums, índices,
vistas, triggers, RLS — al proyecto nuevo. **Datos 100% separados** (no se copian
datos productivos; el proyecto UTE arranca limpio, salvo seeds mínimos).

## Alcance de ESTE feature

El item dice "**preparación** de script de migración". Por lo tanto el entregable
es el **script + el procedimiento**, no necesariamente ejecutar el corte productivo.

## Componentes

### 1. Script de clonado de esquema (DDL)
- Generar el DDL completo del proyecto actual. Opciones:
  - `supabase db dump --schema public` (CLI) → `schema.sql` versionado, o
  - Reconstruir desde las migraciones ya aplicadas (MCP `list_migrations`).
- El script debe ser **idempotente** y crear en el proyecto UTE: schema `public`
  (tablas + enums + índices + constraints + vistas + triggers + funciones + RLS +
  policies). Sin datos, o con seeds mínimos:
  - `app_settings` (llm_config, hitl_config, notifications_config),
  - `ai_pricing` (11 filas), `model_tiers`, `service_prompts` (11 prompts; reusar
    `scripts/seed_prompts.py`).
- Storage: crear el/los buckets equivalentes (`artifacts`) con las mismas policies.

### 2. Auth del proyecto UTE
- Replicar la config de Auth (signups off, Site URL, redirect URLs, template de
  invite con `token_hash`, jwt_exp) — vía Management API (patrón de `feature-login.md`
  FASE 0).
- Crear usuario root de UTE con `app_metadata.role=administrator`.

### 3. Parametrización de los 3 proyectos
- Que API / UI / Services puedan apuntar a UTE cambiando **solo env vars**
  (SUPABASE_URL/KEY, NEXT_PUBLIC_SUPABASE_*, Qdrant si también se separa). Verificar
  que no haya project-ref hardcodeado (revisar `.mcp.json`, `mailgun.md`,
  `email_service.py` usa dominio fijo — OK).
- Decidir si UTE es **otro deploy** (otra app Vercel + otra API + otros ACA Jobs)
  o el mismo deploy multi-config. Lo más limpio para aislamiento real: deploy
  separado por tenant. **A confirmar antes de ejecutar.**

### 4. Qdrant
- Definir si UTE usa colecciones separadas en el mismo Qdrant (prefijo por
  `analysis_slug` ya aísla) o un Qdrant propio. Las colecciones ya van por
  `FILE_{slug}_...` / `PROPOSAL_{slug}_...`, así que el mismo Qdrant puede servir;
  evaluar aislamiento requerido.

## Proyectos afectados

| UI | API | Services | DB |
|----|-----|----------|----|
| Sí (env/deploy) | Sí (env/deploy) | Sí (env/deploy) | Sí (proyecto nuevo) |

## Verificación

- Script corre contra un proyecto Supabase vacío y deja el esquema idéntico al
  actual (comparar `list_tables` / dump del nuevo vs actual).
- Seeds mínimos presentes; sin datos productivos.
- Auth UTE: login root OK, invite flow OK.
- Un análisis de punta a punta en el entorno UTE no toca datos del proyecto
  original (aislamiento verificado).

## Riesgos / abierto

- **Mantenibilidad**: dos esquemas a mantener en paralelo. Toda migración futura
  debe aplicarse a ambos proyectos. Documentar el proceso (o automatizar el
  replay de migraciones).
- Costos (otro proyecto Supabase + posible otro deploy).
- Decisión deploy-separado vs multi-config: confirmar antes de ejecutar el corte.

## Nota

- Este feature es de **preparación**: dejar el script + el runbook listos. La
  ejecución del entorno productivo UTE es un paso posterior, fuera del alcance
  inmediato.
