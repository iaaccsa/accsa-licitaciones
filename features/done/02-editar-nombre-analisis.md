# Feature 02 — Quitar nombre de la subida + editarlo tras la extracción IA

Cubre ToDo items **8** ("Eliminar de la vista de nuevo análisis el nombre de la
licitación") y **9** ("Agregar posibilidad de editar el nombre después que la IA
lo extraiga"). Se implementan juntos: son el ciclo de vida del nombre del análisis.

Complejidad: **baja-media** (UI + pequeño ajuste de schema/endpoint en API).

---

## Estado actual

- Subida: `UploadSection.tsx:141` tiene el input "Nombre del análisis (opcional)";
  si se completa, se envía como `user_assigned_name` en `POST /api/analyses`.
- La IA extrae un nombre y lo guarda en `analyses.generated_name`
  (`accsa-licitaciones-services/service-documents-grouper` / tender-naming).
- Detalle del análisis: `accsa-licitaciones-ui/src/app/analyses/[id]/page.tsx`
  muestra el nombre (header). Hoy no es editable.
- API: ya existe `PATCH /api/v1/analyses/{analysis_id}` → `update_analysis`
  (`analyses.py:144`) con `AnalysisUpdate`. Pero `AnalysisUpdate`
  (`schemas/analysis.py:48`) solo tiene `generated_name` y `status`; **no**
  incluye `user_assigned_name`.

El nombre que se muestra suele resolverse como `user_assigned_name ?? generated_name`.

## Decisión cerrada (encuesta)

- **Quitar** el campo "Nombre" de la vista de subida.
- **Editar inline en el detalle del análisis** (`/analyses/[id]`): un lápiz junto
  al nombre abre edición inline y guarda.
- **Quién edita**: el **dueño** del análisis y el **admin**.

## Proyectos afectados

| UI | API | Services | DB |
|----|-----|----------|----|
| Sí | Sí  | No       | No |

## Diseño

### UI
- `UploadSection.tsx`: eliminar el bloque del input de nombre (líneas ~132-151),
  el estado `analysisName`/`setAnalysisName`, su reset y su inclusión en el body.
  El POST deja de mandar `user_assigned_name`.
- `analyses/[id]/page.tsx`: junto al nombre, botón lápiz (lucide `Pencil`). Al
  editar, input inline + guardar/cancelar. Guarda vía nuevo proxy
  `PATCH /api/analyses/[id]` enviando `{ user_assigned_name }`. Refresca el nombre.
- Permisos: el acceso a `/analyses/[id]` ya está limitado a dueño/admin por
  `requireAnalysisAccess`; el PATCH va por un proxy que revalida acceso (reusar
  `requireAnalysisAccess(id)` en la ruta proxy). No hace falta lógica extra de rol
  más allá de eso.
- Proxy nuevo/ajustado: `src/app/api/analyses/[id]/route.ts` (o el existente) que
  acepte `PATCH`, valide acceso y forwardee a `PATCH {API_ANALYSES_PATH}/{id}`
  con `X-API-Key` + headers de auditoría (`getAuditHeaders`).

### API
- `schemas/analysis.py`: agregar `user_assigned_name: Optional[str] = None` a
  `AnalysisUpdate`.
- `analysis_service.update_analysis`: ya hace update genérico; confirmar que
  persiste `user_assigned_name`. Validar `maxLength` (200, como hoy en UI).
- Auditoría: registrar `analysis.update` (o `analysis.rename`) en `audit_service`
  cuando venga `actor` con `user_id` (patrón de `feature-audit-logs`).

## Verificación

- Subida `/` ya no muestra campo de nombre; el análisis arranca sin
  `user_assigned_name`.
- Tras correr la IA, el detalle muestra `generated_name`.
- Editar el nombre inline persiste y se ve reflejado al recargar.
- Usuario no-dueño no-admin no puede editar (404/403 en el proxy).
- Queda entrada en `/admin/audit`.
- `pnpm build` + import API OK.

## Notas

- Decidir el "nombre mostrado": mantener la regla actual
  `user_assigned_name ?? generated_name`. Editar setea `user_assigned_name`.
