---
id: estado-sistema
title: Estado del sistema
section: Administración
order: 30
keywords: [estado, sistema, salud, backend, supabase, qdrant, azure, diagnostico, admin]
updated_at: 2026-06-25
---

En **Admin › Revisión › Estado del Sistema** (solo administradores) se ve la
**salud de los componentes** de los que depende la aplicación:

- **API**: el servicio que orquesta el pipeline.
- **Supabase**: la base de datos y el almacenamiento de archivos.
- **Qdrant**: la base de datos vectorial que permite búsquedas y citas.
- **Azure**: la infraestructura donde corren los servicios del pipeline.

Cada bloque indica si el componente responde correctamente. Es el primer lugar
para diagnosticar si los análisis no avanzan o si la carga de archivos falla: si
un componente aparece caído, el problema probablemente está ahí.
