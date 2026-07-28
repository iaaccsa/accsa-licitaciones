# service-joiner

## Propósito
Combina archivos markdown en documentos unificados: un `tender_full.md` con todos los archivos tender + normative, y un `proposal_full.md` por cada propuesta. Los archivos resultantes se suben a Supabase Storage y se registran en la DB con `is_merged=true`.

## Tareas que realiza

1. Obtiene el slug del análisis via API
2. Obtiene todos los archivos del análisis via API
3. Filtra archivos procesados (`is_processed_version=true`) con categoría asignada, excluyendo los ya merged
4. **Genera tender_full.md**:
   - Filtra archivos con category `tender` o `normative`
   - Descarga cada .md desde Supabase Storage
   - Concatena con separador (`# {file_name}` + contenido + `---`)
   - Sube a Storage: `{slug}/{file_id}.md`
   - Crea registro con `is_merged=true`, `category='tender'`
5. **Genera proposal_full.md por cada propuesta**:
   - Agrupa archivos `proposal` por `proposal_id`
   - Por cada grupo: descarga, concatena, sube, y crea registro con `is_merged=true`, `category='proposal'`, `proposal_id`
6. Notifica finalización via callback

## Entrada
- **ANALYSIS_ID** (runtime): UUID del análisis
- Lee: archivos markdown procesados desde Supabase Storage

## Salida
- `tender_full.md` subido a Storage y registrado en DB (`is_merged=true`)
- `proposal_full.md` por cada proposal, subido a Storage y registrado en DB (`is_merged=true`, `proposal_id`)

## Servicios externos

| Servicio | Uso |
|----------|-----|
| **Supabase Storage** | Descarga de archivos markdown individuales, subida de archivos merged |
| **Backend API** | Obtener análisis, buscar archivos, crear registros de archivos merged, callback |
