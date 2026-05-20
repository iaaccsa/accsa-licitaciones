"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Layers, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface EjeValue {
    name: string;
    description: string;
    example?: string;
}

interface EjeData {
    number: number;
    name: string;
    question: string;
    required: string;
    requiredVariant: "obligatorio" | "condicional" | "no_implementado";
    description: string;
    color: {
        badge: string;       // number badge bg+text
        border: string;      // card top border
        valueBg: string;     // value row bg
        valueCode: string;   // code chip bg+text
    };
    values?: EjeValue[];
    extra?: React.ReactNode;
    notImplemented?: boolean;
}

const REQUIRED_STYLES: Record<EjeData["requiredVariant"], string> = {
    obligatorio: "bg-green-100 text-green-800 border-green-200",
    condicional: "bg-amber-100 text-amber-800 border-amber-200",
    no_implementado: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

function ValueRow({ name, description, example, color }: EjeValue & { color: EjeData["color"] }) {
    return (
        <div className={`rounded-lg border border-zinc-100 px-3 py-2.5 space-y-1 ${color.valueBg}`}>
            <code className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${color.valueCode}`}>{name}</code>
            <p className="text-sm text-zinc-600">{description}</p>
            {example && (
                <p className="text-xs text-zinc-400 italic">Ejemplo: &quot;{example}&quot;</p>
            )}
        </div>
    );
}

function EjeCard({ eje }: { eje: EjeData }) {
    const [expanded, setExpanded] = useState(false);
    const showExpand = eje.values && eje.values.length > 3;
    const visibleValues = showExpand && !expanded ? eje.values!.slice(0, 3) : eje.values;

    return (
        <div className={`rounded-xl border border-zinc-200 shadow-sm overflow-hidden bg-white border-t-4 ${eje.color.border}`}>
            {/* Header */}
            <div className="bg-white p-5 border-b border-zinc-100">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${eje.color.badge}`}>
                            <span className="text-sm font-bold">{eje.number}</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-base font-semibold text-zinc-900">{eje.name}</h2>
                                {eje.notImplemented && (
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                                        No implementado
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-zinc-500 mt-0.5 italic">{eje.question}</p>
                        </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${REQUIRED_STYLES[eje.requiredVariant]}`}>
                        {eje.required}
                    </span>
                </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
                <p className="text-sm text-zinc-600">{eje.description}</p>

                {visibleValues && visibleValues.length > 0 && (
                    <div className="space-y-2">
                        {visibleValues.map((v) => (
                            <ValueRow key={v.name} {...v} color={eje.color} />
                        ))}
                    </div>
                )}

                {showExpand && (
                    <button
                        onClick={() => setExpanded((v) => !v)}
                        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 transition-colors"
                    >
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {expanded ? "Ocultar valores" : `Ver ${eje.values!.length - 3} valores más`}
                    </button>
                )}

                {eje.extra}
            </div>
        </div>
    );
}

const ejes: EjeData[] = [
    {
        number: 1,
        name: "Rol en la evaluación",
        question: "¿Qué le hace este requisito a una oferta?",
        required: "Obligatorio",
        requiredVariant: "obligatorio",
        color: {
            badge: "bg-blue-100 text-blue-700",
            border: "border-t-blue-400",
            valueBg: "bg-blue-50",
            valueCode: "bg-blue-100 text-blue-800",
        },
        description: "Es el eje más importante del esquema. Un requisito puede tener más de un rol simultáneamente — por ejemplo, ser a la vez un filtro de admisibilidad y un factor puntuable.",
        values: [
            { name: "admisibilidad_obligatoria", description: "Requisito de cumplimiento obligatorio. Si la oferta no lo cumple, queda automáticamente fuera de evaluación. No genera puntaje.", example: "El oferente deberá presentar certificado vigente del BPS al momento de la apertura de ofertas." },
            { name: "admisibilidad_subsanable", description: "Requisito obligatorio que admite ser subsanado dentro de un plazo definido por el pliego (típicamente 24 a 72 horas). Si el oferente regulariza, no es causal de rechazo.", example: "La omisión de la firma en la planilla de cotización podrá subsanarse dentro del plazo de 48 horas." },
            { name: "puntuable", description: "Requisito que entra en la fórmula de puntaje del pliego. Su cumplimiento contribuye al puntaje total de la oferta.", example: "Se otorgarán 15 puntos a quienes acrediten antecedentes positivos con organismos públicos." },
            { name: "penalizador", description: "Su incumplimiento o situación negativa resta puntos o incrementa el valor de comparación de la oferta. No rechaza la oferta, la castiga.", example: "Los antecedentes negativos en RUPE se restarán del puntaje total hasta un máximo de 12 puntos." },
            { name: "informativo", description: "Información que el pliego pide declarar pero que no afecta ni la admisibilidad ni el puntaje. Suele usarse para fines estadísticos.", example: "A efectos meramente informativos, el oferente declarará la cantidad de empleados de la empresa." },
            { name: "preferencia_legal", description: "Activa un régimen de preferencia previsto por la normativa vigente (PIN, MIPYMES, margen de preferencia nacional). La ley aplica una corrección sobre el resultado final.", example: "Las ofertas de productos calificados como PIN gozarán del margen de preferencia previsto en la Ley 18.362." },
            { name: "desconocido_pendiente_pliego_general", description: "Solo se usa cuando la estrategia es 'delegado_pliego_general' y el documento general todavía no está disponible. Marca al requisito como pendiente de clasificación definitiva." },
        ],
        extra: (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <strong>Nota:</strong> Cuáles roles están disponibles depende de la estrategia de evaluación detectada en el pliego. En un pliego{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">solo_precio_exclusivo</code> los roles{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">puntuable</code> y{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">penalizador</code> no están habilitados.
            </div>
        ),
    },
    {
        number: 2,
        name: "Mapeo al factor de evaluación",
        question: "¿A qué factor del pliego está atado?",
        required: "Solo si puntuable o penalizador",
        requiredVariant: "condicional",
        color: {
            badge: "bg-violet-100 text-violet-700",
            border: "border-t-violet-400",
            valueBg: "bg-violet-50",
            valueCode: "bg-violet-100 text-violet-800",
        },
        description: "Ata el requisito al factor concreto del pliego que lo evalúa. Los factores no son genéricos: los instancia el servicio de clasificación leyendo el pliego en cuestión. Si el extractor no logra atar un requisito a ningún factor existente, no puede inventar uno: el sistema lo degrada automáticamente y registra la situación para revisión humana.",
        extra: (
            <div className="space-y-3">
                <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Factores canónicos típicos</p>
                    <div className="flex flex-wrap gap-1.5">
                        {["precio", "antecedentes_publicos", "antecedentes_privados", "antiguedad", "calidad_tecnica",
                          "formacion_rrhh", "plazo_entrega", "procedencia", "garantia", "postventa",
                          "cantidad_items", "sanciones_rupe", "antecedentes_negativos"].map(f => (
                            <Badge key={f} variant="secondary" className="text-xs font-mono">{f}</Badge>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Campos del mapeo</p>
                    <div className="space-y-1.5">
                        {[
                            { name: "factor_id", description: "Identificador del factor, debe coincidir con uno de los definidos en el perfil de evaluación del pliego." },
                            { name: "weight_type", description: "points, percent, formula o none." },
                            { name: "value", description: "Valor numérico del peso cuando es extraíble." },
                            { name: "formula", description: "Fórmula literal copiada del pliego cuando existe (ej: '50 × (PME/PEv)')." },
                            { name: "block", description: "Bloque al que pertenece el factor, solo aplica a la estrategia mixta." },
                        ].map(({ name, description }) => (
                            <div key={name} className="flex gap-2 text-sm text-zinc-600">
                                <code className="text-xs font-mono font-semibold text-zinc-700 bg-zinc-100 px-1.5 py-0.5 rounded h-fit shrink-0 mt-0.5">{name}</code>
                                <span>{description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        ),
    },
    {
        number: 3,
        name: "Dominio / Naturaleza",
        question: "¿De qué se trata?",
        required: "Obligatorio",
        requiredVariant: "obligatorio",
        color: {
            badge: "bg-emerald-100 text-emerald-700",
            border: "border-t-emerald-400",
            valueBg: "bg-emerald-50",
            valueCode: "bg-emerald-100 text-emerald-800",
        },
        description: "Describe el requisito desde el punto de vista temático. Es una taxonomía descriptiva, útil para navegar la lista, asignar revisiones a equipos especializados o filtrar reportes. No tiene efecto sobre el cálculo del puntaje.",
        values: [
            { name: "tecnico", description: "Especificaciones técnicas del bien o servicio: características físicas, normas, procesos, capacidades, parámetros de calidad técnica." },
            { name: "administrativo", description: "Documentación, formularios, declaraciones juradas, inscripciones registrales, certificados de organismos públicos, formato de la oferta." },
            { name: "legal", description: "Cumplimiento de leyes, decretos, reglamentos, requisitos jurídicos del oferente o de la oferta, cláusulas contractuales." },
            { name: "economico_financiero", description: "Capacidad económica, garantías de mantenimiento, garantías de fiel cumplimiento, balances, estados contables, condiciones de pago." },
            { name: "rrhh", description: "Recursos humanos: formación del personal, calificaciones técnicas, antigüedad de los profesionales, plantilla mínima." },
            { name: "logistico", description: "Plazos de entrega, condiciones de envío, lugares de recepción, distribución, almacenamiento." },
            { name: "ambiental", description: "Cumplimiento de normativa ambiental, certificaciones, gestión de residuos, eficiencia energética." },
            { name: "calidad", description: "Sistemas de gestión de calidad, certificaciones ISO, controles de calidad, trazabilidad." },
            { name: "seguridad", description: "Seguridad e higiene laboral, planes de contingencia, equipos de protección, normativa de prevención de riesgos." },
            { name: "otro", description: "Cualquier requisito que no encaje claramente en las categorías anteriores." },
        ],
    },
    {
        number: 4,
        name: "Peso cuantitativo",
        question: "¿Cuánto suma o resta?",
        required: "Solo cuando aplica",
        requiredVariant: "condicional",
        color: {
            badge: "bg-amber-100 text-amber-700",
            border: "border-t-amber-400",
            valueBg: "bg-amber-50",
            valueCode: "bg-amber-100 text-amber-800",
        },
        description: "Captura cuánto suma o resta el requisito al puntaje total de la oferta. Es el reflejo numérico del Eje 2 a nivel del requisito individual. Para requisitos no puntuables queda en {type: 'none', value: null, formula: null, block: null}.",
        values: [
            { name: "type", description: "Cómo se expresa el peso: points (puntos absolutos), percent (porcentaje del total), formula (cálculo literal del pliego), o none." },
            { name: "value", description: "Valor numérico del peso, si es extraíble. Puede ser negativo en penalizadores (ej: -12 para 'se restarán hasta 12 puntos')." },
            { name: "formula", description: "Fórmula literal copiada del pliego, sin reescritura. Imprescindible para auditoría." },
            { name: "block", description: "Aplicable únicamente a la estrategia mixta. Indica en qué bloque pondera el peso." },
        ],
    },
    {
        number: 5,
        name: "Fuente del requisito",
        question: "¿De qué documento proviene?",
        required: "No implementado",
        requiredVariant: "no_implementado",
        notImplemented: true,
        color: {
            badge: "bg-zinc-100 text-zinc-500",
            border: "border-t-zinc-300",
            valueBg: "bg-zinc-50",
            valueCode: "bg-zinc-200 text-zinc-600",
        },
        description: "La intención es identificar de qué documento proviene cada requisito (pliego particular, anexo, pliego general, ley, decreto). En la implementación actual, todos los archivos se unifican en un único documento markdown antes de indexarlos, perdiendo la pertenencia de cada fragmento a su documento original. La trazabilidad se mantiene a través de las citas.",
    },
    {
        number: 6,
        name: "Método de verificación",
        question: "¿Cómo se comprueba el cumplimiento?",
        required: "Obligatorio",
        requiredVariant: "obligatorio",
        color: {
            badge: "bg-cyan-100 text-cyan-700",
            border: "border-t-cyan-400",
            valueBg: "bg-cyan-50",
            valueCode: "bg-cyan-100 text-cyan-800",
        },
        description: "Describe cómo se va a comprobar el cumplimiento del requisito al evaluar las propuestas. Alimenta directamente el checklist que el evaluador (humano o automatizado) debe seguir.",
        values: [
            { name: "documento_adjunto", description: "Se verifica revisando un documento que el oferente debe adjuntar a la propuesta (folleto técnico, ficha de producto, certificado privado, planilla, etc.)." },
            { name: "declaracion_jurada", description: "Se verifica con una declaración jurada firmada por el oferente. La responsabilidad recae sobre quien declara." },
            { name: "certificado_externo", description: "Se verifica consultando un sistema o registro externo: BPS, DGI, RUPE, MIDES, etc. Deben estar vigentes al momento de la apertura." },
            { name: "inspeccion", description: "Requiere una inspección presencial por parte del organismo contratante (instalaciones, depósitos, plantas de producción, etc.)." },
            { name: "muestra", description: "Requiere la entrega de una muestra física del bien ofertado para análisis o ensayo." },
            { name: "visita_tecnica", description: "Requiere que el oferente realice una visita técnica al lugar de ejecución del contrato, generalmente como condición previa a ofertar." },
            { name: "auto_verificable_desde_oferta", description: "Se puede verificar leyendo directamente la propuesta del oferente, sin documentos adicionales." },
            { name: "otro", description: "Cualquier método que no encaje en los anteriores." },
        ],
    },
    {
        number: 7,
        name: "Obligatoriedad temporal",
        question: "¿Cuándo debe cumplirse?",
        required: "Obligatorio",
        requiredVariant: "obligatorio",
        color: {
            badge: "bg-indigo-100 text-indigo-700",
            border: "border-t-indigo-400",
            valueBg: "bg-indigo-50",
            valueCode: "bg-indigo-100 text-indigo-800",
        },
        description: "Describe cuándo debe cumplirse el requisito. La distinción importa porque cambia la naturaleza de la verificación: un requisito al momento de ofertar se evalúa sobre la propuesta, uno durante la ejecución solo puede verificarse contra el contrato firmado.",
        values: [
            { name: "al_momento_ofertar", description: "Debe cumplirse en el momento mismo de presentar la oferta. Es el caso más común: certificados vigentes, formularios completos, garantías de mantenimiento, etc." },
            { name: "previo_adjudicacion", description: "Debe cumplirse antes de que el organismo formalice la adjudicación, pero no necesariamente al momento de ofertar." },
            { name: "durante_ejecucion", description: "Debe cumplirse durante el período de ejecución del contrato. Por ejemplo, mantener vigentes los certificados de BPS y DGI a lo largo de toda la prestación." },
            { name: "postventa", description: "Debe cumplirse después de la entrega del bien o finalización del servicio. Incluye garantías de funcionamiento, servicio técnico postventa, repuestos disponibles, etc." },
            { name: "otro", description: "Para casos atípicos que no encajan en los anteriores." },
        ],
    },
];

export default function RequirementsEdgesPage() {
    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            <div className="flex items-center gap-3 mb-6">
                <Link
                    href="/docs"
                    className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>
            </div>

            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <Layers className="w-6 h-6 text-zinc-400 shrink-0" />
                    <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">Ejes de clasificación de requisitos</h1>
                </div>
                <p className="text-sm text-zinc-500">
                    Cada requisito extraído de un pliego de licitación se describe usando un esquema multi-eje.
                    Una sola etiqueta no alcanza: hace falta describirlo en varias dimensiones ortogonales para que
                    el motor de evaluación pueda usarlo correctamente.
                </p>
            </div>

            <div className="space-y-4">
                {ejes.map((eje) => (
                    <EjeCard key={eje.number} eje={eje} />
                ))}

                {/* Citas card */}
                <div className="rounded-xl border border-zinc-200 shadow-sm overflow-hidden bg-white border-t-4 border-t-rose-400">
                    <div className="bg-white p-5 border-b border-zinc-100">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold">Cit</span>
                                </div>
                                <div>
                                    <h2 className="text-base font-semibold text-zinc-900">Citas</h2>
                                    <p className="text-sm text-zinc-500 mt-0.5 italic">Trazabilidad al texto original del pliego</p>
                                </div>
                            </div>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 mt-0.5 bg-green-100 text-green-800 border-green-200">
                                Obligatorio
                            </span>
                        </div>
                    </div>
                    <div className="p-5 space-y-3">
                        <p className="text-sm text-zinc-600">
                            Cada requisito conserva una o más citas que lo conectan con el texto literal del pliego.
                            Son condición necesaria para que el sistema sea auditable: ningún requisito puede existir sin al menos una cita.
                        </p>
                        <div className="space-y-2">
                            {[
                                { name: "chunk_id", description: "Identificador del chunk en la base vectorial. Permite recuperar el fragmento exacto del documento original." },
                                { name: "page", description: "Referencia textual a la página, sección o artículo del pliego donde aparece el requisito (ej: 'Pliego particular, art. 12.1')." },
                                { name: "snippet", description: "Cita literal corta (hasta 300 caracteres) tomada del texto original. Es la huella textual del requisito." },
                            ].map(({ name, description }) => (
                                <ValueRow key={name} name={name} description={description} color={{ valueBg: "bg-rose-50", valueCode: "bg-rose-100 text-rose-800", badge: "", border: "" }} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
