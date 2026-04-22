# service-admissibility-gate

## Proposito
Gate parcial de admisibilidad que corre **justo despues del compliance-matcher** (antes del summarizer y del economic-offer-extractor). Evalua de forma **determinista** (sin LLM) si una propuesta cumple los requerimientos de `admisibilidad_obligatoria` que son `auto_verificable_desde_oferta`, cruzando contra la matriz de cumplimiento. Se ejecuta una instancia por propuesta (fan_out_by=proposal) con `pause_after=true` para que el usuario revise y decida que propuestas continuan con el resto del analisis.

## Regla

Una propuesta es **rechazada** si tiene al menos un requerimiento que cumple estas tres condiciones:
1. `roles` contiene `admisibilidad_obligatoria`
2. `verification_method = auto_verificable_desde_oferta`
3. `verdict = no_cumple` en la matriz de cumplimiento

Si todos los requerimientos que cumplen (1) y (2) tienen verdict `cumple` o `cumple_parcial` -> **admitida**.

El usuario puede sobreescribir el veredicto via HITL (`PATCH .../admissibility-override`) antes de continuar. Los motivos originales se conservan para auditoria.

## Flujo

1. `PATCH /api/v1/proposals/{PROPOSAL_ID}/admissibility-start` -- transiciona `admissibility_status` a `evaluating`.
2. Carga los requerimientos del analisis filtrados por `role=admisibilidad_obligatoria`, `is_verified=true` via `GET /api/v1/analysis-requirements/{ANALYSIS_ID}`.
3. Filtra localmente solo los que tienen `verification_method = auto_verificable_desde_oferta`.
4. Carga la matriz de cumplimiento de la propuesta via `GET /api/v1/analysis-compliance-matrix/by-proposal/{PROPOSAL_ID}` (paginada).
5. Para cada requerimiento auto-verificable de admisibilidad, busca el verdict en la matriz.
6. Si al menos uno tiene `no_cumple` -> `rechazada` con los motivos detallados.
7. Si ninguno tiene `no_cumple` -> `admitida`.
8. `PATCH /api/v1/proposals/{PROPOSAL_ID}/admissibility-result` con el veredicto y motivos.
9. Notifica finalizacion via callback.

## Entrada
- **ANALYSIS_ID** (runtime): UUID del analisis.
- **PROPOSAL_ID** (runtime): UUID de la propuesta a evaluar.
- Requiere: `matching_status` en `{matrix_ready, completed}` (la matriz debe existir).
- Requiere: requerimientos con `is_verified=true` en `analysis_requirements`.
- Requiere: entradas en `analysis_compliance_matrix` para la propuesta.

## Salida
- `admissibility_status` en `admitida` o `rechazada`.
- `admissibility_reasons`: array JSONB con los motivos de rechazo (con referencia a requirement_id/code y reasoning del compliance-matcher).
- Eventos de log en `events`.

## Posicion en el pipeline

```
compliance-matcher (fan_out_by=proposal)
  -> admissibility-gate (fan_out_by=proposal, pause_after=true)
  -> [HITL: usuario revisa, override si necesario]
  -> compliance-summarizer (solo propuestas admitidas)
  -> economic-offer-extractor (solo propuestas admitidas)
  -> ...
```

Las propuestas con `admissibility_status = rechazada` (sin override a admitida) no se procesan en los pasos siguientes. El orquestador filtra por este campo.

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Backend API** | Cargar requerimientos, matriz de cumplimiento. Transiciones de estado, callback. |

No usa Qdrant, Gemini ni OpenAI. Es 100% determinista.
