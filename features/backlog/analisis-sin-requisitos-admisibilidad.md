# Backlog — Análisis terminado sin requisitos de admisibilidad (vista en UI)

Nota de backlog, **no es un feature especificado todavía**. Surge de la
planificación de la separación del extractor de requisitos en dos servicios
(`service-admissibility-extractor` + `service-requirement-extractor`).

---

## El caso

`service-admissibility-extractor` corre y extrae **cero** requisitos de
admisibilidad del pliego. Puede pasar porque el pliego realmente no define
requisitos excluyentes, o porque el prompt/OCR no los detectó.

## Comportamiento de backend ya decidido

No falla el pipeline. Al detectar cero requisitos:

- Los steps aguas abajo se autocompletan con 0 instancias
  (`_complete_downstream_and_finalize`, el mismo mecanismo que ya usa el corte
  de "ninguna propuesta admitida").
- El análisis queda `status = "ready"`, `is_success = true` (terminado con
  éxito, no fallido).
- Se registra un evento explicando que se terminó por no haber requisitos de
  admisibilidad.

Consecuencia: el análisis nunca llega a la evaluación de admisibilidad por
propuesta ni a la extracción de otros requisitos. Las propuestas quedan sin
`admissibility_status`, y no hay filas en `admissibility_results`,
`analysis_requirements` ni en la matriz de cumplimiento.

## Lo que falta definir (esto es el feature futuro)

Cómo se comunica esto en la interfaz del análisis, para que no se lea como un
análisis exitoso normal que quedó vacío por un bug:

- Qué muestra el detalle del análisis (`/analyses/[id]`): ¿un aviso destacado?
  ¿un estado propio distinto de "terminado con éxito"?
- Qué muestran las tarjetas de navegación (Requisitos de Admisibilidad,
  Admisibilidad, Otros Requisitos) cuando no hay datos por este motivo.
- Cómo se ve en el listado de análisis (`AnalysisCard` / `AnalysisList`).
- Qué pasa con las fases: hoy `apply_admissibility_cut` pinta `award_check` como
  `warning` cuando no hay admitidas. Hace falta un tratamiento equivalente (o
  distinto) para este corte, que ocurre una fase antes.
- Si el email de "análisis terminado" debe decir algo distinto en este caso.

## Referencias

- `app/services/job_orchestrator_service.py` — `_complete_downstream_and_finalize`
  (línea ~584), `apply_admissibility_cut` en `workflow_phase_service.py:151`.
- Feature de la separación de extractores (define el comportamiento de backend).
