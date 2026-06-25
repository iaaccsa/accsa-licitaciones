import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface HelpFragment {
    id: string;
    title: string;
    section: string;
    order: number;
    keywords: string[];
    updatedAt: string | null;
    body: string;
}

export interface HelpSection {
    name: string;
    fragments: HelpFragment[];
}

const HELP_DIR = path.join(process.cwd(), "content", "help");

// Controls the order of sections in the sidebar. Sections not listed go last,
// alphabetically.
const SECTION_ORDER = [
    "Primeros pasos",
    "Análisis",
    "Requisitos y admisibilidad",
    "Propuestas y cumplimiento",
    "Configuración",
    "Administración",
    "Ayuda",
];

// gray-matter parses unquoted `updated_at: 2026-06-25` as a Date via js-yaml.
function formatDate(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
}

export function getHelpSections(): HelpSection[] {
    const files = fs.readdirSync(HELP_DIR).filter((f) => f.endsWith(".md"));

    const fragments: HelpFragment[] = files.map((file) => {
        const raw = fs.readFileSync(path.join(HELP_DIR, file), "utf8");
        const { data, content } = matter(raw);
        return {
            id: String(data.id ?? path.basename(file, ".md")),
            title: String(data.title ?? ""),
            section: String(data.section ?? "Otros"),
            order: typeof data.order === "number" ? data.order : 0,
            keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
            updatedAt: formatDate(data.updated_at),
            body: content.trim(),
        };
    });

    const bySection = new Map<string, HelpFragment[]>();
    for (const f of fragments) {
        if (!bySection.has(f.section)) bySection.set(f.section, []);
        bySection.get(f.section)!.push(f);
    }

    const sections: HelpSection[] = [...bySection.entries()].map(([name, frags]) => ({
        name,
        fragments: frags.sort(
            (a, b) => a.order - b.order || a.title.localeCompare(b.title, "es"),
        ),
    }));

    sections.sort((a, b) => {
        const ia = SECTION_ORDER.indexOf(a.name);
        const ib = SECTION_ORDER.indexOf(b.name);
        if (ia === -1 && ib === -1) return a.name.localeCompare(b.name, "es");
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });

    return sections;
}
