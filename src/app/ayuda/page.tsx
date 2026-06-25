import type { Metadata } from "next";
import { getHelpSections } from "@/lib/help/loader";
import { HelpView } from "@/components/help/HelpView";

export const metadata: Metadata = {
    title: "Ayuda - Asistente de Compras Estatales",
    description: "Documentación de uso del Asistente de Compras Estatales.",
};

export default function AyudaPage() {
    const sections = getHelpSections();
    return <HelpView sections={sections} />;
}
