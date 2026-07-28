# Feature 10 — Documentacion de usuario + Chatbot de documentacion

Documentacion de usuario embebida en la app (HTML, por fragmentos actualizables)
y un chatbot web (RAG) que conversa con esa documentacion, con conversaciones
persistidas para revision posterior.

Complejidad: **alta** (nuevo proyecto + render de docs + RAG + persistencia).

Estado: **0 tareas hechas**. Spec definido, NO implementado.

---

## Decisiones cerradas (encuestas)

1. **Fragmentos = Markdown en el repo de la UI** (`content/help/*.md`), un `.md`
   por fragmento, con frontmatter. Versionado con el codigo, editado por PR.
2. **Borrador inicial lo redacta el asistente** desde el analisis de la app; el
   usuario revisa y aprueba.
3. **OpenAI para todo**: embeddings `text-embedding-3-small` (1536-dim, ya en uso)
   y generacion `gpt-4o-mini` (configurable por env).
4. **Conversaciones: persistir ahora** en Supabase (2 tablas). Panel `/admin` de
   revision **diferido** a una fase posterior.
5. **Redis + Supabase en paralelo** (write-through): la ventana "hot" de la
   conversacion vive en Redis (lectura rapida de contexto, como hoy
   `chat_service.py` con `chat_history:{...}`); cada mensaje (user + assistant)
   se persiste **ademas** en Supabase como registro durable.
6. **Proyecto independiente `accsa-chatbot-documentation`**: 4o proyecto, dueno
   del agente de chat (RAG, embeddings, generacion, Redis hot, reindexado).
   Stack: **FastAPI** (capa HTTP) + **Pydantic AI** (logica del agente: generacion,
   salida estructurada validada para citas, tools), desplegado como **Azure
   Container App always-on** (no ACA Job efimero; el chat es sincronico) en
   `env-licitaciones` / RG `accsa-licitaciones`, con su `build-and-push.sh` como
   los services. Embeddings con el SDK de OpenAI directo.
7. **Widget de chat flotante global** (presente en toda la app).
8. **Reindex manual** disparado por script/boton, **push-based**: la UI parsea los
   `.md` y hace `POST` al `/reindex` del chatbot. Reindex completo cada vez (ok).
9. **Los `.md` viven en el repo de la UI**; `/ayuda` renderiza local (sin depender
   del chatbot en runtime). El script de reindex empuja los fragmentos al chatbot.
10. **El chatbot escribe Supabase directo** con su propio cliente (2 tablas
    aisladas del pipeline). Rompe levemente la convencion "solo la API toca
    Supabase", aceptado por autonomia del agente.

Fuera de alcance hoy: WhatsApp/Telegram, tocar el `/docs` tecnico existente,
tocar el chat por-analisis existente (`chat_service.py`), panel `/admin` de
revision (diferido), registro en `ai_usage` (diferido, ver nota al final).

---

## Estado actual relevante

- Existe un chatbot RAG **por analisis/archivo**: `accsa-licitaciones-api/app/
  services/chat_service.py` (embeddings OpenAI `text-embedding-3-small` -> Qdrant
  filtrado por `file_id` -> Gemini 3 Flash -> historial en Redis
  `chat_history:{file_id}`, ultimos 20). Patron a **clonar**, NO a modificar.
- El `/docs` actual (`accsa-licitaciones-ui/src/app/docs/*`) es documentacion
  **tecnica/dev** hardcodeada en React (`pipeline/page.tsx` ~582 lineas JSX). NO
  es doc de usuario. Convive sin cambios; la doc de usuario va en ruta nueva
  `/ayuda`.
- Qdrant: colecciones por archivo y por propuesta, 1536-dim, `text-embedding-3-small`.
- Supabase: store canonico. La UI proxea todas las llamadas server-side.

---

## Arquitectura

```
content/help/*.md  (UI repo, fuente de verdad; frontmatter por fragmento)
   |
   |-- Render:  UI /ayuda  (lee carpeta local -> sidebar + ToC + HTML embebido)
   |
   '-- Reindex: scripts/reindex-help.ts  parsea .md
                  -> POST {CHATBOT_DOCS_URL}/reindex  (push)
                       -> accsa-chatbot-documentation:
                            embeddings OpenAI -> recrea Qdrant DOCS_USER_GUIDE

UI widget flotante (global)
   -> UI proxy  src/app/api/docs-chat/*  (auth server-side)
        -> accsa-chatbot-documentation  POST /chat:
             embed pregunta -> ANN DOCS_USER_GUIDE -> contexto
             -> OpenAI gpt-4o-mini
             Redis: append ventana hot  chat_history:{conversation_id} (TTL)
             Supabase: insert user+assistant (write-through, en paralelo)
             -> respuesta + fragmentos citados
```

---

## DDL (FASE 1, via MCP Supabase)

```sql
create table doc_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),          -- nullable si anonimo
  title text,                                       -- derivado del 1er mensaje
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table doc_chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references doc_chat_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  retrieved_fragment_ids text[],                    -- ids de fragmentos citados
  model text,                                       -- p.ej. gpt-4o-mini
  prompt_tokens int,
  completion_tokens int,
  created_at timestamptz not null default now()
);

create index on doc_chat_messages (conversation_id, created_at);
create index on doc_chat_conversations (user_id, last_activity_at desc);

alter table doc_chat_conversations enable row level security;
alter table doc_chat_messages enable row level security;
-- El chatbot usa service key (bypassa RLS). Policies de lectura para el panel
-- /admin se agregan en la fase diferida.
```

---

## Esquema de fragmento (`content/help/<id>.md`)

```markdown
---
id: subir-licitacion            # slug estable: URL ancla + id de punto Qdrant
title: Como subir una licitacion
section: Primeros pasos          # agrupa en el sidebar
order: 10                        # orden dentro de la seccion
keywords: [subir, zip, carga]
updated_at: 2026-06-25
---

Cuerpo en Markdown del fragmento...
```

- Un fragmento = unidad de render (ancla `/ayuda#<id>`) Y unidad de indexacion
  (1 punto Qdrant; si excede presupuesto de tokens, se parte en sub-puntos
  `<id>#0`, `<id>#1`).
- Payload Qdrant: `{ fragment_id, title, section, url, text }`.
- Coleccion: `DOCS_USER_GUIDE`, 1536-dim, distancia cosine.

---

## Estructura del proyecto nuevo

```
accsa-chatbot-documentation/
  app/
    main.py
    core/        config.py, qdrant.py, redis_client.py, supabase.py, openai.py
    services/    rag_service.py, reindex_service.py, conversation_service.py
    api/         chat.py, reindex.py, conversations.py
    schemas/     chat.py, fragment.py
  Dockerfile
  build-and-push.sh
  requirements.txt
  .env.example
```

Env del chatbot: `OPENAI_API_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `REDIS_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `API_KEY` (auth propia),
`DOCS_COLLECTION=DOCS_USER_GUIDE`, `GEN_MODEL=gpt-4o-mini`,
`EMBED_MODEL=text-embedding-3-small`, `HOT_HISTORY_TTL`, `HOT_HISTORY_SIZE`.

Endpoints:
- `POST /chat`  { conversation_id?, message, user_id? } -> { conversation_id,
  answer, cited_fragments[] }. Crea conversacion si falta; lee hot de Redis;
  embed -> ANN -> OpenAI; write-through Redis + Supabase.
- `POST /reindex`  { fragments: [{id,title,section,url,text,keywords}] } ->
  recrea coleccion + upsert; devuelve count.
- `GET  /conversations/{id}`  -> mensajes desde Supabase (para historial UI).

---

## Cambios por proyecto

| Proyecto | Cambios |
|----------|---------|
| `accsa-chatbot-documentation` (NUEVO) | Todo el agente: RAG, reindex, Redis hot, persistencia Supabase, endpoints, Docker, ACA Container App, build-and-push |
| `accsa-licitaciones-ui` | `content/help/*.md`; ruta `/ayuda` (render); widget flotante global en layout; proxy `src/app/api/docs-chat/*`; `scripts/reindex-help.ts` + script pnpm; env `CHATBOT_DOCS_URL` + `CHATBOT_DOCS_API_KEY` (a `.env.example`) |
| `accsa-licitaciones-api` | Sin cambios (el chatbot es autonomo) |
| Supabase | 2 tablas nuevas |
| Qdrant | coleccion `DOCS_USER_GUIDE` |

---

## Fases y subtareas (marcar [x] al avanzar)

### FASE 0 - Scaffold proyecto chatbot
- [ ] Crear `accsa-chatbot-documentation/` con estructura FastAPI
- [ ] `requirements.txt` (fastapi, uvicorn, openai, qdrant-client, redis, supabase, python-dotenv)
- [ ] `core/` clientes: config, qdrant, redis, supabase, openai
- [ ] `main.py` con health check
- [ ] `Dockerfile` + `build-and-push.sh` (patron de los services)
- [ ] `.env.example`
- [ ] Correr local: `uvicorn app.main:app --reload`

### FASE 1 - DB Supabase (MCP)
- [ ] Migracion: `doc_chat_conversations` + `doc_chat_messages` + indices + RLS
- [ ] Verificar con `list_tables`

### FASE 2 - Contenido (fragmentos) [hecha]
- [x] Definir el arbol de secciones/fragmentos (mapa de la app) -> 7 secciones
- [x] Redactar borrador `.md` por fragmento (espanol, frontmatter completo) ->
      29 fragmentos en `accsa-licitaciones-ui/content/help/*.md`
- [x] Revision del usuario y ajustes -> aprobado (revisado en /ayuda)

### FASE 3 - Render /ayuda (UI) [hecha]
- [x] Loader de `content/help/*.md` (gray-matter) -> `src/lib/help/loader.ts`
- [x] Ruta `/ayuda`: sidebar por `section`/`order`, ToC, anclas `#id` ->
      `src/app/ayuda/page.tsx` + `src/components/help/HelpView.tsx`
- [x] Render Markdown -> HTML (react-markdown + rehype-slug + remark-gfm)
- [x] Entrada en la navegacion principal -> Navbar item "Ayuda"
- [x] Busqueda local basica (por title/keywords/body, sin acentos)

### FASE 4 - Indexador
- [ ] `POST /reindex` en el chatbot: recrear coleccion + embeddings batch + upsert
- [ ] `scripts/reindex-help.ts` en la UI: parsea `.md` -> arma fragmentos -> POST
- [ ] Script pnpm `reindex:help`
- [ ] Probar reindex completo end to end

### FASE 5 - Chat (RAG + persistencia)
- [ ] `rag_service`: embed -> ANN DOCS_USER_GUIDE -> prompt (grounded, citar, espanol) -> OpenAI
- [ ] `conversation_service`: crear conversacion; write-through Redis + Supabase
- [ ] `POST /chat` y `GET /conversations/{id}`
- [ ] Manejo de hot window en Redis (TTL, size)
- [ ] Probar: pregunta -> respuesta citada -> verificar fila en Supabase y Redis

### FASE 6 - Widget UI
- [ ] Componente de chat flotante global (burbuja + panel) en el layout
- [ ] Proxy `src/app/api/docs-chat/route.ts` (+ history) con auth server-side
- [ ] Estado de conversacion en cliente; streaming opcional
- [ ] Estilos shadcn/Tailwind coherentes

### FASE 7 - e2e + deploy
- [ ] Deploy `accsa-chatbot-documentation` a ACA Container App
- [ ] Env vars en ACA + Vercel (`CHATBOT_DOCS_URL`, `CHATBOT_DOCS_API_KEY`)
- [ ] Reindex en entorno desplegado
- [ ] e2e manual: render /ayuda, chat, persistencia, citas correctas

### Diferido (no MVP)
- [ ] Panel `/admin` de revision de conversaciones (patron audit-logs/review)
- [ ] Registrar coste OpenAI del chatbot en `ai_usage` (coherencia con el
      sistema de cost tracking existente)
- [ ] Reindex automatico en CI por release (hoy es manual)

---

## Notas

- Mismo modelo de embeddings que el resto del sistema -> coleccion compatible.
- Reindex completo (drop + recreate) aceptado: simplifica, sin diffs incrementales.
- El chatbot NO toca la API principal: persiste Supabase directo y lee Qdrant/Redis.
- `.env.example` de la UI: agregar las vars nuevas ahi; el usuario copia a `.env.local`.
