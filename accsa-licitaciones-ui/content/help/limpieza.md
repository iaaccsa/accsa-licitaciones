---
id: limpieza
title: Limpieza de datos
section: Administración
order: 40
keywords: [limpieza, borrar, eliminar, datos, reset, zona peligrosa, irreversible, admin]
updated_at: 2026-06-25
---

La **Limpieza** (acción de administrador, en **Admin › Limpieza**) es una
operación de **zona peligrosa**: elimina **todos los análisis** del sistema junto
con sus archivos, propuestas, requisitos y eventos, vacía los **buckets de
almacenamiento** y borra todas las **colecciones de Qdrant**.

**No se puede deshacer.** Por eso la aplicación pide una **confirmación explícita**
antes de ejecutarla.

Úsela solo para reiniciar el sistema por completo (por ejemplo, al terminar una
etapa de pruebas). Si solo quiere detener un análisis concreto, use **Cancelar** en
ese análisis; no hace falta borrar todo. Ver [[cancelar-reanudar]].
