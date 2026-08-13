"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { FileUploadZone } from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import { signalActivity } from "@/lib/session-timeout";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

type UploadStatus = "idle" | "success" | "error";
type UploadPhase = "idle" | "uploading" | "creating";
type AnalysisResult = Record<string, unknown> | null;

const MAX_UPLOAD_FILES = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_FILES) || 500;
const MAX_UPLOAD_TOTAL_MB =
  Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_TOTAL_MB) || 2048;

// Uploads in flight at a time. Enough to keep the link busy without opening
// one connection per file on a 500 file batch.
const UPLOAD_CONCURRENCY = 5;
// Delay before each attempt, so the first one starts immediately.
const RETRY_DELAYS_MS = [0, 1_000, 3_000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Object key inside the batch prefix: the zero padded index, never the original
// name. The real name travels in the manifest, so no sanitizing and no
// collisions between two files with the same name in different folders.
function objectKey(index: number) {
  return `${String(index).padStart(4, "0")}.pdf`;
}

// Uploads one object to the artifacts bucket, retrying on network errors and
// non-2xx responses. Throws once the attempts run out.
async function uploadObject(path: string, body: Blob, contentType: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let lastError = "unknown error";

  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await sleep(delay);
    try {
      const response = await fetch(
        `${supabaseUrl}/storage/v1/object/artifacts/${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
            "Content-Type": contentType,
            // No x-upsert: the anon key may create objects in this bucket but
            // not update them, so upsert is rejected even on a brand new key.
          },
          body,
        },
      );
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`${path}: ${lastError}`);
}

export function UploadSection() {
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [uploadedCount, setUploadedCount] = useState(0);
  // Frozen when the batch starts: `files` is emptied on success while the
  // progress bar is still on screen.
  const [totalFiles, setTotalFiles] = useState(0);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState(0);

  const hasMinFiles = files.length >= 2;
  const isBusy = phase !== "idle";
  const progressPercent =
    phase === "creating" || totalFiles === 0
      ? 100
      : Math.round((uploadedCount / totalFiles) * 100);

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
    if (!hasMinFiles || isBusy) return;

    const totalMB = files.reduce((sum, f) => sum + f.size, 0) / (1024 * 1024);
    if (totalMB > MAX_UPLOAD_TOTAL_MB) {
      setErrorMessage(
        `La selección pesa ${totalMB.toFixed(0)} MB y el máximo por análisis es ${MAX_UPLOAD_TOTAL_MB} MB. Quite archivos e inténtelo de nuevo.`,
      );
      setStatus("error");
      return;
    }

    setAnalysisResult(null);
    setErrorMessage(null);
    setStatus("idle");
    setUploadedCount(0);
    setTotalFiles(files.length);
    setPhase("uploading");

    const batch = files;
    const batchId = crypto.randomUUID();

    try {
      let nextIndex = 0;
      let done = 0;
      const failures: string[] = [];

      // Worker pool: each worker takes the next pending file until the batch
      // runs out or one file exhausts its retries and the batch is abandoned.
      const worker = async () => {
        while (nextIndex < batch.length && failures.length === 0) {
          const index = nextIndex++;
          const file = batch[index];
          try {
            await uploadObject(
              `${batchId}/${objectKey(index)}`,
              file,
              "application/pdf",
            );
          } catch {
            failures.push(file.name);
            return;
          }
          done += 1;
          setUploadedCount(done);
          // A long upload is the user working even with no input events, so
          // keep the inactivity watcher from logging them out mid batch.
          signalActivity();
        }
      };

      await Promise.all(
        Array.from(
          { length: Math.min(UPLOAD_CONCURRENCY, batch.length) },
          worker,
        ),
      );

      if (failures.length > 0) {
        setErrorMessage(
          `No se pudo subir "${failures[0]}" tras ${RETRY_DELAYS_MS.length} intentos. No se inició ningún análisis: revise la conexión e inténtelo de nuevo.`,
        );
        setStatus("error");
        return;
      }

      // The manifest goes last on purpose: it is the commit marker of the
      // batch, so an upload cut halfway leaves a prefix without manifest and
      // the extractor can tell it apart from a complete one.
      const manifest = {
        version: 1,
        files: batch.map((file, index) => ({
          key: objectKey(index),
          name: file.name,
          size: file.size,
        })),
      };

      await uploadObject(
        `${batchId}/manifest.json`,
        new Blob([JSON.stringify(manifest)], { type: "application/json" }),
        "application/json",
      );

      setPhase("creating");

      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: `${batchId}/` }),
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
    } finally {
      setPhase("idle");
    }
  }, [files, hasMinFiles, isBusy]);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-8 mb-6">
      <h2 className="text-lg font-medium text-zinc-700 dark:text-zinc-300 mb-6">
        Subir Documentos
      </h2>

      <div key={uploadKey} className="mb-8">
        <FileUploadZone
          title="Documentos"
          description="Subir pliegos, normativas y ofertas"
          subtitle={`Hasta ${MAX_UPLOAD_FILES} archivos PDF (máx. 10 MB c/u)`}
          icon="document"
          accept=".pdf"
          maxFiles={MAX_UPLOAD_FILES}
          maxSizeMB={10}
          disabled={isBusy}
          onFilesChange={handleFilesChange}
        />
      </div>

      {/* Status Messages */}
      {status === "success" ? (
        <div className="flex flex-col items-center justify-center gap-2 mb-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-900 rounded-xl text-green-700 dark:text-green-300">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            <span>Análisis iniciado con éxito.</span>
          </div>
          {analysisResult ? (
            <div className="flex flex-col items-center gap-1">
              {analysisResult.slug ? (
                <p className="text-sm text-green-600 dark:text-green-400">
                  ID del análisis:{" "}
                  <code className="bg-green-100 dark:bg-green-950 px-2 py-0.5 rounded font-mono uppercase">
                    {String(analysisResult.slug)}
                  </code>
                </p>
              ) : null}
              <Link
                href={`/analyses/${analysisResult.id}`}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline underline-offset-2"
              >
                Ver estado del análisis →
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex items-center justify-center gap-2 mb-4 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-xl text-red-700 dark:text-red-300">
          <XCircle className="h-5 w-5" />
          <span>{errorMessage || "No se pudo iniciar el análisis."}</span>
        </div>
      ) : null}

      {/* Min files warning */}
      {files.length === 1 ? (
        <p className="text-sm text-amber-600 dark:text-amber-400 mb-4 text-center">
          Se necesitan al menos 2 archivos para iniciar el análisis.
        </p>
      ) : null}

      {/* Upload progress */}
      {isBusy ? (
        <div className="flex items-center gap-3 mb-4">
          <div className="h-2 flex-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-blue-500 dark:bg-blue-400 transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-sm tabular-nums text-zinc-600 dark:text-zinc-400">
            {progressPercent}%
          </span>
        </div>
      ) : null}

      {/* Action Button */}
      <Button
        onClick={handleAnalysis}
        variant="outline"
        disabled={!hasMinFiles || isBusy}
        className="w-full py-6 text-lg font-medium text-blue-600 dark:text-blue-400 border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-700 dark:hover:text-blue-300 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isBusy ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            {phase === "uploading"
              ? `Subiendo ${uploadedCount} de ${totalFiles} archivos`
              : "Iniciando el análisis..."}
          </>
        ) : (
          "Iniciar Análisis"
        )}
      </Button>
    </div>
  );
}
