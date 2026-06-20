"use client";

import { useState, useCallback, useTransition } from "react";
import Link from "next/link";
import { FileUploadZone } from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

type UploadStatus = "idle" | "success" | "error";
type AnalysisResult = Record<string, unknown> | null;

export function UploadSection() {
  const [files, setFiles] = useState<File[]>([]);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState(0);

  const hasMinFiles = files.length >= 2;

  const clearNotifications = useCallback(() => {
    if (status !== "idle") {
      setStatus("idle");
      setAnalysisResult(null);
      setErrorMessage(null);
    }
  }, [status]);

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      setFiles(newFiles);
      clearNotifications();
    },
    [clearNotifications],
  );

  const handleAnalysis = useCallback(async () => {
    if (!hasMinFiles) return;

    setAnalysisResult(null);
    setErrorMessage(null);
    setStatus("idle");

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const file of files) {
        const buffer = await file.arrayBuffer();
        zip.file(file.name, buffer);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      const uuid = crypto.randomUUID();
      const fileName = `${uuid}.zip`;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      const storageResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/artifacts/${fileName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": "application/zip",
          },
          body: zipBlob,
        },
      );

      if (!storageResponse.ok) {
        setErrorMessage("No se pudo subir los archivos. Inténtelo después.");
        setStatus("error");
        return;
      }

      const body: Record<string, string> = {
        storage_path: fileName,
      };

      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        setAnalysisResult(data);
        setStatus("success");

        setFiles([]);
        setUploadKey((prev) => prev + 1);
      } else {
        setErrorMessage(data.error || "No se pudo iniciar el análisis");
        setStatus("error");
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      setErrorMessage("Error de conexión. Inténtelo después.");
      setStatus("error");
    }
  }, [files, hasMinFiles]);

  const handleAnalysisWithTransition = useCallback(() => {
    startTransition(async () => {
      await handleAnalysis();
    });
  }, [handleAnalysis]);

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 mb-6">
      <h2 className="text-lg font-medium text-zinc-700 mb-6">
        Subir Documentos
      </h2>

      <div key={uploadKey} className="mb-8">
        <FileUploadZone
          title="Documentos"
          description="Subir pliegos, normativas y ofertas"
          subtitle="Hasta 25 archivos PDF (máx. 10 MB c/u)"
          icon="document"
          accept=".pdf"
          maxFiles={25}
          maxSizeMB={10}
          onFilesChange={handleFilesChange}
        />
      </div>

      {/* Status Messages */}
      {status === "success" ? (
        <div className="flex flex-col items-center justify-center gap-2 mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            <span>Análisis iniciado con éxito.</span>
          </div>
          {analysisResult ? (
            <div className="flex flex-col items-center gap-1">
              {analysisResult.slug ? (
                <p className="text-sm text-green-600">
                  ID del análisis:{" "}
                  <code className="bg-green-100 px-2 py-0.5 rounded font-mono uppercase">
                    {String(analysisResult.slug)}
                  </code>
                </p>
              ) : null}
              <Link
                href={`/analyses/${analysisResult.id}`}
                className="text-sm text-blue-600 hover:text-blue-700 underline underline-offset-2"
              >
                Ver estado del análisis →
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex items-center justify-center gap-2 mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
          <XCircle className="h-5 w-5" />
          <span>{errorMessage || "No se pudo iniciar el análisis."}</span>
        </div>
      ) : null}

      {/* Min files warning */}
      {files.length === 1 ? (
        <p className="text-sm text-amber-600 mb-4 text-center">
          Se necesitan al menos 2 archivos para iniciar el análisis.
        </p>
      ) : null}

      {/* Action Button */}
      <Button
        onClick={handleAnalysisWithTransition}
        variant="outline"
        disabled={!hasMinFiles || isPending}
        className="w-full py-6 text-lg font-medium text-blue-600 border-blue-500 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Enviando...
          </>
        ) : (
          "Iniciar Análisis"
        )}
      </Button>
    </div>
  );
}
