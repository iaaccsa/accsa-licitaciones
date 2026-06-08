import Link from "next/link";
import { ArrowLeft, Coins } from "lucide-react";

const LEVEL_STYLES = {
    Alto: "bg-red-50 text-red-700 border-red-200",
    Medio: "bg-amber-50 text-amber-700 border-amber-200",
    Bajo: "bg-green-50 text-green-700 border-green-200",
} as const;

type Tier = {
    provider: "openai" | "gemini";
    level: "low" | "medium" | "high";
    levelLabel: keyof typeof LEVEL_STYLES;
    model: string;
    fallback: string;
    description: string;
    input: number;
    output: number;
    cached: number | null;
};

const tiers: Tier[] = [
    { provider: "openai", level: "low", levelLabel: "Bajo", model: "gpt-5.4-nano", fallback: "gemini-3.1-flash-lite", description: "Rápido y económico.", input: 0.2, output: 1.25, cached: null },
    { provider: "openai", level: "medium", levelLabel: "Medio", model: "gpt-5.4-mini", fallback: "gemini-3.5-flash", description: "Equilibrio velocidad/calidad.", input: 0.75, output: 4.5, cached: null },
    { provider: "openai", level: "high", levelLabel: "Alto", model: "gpt-5.5", fallback: "gemini-3.1-pro", description: "Máxima capacidad.", input: 5.0, output: 30.0, cached: 0.5 },
    { provider: "gemini", level: "low", levelLabel: "Bajo", model: "gemini-3.1-flash-lite", fallback: "gpt-5.4-nano", description: "Más económico, baja latencia.", input: 0.1, output: 0.4, cached: null },
    { provider: "gemini", level: "medium", levelLabel: "Medio", model: "gemini-3.5-flash", fallback: "gpt-5.4-mini", description: "Casi Pro a costo Flash.", input: 1.5, output: 9.0, cached: 0.15 },
    { provider: "gemini", level: "high", levelLabel: "Alto", model: "gemini-3.1-pro", fallback: "gpt-5.5", description: "Razonamiento, contexto 1M.", input: 2.0, output: 12.0, cached: null },
];

const comparison = [
    { level: "Bajo", openai: 1.45, gemini: 0.5 },
    { level: "Medio", openai: 5.25, gemini: 10.5 },
    { level: "Alto", openai: 35.0, gemini: 14.0 },
] as const;

function ModelBadge({ model }: { model: string }) {
    const isGemini = model.startsWith("gemini");
    const base = isGemini
        ? "bg-blue-50 text-blue-800 border-blue-200"
        : "bg-violet-50 text-violet-800 border-violet-200";
    return (
        <span className={`inline-block text-xs font-mono font-medium px-2 py-0.5 rounded border ${base}`}>
            {model}
        </span>
    );
}

function price(n: number | null) {
    return n === null ? "—" : `$${n.toFixed(2)}`;
}

export default function ModelTiersPage() {
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
                    <Coins className="w-6 h-6 text-zinc-400 shrink-0" />
                    <h1 className="text-2xl font-semibold text-zinc-800 font-serif italic">
                        Niveles de modelo y precios
                    </h1>
                </div>
                <p className="text-sm text-zinc-500">
                    Al crear un análisis el usuario elige un <strong>proveedor</strong> (Gemini u OpenAI) y un{" "}
                    <strong>nivel de inteligencia</strong> (bajo, medio, alto). Esa combinación resuelve el modelo a
                    usar a partir de la tabla{" "}
                    <code className="font-mono text-xs bg-zinc-100 px-1 rounded">model_tiers</code>. Precios en USD por
                    1M de tokens (junio 2026).
                </p>
            </div>

            {/* Leyenda */}
            <div className="flex flex-wrap gap-3 mb-6 p-3 rounded-lg bg-zinc-50 border border-zinc-200">
                {(["Alto", "Medio", "Bajo"] as const).map((l) => (
                    <span key={l} className={`text-xs font-medium px-2 py-0.5 rounded-full border ${LEVEL_STYLES[l]}`}>
                        {l}
                    </span>
                ))}
                <span className="text-xs text-zinc-400 self-center ml-1">| Nivel de inteligencia</span>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200">
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Proveedor / Nivel</th>
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Modelo</th>
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Fallback</th>
                            <th className="text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Entrada</th>
                            <th className="text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Salida</th>
                            <th className="text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Cacheado</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 bg-white">
                        {tiers.map((t) => (
                            <tr key={`${t.provider}-${t.level}`} className="hover:bg-zinc-50 transition-colors">
                                <td className="px-4 py-3 align-top">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold text-zinc-700 capitalize">{t.provider}</span>
                                        <span className={`w-fit text-xs font-medium px-2 py-0.5 rounded-full border ${LEVEL_STYLES[t.levelLabel]}`}>
                                            {t.levelLabel}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                    <div className="flex flex-col gap-1">
                                        <ModelBadge model={t.model} />
                                        <span className="text-xs text-zinc-400 leading-snug">{t.description}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 align-top hidden md:table-cell">
                                    <ModelBadge model={t.fallback} />
                                </td>
                                <td className="px-4 py-3 align-top text-right font-mono text-xs text-zinc-700">{price(t.input)}</td>
                                <td className="px-4 py-3 align-top text-right font-mono text-xs text-zinc-700">{price(t.output)}</td>
                                <td className="px-4 py-3 align-top text-right font-mono text-xs text-zinc-500 hidden sm:table-cell">{price(t.cached)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Cost comparison */}
            <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide mt-8 mb-3">
                Costo comparado (1M entrada + 1M salida)
            </h2>
            <div className="rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200">
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Nivel</th>
                            <th className="text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">OpenAI</th>
                            <th className="text-right text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3">Gemini</th>
                            <th className="text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide px-4 py-3 pl-6">Más barato</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 bg-white">
                        {comparison.map((c) => {
                            const cheaper = c.openai <= c.gemini ? "OpenAI" : "Gemini";
                            return (
                                <tr key={c.level} className="hover:bg-zinc-50 transition-colors">
                                    <td className="px-4 py-3">{c.level}</td>
                                    <td className={`px-4 py-3 text-right font-mono text-xs ${cheaper === "OpenAI" ? "text-green-700 font-semibold" : "text-zinc-700"}`}>${c.openai.toFixed(2)}</td>
                                    <td className={`px-4 py-3 text-right font-mono text-xs ${cheaper === "Gemini" ? "text-green-700 font-semibold" : "text-zinc-700"}`}>${c.gemini.toFixed(2)}</td>
                                    <td className="px-4 py-3 pl-6 text-xs text-zinc-600">{cheaper}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Note */}
            <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <strong>Notas:</strong> el <em>fallback</em> es el otro proveedor en el mismo nivel (resiliencia ante caída
                de un proveedor).{" "}
                <code className="font-mono text-xs bg-blue-100 px-1 rounded">gemini-3.1-pro</code> tiene precio por tramos
                (&gt;200K de contexto: entrada 2x / salida 1.5x).{" "}
                <code className="font-mono text-xs bg-blue-100 px-1 rounded">gpt-5.5</code> en modo batch/flex baja a
                $2.50 / $15. Los servicios aún no consumen esta tabla; el wiring queda pendiente.
            </div>
        </div>
    );
}
