import Link from "next/link";
import { ArrowLeft, Braces, Boxes, Layers3, Network, ShieldCheck } from "lucide-react";

interface Field {
    key: string;
    example: string;
    description: string;
    note?: React.ReactNode;
}

interface Group {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    intro: string;
    accent: string;   // card top border
    badge: string;    // icon chip bg+text
    keyChip: string;  // field code chip bg+text
    fields: Field[];
}

const groups: Group[] = [
    {
        icon: Boxes,
        title: "Volumen de requisitos",
        intro: "Conteos crudos (lo que devolvió el LLM por batch) versus conteos finales (tras deduplicación y validación contra el perfil de evaluación). La diferencia entre crudo y final es esperable: se eliminan duplicados y requisitos inválidos.",
        accent: "border-t-blue-400",
        badge: "bg-blue-100 text-blue-700",
        keyChip: "bg-blue-100 text-blue-800",
        fields: [
            {
                key: "raw_count",
                example: "215",
                description: "Requisitos generales crudos extraídos sumando todos los batches, antes de deduplicar y validar. Incluye repeticiones entre batches solapados.",
            },
            {
                key: "requirement_count",
                example: "207",
                description: "Requisitos generales finales persistidos en la tabla requirements. Resultado tras deduplicar y descartar los inválidos en la validación contra el perfil.",
                note: "raw_count - requirement_count = duplicados + descartes. Una caída grande puede indicar mucho solapamiento o un perfil que rechaza muchos roles.",
            },
            {
                key: "raw_admissibility_count",
                example: "38",
                description: "Requisitos de admisibilidad crudos extraídos en la segunda pasada (prompt dedicado), antes de deduplicar.",
            },
            {
                key: "admissibility_requirement_count",
                example: "38",
                description: "Requisitos de admisibilidad finales persistidos. Solo deduplicación, sin validación contra el perfil (la admisibilidad no usa evaluation_profile).",
            },
        ],
    },
    {
        icon: Layers3,
        title: "Procesamiento por batches",
        intro: "Los chunks del pliego se procesan en lotes (batches) de tamaño fijo. Estos campos miden robustez (cuántos fallaron) y latencia (cuánto tardó el más lento y el percentil 95).",
        accent: "border-t-amber-400",
        badge: "bg-amber-100 text-amber-700",
        keyChip: "bg-amber-100 text-amber-800",
        fields: [
            {
                key: "batch_count",
                example: "8",
                description: "Cantidad total de batches en que se dividieron los chunks del pliego (tamaño de batch = 15 chunks, con solapamiento).",
            },
            {
                key: "failed_batches",
                example: "0",
                description: "Batches que no devolvieron ningún requisito (Gemini falló y el fallback OpenAI también, o respuesta vacía).",
                note: "Si la proporción supera el 5% del total, el job aborta para no guardar resultados incompletos.",
            },
            {
                key: "failed_batch_ids",
                example: "[]",
                description: "IDs de los batches que fallaron. Lista vacía = todos produjeron resultados. Sirve para ubicar qué tramo del documento dio problemas.",
            },
            {
                key: "slowest_batch_id",
                example: "7",
                description: "ID del batch que más tardó en procesarse.",
            },
            {
                key: "slowest_batch_seconds",
                example: "88.7",
                description: "Duración en segundos del batch más lento (el peor caso individual).",
            },
            {
                key: "p95_batch_seconds",
                example: "84.08",
                description: "Percentil 95 de la duración de los batches: el 95% tardó menos que este valor. Mejor referencia de latencia típica que el máximo, porque ignora outliers.",
            },
        ],
    },
    {
        icon: Network,
        title: "Fallback de modelos LLM",
        intro: "Cada batch se intenta primero con el modelo primario (OpenAI). Si OpenAI no está disponible, se reintenta con Gemini. Estos contadores indican cuántas veces se activó esa cadena de respaldo: idealmente todos en 0.",
        accent: "border-t-violet-400",
        badge: "bg-violet-100 text-violet-700",
        keyChip: "bg-violet-100 text-violet-800",
        fields: [
            {
                key: "openai_unavailable_batches",
                example: "0",
                description: "Batches en los que el modelo primario (OpenAI) no estuvo disponible y se gatilló el fallback a Gemini.",
            },
            {
                key: "gemini_fallbacks_succeeded",
                example: "0",
                description: "Batches que usaron el fallback de Gemini y obtuvieron resultado con éxito.",
            },
            {
                key: "gemini_fallbacks_failed",
                example: "0",
                description: "Batches en los que el fallback de Gemini también falló. Cuentan como batch fallido en failed_batches.",
            },
        ],
    },
    {
        icon: ShieldCheck,
        title: "Calidad y clasificación",
        intro: "Resultado de la validación contra el perfil y la distribución final de los requisitos generales por rol y por dominio.",
        accent: "border-t-emerald-400",
        badge: "bg-emerald-100 text-emerald-700",
        keyChip: "bg-emerald-100 text-emerald-800",
        fields: [
            {
                key: "validation_warnings",
                example: "14",
                description: "Cantidad de correcciones automáticas o descartes al validar los requisitos contra el evaluation_profile. No son errores fatales: el detalle de cada uno queda en los eventos del análisis.",
                note: (
                    <>
                        Se disparan al limpiar roles no habilitados, degradar roles puntuables sin factores
                        válidos, quitar mapped_factors desconocidos o detectar inconsistencias de estrategia.
                        Ver{" "}
                        <Link href="/docs/requirements_edges" className="underline hover:text-zinc-700">
                            ejes de clasificación
                        </Link>{" "}
                        para los roles y dominios.
                    </>
                ),
            },
            {
                key: "role_distribution",
                example: '{ "admisibilidad_obligatoria": 98, "informativo": 73, ... }',
                description: "Conteo de requisitos generales finales por rol. Un requisito puede tener varios roles, por lo que la suma puede superar a requirement_count.",
            },
            {
                key: "domain_distribution",
                example: '{ "administrative": 96, "legal": 60, ... }',
                description: "Conteo de requisitos generales finales por dominio. Cada requisito tiene un único dominio, así que la suma equivale a requirement_count.",
            },
        ],
    },
];

const exampleJson = `{
  "raw_count": 215,
  "batch_count": 8,
  "failed_batches": 0,
  "failed_batch_ids": [],
  "slowest_batch_id": 7,
  "p95_batch_seconds": 84.08,
  "requirement_count": 207,
  "role_distribution": {
    "puntuable": 13,
    "informativo": 73,
    "penalizador": 1,
    "preferencia_legal": 28,
    "admisibilidad_subsanable": 9,
    "admisibilidad_obligatoria": 98
  },
  "domain_distribution": {
    "hr": 4,
    "legal": 60,
    "quality": 3,
    "financial": 28,
    "logistics": 9,
    "technical": 7,
    "administrative": 96
  },
  "validation_warnings": 14,
  "slowest_batch_seconds": 88.7,
  "gemini_fallbacks_failed": 0,
  "raw_admissibility_count": 38,
  "openai_unavailable_batches": 0,
  "gemini_fallbacks_succeeded": 0,
  "admissibility_requirement_count": 38
}`;

function FieldRow({ field, keyChip }: { field: Field; keyChip: string }) {
    return (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
                <code className={`text-xs font-mono font-semibold px-1.5 py-0.5 rounded ${keyChip}`}>{field.key}</code>
                <code className="text-xs font-mono text-zinc-400">{field.example}</code>
            </div>
            <p className="text-sm text-zinc-600">{field.description}</p>
            {field.note && (
                <p className="text-xs text-zinc-400 border-l-2 border-zinc-200 pl-2">{field.note}</p>
            )}
        </div>
    );
}

export default function RequirementExtractorSummaryPage() {
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
                    <Braces className="w-6 h-6 text-zinc-400 shrink-0" />
                    <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">Resumen del extractor de requisitos</h1>
                </div>
                <p className="text-sm text-zinc-500">
                    Al terminar, el servicio <code className="text-xs font-mono text-zinc-600">service-requirement-extractor</code>{" "}
                    emite un evento de resumen con métricas del procesamiento. Esta página explica qué significa cada campo
                    de ese JSON.
                </p>
            </div>

            <div className="mb-6 rounded-xl border border-zinc-200 bg-zinc-900 overflow-hidden shadow-sm">
                <div className="px-4 py-2 border-b border-zinc-700 text-xs font-mono text-zinc-400">
                    ejemplo de salida
                </div>
                <pre className="p-4 text-xs leading-relaxed text-zinc-200 overflow-x-auto">
                    <code>{exampleJson}</code>
                </pre>
            </div>

            <div className="space-y-4">
                {groups.map((group) => {
                    const Icon = group.icon;
                    return (
                        <div
                            key={group.title}
                            className={`rounded-xl border border-zinc-200 shadow-sm overflow-hidden bg-white border-t-4 ${group.accent}`}
                        >
                            <div className="p-5 border-b border-zinc-100">
                                <div className="flex items-center gap-3">
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${group.badge}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-base font-semibold text-zinc-900">{group.title}</h2>
                                </div>
                                <p className="text-sm text-zinc-500 mt-2">{group.intro}</p>
                            </div>
                            <div className="p-5 space-y-2">
                                {group.fields.map((field) => (
                                    <FieldRow key={field.key} field={field} keyChip={group.keyChip} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
