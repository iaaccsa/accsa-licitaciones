"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { FileUploadZone } from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import JSZip from "jszip";
import { Loader2, CheckCircle, XCircle, Search, Clock, AlertCircle } from "lucide-react";

type UploadStatus = "idle" | "loading" | "success" | "error";
type StatusCheckStatus = "idle" | "loading" | "success" | "error";

interface JobStatus {
  id: string;
  status: string;
  is_success: boolean | null;
  input_path: string;
  output_path: string | null;
  error_details: string | null;
  created_at: string;
  updated_at: string;
}

export default function Home() {
  const [pliegoFiles, setPliegoFiles] = useState<File[]>([]);
  const [normativasFiles, setNormativasFiles] = useState<File[]>([]);
  const [ofertasFiles, setOfertasFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState(0);

  // Status check states
  const [searchJobId, setSearchJobId] = useState("");
  const [statusCheckStatus, setStatusCheckStatus] = useState<StatusCheckStatus>("idle");
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const hasFiles =
    pliegoFiles.length > 0 ||
    normativasFiles.length > 0 ||
    ofertasFiles.length > 0;

  const handleAnalysis = useCallback(async () => {
    if (!hasFiles) return;

    setStatus("loading");
    setJobId(null);
    setJobStatus(null);
    setStatusCheckStatus("idle");
    setSearchJobId(""); // Clear until response arrives

    try {
      // Create ZIP file with all documents
      const zip = new JSZip();

      // Add Pliego de Condiciones files
      const pliegoFolder = zip.folder("pliego_condiciones");
      for (const file of pliegoFiles) {
        const buffer = await file.arrayBuffer();
        pliegoFolder?.file(file.name, buffer);
      }

      // Add Normativas files
      const normativasFolder = zip.folder("normativas");
      for (const file of normativasFiles) {
        const buffer = await file.arrayBuffer();
        normativasFolder?.file(file.name, buffer);
      }

      // Add Ofertas files
      const ofertasFolder = zip.folder("ofertas");
      for (const file of ofertasFiles) {
        const buffer = await file.arrayBuffer();
        ofertasFolder?.file(file.name, buffer);
      }

      // Generate ZIP blob
      const zipBlob = await zip.generateAsync({ type: "blob" });

      // Create FormData and send to webhook
      const formData = new FormData();
      formData.append("file", zipBlob, "licitacion_documentos.zip");

      // Send to local API route (avoids CORS issues)
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setJobId(data.job_id);
        setSearchJobId(data.job_id); // Auto-populate the status check field
        setStatus("success");

        // Clear all files by remounting components with new key
        setPliegoFiles([]);
        setNormativasFiles([]);
        setOfertasFiles([]);
        setUploadKey((prev) => prev + 1);
      } else {
        setStatus("error");
      }
    } catch (error) {
      console.error("Error uploading files:", error);
      setStatus("error");
    }
  }, [pliegoFiles, normativasFiles, ofertasFiles, hasFiles]);

  const handleCheckStatus = useCallback(async () => {
    if (!searchJobId.trim()) return;

    setStatusCheckStatus("loading");
    setJobStatus(null);

    try {
      const response = await fetch(`/api/status?job_id=${encodeURIComponent(searchJobId.trim())}`);

      if (response.ok) {
        const data = await response.json();
        setJobStatus(data);
        setStatusCheckStatus("success");
      } else {
        setStatusCheckStatus("error");
      }
    } catch (error) {
      console.error("Error checking status:", error);
      setStatusCheckStatus("error");
    }
  }, [searchJobId]);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && searchJobId.trim() && statusCheckStatus === "success") {
      autoRefreshIntervalRef.current = setInterval(() => {
        handleCheckStatus();
      }, 30000);
    }

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    };
  }, [autoRefresh, searchJobId, statusCheckStatus, handleCheckStatus]);

  const getStatusColor = (status: string, isSuccess: boolean | null) => {
    switch (status.toLowerCase()) {
      case "ready":
        // Ready can be success or failure based on is_success
        if (isSuccess === true) {
          return "text-green-600 bg-green-100";
        } else if (isSuccess === false) {
          return "text-red-600 bg-red-100";
        }
        return "text-green-600 bg-green-100";
      case "pending":
        return "text-yellow-600 bg-yellow-100";
      case "processing":
        return "text-blue-600 bg-blue-100";
      default:
        return "text-zinc-600 bg-zinc-100";
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <h1 className="text-3xl font-semibold text-center text-zinc-800 mb-8 font-serif italic">
          Asistente de Licitaciones
        </h1>

        {/* Upload Section */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 mb-6">
          <h2 className="text-lg font-medium text-zinc-700 mb-6">Subir Documentos</h2>

          {/* Upload Zones - key prop forces remount to clear state */}
          <div key={uploadKey} className="flex flex-col lg:flex-row gap-6 mb-8">
            <FileUploadZone
              title="Pliego de Condiciones"
              description="Subir documento base"
              subtitle="TXT, PDF, DOCX (máx. 10 MB)"
              icon="document"
              accept=".txt,.pdf,.docx"
              maxFiles={1}
              maxSizeMB={10}
              onFilesChange={setPliegoFiles}
            />

            <FileUploadZone
              title="Normativas"
              description="Subir ofertas técnicas"
              subtitle="Múltiples archivos (máx. 5)"
              icon="multi-document"
              accept=".txt,.pdf,.docx"
              maxFiles={5}
              maxSizeMB={10}
              onFilesChange={setNormativasFiles}
            />

            <FileUploadZone
              title="Ofertas"
              description="Subir ofertas técnicas"
              subtitle="Múltiples archivos (máx. 5)"
              icon="multi-document"
              accept=".txt,.pdf,.docx"
              maxFiles={5}
              maxSizeMB={10}
              onFilesChange={setOfertasFiles}
            />
          </div>

          {/* Status Messages */}
          {status === "success" && (
            <div className="flex flex-col items-center justify-center gap-2 mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                <span>Procesamiento iniciado con éxito.</span>
              </div>
              {jobId && (
                <p className="text-sm text-green-600">
                  ID del procesamiento: <code className="bg-green-100 px-2 py-0.5 rounded font-mono">{jobId}</code>
                </p>
              )}
            </div>
          )}

          {status === "error" && (
            <div className="flex items-center justify-center gap-2 mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
              <XCircle className="h-5 w-5" />
              <span>No se pudo iniciar el procesamiento. Inténtelo después.</span>
            </div>
          )}

          {/* Action Button */}
          <Button
            onClick={handleAnalysis}
            variant="outline"
            disabled={!hasFiles || status === "loading"}
            className="w-full py-6 text-lg font-medium text-blue-600 border-blue-500 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Iniciar Análisis"
            )}
          </Button>
        </div>

        {/* Divider */}
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-300"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="bg-zinc-50 px-4 text-sm text-zinc-500">o consultar un procesamiento existente</span>
          </div>
        </div>

        {/* Status Check Section */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
          <h2 className="text-lg font-medium text-zinc-700 mb-6">Consultar Estado del Procesamiento</h2>

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <input
              type="text"
              value={searchJobId}
              onChange={(e) => setSearchJobId(e.target.value)}
              placeholder="Ingrese el ID del procesamiento (job_id)"
              className="flex-1 px-4 py-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-zinc-700 placeholder:text-zinc-400"
            />
            <Button
              onClick={handleCheckStatus}
              disabled={!searchJobId.trim() || statusCheckStatus === "loading"}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {statusCheckStatus === "loading" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Search className="h-5 w-5" />
              )}
              Consultar
            </Button>
          </div>

          {/* Auto-refresh checkbox - show after first successful query */}
          {jobStatus && statusCheckStatus === "success" && (
            <div className="flex items-center gap-3 mb-6">
              <input
                type="checkbox"
                id="autoRefresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-zinc-100 border-zinc-300 rounded focus:ring-blue-500 cursor-pointer"
              />
              <label htmlFor="autoRefresh" className="text-sm text-zinc-600 cursor-pointer">
                Actualizar automáticamente cada 30 segundos
              </label>
              {autoRefresh && (
                <span className="text-xs text-blue-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Activo
                </span>
              )}
            </div>
          )}

          {/* Job Status Display */}
          {statusCheckStatus === "error" && (
            <div className="flex items-center justify-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
              <AlertCircle className="h-5 w-5" />
              <span>No se pudo obtener el estado. Verifique el ID e intente de nuevo.</span>
            </div>
          )}

          {jobStatus && statusCheckStatus === "success" && (
            <div className="border border-zinc-200 rounded-xl overflow-hidden">
              <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-200">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-700">Resultado</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(jobStatus.status, jobStatus.is_success)}`}>
                    {jobStatus.status}
                  </span>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500 w-32">ID:</span>
                  <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-zinc-700">{jobStatus.id}</code>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500 w-32">Creado:</span>
                  <span className="text-zinc-700 flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {new Date(jobStatus.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500 w-32">Actualizado:</span>
                  <span className="text-zinc-700">{new Date(jobStatus.updated_at).toLocaleString()}</span>
                </div>
                {jobStatus.is_success !== null && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 w-32">Éxito:</span>
                    <span className={jobStatus.is_success ? "text-green-600" : "text-red-600"}>
                      {jobStatus.is_success ? "Sí" : "No"}
                    </span>
                  </div>
                )}
                {jobStatus.output_path && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-zinc-500 w-32">Resultado:</span>
                    <code className="bg-zinc-100 px-2 py-1 rounded font-mono text-zinc-700 text-xs">{jobStatus.output_path}</code>
                  </div>
                )}
                {jobStatus.error_details && (
                  <div className="flex items-start gap-2 text-sm">
                    <span className="text-zinc-500 w-32">Error:</span>
                    <span className="text-red-600">{jobStatus.error_details}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
