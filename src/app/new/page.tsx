"use client";

import { UploadSection } from "@/components/UploadSection";

export default function AnalisisPage() {
  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 mb-6">
        Nuevo Análisis
      </h1>
      <UploadSection />
    </div>
  );
}
