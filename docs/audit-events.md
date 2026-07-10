# Eventos de auditoría

> Origen: página `/docs/audit-events` de la UI, retirada el 2026-07-09. Documento interno. La versión para usuarios está en la ayuda (`content/help/revision-auditoria.md`).

Acciones de usuario que la API registra en la tabla `audit_logs`. El registro es best-effort: si la auditoría falla, la acción de negocio nunca se interrumpe. Cada evento guarda además el actor (usuario, email, IP, user agent), el estado (`success` o `failure`) y la fecha. Consultables en Admin -> Revisión -> Auditoría.

| Categoría | Acción | Recurso | Cuándo se registra | Datos guardados |
|---|---|---|---|---|
| Análisis | `analysis.create` | `analysis` | Se sube un ZIP y se crea un análisis. También con estado failure si la creación falla. | En fallo: mensaje de error. |
| Análisis | `analysis.rename` | `analysis` | Se renombra o edita un análisis. | Campos modificados (patch). |
| Análisis | `analysis.download` | `analysis` | Se descargan los archivos fuente de un análisis. | Cantidad de archivos. |
| Análisis | `analysis.delete` | `analysis` | Eliminación masiva de análisis (limpieza global). | Alcance (all) y resumen de lo eliminado. |
| Requisitos y cumplimiento | `requirement.update` | `requirement` | Se editan requisitos: reemplazo masivo, verificar todos, o edición individual. | Operación (bulk_replace / verify_all / update) y cantidad, patch o estado de verificación. |
| Requisitos y cumplimiento | `compliance_result.update` | `compliance_result` / `compliance_matrix_entry` | Se editan resultados de cumplimiento o una celda de la matriz. | Cantidad y propuestas afectadas, o patch de la celda. |
| Requisitos y cumplimiento | `admissibility.override` | `proposal` | Override manual de la decisión de admisibilidad de una propuesta. | Decisión y justificación enviadas. |
| Configuración (admin) | `prompt.update` | `service_prompt` | Se edita el prompt de un servicio del pipeline. | Key, servicio y archivo del prompt. |
| Configuración (admin) | `llm_config.update` | `app_setting` | Se cambia la configuración global de LLM (proveedor / nivel). | Configuración completa aplicada. |
| Configuración (admin) | `hitl_config.update` | `app_setting` | Se cambia la configuración de HITL. | Configuración completa aplicada. |
| Configuración (admin) | `notifications_config.update` | `app_setting` | Se cambia la configuración de notificaciones. | Configuración completa aplicada. |

## Notas de implementación

- El actor se obtiene de las cabeceras `X-User-Id` y `X-User-Email` que reenvía el proxy del frontend (ya autenticado por Supabase).
- Las llamadas de sistema o servicios producen un actor vacío.
- El pipeline automático no se audita: solo se registran las acciones de usuario listadas arriba.
