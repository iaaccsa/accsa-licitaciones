"use client";

import Link from "next/link";
import { ArrowLeft, ScanText } from "lucide-react";

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
    return (
        <h2 id={id} className="text-xl font-semibold text-zinc-800 mb-4 mt-10 first:mt-0 scroll-mt-20 border-b border-zinc-100 pb-2">
            {children}
        </h2>
    );
}

function SubTitle({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-base font-semibold text-zinc-700 mb-3 mt-6">
            {children}
        </h3>
    );
}

function Prose({ children }: { children: React.ReactNode }) {
    return <p className="text-sm text-zinc-600 leading-relaxed mb-4">{children}</p>;
}

interface TableRow {
    [key: string]: string;
}

function DataTable({ headers, rows }: { headers: string[]; rows: TableRow[] }) {
    return (
        <div className="overflow-x-auto mb-6 rounded-xl border border-zinc-200 shadow-sm">
            <table className="w-full text-sm text-left">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                        {headers.map((h) => (
                            <th key={h} className="px-4 py-3 font-semibold text-zinc-700 whitespace-nowrap">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                    {rows.map((row, i) => (
                        <tr key={i} className="hover:bg-zinc-50 transition-colors">
                            {headers.map((h) => (
                                <td key={h} className="px-4 py-3 text-zinc-600">
                                    {row[h]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ModelCard({
    name,
    badge,
    badgeColor,
    children,
}: {
    name: string;
    badge: string;
    badgeColor: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-zinc-200 shadow-sm overflow-hidden bg-white mb-6">
            <div className="bg-zinc-50 px-5 py-4 border-b border-zinc-200 flex items-center gap-3">
                <span className="font-bold text-zinc-900 text-base">{name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                    {badge}
                </span>
            </div>
            <div className="p-5">{children}</div>
        </div>
    );
}

const mistralBenchmark = {
    headers: ["Categoría", "Mistral OCR 3", "Azure OCR", "Google Document AI"],
    rows: [
        { "Categoría": "Precisión general del documento", "Mistral OCR 3": "94,89 %", "Azure OCR": "89,52 %", "Google Document AI": "83,42 %" },
        { "Categoría": "Fidelidad en documentos escaneados", "Mistral OCR 3": "98,96 %", "Azure OCR": "94,65 %", "Google Document AI": "92,77 %" },
        { "Categoría": "Extracción de tablas complejas", "Mistral OCR 3": "96,12 %", "Azure OCR": "89,52 %", "Google Document AI": "78,16 %" },
        { "Categoría": "Notación matemática", "Mistral OCR 3": "94,29 %", "Azure OCR": "85,72 %", "Google Document AI": "80,29 %" },
        { "Categoría": "Reconocimiento de escritura manual", "Mistral OCR 3": "88,90 %", "Azure OCR": "78,20 %", "Google Document AI": "N/A" },
        { "Categoría": "Precisión multilingüe", "Mistral OCR 3": "89,55 %", "Azure OCR": "87,52 %", "Google Document AI": "86,42 %" },
    ],
};

const mistralLang = {
    headers: ["Idioma", "Mistral OCR 2503", "Azure OCR", "Google Document AI", "Gemini-2.0-Flash"],
    rows: [
        { "Idioma": "Ruso (ru)", "Mistral OCR 2503": "99,09 %", "Azure OCR": "97,35 %", "Google Document AI": "95,56 %", "Gemini-2.0-Flash": "96,58 %" },
        { "Idioma": "Francés (fr)", "Mistral OCR 2503": "99,20 %", "Azure OCR": "97,50 %", "Google Document AI": "96,36 %", "Gemini-2.0-Flash": "97,06 %" },
        { "Idioma": "Hindi (hi)", "Mistral OCR 2503": "97,55 %", "Azure OCR": "96,45 %", "Google Document AI": "95,65 %", "Gemini-2.0-Flash": "94,99 %" },
        { "Idioma": "Chino (zh)", "Mistral OCR 2503": "97,11 %", "Azure OCR": "91,40 %", "Google Document AI": "90,89 %", "Gemini-2.0-Flash": "91,85 %" },
        { "Idioma": "Alemán (de)", "Mistral OCR 2503": "99,51 %", "Azure OCR": "98,39 %", "Google Document AI": "97,09 %", "Gemini-2.0-Flash": "97,19 %" },
        { "Idioma": "Español (es)", "Mistral OCR 2503": "99,54 %", "Azure OCR": "98,54 %", "Google Document AI": "97,52 %", "Gemini-2.0-Flash": "97,75 %" },
        { "Idioma": "Italiano (it)", "Mistral OCR 2503": "99,42 %", "Azure OCR": "98,31 %", "Google Document AI": "97,69 %", "Gemini-2.0-Flash": "97,68 %" },
    ],
};

const llamaTiers = {
    headers: ["Tier", "Valor en API", "Caso de uso ideal", "Precisión relativa"],
    rows: [
        { "Tier": "Agentic Plus", "Valor en API": "agentic_plus", "Caso de uso ideal": "Maxima precision para layouts muy complejos", "Precisión relativa": "Maxima" },
        { "Tier": "Agentic", "Valor en API": "agentic", "Caso de uso ideal": "Inteligencia equilibrada para documentos empresariales", "Precisión relativa": "Alta" },
        { "Tier": "Cost Effective", "Valor en API": "cost_effective", "Caso de uso ideal": "Modelos eficientes para PDFs digitales limpios", "Precisión relativa": "Equilibrada" },
        { "Tier": "Fast", "Valor en API": "fast", "Caso de uso ideal": "Extraccion basica de texto en alto volumen", "Precisión relativa": "Estandar" },
    ],
};

const reductoLimits = {
    headers: ["Tipo de limite", "Valor", "Descripcion"],
    rows: [
        { "Tipo de limite": "Requests sincronos concurrentes", "Valor": "200", "Descripcion": "Llamadas simultaneas a /parse, /extract, etc." },
        { "Tipo de limite": "Requests por segundo (RPS)", "Valor": "500", "Descripcion": "Velocidad de envio de nuevos IDs de request" },
        { "Tipo de limite": "Tamano maximo de archivo (Sync)", "Valor": "100 MB", "Descripcion": "Limite para /upload directo" },
        { "Tipo de limite": "Tamano maximo de archivo (Async)", "Valor": "5 GB", "Descripcion": "Limite para URL prefirmada o S3" },
    ],
};

const mathpixPricing = {
    headers: ["Categoria", "Volumen mensual", "Precio unitario"],
    rows: [
        { "Categoria": "Conversion PDF (v3/pdf)", "Volumen mensual": "0 - 1 M paginas", "Precio unitario": "$0,005 / pagina" },
        { "Categoria": "Conversion PDF (v3/pdf)", "Volumen mensual": "1 M+ paginas", "Precio unitario": "$0,0035 / pagina" },
        { "Categoria": "OCR de imagen (v3/text)", "Volumen mensual": "0 - 1 M imagenes", "Precio unitario": "$0,002 / imagen" },
        { "Categoria": "OCR de imagen (v3/text)", "Volumen mensual": "1 M+ imagenes", "Precio unitario": "$0,0015 / imagen" },
        { "Categoria": "Tinta digital (Strokes)", "Volumen mensual": "1 K - 100 K sesiones", "Precio unitario": "$0,01 / sesion" },
        { "Categoria": "Tinta digital (Strokes)", "Volumen mensual": "1 M+ sesiones", "Precio unitario": "$0,005 / sesion" },
    ],
};

const markerPricing = {
    headers: ["Parametro / Caracteristica", "Valor / Especificacion", "Tier"],
    rows: [
        { "Parametro / Caracteristica": "Modo Fast y Balanced", "Valor / Especificacion": "$4 por 1.000 paginas", "Tier": "Managed API" },
        { "Parametro / Caracteristica": "Modo Accurate", "Valor / Especificacion": "$6 por 1.000 paginas", "Tier": "Managed API" },
        { "Parametro / Caracteristica": "Extraccion estructurada", "Valor / Especificacion": "$6 por 1.000 paginas", "Tier": "Managed API" },
        { "Parametro / Caracteristica": "Max paginas por request", "Valor / Especificacion": "7.000 paginas", "Tier": "Todos" },
        { "Parametro / Caracteristica": "Tamano maximo de archivo", "Valor / Especificacion": "200 MB", "Tier": "Todos" },
        { "Parametro / Caracteristica": "Requests concurrentes", "Valor / Especificacion": "400", "Tier": "Todos" },
        { "Parametro / Caracteristica": "Paginas concurrentes en vuelo", "Valor / Especificacion": "5.000", "Tier": "Limite de plataforma" },
    ],
};

const featureMatrix = {
    headers: ["Modelo / Servicio", "Fortaleza principal", "Caracteristica API unica", "Formato de salida", "Enfoque de seguridad"],
    rows: [
        { "Modelo / Servicio": "Mistral OCR 3", "Fortaleza principal": "Velocidad (2.000 pags/min)", "Caracteristica API unica": "Preservacion de notas al pie y superindices", "Formato de salida": "MD, JSON, HTML", "Enfoque de seguridad": "Opcion de autoalojamiento" },
        { "Modelo / Servicio": "LlamaParse", "Fortaleza principal": "Razonamiento agentico", "Caracteristica API unica": "Versionado de tiers para estabilidad", "Formato de salida": "MD, JSON, Sheets", "Enfoque de seguridad": "Soporte LlamaAgents" },
        { "Modelo / Servicio": "Reducto", "Fortaleza principal": "Precision de auditoria", "Caracteristica API unica": "Division inteligente de multiples documentos", "Formato de salida": "MD, JSON, Chunks", "Enfoque de seguridad": "SOC2, HIPAA, VPC" },
        { "Modelo / Servicio": "Mathpix", "Fortaleza principal": "STEM y LaTeX", "Caracteristica API unica": "Extraccion de texto en diagramas", "Formato de salida": "Mathpix MD, LaTeX", "Enfoque de seguridad": "On-prem sin internet" },
        { "Modelo / Servicio": "Marker-Datalab", "Fortaleza principal": "Herencia open-source", "Caracteristica API unica": "Extraccion con esquema Pydantic", "Formato de salida": "MD, HTML, JSON", "Enfoque de seguridad": "Auto-eliminacion en 1 hora" },
    ],
};

const throughputTable = {
    headers: ["Modo / Variable", "Concurrencia por defecto", "Paginas por request concurrente", "Max paginas por defecto"],
    rows: [
        { "Modo / Variable": "Fast (sin LLM)", "Concurrencia por defecto": "N/A", "Paginas por request concurrente": "N/A", "Max paginas por defecto": "10.000" },
        { "Modo / Variable": "Agentic / Premium", "Concurrencia por defecto": "25", "Paginas por request concurrente": "12", "Max paginas por defecto": "700" },
        { "Modo / Variable": "Multimodal (LVM)", "Concurrencia por defecto": "50", "Paginas por request concurrente": "12", "Max paginas por defecto": "700" },
        { "Modo / Variable": "Accurate (LLM por pagina)", "Concurrencia por defecto": "250", "Paginas por request concurrente": "12", "Max paginas por defecto": "5.000" },
        { "Modo / Variable": "Procesamiento OCR", "Concurrencia por defecto": "8", "Paginas por request concurrente": "N/A", "Max paginas por defecto": "N/A" },
    ],
};

export default function OcrApisPage() {
    return (
        <div className="max-w-4xl mx-auto py-12 px-4">
            <div className="mb-6">
                <Link
                    href="/docs"
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Documentacion
                </Link>
            </div>

            <div className="mb-8 flex items-center gap-3">
                <ScanText className="w-7 h-7 text-zinc-400 shrink-0" />
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900">
                        Modelos OCR para conversion PDF a Markdown
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        Informe comparativo de modelos multimodales de ultima generacion disponibles via REST API
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">31 de marzo de 2026, 17:26</p>
                </div>
            </div>

            <Prose>
                La evolucion tecnica del reconocimiento optico de caracteres (OCR) ha llegado a un punto de inflexion critico donde los sistemas tradicionales basados en reglas estan siendo reemplazados por modelos unificados de vision y lenguaje (VLMs). Estos sistemas de nueva generacion, que emergen como estandares de la industria en 2026, representan una transicion del reconocimiento de caracteres hacia la comprension integral del documento.
            </Prose>
            <Prose>
                El desafio central en el procesamiento de documentos sigue siendo la "paradoja del PDF": un formato disenado para consistencia visual que carece de la jerarquia semantica requerida por la inteligencia artificial moderna. Los cinco modelos evaluados en este analisis utilizan decodificadores basados en transformers y razonamiento agentico para interpretar documentos como lo haria un ser humano.
            </Prose>

            <SectionTitle id="mistral">Mistral OCR - El estandar multimodal de alta velocidad</SectionTitle>

            <Prose>
                Mistral AI introdujo su API Mistral OCR en 2025, seguida de la significativamente mejorada Mistral OCR 3 en diciembre de 2025, estableciendo un nuevo referente de velocidad y precision. A diferencia de las herramientas de pipeline segmentadas, Mistral OCR es un VLM nativo disenado para comprender el campo visual completo de un documento simultaneamente. Es capaz de procesar hasta 2.000 paginas por minuto en un solo nodo.
            </Prose>

            <ModelCard
                name="Mistral OCR 3"
                badge="Mas rapido"
                badgeColor="bg-blue-50 text-blue-700 border-blue-200"
            >
                <div className="grid grid-cols-2 gap-4 mb-4 sm:grid-cols-4">
                    {[
                        { label: "Precio estandar", value: "$2 / 1.000 pags" },
                        { label: "Precio Batch API", value: "$1 / 1.000 pags" },
                        { label: "Tamano max.", value: "50 MB / 1.000 pags" },
                        { label: "Velocidad", value: "2.000 pags/min" },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-zinc-50 rounded-lg p-3 border border-zinc-200">
                            <p className="text-xs text-zinc-500 mb-1">{label}</p>
                            <p className="text-sm font-semibold text-zinc-800">{value}</p>
                        </div>
                    ))}
                </div>
                <ul className="text-sm text-zinc-600 space-y-1 list-disc list-inside">
                    <li>Salida "markdown-first" optimizada para sistemas RAG</li>
                    <li>Parametro <code className="text-xs bg-zinc-100 px-1 rounded">table_format</code> para alternar entre Markdown y HTML</li>
                    <li>Imagenes extraidas como base64 con marcadores de posicion en el Markdown</li>
                    <li>Opcion de autoalojamiento on-premises para datos sensibles</li>
                    <li>Rate limit accesible via headers <code className="text-xs bg-zinc-100 px-1 rounded">x-ratelimit-limit-tokens-minute</code></li>
                </ul>
            </ModelCard>

            <SubTitle>Rendimiento de Mistral OCR 3 vs. competidores</SubTitle>
            <DataTable headers={mistralBenchmark.headers} rows={mistralBenchmark.rows} />
            <p className="text-xs text-zinc-400 mb-6">Fuente: conjunto de prueba "solo texto" interno de Mistral AI y benchmarks multiplataforma.</p>

            <SubTitle>Precision por idioma (coincidencia difusa)</SubTitle>
            <DataTable headers={mistralLang.headers} rows={mistralLang.rows} />
            <p className="text-xs text-zinc-400 mb-6">Fuente: datos de prueba multilingue publicados por Mistral AI en 2025.</p>

            <SectionTitle id="llamaparse">LlamaParse - Enfoque agentico para optimizacion RAG</SectionTitle>

            <Prose>
                LlamaParse, componente central del ecosistema LlamaIndex, representa un cambio de paradigma del analisis estatico de documentos hacia la "inteligencia documental agentica". Utiliza agentes que razonan sobre la estructura del documento para producir datos limpios y listos para IA. Soporta mas de 90 tipos de archivo y 100 idiomas.
            </Prose>

            <ModelCard
                name="LlamaParse"
                badge="Mejor para RAG"
                badgeColor="bg-green-50 text-green-700 border-green-200"
            >
                <div className="grid grid-cols-2 gap-4 mb-4 sm:grid-cols-3">
                    {[
                        { label: "Creditos gratuitos/mes", value: "10.000 creditos" },
                        { label: "Precio adicional", value: "$1,25 / 1.000 creditos" },
                        { label: "Tipos de archivo", value: "90+" },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-zinc-50 rounded-lg p-3 border border-zinc-200">
                            <p className="text-xs text-zinc-500 mb-1">{label}</p>
                            <p className="text-sm font-semibold text-zinc-800">{value}</p>
                        </div>
                    ))}
                </div>
                <ul className="text-sm text-zinc-600 space-y-1 list-disc list-inside">
                    <li>Sistema de versionado de tiers para comportamiento consistente en produccion</li>
                    <li>Auto-correccion agentica: vuelve a analizar secciones para mejorar la precision</li>
                    <li>Integracion con LlamaExtract (extraccion con esquema) y LlamaSheets</li>
                    <li>Rate limiting por organizacion; cuentas gratuitas limitadas a 20 req/min</li>
                    <li>Soporta calculo de "paginas maximas procesables" segun concurrencia del modelo</li>
                </ul>
            </ModelCard>

            <SubTitle>Tiers de procesamiento de LlamaParse v2</SubTitle>
            <DataTable headers={llamaTiers.headers} rows={llamaTiers.rows} />

            <SubTitle>Ajuste de concurrencia y throughput para alto volumen</SubTitle>
            <DataTable headers={throughputTable.headers} rows={throughputTable.rows} />
            <p className="text-xs text-zinc-400 mb-6">Fuente: documentacion de autoalojamiento y ajuste de throughput de LlamaIndex.</p>

            <SectionTitle id="reducto">Reducto - Analisis multi-paso de alta fidelidad</SectionTitle>

            <Prose>
                Reducto se posiciona como la solucion de referencia para extraccion de documentos de "alta relevancia" donde la fidelidad estructural no es negociable. Utiliza una arquitectura hibrida que combina vision computacional con VLMs avanzados en un sistema multi-paso: el primer paso identifica segmentos de layout, y los siguientes interpretan cada region en contexto.
            </Prose>
            <Prose>
                En benchmarks clinicos, Reducto alcanzo un 99,24 % de precision de extraccion, frente al 85 % logrado por revisores humanos. Los servicios financieros han reportado hasta 16 veces mas velocidad en auditorias con Reducto.
            </Prose>

            <ModelCard
                name="Reducto"
                badge="Mayor precision"
                badgeColor="bg-purple-50 text-purple-700 border-purple-200"
            >
                <div className="grid grid-cols-2 gap-4 mb-4 sm:grid-cols-3">
                    {[
                        { label: "Precio aprox.", value: "$0,015 / credito" },
                        { label: "Uptime documentado", value: "99,9 %+" },
                        { label: "Tipos de archivo", value: "30+" },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-zinc-50 rounded-lg p-3 border border-zinc-200">
                            <p className="text-xs text-zinc-500 mb-1">{label}</p>
                            <p className="text-sm font-semibold text-zinc-800">{value}</p>
                        </div>
                    ))}
                </div>
                <ul className="text-sm text-zinc-600 space-y-1 list-disc list-inside">
                    <li>Endpoints sincronos (<code className="text-xs bg-zinc-100 px-1 rounded">/parse</code>) y asincronos (<code className="text-xs bg-zinc-100 px-1 rounded">/parse_async</code>)</li>
                    <li>"Intelligent Splitting": separa automaticamente archivos multi-documento</li>
                    <li>Opcion "Zero Data Retention" (ZDR): datos eliminados en 24 horas</li>
                    <li>Certificaciones SOC2, HIPAA; opcion VPC para datos regulados</li>
                    <li>Publicaron "RD-TableBench": 1.000 tablas complejas etiquetadas a mano</li>
                </ul>
            </ModelCard>

            <SubTitle>Limites de concurrencia y requests de la API de Reducto</SubTitle>
            <DataTable headers={reductoLimits.headers} rows={reductoLimits.rows} />
            <p className="text-xs text-zinc-400 mb-6">Fuente: Referencia de API de Reducto y documentacion de estrategia de optimizacion.</p>

            <SectionTitle id="mathpix">Mathpix - Especialista en STEM y notacion cientifica</SectionTitle>

            <Prose>
                Para documentos con notacion matematica densa, diagramas quimicos y formatos cientificos especializados, Mathpix sigue siendo el estandar de oro. Su Convert API esta disenada especificamente para digitalizar papers cientificos y manuales tecnicos en "Mathpix Markdown", un formato especializado que preserva la notacion LaTeX con alta fidelidad.
            </Prose>

            <ModelCard
                name="Mathpix"
                badge="Lider en STEM"
                badgeColor="bg-amber-50 text-amber-700 border-amber-200"
            >
                <div className="grid grid-cols-2 gap-4 mb-4 sm:grid-cols-3">
                    {[
                        { label: "Tarifa de alta", value: "$19,99 (una vez)" },
                        { label: "Credito inicial", value: "$29 para pruebas" },
                        { label: "Rate limit", value: "200 req/min" },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-zinc-50 rounded-lg p-3 border border-zinc-200">
                            <p className="text-xs text-zinc-500 mb-1">{label}</p>
                            <p className="text-sm font-semibold text-zinc-800">{value}</p>
                        </div>
                    ))}
                </div>
                <ul className="text-sm text-zinc-600 space-y-1 list-disc list-inside">
                    <li>Extraccion de tablas en Markdown, CSV, TSV o LaTeX</li>
                    <li>Flag <code className="text-xs bg-zinc-100 px-1 rounded">include_diagram_text</code> para extraer texto dentro de diagramas</li>
                    <li>Cola de prioridad "fair-share" para alta disponibilidad bajo carga</li>
                    <li>Opcion de no retencion de datos: imagenes eliminadas en 24 horas</li>
                    <li>Servicio de conversion segura (SCS) y despliegue on-prem via AMI o Docker</li>
                </ul>
            </ModelCard>

            <SubTitle>Precios por volumen de la Convert API de Mathpix (2026)</SubTitle>
            <DataTable headers={mathpixPricing.headers} rows={mathpixPricing.rows} />
            <p className="text-xs text-zinc-400 mb-6">Fuente: documentacion de facturacion y limites de la Convert API de Mathpix.</p>

            <SectionTitle id="marker">Marker-Datalab - Infraestructura open-source escalable</SectionTitle>

            <Prose>
                Marker, originalmente un aclamado proyecto open-source con mas de 60.000 estrellas en GitHub, ha evolucionado hacia un servicio API de grado productivo a traves de Datalab.to. Ofrece alta precision, rentabilidad y velocidad de inferencia de 4 paginas por segundo con una tasa de error inferior al 0,1 % para una amplia gama de tipos de documentos.
            </Prose>

            <ModelCard
                name="Marker-Datalab"
                badge="Open-source"
                badgeColor="bg-zinc-100 text-zinc-600 border-zinc-300"
            >
                <div className="grid grid-cols-2 gap-4 mb-4 sm:grid-cols-3">
                    {[
                        { label: "Credito mensual inicial", value: "$25" },
                        { label: "Velocidad de inferencia", value: "4 pags/seg" },
                        { label: "Requests concurrentes", value: "400" },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-zinc-50 rounded-lg p-3 border border-zinc-200">
                            <p className="text-xs text-zinc-500 mb-1">{label}</p>
                            <p className="text-sm font-semibold text-zinc-800">{value}</p>
                        </div>
                    ))}
                </div>
                <ul className="text-sm text-zinc-600 space-y-1 list-disc list-inside">
                    <li>Patron submit-poll-retrieve: enviar documento, recibir <code className="text-xs bg-zinc-100 px-1 rounded">request_id</code>, sondear hasta completar</li>
                    <li>"Extraccion estructurada": definir esquema JSON para extraer campos especificos</li>
                    <li>Puntuacion de confianza de extraccion y campos de cita vinculados a Block IDs</li>
                    <li>Resultados eliminados automaticamente 1 hora despues del procesamiento</li>
                    <li>Contenedor on-prem disponible para ejecucion sin acceso a internet</li>
                </ul>
            </ModelCard>

            <SubTitle>Precios y limites de la API de Marker-Datalab</SubTitle>
            <DataTable headers={markerPricing.headers} rows={markerPricing.rows} />
            <p className="text-xs text-zinc-400 mb-6">Fuente: documentacion de precios y limites de API de Datalab.to.</p>

            <SectionTitle id="comparativa">Comparativa y criterios de seleccion</SectionTitle>

            <Prose>
                La seleccion de un modelo OCR PDF-a-Markdown debe estar dictada por los requisitos tecnicos especificos de la aplicacion destino:
            </Prose>

            <ul className="text-sm text-zinc-600 space-y-2 list-disc list-inside mb-6">
                <li><strong>Alto throughput y multilingüe:</strong> Mistral OCR 3 ofrece una combinacion inigualable de velocidad y rentabilidad.</li>
                <li><strong>RAG y agentes conversacionales:</strong> LlamaParse con su razonamiento agentico y profunda integracion con bases de datos vectoriales.</li>
                <li><strong>Contenido STEM y academico:</strong> Mathpix es la eleccion definitiva para fidelidad LaTeX en literatura cientifica.</li>
                <li><strong>Finanzas y salud regulados:</strong> Reducto con su arquitectura multi-paso y auditabilidad mediante bounding-boxes.</li>
                <li><strong>Flexibilidad open-source y on-prem:</strong> Marker-Datalab para organizaciones que valoran la infraestructura open-source con conveniencia de API gestionada.</li>
            </ul>

            <SubTitle>Matriz comparativa de caracteristicas</SubTitle>
            <DataTable headers={featureMatrix.headers} rows={featureMatrix.rows} />
            <p className="text-xs text-zinc-400 mb-6">Fuente: comparacion sintetizada basada en caracteristicas de API documentadas y resultados de benchmark.</p>

            <div className="mt-10 p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-xs text-zinc-500">
                Informe basado en analisis publicados en 2025-2026. Los precios y limites pueden haber cambiado. Consultar la documentacion oficial de cada proveedor para informacion actualizada.
            </div>
        </div>
    );
}
