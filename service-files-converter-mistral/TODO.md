# TODO

## PDF splitting para archivos > 45 MB

Actualmente los archivos que superan `MAX_FILE_SIZE_MB` (45 MB) se omiten con un evento de warning.

Implementar splitting del PDF en chunks de N paginas (ej. 30) antes de enviarlo a Mistral OCR, y concatenar el Markdown resultante en un unico archivo de salida.

**Dependencia requerida:** `pypdf>=4.0.0` en `requirements.txt`

**Logica general:**
1. Si el archivo supera el limite, dividirlo en partes con `PdfReader` / `PdfWriter`
2. Procesar cada parte con `parse_file()` de forma secuencial
3. Concatenar los resultados de Markdown
4. Subir el Markdown completo como un unico `.md` (comportamiento identico al flujo actual)
5. Limpiar los archivos temporales de cada chunk
