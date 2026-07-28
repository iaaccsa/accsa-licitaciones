# Runbook — Espacio independiente para UTE (proyecto Supabase separado)

Cubre el feature 09 (`features/pending/09-ute-proyecto-supabase-separado.md`,
ToDo item 19). Este entregable es de **preparación**: deja listos el script
(`clone_ute.py`) y el procedimiento. La ejecución del corte productivo es un
paso posterior.

Estrategia de clonado: la fuente de verdad del esquema es el **historial de
migraciones** del proyecto origen (`supabase_migrations.schema_migrations`, 95
migraciones, ~93 KB). El script las **reaplica** una a una, en orden de versión,
en el proyecto UTE, y copia las filas de bookkeeping para que UTE arranque en el
mismo HEAD de migración. Así las migraciones futuras (vía MCP `apply_migration`)
se aplican igual a ambos proyectos. **No se copian datos productivos**; solo
catálogos de referencia.

Snapshot del origen al momento de escribir (verificación esperada en UTE):

| objeto        | n  |
|---------------|----|
| tablas        | 23 |
| vistas        | 6  |
| enums         | 17 |
| funciones     | 4  |
| triggers      | 9  |
| RLS policies  | 6  |
| secuencias    | 1  |
| migraciones   | 95 |

Proyecto origen: `yeawvnrvnnbuiejvrzbt` (ver `.mcp.json`).

---

## Decisiones a tomar ANTES de ejecutar

El feature las deja abiertas a propósito. No bloquean la preparación, pero hay
que cerrarlas antes del corte.

1. **Deploy: separado por tenant vs multi-config.**
   Recomendado: **deploy separado** (otra app Vercel + otra API + otros ACA Jobs
   con su set de env vars apuntando a UTE). Es el aislamiento más limpio y evita
   que un bug de routing mezcle tenants. Multi-config (mismo deploy, env por
   request/host) es más barato pero más frágil.

2. **Qdrant: mismo cluster vs cluster propio.**
   Las colecciones ya van por `FILE_{slug}_...` / `PROPOSAL_{slug}_...`, así que
   el mismo Qdrant aísla por nombre. Recomendado: **mismo Qdrant** salvo que haya
   un requisito de aislamiento físico (compliance/datos). Si se separa, cambia
   solo `QDRANT_URL` / `QDRANT_API_KEY` en API y Services.

---

## Prerrequisitos

- Python 3.12 + `pip install -r requirements.txt` (psycopg2).
- Acceso al dashboard de Supabase (crear proyecto, connection strings).
- Personal Access Token de Supabase para la Management API (el mismo que está en
  `.mcp.json`, header `Authorization: Bearer sbp_...`). Es de cuenta, sirve para
  el proyecto nuevo.

---

## Procedimiento

### 1. Crear el proyecto Supabase UTE
Dashboard -> New project. Misma región que el origen si se quiere latencia
pareja. Guardar la DB password.

### 2. Obtener connection strings
En cada proyecto: Project Settings -> Database -> Connection string -> URI
(usar el **Session pooler**). Exportar:

```bash
export SOURCE_DB_URL='postgresql://postgres.yeawvnrvnnbuiejvrzbt:<pwd>@<host>:5432/postgres?sslmode=require'
export TARGET_DB_URL='postgresql://postgres.<ute-ref>:<pwd>@<host>:5432/postgres?sslmode=require'
```

### 3. Volcar el esquema del origen (genera artefactos versionables)
```bash
python clone_ute.py dump --out ./out
# -> ./out/migrations.json (fuente de máquina) y ./out/schema.sql (revisión humana)
```

### 4. Aplicar el esquema en UTE (idempotente)
```bash
python clone_ute.py apply --in ./out --dry-run   # revisar qué aplicaría
python clone_ute.py apply --in ./out             # aplicar de verdad
```
Reaplica cada migración no presente y registra el bookkeeping. Re-correrlo es
seguro: salta las versiones ya aplicadas.

### 5. Sembrar catálogos de referencia (sin datos productivos)
```bash
python clone_ute.py seed            # upsert por PK
# python clone_ute.py seed --truncate   # si se quiere reemplazo limpio
```
Tablas sembradas: `app_settings` (llm_config, hitl_config, notifications_config),
`ai_pricing`, `model_tiers`, `service_prompts`, `tender_evaluation_types`.
Todo lo demás arranca vacío.

### 6. Storage buckets
Las migraciones **no** crean los buckets (sí las policies). Crear a mano en el
dashboard de UTE (Storage -> New bucket), ambos **public**:
- `artifacts`
- `files`

La policy `Allow anon uploads to artifacts` (INSERT, role `anon`,
`bucket_id = 'artifacts'`) la recrea el replay de migraciones; verificar que
quedó (Storage -> Policies). Si Qdrant/almacenamiento se separa, no aplica aquí.

### 7. Auth (Management API)
Replicar la config del origen (ver memoria `auth-supabase-design`). Con
`PROJECT_REF=<ute-ref>` y `PAT=<sbp_... de .mcp.json>`:

```bash
curl -sX PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" -d '{
    "disable_signup": true,
    "site_url": "https://<ute-ui-domain>",
    "uri_allow_list": "http://localhost:3000/**,https://<ute-ui-domain>/**",
    "jwt_exp": 3600,
    "mailer_templates_invite_content": "<plantilla invite con token_hash>"
  }'
```
Luego crear el usuario root admin (invite o create user) con
`app_metadata.role = administrator`:
```bash
curl -sX POST "https://api.supabase.com/v1/projects/$PROJECT_REF/.../users" ...
# o desde la UI /admin/users una vez desplegada, con un root sembrado por dashboard.
```
SMTP custom: configurar antes de invitar en prod (el mail integrado de Supabase
es rate-limited). En dev sirve el integrado.

### 8. Env vars en los 3 proyectos (apuntar a UTE)

| Proyecto | Variables a cambiar |
|----------|---------------------|
| **API** | `SUPABASE_URL`, `SUPABASE_KEY` (service role de UTE). Qdrant solo si se separa. |
| **UI**  | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `INVITE_ALLOWED_EMAIL_DOMAINS` |
| **Services** | mismas env de Supabase/Qdrant que la API; `API_KEY` (= `BACKEND_API_KEY`) y la base URL de la API de UTE |

No hay project-ref hardcodeado en código de app (verificado: solo aparece en
`.mcp.json`, `mailgun.md`, `opencode.json` y docs). El cambio es 100% por env.

### 9. Qdrant
Según la decisión: mismo cluster (no se toca nada; el slug aísla) o cluster
propio (cambiar `QDRANT_URL`/`QDRANT_API_KEY` en API + Services).

### 10. Deploy
Según la decisión: levantar el deploy separado de UTE (Vercel + API + ACA Jobs)
con las env de arriba. Luego correr `seed_prompts.py` contra la API de UTE si se
prefiere re-sembrar prompts desde fuente (alternativa al paso 5 para
`service_prompts`).

---

## Verificación

```bash
python clone_ute.py verify   # diff de inventario SOURCE vs TARGET; exit 0 si coincide
```
Checklist:
- [ ] `verify` reporta `OK: schemas match` (23 tablas, 6 vistas, 17 enums, 4
      funciones, 9 triggers, 6 RLS, 95 migraciones).
- [ ] Catálogos sembrados; tablas productivas vacías.
- [ ] Buckets `artifacts` y `files` existen (public) + policy presente.
- [ ] Auth: login root OK; flujo de invite OK.
- [ ] Un análisis de punta a punta en UTE no toca datos del proyecto origen.

---

## Mantenibilidad (lockstep)

Como UTE arranca en el mismo HEAD de migración, **toda migración futura debe
aplicarse a ambos proyectos**. Flujo: aplicar la migración vía MCP en origen y en
UTE (apuntando el MCP al ref de UTE), o re-correr `clone_ute.py apply` (salta lo
ya aplicado y suma las nuevas). Documentar cada migración nueva como aplicada a
los dos.

## Riesgos

- Dos esquemas a mantener en paralelo (mitigado por el lockstep de arriba).
- Costo de otro proyecto Supabase (+ posible deploy separado + posible Qdrant).
- `apply` corre cada migración en su propia transacción. Si alguna migración
  futura usa `CREATE INDEX CONCURRENTLY` (no transaccionable), correr esa con
  autocommit aparte. Las 95 actuales no lo usan.
