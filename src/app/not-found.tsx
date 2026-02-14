import Link from "next/link";
import { FileQuestion, ArrowLeft } from "lucide-react";

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-zinc-200 text-center max-w-md w-full">
                <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <FileQuestion className="w-8 h-8 text-blue-600" />
                </div>

                <h2 className="text-2xl font-semibold text-zinc-900 mb-3">
                    Página no encontrada
                </h2>

                <p className="text-zinc-500 mb-8 leading-relaxed">
                    Lo sentimos, la página que estás buscando no existe o ha sido movida.
                </p>

                <Link
                    href="/"
                    className="flex items-center justify-center gap-2 w-full bg-zinc-900 hover:bg-zinc-800 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al inicio
                </Link>
            </div>
        </div>
    );
}
