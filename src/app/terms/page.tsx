import { FileText } from "lucide-react";

export default function TermsPage() {
    return (
        <div className="max-w-3xl mx-auto py-12 px-4">
            <div className="mb-8 flex items-center gap-3">
                <FileText className="w-7 h-7 text-zinc-400 shrink-0" />
                <h1 className="text-2xl font-bold text-zinc-900">Términos y Condiciones</h1>
            </div>

            <div className="space-y-8 text-sm text-zinc-600 leading-relaxed">

                <section>
                    <h2 className="text-base font-semibold text-zinc-800 mb-2">
                        1. Naturaleza del Servicio y Uso de Inteligencia Artificial
                    </h2>
                    <p>
                        Este producto utiliza inteligencia artificial (IA) para generar resultados y respuestas de forma automatizada
                        mediante técnicas de Procesamiento de Lenguaje Natural (NLP) y Recuperación Aumentada por Generación (RAG).
                        Si bien se busca la mayor precisión posible mediante el uso de modelos avanzados (GPT-4o) y bases de datos
                        vectoriales (Qdrant), la información proporcionada puede contener errores, imprecisiones u omisiones derivadas
                        de la naturaleza probabilística de los modelos de lenguaje.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-zinc-800 mb-2">
                        2. Descargo de Responsabilidad
                    </h2>
                    <p>
                        Los resultados generados por el sistema no deben considerarse definitivos ni utilizarse como única fuente
                        para la toma de decisiones críticas, técnicas, legales o financieras. El sistema actúa como una herramienta
                        de apoyo a la productividad y no sustituye el juicio profesional humano.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-zinc-800 mb-2">
                        3. Responsabilidad del Usuario
                    </h2>
                    <p>
                        Es responsabilidad exclusiva del usuario verificar y validar toda la información proporcionada por el sistema
                        con un ser humano cualificado antes de su aplicación en cualquier proceso de licitación, contrato o decisión
                        estratégica. El desarrollador no se hace responsable de pérdidas, sanciones o perjuicios derivados de la
                        confianza ciega en las respuestas generadas por la IA.
                    </p>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-zinc-800 mb-2">
                        4. Privacidad y Procesamiento de Datos
                    </h2>
                    <p className="mb-3">El usuario reconoce y acepta que:</p>
                    <ul className="space-y-2 pl-4 border-l-2 border-zinc-200">
                        <li>Los documentos cargados son procesados por infraestructura de terceros (Azure, OpenAI).</li>
                        <li>El historial de chat se almacena en una base de datos de memoria (Redis) para mantener el contexto de la sesión.</li>
                        <li>No se debe cargar información altamente sensible o clasificada que viole acuerdos de confidencialidad externos.</li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-base font-semibold text-zinc-800 mb-2">
                        5. Limitación de Garantías
                    </h2>
                    <p>
                        El servicio se proporciona <span className="italic">"tal cual"</span> y{" "}
                        <span className="italic">"según disponibilidad"</span>, sin garantías de que las respuestas sean
                        100% veraces o que el servicio sea ininterrumpido.
                    </p>
                </section>

            </div>
        </div>
    );
}
