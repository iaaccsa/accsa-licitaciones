// Parses content/help/*.md and pushes the fragments to the docs chatbot so it
// rebuilds its Qdrant collection (full recreate). Manual reindex, run after
// editing help content.
//
// Usage: pnpm reindex:help   (loads CHATBOT_DOCS_URL + CHATBOT_DOCS_API_KEY
// from .env.local via node --env-file).
import { readFileSync, readdirSync } from "fs";
import { resolve, join, basename } from "path";
import matter from "gray-matter";

const CHATBOT_DOCS_URL = process.env.CHATBOT_DOCS_URL;
const CHATBOT_DOCS_API_KEY = process.env.CHATBOT_DOCS_API_KEY;

if (!CHATBOT_DOCS_URL || !CHATBOT_DOCS_API_KEY) {
  console.error(
    "error: CHATBOT_DOCS_URL and CHATBOT_DOCS_API_KEY must be set (in .env.local).",
  );
  process.exit(1);
}

const HELP_DIR = resolve(process.cwd(), "content", "help");

const files = readdirSync(HELP_DIR).filter((f) => f.endsWith(".md"));
const fragments = files.map((file) => {
  const raw = readFileSync(join(HELP_DIR, file), "utf-8");
  const { data, content } = matter(raw);
  const id = String(data.id ?? basename(file, ".md"));
  return {
    id,
    title: String(data.title ?? ""),
    section: String(data.section ?? "Otros"),
    url: `/ayuda#${id}`,
    text: content.trim(),
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
  };
});

const endpoint = `${CHATBOT_DOCS_URL.replace(/\/$/, "")}/reindex`;
console.log(`Reindexing ${fragments.length} fragments -> ${endpoint}`);

const res = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": CHATBOT_DOCS_API_KEY,
  },
  body: JSON.stringify({ fragments }),
});

if (!res.ok) {
  console.error(`error: reindex failed (${res.status} ${res.statusText})`);
  console.error(await res.text());
  process.exit(1);
}

const result = await res.json();
console.log(`done: collection=${result.collection} count=${result.count}`);
