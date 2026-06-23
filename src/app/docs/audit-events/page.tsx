import Link from "next/link";
import { ArrowLeft, ScrollText } from "lucide-react";

const CATEGORY_STYLES = {
    Análisis: "bg-blue-50 text-blue-700 border-blue-200",
    "Requisitos y cumplimiento": "bg-violet-50 text-violet-700 border-violet-200",
    "Configuración (admin)": "bg-amber-50 text-amber-700 border-amber-200",
} as const;

type Event = {
    category: keyof typeof CATEGORY_STYLES;
    action: string;
    resourceType: string;
    when: string;
    details: string;
};

const events: Event[] = [
    {
        category: "Análisis",
        action: "analysis.create",
        resourceType: "analysis",
        when: "Se sube un ZIP y se crea un nuevo análisis. También se registra con estado failure si la creación falla.",
        details: "En fallo: mensaje de error.",
    },
    {
        category: "Análisis",
        action: "analysis.rename",
        resourceType: "analysis",
        when: "Se renombra o edita un análisis.",
        details: "Campos modificados (patch).",
    },
    {
        category: "Análisis",
        action: "analysis.download",
        resourceType: "analysis",
        when: "Se descargan los archivos fuente de un análisis.",
        details: "Cantidad de archivos.",
    },
    {
        category: "Análisis",
        action: "analysis.delete",
        resourceType: "analysis",
        when: "Eliminación masiva de análisis (limpieza global).",
        details: "Alcance (all) y resumen de lo eliminado.",
    },
    {
        category: "Requisitos y cumplimiento",
        action: "requirement.update",
        resourceType: "requirement",
        when: "Se editan requisitos: reemplazo masivo, verificar todos, o edición individual.",
        details: "Operación (bulk_replace / verify_all / update) y cantidad, patch o estado de verificación.",
    },
    {
        category: "Requisitos y cumplimiento",
        action: "compliance_result.update",
        resourceType: "compliance_result · compliance_matrix_entry",
        when: "Se editan resultados de cumplimiento o una celda de la matriz de cumplimiento.",
        details: "Cantidad y propuestas afectadas, o patch de la celda.",
    },
    {
        category: "Requisitos y cumplimiento",
        action: "admissibility.override",
        resourceType: "proposal",
        when: "Override manual de la decisión de admisibilidad de una propuesta.",
        details: "Decisión y justificación enviadas.",
    },
    {
        category: "Configuración (admin)",
        action: "prompt.update",
        resourceType: "service_prompt",
        when: "Se edita el prompt de un servicio del pipeline.",
        details: "Key, servicio y archivo del prompt.",
    },
    {
        category: "Configuración (admin)",
        action: "llm_config.update",
        resourceType: "app_setting",
        when: "Se cambia la configuración global de LLM (proveedor / nivel de inteligencia).",
        details: "Configuración completa aplicada.",
    },
    {
        category: "Configuración (admin)",
        action: "hitl_config.update",
        resourceType: "app_setting",
        when: "Se cambia la configuración de HITL (human-in-the-loop).",
        details: "Configuración completa aplicada.",
    },
    {
        category: "Configuración (admin)",
        action: "notifications_config.update",
        resourceType: "app_setting",
        when: "Se cambia la configuración de notificaciones.",
        details: "Configuración completa aplicada.",
    },
];

function CategoryBadge({ category }: { category: keyof typeof CATEGORY_STYLES }) {
    return (
        <span className={`w-fit text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_STYLES[category]}`}>
            {category}
        </span>
    );
}

export default function AuditEventsPage() {
    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
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
                    <ScrollText className="w-6 h-6 text-zinc-400 shrink-0" />
                    <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">
                        Eventos de auditoría
                    </h1>
                </div>
                <p className="text-sm text-zinc-500">
                    Acciones de usuario que la API registra en la tabla{" "}
                    <code className="font-mono text-xs bg-zinc-100 px-1 rounded">audit_logs</code>. El registro es{" "}
                    <em>best-effort</em>: si la auditoría falla, la acción de negocio nunca se interrumpe. Cada evento
                    guarda además el actor (usuario, email, IP, user agent), el estado (
                    <code className="font-mono text-xs bg-zinc-100 px-1 rounded">success</code> o{" "}
                    <code className="font-mono text-xs bg-zinc-100 px-1 rounded">failure</code>) y la fecha. Consultables
                    en{" "}
                    <Link href="/admin/config/audit" className="text-blue-600 hover:underline">
                        Admin → Auditoría
                    </Link>
                    .
                </p>
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap gap-3 mb-6 p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                {(Object.keys(CATEGORY_STYLES) as (keyof typeof CATEGORY_STYLES)[]).map((c) => (
                    <CategoryBadge key={c} category={c} />
                ))}
                <span className="text-xs text-zinc-400 self-center ml-1">| Categoría</span>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200">
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Acción</th>
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Recurso</th>
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Cuándo se registra</th>
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Datos guardados</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 bg-white">
                        {events.map((e) => (
                            <tr key={e.action + e.when} className="hover:bg-zinc-50 transition-colors">
                                <td className="px-4 py-3 align-top">
                                    <div className="flex flex-col gap-1.5">
                                        <code className="w-fit font-mono text-xs font-medium bg-zinc-100 text-zinc-800 px-2 py-0.5 rounded">
                                            {e.action}
                                        </code>
                                        <CategoryBadge category={e.category} />
                                    </div>
                                </td>
                                <td className="px-4 py-3 align-top hidden md:table-cell">
                                    <span className="font-mono text-xs text-zinc-500">{e.resourceType}</span>
                                </td>
                                <td className="px-4 py-3 align-top text-sm text-zinc-700 leading-snug">{e.when}</td>
                                <td className="px-4 py-3 align-top text-xs text-zinc-500 leading-snug hidden lg:table-cell">{e.details}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Note */}
            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <strong>Nota:</strong> el actor se obtiene de las cabeceras{" "}
                <code className="font-mono text-xs bg-blue-100 px-1 rounded">X-User-Id</code> y{" "}
                <code className="font-mono text-xs bg-blue-100 px-1 rounded">X-User-Email</code> que reenvía el proxy del
                frontend (ya autenticado por Supabase). Las llamadas de sistema o servicios producen un actor vacío. El
                pipeline automático no se audita: solo se registran las acciones de usuario listadas arriba.
            </div>
        </div>
    );
}
