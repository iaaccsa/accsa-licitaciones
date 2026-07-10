import Link from "next/link";
import { Activity, ScrollText } from "lucide-react";

const cards = [
    { href: "/admin/review/status", label: "Estado del Sistema", description: "Salud de backend, Supabase, Qdrant y Azure.", icon: Activity },
    { href: "/admin/review/audit", label: "Auditoría", description: "Registro de acciones de los usuarios.", icon: ScrollText },
] as const;

export default function AdminReviewPage() {
    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 font-serif italic mb-6">
                Revisión
            </h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cards.map(({ href, label, description, icon: Icon }) => (
                    <Link
                        key={href}
                        href={href}
                        className="group flex flex-col gap-3 p-5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow transition-colors"
                    >
                        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 transition-colors">
                            <Icon className="w-5 h-5" />
                        </span>
                        <span className="text-base font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">{description}</span>
                    </Link>
                ))}
            </div>
        </div>
    );
}
