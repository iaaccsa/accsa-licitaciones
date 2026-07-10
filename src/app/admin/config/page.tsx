import Link from "next/link";
import { Bell, Cpu, FileText, KeyRound, UserCheck, Users } from "lucide-react";

const cards = [
    { href: "/admin/config/llm-config", label: "Configuración LLM", description: "Modelos y parámetros de los servicios de IA.", icon: Cpu },
    { href: "/admin/config/infra-config", label: "Credenciales de servicios", description: "Claves de proveedores (Qdrant, OpenAI, Google, Mistral).", icon: KeyRound },
    { href: "/admin/config/prompts", label: "Prompts", description: "Editar los prompts de los microservicios.", icon: FileText },
    { href: "/admin/config/human-loop", label: "Validación humana", description: "Puntos de control humano (HITL) del pipeline.", icon: UserCheck },
    { href: "/admin/config/notifications", label: "Notificaciones", description: "Correos y avisos del sistema.", icon: Bell },
    { href: "/admin/config/users", label: "Usuarios", description: "Invitar usuarios y administrar roles.", icon: Users },
] as const;

export default function AdminConfigPage() {
    return (
        <div className="max-w-7xl mx-auto py-8 px-4">
            <h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 font-serif italic mb-6">
                Configuración
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
