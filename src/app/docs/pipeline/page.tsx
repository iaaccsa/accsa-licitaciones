import Link from "next/link";
import { ArrowLeft, GitBranch } from "lucide-react";

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
    return (
        <h2 id={id} className="text-lg font-semibold text-zinc-800 mb-4 mt-8 first:mt-0 scroll-mt-20">
            {children}
        </h2>
    );
}

function BlockTitle({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3 mt-6">
            {children}
        </h3>
    );
}

interface StageCardProps {
    code: string;
    label: string;
    number: number;
    variant: "implemented" | "proposed" | "optional";
    tags?: string[];
    children: React.ReactNode;
}

const VARIANT_STYLES = {
    implemented: {
        border: "border-t-blue-400",
        badge: "bg-blue-50 text-blue-700",
        codeBg: "bg-blue-50 text-blue-800",
        indicator: "bg-blue-100 text-blue-700",
        label: "Implementado",
        labelStyle: "bg-blue-100 text-blue-700 border-blue-200",
    },
    proposed: {
        border: "border-t-amber-400",
        badge: "bg-amber-50 text-amber-700",
        codeBg: "bg-amber-50 text-amber-800",
        indicator: "bg-amber-100 text-amber-700",
        label: "Propuesto",
        labelStyle: "bg-amber-100 text-amber-700 border-amber-200",
    },
    optional: {
        border: "border-t-zinc-300",
        badge: "bg-zinc-50 text-zinc-500",
        codeBg: "bg-zinc-100 text-zinc-600",
        indicator: "bg-zinc-100 text-zinc-500",
        label: "Opcional",
        labelStyle: "bg-zinc-100 text-zinc-500 border-zinc-200",
    },
};

function Tag({ children }: { children: React.ReactNode }) {
    return (
        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
            {children}
        </span>
    );
}

function StageCard({ code, label, number, variant, tags = [], children }: StageCardProps) {
    const s = VARIANT_STYLES[variant];
    return (
        <div className={`rounded-xl border border-zinc-200 shadow-sm overflow-hidden bg-white border-t-4 ${s.border}`}>
            <div className="bg-white p-4 border-b border-zinc-100">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${s.indicator}`}>
                            {number}
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <code className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${s.codeBg}`}>
                                    {code}
                                </code>
                                <span className="text-sm font-semibold text-zinc-900">{label}</span>
                            </div>
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {tags.map((t) => <Tag key={t}>{t}</Tag>)}
                                </div>
                            )}
                        </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${s.labelStyle}`}>
                        {s.label}
                    </span>
                </div>
            </div>
            <div className="p-4 text-sm text-zinc-600 space-y-2">{children}</div>
        </div>
    );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
    return (
        <pre className="bg-zinc-900 text-zinc-100 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed">
            {children}
        </pre>
    );
}

function InfoBox({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            {children}
        </div>
    );
}

function FieldList({ fields }: { fields: { name: string; description: string }[] }) {
    return (
        <div className="space-y-1.5 mt-2">
            {fields.map(({ name, description }) => (
                <div key={name} className="flex gap-2">
                    <code className="text-xs font-mono font-semibold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded h-fit shrink-0 mt-0.5">
                        {name}
                    </code>
                    <span>{description}</span>
                </div>
            ))}
        </div>
    );
}

const TOC = [
    { id: "parte-1", label: "Parte 1 — Etapas implementadas" },
    { id: "parte-2", label: "Parte 2 — Etapas propuestas" },
    { id: "parte-3", label: "Parte 3 — Grafo propuesto" },
    { id: "parte-4", label: "Parte 4 — Orden de implementación" },
    { id: "parte-5", label: "Parte 5 — Dependencias de schema y API" },
    { id: "parte-6", label: "Parte 6 — Cosas diferidas" },
];

export default function PipelinePage() {
    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            {/* Back */}
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/docs"
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>
            </div>

            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <GitBranch className="w-6 h-6 text-zinc-400 shrink-0" />
                    <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">
                        Pipeline de evaluación de licitaciones
                    </h1>
                </div>
                <p className="text-sm text-zinc-500">
                    Estado actual y etapas propuestas. Distingue entre lo ya implementado (corriendo en producción
                    según el <code className="font-mono text-xs bg-zinc-100 px-1 rounded">pipeline_config.json</code>) y
                    las etapas complementarias propuestas para llegar de punta a punta a una recomendación de
                    adjudicación documentada.
                </p>
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap gap-3 mb-8 p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                {(["implemented", "proposed", "optional"] as const).map((v) => (
                    <div key={v} className="flex items-center gap-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${VARIANT_STYLES[v].labelStyle}`}>
                            {VARIANT_STYLES[v].label}
                        </span>
                    </div>
                ))}
                <span className="text-xs text-zinc-400 self-center ml-1">| Etiquetas: fan_out_by, pause_after (HITL), is_final</span>
            </div>

            {/* TOC */}
            <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-4">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Contenido</p>
                <ol className="space-y-1">
                    {TOC.map(({ id, label }) => (
                        <li key={id}>
                            <a href={`#${id}`} className="text-sm text-blue-600 hover:text-blue-800 hover:underline">
                                {label}
                            </a>
                        </li>
                    ))}
                </ol>
            </div>

            {/* ===== PARTE 1 ===== */}
            <SectionTitle id="parte-1">Parte 1 — Etapas implementadas</SectionTitle>
            <p className="text-sm text-zinc-500 mb-4">
                Las 14 etapas activas hoy según el <code className="font-mono text-xs bg-zinc-100 px-1 rounded">pipeline_config.json</code>.
                Agrupadas en cuatro bloques lógicos aunque técnicamente corren como una cadena única.
            </p>

            <BlockTitle>Bloque A — Ingesta y preparación documental</BlockTitle>
            <div className="space-y-3">
                <StageCard code="service-queue" label="En Espera" number={1} variant="implemented">
                    <p>Estado inicial. La licitación se crea en la cola esperando que el pipeline arranque. No ejecuta lógica propiamente dicha; es el nodo raíz del grafo.</p>
                </StageCard>

                <StageCard code="service-file-extractor" label="Extracción de Archivos" number={2} variant="implemented">
                    <p>Desempaqueta y descarga los archivos del pliego y las normativas relacionadas (y eventualmente las propuestas) a almacenamiento accesible para las etapas siguientes.</p>
                </StageCard>

                <StageCard code="service-files-converter-mistral" label="Preparación de Documentos" number={3} variant="implemented">
                    <p>Convierte los archivos crudos (PDFs escaneados, DOCX, imágenes, etc.) a markdown estructurado usando Mistral OCR. Es el paso de normalización de formato que habilita todo el procesamiento semántico posterior.</p>
                </StageCard>

                <StageCard code="service-qdrant-by-file" label="Indexación de Documentos" number={4} variant="implemented" tags={["fan_out: archivo"]}>
                    <p>Indexa cada archivo individualmente en Qdrant como un primer paso de indexación granular (útil para operaciones a nivel archivo y para validaciones tempranas).</p>
                </StageCard>

                <StageCard code="service-file-metadata-extractor" label="Extracción de Metadatos" number={5} variant="implemented" tags={["fan_out: archivo"]}>
                    <p>Extrae metadatos estructurados de cada archivo (título, tipo de documento candidato, fechas, número de páginas, etc.) que alimentan la clasificación posterior.</p>
                </StageCard>

                <StageCard code="service-setup-qdrant" label="Configuración RAG" number={6} variant="implemented">
                    <p>Configura la colección Qdrant específica del análisis con el esquema de payload esperado por las etapas posteriores.</p>
                </StageCard>
            </div>

            <BlockTitle>Bloque B — Clasificación y consolidación documental</BlockTitle>
            <div className="space-y-3">
                <StageCard code="service-documents-classifier" label="Clasificación de Documentos" number={7} variant="implemented" tags={["fan_out: archivo + metadatos"]}>
                    <p>Clasifica cada archivo según su rol en el expediente: pliego particular, anexo técnico, normativa externa, propuesta de oferente, circular aclaratoria, etc. Es la base para saber qué se unifica con qué en las etapas siguientes.</p>
                </StageCard>

                <StageCard code="service-documents-grouper" label="Agrupación de Documentos" number={8} variant="implemented" tags={["pause_after (HITL)"]}>
                    <p>Agrupa los archivos clasificados en conjuntos lógicos que deben procesarse juntos (pliego particular + anexos + normativas que conforman el &quot;pliego único&quot;, por cada propuesta sus archivos asociados, etc.).</p>
                    <p>Pausa después de ejecutar para que un operador humano revise la agrupación propuesta antes de consolidar. Este gate es crítico porque una agrupación mal hecha contamina toda la pipeline posterior.</p>
                </StageCard>

                <StageCard code="service-joiner" label="Uniendo Documentos" number={9} variant="implemented">
                    <p>Consolida cada grupo de archivos en un único markdown por grupo (p. ej. un markdown que concentra pliego + anexos + normativas, y uno por propuesta). En la consolidación se pierde la trazabilidad por archivo fuente, compensada parcialmente con citas (<code className="font-mono text-xs bg-zinc-100 px-1 rounded">chunk_id + snippet</code>).</p>
                </StageCard>

                <StageCard code="service-chunk-and-index" label="Chunking e Indexación" number={10} variant="implemented" tags={["fan_out: markdown unificado"]}>
                    <p>Toma cada markdown consolidado y lo chunkea con markdown-header-splitter, genera embeddings con <code className="font-mono text-xs bg-zinc-100 px-1 rounded">text-embedding-3-small</code> y lo indexa en Qdrant con el payload completo.</p>
                    <FieldList fields={[
                        { name: "analysis_id", description: "Identificador del análisis." },
                        { name: "category", description: "pliego | proposal" },
                        { name: "proposal_id", description: "Cuando aplica." },
                        { name: "chunk_index", description: "Posición del chunk." },
                        { name: "text", description: "Contenido del chunk." },
                        { name: "Header 1", description: "Sección del documento." },
                    ]} />
                    <InfoBox>Esta es la fuente de verdad RAG sobre la que trabajan todas las etapas de análisis semántico posteriores.</InfoBox>
                </StageCard>
            </div>

            <BlockTitle>Bloque C — Análisis del pliego</BlockTitle>
            <div className="space-y-3">
                <StageCard code="service-tender-classifier" label="Determinación Sistema de Evaluación" number={11} variant="implemented">
                    <p>Analiza el markdown unificado del pliego para detectar el <code className="font-mono text-xs bg-zinc-100 px-1 rounded">evaluation_profile</code>: tipo de estrategia de evaluación y vocabulario de factores ponderables.</p>
                    <FieldList fields={[
                        { name: "puntos", description: "Suma ponderada de puntos." },
                        { name: "porcentajes", description: "Suma ponderada de porcentajes." },
                        { name: "mixto_cualitativo_cuantitativo", description: "Combinación con ponderación diferente para la parte cualitativa." },
                        { name: "solo_precio_con_AN", description: "Ordenamiento por precio con ajustes AN." },
                        { name: "solo_precio_exclusivo", description: "Solo precio, sin otros factores." },
                        { name: "precio_con_incremento_multas", description: "Precio corregido por historial de multas." },
                        { name: "delegado_pliego_general", description: "Evaluación delegada al pliego general." },
                        { name: "indeterminado", description: "No se pudo determinar la estrategia." },
                    ]} />
                    <p className="text-xs text-zinc-500">Persiste en <code className="font-mono bg-zinc-100 px-1 rounded">tender_classifications</code> con <code className="font-mono bg-zinc-100 px-1 rounded">profile_version = 2</code>.</p>
                </StageCard>

                <StageCard code="service-requirement-extractor" label="Extracción de Requisitos" number={12} variant="implemented" tags={["pause_after (HITL)"]}>
                    <p>Recorre todos los chunks del pliego unificado, extrae requisitos atómicos y los clasifica según el esquema multi-eje (Eje 1 rol, Eje 2 factor, Eje 3 dominio, Eje 4 peso, Eje 6 método de verificación, Eje 7 obligatoriedad temporal; Eje 5 diferido).</p>
                    <p>Persiste en <code className="font-mono text-xs bg-zinc-100 px-1 rounded">analysis_requirements</code> con código <code className="font-mono text-xs bg-zinc-100 px-1 rounded">REQ-001</code>, <code className="font-mono text-xs bg-zinc-100 px-1 rounded">REQ-002</code>, etc.</p>
                    <p>Pausa después para que el evaluador humano revise y marque como <code className="font-mono text-xs bg-zinc-100 px-1 rounded">is_verified</code> los requisitos críticos antes de avanzar a la evaluación de propuestas.</p>
                </StageCard>
            </div>

            <BlockTitle>Bloque D — Evaluación de propuestas</BlockTitle>
            <div className="space-y-3">
                <StageCard code="service-compliance-matcher" label="Matcher de Cumplimiento" number={13} variant="implemented" tags={["pause_after (HITL)", "fan_out: propuesta"]}>
                    <p>Por cada propuesta lanza un job que, para cada requisito del pliego, decide si la propuesta cumple usando RAG focalizado sobre los chunks de esa propuesta y una llamada LLM dedicada por requisito.</p>
                    <FieldList fields={[
                        { name: "cumple", description: "La propuesta satisface el requisito." },
                        { name: "cumple_parcial", description: "Cumplimiento parcial documentado." },
                        { name: "no_cumple", description: "La propuesta no satisface el requisito." },
                        { name: "no_evidencia", description: "No se encontró evidencia en la propuesta." },
                        { name: "no_aplica", description: "El requisito no aplica a esta propuesta." },
                        { name: "requiere_verificacion_manual", description: "Se requiere revisión humana." },
                    ]} />
                    <p className="text-xs text-zinc-500">Escribe <code className="font-mono bg-zinc-100 px-1 rounded">analysis_compliance_matrix</code>. El gate permite al evaluador revisar y ajustar veredictos vía HITL.</p>
                </StageCard>

                <StageCard code="service-compliance-summarizer" label="Resumen de Cumplimiento" number={14} variant="implemented" tags={["fan_out: propuesta", "is_final"]}>
                    <p>Por cada propuesta en <code className="font-mono text-xs bg-zinc-100 px-1 rounded">matrix_ready</code>, computa de forma determinista las métricas agregadas y genera con una única llamada al LLM el texto narrativo de <code className="font-mono text-xs bg-zinc-100 px-1 rounded">compliance_summary</code>.</p>
                    <FieldList fields={[
                        { name: "compliance_rate", description: "Tasa de cumplimiento global de la propuesta." },
                        { name: "compliance_counts", description: "Conteos por veredicto." },
                        { name: "critical_failures_count", description: "Cantidad de fallas en requisitos críticos." },
                    ]} />
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-500">
                        Este es hoy el <strong>nodo final</strong> del grafo de servicios. Después de que todas las propuestas están en <code className="font-mono bg-zinc-100 px-1 rounded">completed</code>, el pipeline se detiene. La decisión de adjudicación queda fuera del sistema automatizado.
                    </div>
                </StageCard>
            </div>

            {/* ===== PARTE 2 ===== */}
            <SectionTitle id="parte-2">Parte 2 — Etapas propuestas</SectionTitle>
            <p className="text-sm text-zinc-500 mb-4">
                Lo que falta para llegar de &quot;propuestas con matriz de cumplimiento y resumen&quot; a &quot;recomendación de adjudicación documentada y auditable&quot;.
            </p>

            <div className="space-y-3">
                <StageCard
                    code="service-economic-offer-extractor"
                    label="Extracción de Oferta Económica"
                    number={15}
                    variant="proposed"
                    tags={["fan_out: propuesta", "crítico"]}
                >
                    <p>Por cada propuesta, hace RAG focalizado sobre la sección de oferta económica y usa un LLM con output estructurado para extraer:</p>
                    <ul className="list-disc list-inside space-y-0.5 mt-1 text-zinc-600">
                        <li>Monto total ofertado (valor, moneda, IVA, impuestos).</li>
                        <li>Desglose por ítem o línea cuando el pliego lo exige.</li>
                        <li>Forma de pago y plazos.</li>
                        <li>Plazo de validez de la oferta.</li>
                        <li>Ajustes paramétricos (fórmulas de ajuste por inflación, TC, etc.).</li>
                        <li>Descuentos condicionales (por volumen, por pronto pago, etc.).</li>
                        <li>Preferencia nacional / MYPE si el oferente la declara.</li>
                    </ul>
                    <InfoBox>Sin este paso no es posible comparar propuestas por precio ni alimentar la fórmula del pliego en el scoring.</InfoBox>
                    <p className="text-xs text-zinc-500 mt-1">
                        <strong>Persistencia:</strong> nueva tabla <code className="font-mono bg-zinc-100 px-1 rounded">proposal_economic_offers</code> con campos estructurados más un <code className="font-mono bg-zinc-100 px-1 rounded">raw_extraction jsonb</code>.<br />
                        <strong>Ubicación en el grafo:</strong> puede correr en paralelo al <code className="font-mono bg-zinc-100 px-1 rounded">service-compliance-matcher</code>, o en serie después del summarizer (Variante A, más simple).
                    </p>
                </StageCard>

                <StageCard
                    code="service-admissibility-gate"
                    label="Evaluación de Admisibilidad Formal"
                    number={16}
                    variant="proposed"
                    tags={["fan_out: propuesta"]}
                >
                    <p>Toma cada propuesta ya con matriz + métricas + oferta económica y aplica las reglas de admisibilidad formal para decidir si la propuesta es legalmente evaluable o si queda rechazada sin pasar al scoring:</p>
                    <ol className="list-decimal list-inside space-y-1 mt-1">
                        <li>Si <code className="font-mono text-xs bg-zinc-100 px-1 rounded">critical_failures_count &gt; 0</code> → <strong>rechazada</strong>.</li>
                        <li>Si faltan campos obligatorios de la oferta económica → <strong>rechazada</strong>.</li>
                        <li>Si condiciones habilitantes no verificables → <strong>condicionada</strong>.</li>
                        <li>En cualquier otro caso → <strong>admitida</strong>.</li>
                    </ol>
                    <p className="text-xs text-zinc-500 mt-2">
                        <strong>Persistencia:</strong> columnas nuevas en <code className="font-mono bg-zinc-100 px-1 rounded">proposals</code>: <code className="font-mono bg-zinc-100 px-1 rounded">admissibility_status</code>, <code className="font-mono bg-zinc-100 px-1 rounded">admissibility_reasons jsonb</code>, <code className="font-mono bg-zinc-100 px-1 rounded">admissibility_evaluated_at</code>.<br />
                        <strong>Ubicación:</strong> después del summarizer y del economic-offer-extractor (necesita ambos). Es el punto donde las dos ramas se juntan si corrieron en paralelo.
                    </p>
                </StageCard>

                <StageCard
                    code="service-scoring-engine"
                    label="Motor de Puntuación"
                    number={17}
                    variant="proposed"
                >
                    <p>Aplica la fórmula del pliego sobre todas las propuestas admitidas. Despacha internamente por tipo de estrategia:</p>
                    <FieldList fields={[
                        { name: "puntos / porcentajes", description: "Suma ponderada clásica de factores técnicos + precio." },
                        { name: "mixto_cualitativo_cuantitativo", description: "Combinación con ponderación diferente para la parte cualitativa." },
                        { name: "solo_precio_con_AN / solo_precio_exclusivo", description: "Ordenamiento por precio normalizado, con o sin ajustes AN y preferencia nacional / MYPE." },
                        { name: "precio_con_incremento_multas", description: "Precio corregido por historial de multas." },
                        { name: "delegado_pliego_general", description: "Devuelve estado 'no evaluable automáticamente'." },
                        { name: "indeterminado", description: "Falla suave con razonamiento." },
                    ]} />
                    <p className="text-xs text-zinc-500 mt-2">
                        <strong>Salida:</strong> nueva tabla <code className="font-mono bg-zinc-100 px-1 rounded">proposal_scores</code> con puntaje total, desglose por factor, justificación textual, ranking posicional y flags de desempate.<br />
                        <strong>Sin fan out</strong>: corre una sola vez por análisis, con vista global de todas las propuestas (ranking comparativo, normalización de precios).<br />
                        <strong>Ubicación:</strong> después del <code className="font-mono bg-zinc-100 px-1 rounded">service-admissibility-gate</code>.
                    </p>
                </StageCard>

                <StageCard
                    code="service-evaluation-report"
                    label="Acta de Evaluación"
                    number={18}
                    variant="proposed"
                    tags={["is_final"]}
                >
                    <p>Genera el deliverable final: un documento Word (<code className="font-mono text-xs bg-zinc-100 px-1 rounded">.docx</code>) y/o PDF con la estructura típica de un acta de evaluación de licitación uruguaya.</p>
                    <ol className="list-decimal list-inside space-y-0.5 mt-1 text-zinc-600">
                        <li>Identificación del llamado.</li>
                        <li>Propuestas recibidas.</li>
                        <li>Análisis de admisibilidad.</li>
                        <li>Evaluación técnica (matriz de cumplimiento resumida).</li>
                        <li>Evaluación económica (comparativa de ofertas).</li>
                        <li>Aplicación de la fórmula de evaluación.</li>
                        <li>Ranking final con justificación de desempates.</li>
                        <li>Recomendación al ordenador del gasto.</li>
                        <li>Anexos (matriz completa, citas, firmas).</li>
                    </ol>
                    <p className="text-xs text-zinc-500 mt-2">
                        <strong>Implementación:</strong> plantilla + datos. Narrativa por propuesta ya disponible en <code className="font-mono bg-zinc-100 px-1 rounded">compliance_summary</code>. Sin fan out: un acta por análisis.<br />
                        <strong>Persistencia:</strong> tabla <code className="font-mono bg-zinc-100 px-1 rounded">analysis_reports</code> con metadata (storage path, versión, generated_at) y endpoint de descarga.
                    </p>
                </StageCard>

                <StageCard
                    code="service-external-verifications"
                    label="Verificaciones Externas"
                    number={19}
                    variant="optional"
                    tags={["fan_out: propuesta"]}
                >
                    <p>Reemplaza parte del flujo HITL consultando fuentes externas para validar requisitos marcados como <code className="font-mono text-xs bg-zinc-100 px-1 rounded">requiere_verificacion_manual</code> o con <code className="font-mono text-xs bg-zinc-100 px-1 rounded">verification_method = certificado_externo</code>.</p>
                    <p className="mt-1">Integraciones candidatas: <strong>RUPE</strong>, <strong>BPS</strong>, <strong>DGI</strong>, <strong>BSE</strong>.</p>
                    <p className="text-xs text-zinc-500 mt-2">
                        <strong>Por qué es opcional:</strong> depende de que las integraciones estén disponibles, autenticadas y tengan SLAs aceptables. Sin este servicio, la pipeline sigue funcionando con HITL.<br />
                        <strong>Ubicación:</strong> entre el <code className="font-mono bg-zinc-100 px-1 rounded">service-compliance-matcher</code> y el <code className="font-mono bg-zinc-100 px-1 rounded">service-admissibility-gate</code>.
                    </p>
                </StageCard>

                <StageCard
                    code="service-pipeline-observability"
                    label="Observabilidad"
                    number={20}
                    variant="optional"
                >
                    <p>No es un nodo en la pipeline sino una tabla + vistas + dashboard que concentran el estado y métricas end-to-end de cada análisis:</p>
                    <ul className="list-disc list-inside space-y-0.5 mt-1 text-zinc-600">
                        <li>Timeline de ejecución (cada servicio con timestamps de inicio/fin).</li>
                        <li>Costos acumulados de LLM por etapa y total.</li>
                        <li>Conteos de éxito / falla / reintentos por servicio.</li>
                        <li>Estado actual del análisis y próximas etapas pendientes.</li>
                        <li>Métricas de calidad agregadas.</li>
                    </ul>
                    <p className="text-xs text-zinc-500 mt-2">Los servicios ya usan <code className="font-mono bg-zinc-100 px-1 rounded">log_event / supabase_logger</code>, suficiente para debugging. Este módulo es &quot;nice to have&quot; hasta que haya carga real.</p>
                </StageCard>
            </div>

            {/* ===== PARTE 3 ===== */}
            <SectionTitle id="parte-3">Parte 3 — Grafo propuesto con las etapas nuevas</SectionTitle>
            <p className="text-sm text-zinc-500 mb-4">Dos variantes según si el orquestador soporta fan-out con múltiples ramas desde un mismo padre.</p>

            <div className="space-y-4">
                <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-zinc-100">
                        <p className="text-sm font-semibold text-zinc-900">Variante A — secuencial</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Mínimo esfuerzo. No requiere cambios al orquestador.</p>
                    </div>
                    <div className="p-4">
                        <CodeBlock>
{`... → compliance-matcher → compliance-summarizer → economic-offer-extractor → admissibility-gate → scoring-engine → evaluation-report
          (fan_out: proposal)  (fan_out: proposal)    (fan_out: proposal)      (fan_out: proposal)   (sin fan_out)   (sin fan_out)
          (HITL pause)`}
                        </CodeBlock>
                        <p className="text-xs text-zinc-500 mt-3">El <code className="font-mono bg-zinc-100 px-1 rounded">economic-offer-extractor</code> corre después del summarizer. No es el orden más eficiente (no aprovecha el paralelismo posible), pero respeta un grafo lineal simple.</p>
                    </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-zinc-100">
                        <p className="text-sm font-semibold text-zinc-900">Variante B — con ramas paralelas</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Más eficiente. Requiere join en el orquestador.</p>
                    </div>
                    <div className="p-4">
                        <CodeBlock>
{`                                              +-- compliance-matcher --> compliance-summarizer --+
                                              |      (HITL pause)                               |
requirement-extractor (HITL pause) ---------->|                                                 +---> admissibility-gate --> scoring-engine --> evaluation-report
                                              |                                                 |         (fan_out: proposal)  (sin fan_out)    (sin fan_out)
                                              +-- economic-offer-extractor ---------------------+
                                                     (fan_out: proposal)`}
                        </CodeBlock>
                        <p className="text-xs text-zinc-500 mt-3">Ambas ramas son fan-out por propuesta. El <code className="font-mono bg-zinc-100 px-1 rounded">admissibility-gate</code> requiere que ambas ramas hayan terminado para una misma <code className="font-mono bg-zinc-100 px-1 rounded">proposal_id</code> antes de correr (barrier/join por proposal_id).</p>
                    </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <strong>Recomendación:</strong> arrancar con la Variante A (más simple) y migrar a la Variante B cuando la performance lo justifique. El costo de tiempo extra de la Variante A es aceptable para la primera iteración.
                </div>
            </div>

            {/* ===== PARTE 4 ===== */}
            <SectionTitle id="parte-4">Parte 4 — Orden de implementación sugerido</SectionTitle>
            <p className="text-sm text-zinc-500 mb-4">Para llegar cuanto antes a una pipeline de punta a punta que produzca un acta final usable:</p>

            <div className="space-y-2">
                {[
                    { n: 1, code: "service-economic-offer-extractor", reason: "Primero porque es input obligatorio de las dos etapas siguientes. Sin esto, ni el gate ni el scoring funcionan." },
                    { n: 2, code: "service-admissibility-gate", reason: "Segundo porque es el filtro que determina qué propuestas entran al scoring. Relativamente simple (reglas deterministas + una consulta a datos ya existentes), sin LLM." },
                    { n: 3, code: "service-scoring-engine", reason: "Tercero, la etapa con más lógica pero la que le da 'significado' a todo lo anterior. Conviene empezar soportando una sola estrategia (la más común en pruebas reales) y agregar las demás después." },
                    { n: 4, code: "service-evaluation-report", reason: "Cuarto, el deliverable final. Una vez que scoring funciona, armar el acta es mayormente plumbing + plantilla." },
                ].map(({ n, code, reason }) => (
                    <div key={n} className="flex gap-3 p-3 rounded-lg border border-zinc-200 bg-white">
                        <div className="w-6 h-6 rounded-full bg-zinc-100 text-zinc-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                            {n}
                        </div>
                        <div>
                            <code className="text-xs font-mono font-semibold text-zinc-800 bg-zinc-100 px-1.5 py-0.5 rounded">{code}</code>
                            <p className="text-sm text-zinc-600 mt-1">{reason}</p>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                Con esos cuatro, la pipeline termina en un <code className="font-mono bg-green-100 px-1 rounded">.docx</code> firmable. Las etapas 19 y 20 se agregan después como mejoras.
            </div>

            {/* ===== PARTE 5 ===== */}
            <SectionTitle id="parte-5">Parte 5 — Dependencias de schema y API para las etapas nuevas</SectionTitle>
            <p className="text-sm text-zinc-500 mb-4">Resumen de lo que cada nueva etapa requiere en términos de DB y endpoints:</p>

            <div className="space-y-2">
                {[
                    {
                        code: "economic-offer-extractor",
                        items: [
                            "Nueva tabla proposal_economic_offers",
                            "Endpoints POST/GET/PATCH siguiendo el patrón del matcher",
                        ],
                    },
                    {
                        code: "admissibility-gate",
                        items: [
                            "Columnas nuevas en proposals: admissibility_status enum, admissibility_reasons jsonb, admissibility_evaluated_at timestamp",
                            "Endpoint PATCH /api/v1/proposals/{id}/admissibility-result",
                        ],
                    },
                    {
                        code: "scoring-engine",
                        items: [
                            "Nueva tabla proposal_scores",
                            "Campo analyses.ranking",
                            "Endpoints nuevos para puntajes y ranking",
                        ],
                    },
                    {
                        code: "evaluation-report",
                        items: [
                            "Tabla analysis_reports con metadata (storage path, versión, generated_at)",
                            "Endpoint de descarga",
                            "Integración con almacenamiento (Supabase Storage o similar)",
                        ],
                    },
                ].map(({ code, items }) => (
                    <div key={code} className="rounded-lg border border-zinc-200 bg-white p-3">
                        <code className="text-xs font-mono font-semibold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded">{code}</code>
                        <ul className="mt-2 space-y-0.5 list-disc list-inside text-sm text-zinc-600">
                            {items.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                    </div>
                ))}
            </div>

            {/* ===== PARTE 6 ===== */}
            <SectionTitle id="parte-6">Parte 6 — Cosas diferidas que se cruzan con las etapas nuevas</SectionTitle>
            <p className="text-sm text-zinc-500 mb-4">Al momento de implementar estas etapas, conviene revisar las entradas del <code className="font-mono text-xs bg-zinc-100 px-1 rounded">pending.md</code>:</p>

            <div className="space-y-2">
                {[
                    {
                        ref: "Entrada 1 (Eje 5 — fuente del documento)",
                        text: "No bloqueante para ninguna de las etapas nuevas, pero el acta de evaluación se beneficia de poder citar 'según el pliego particular' vs 'según la normativa externa'.",
                    },
                    {
                        ref: "Entradas 2 y 3 (re-ejecución del matcher/extractor preservando HITL)",
                        text: "Importante si se habilita re-ejecución del scoring con cambios de pliego a mitad del proceso.",
                    },
                    {
                        ref: "Entrada 4 (re-ejecución voluntaria del summarizer)",
                        text: "Relevante solo si el scoring-engine también debe soportar re-ejecución voluntaria para probar cambios de fórmula.",
                    },
                ].map(({ ref, text }) => (
                    <div key={ref} className="rounded-lg border border-zinc-200 bg-white p-3">
                        <p className="text-xs font-semibold text-zinc-500">{ref}</p>
                        <p className="text-sm text-zinc-600 mt-1">{text}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
