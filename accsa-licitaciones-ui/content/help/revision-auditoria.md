---
id: revision-auditoria
title: Revisión y auditoría
section: Administración
order: 20
keywords: [revision, auditoria, registro, acciones, usuarios, historial, admin]
updated_at: 2026-07-09
---

En **Admin › Revisión** (solo administradores) hay dos herramientas:

- **Estado del sistema**: salud de los componentes. Ver [[estado-sistema]].
- **Auditoría**: el **registro de acciones de los usuarios** en el sistema. Sirve
  para saber quién hizo qué y cuándo (por ejemplo, cambios de configuración,
  invitaciones o ediciones manuales).

La auditoría es un apoyo para el control y la trazabilidad: ante una duda sobre un
cambio, es el primer lugar donde mirar.

## Qué se registra

Cada registro guarda **quién** hizo la acción, **cuándo**, sobre **qué recurso**
y si terminó **bien o con error**. El pipeline automático no genera registros de
auditoría: solo las acciones de los usuarios.

**Sobre análisis**

- Crear un análisis (subir un ZIP); también se registra si la creación falla.
- Renombrar o editar un análisis.
- Descargar los archivos fuente de un análisis.
- Limpieza global de análisis.

**Sobre requisitos y cumplimiento**

- Editar requisitos: edición individual, reemplazo masivo o confirmar todos.
- Editar resultados de cumplimiento o celdas de la matriz.
- Forzar manualmente (override) la decisión de admisibilidad de una propuesta.

**Sobre configuración (solo administradores)**

- Editar el prompt de un servicio del pipeline.
- Cambiar la configuración LLM, de validación humana o de notificaciones.
