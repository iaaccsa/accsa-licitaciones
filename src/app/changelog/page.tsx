import fs from "node:fs";
import path from "node:path";
import ReactMarkdown from "react-markdown";

export const dynamic = "force-static";

export const metadata = {
    title: "Changelog",
    description: "Historial de cambios del sistema Licitaciones",
};

export default function ChangelogPage() {
    const content = fs.readFileSync(
        path.join(process.cwd(), "CHANGELOG.md"),
        "utf8",
    );

    return (
        <div className="max-w-4xl mx-auto py-12 px-4">
            <article className="prose prose-sm prose-zinc max-w-none prose-headings:font-semibold prose-h1:text-2xl prose-h2:mt-10 prose-h2:border-b prose-h2:border-zinc-200 prose-h2:pb-2 prose-h3:text-zinc-800 prose-h4:text-zinc-600 prose-li:my-0.5 prose-a:text-blue-600 prose-code:text-zinc-800 prose-code:bg-zinc-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none">
                <ReactMarkdown>{content}</ReactMarkdown>
            </article>
        </div>
    );
}
