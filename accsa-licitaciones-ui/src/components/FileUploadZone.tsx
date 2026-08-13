"use client";

import React, { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, FileStack, Upload, X, BookOpen, Receipt } from "lucide-react";

function matchesAccept(file: File, accept: string): boolean {
    if (!accept || accept === "*" || accept === "*/*") return true;
    const tokens = accept
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return tokens.some((token) => {
        if (token.startsWith(".")) return name.endsWith(token);
        if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
        return type === token;
    });
}

interface FileUploadZoneProps {
    title: string;
    description: string;
    subtitle: string;
    icon: "document" | "multi-document" | "normativas" | "ofertas";
    accept?: string;
    maxFiles?: number;
    maxSizeMB?: number;
    disabled?: boolean;
    onFilesChange?: (files: File[]) => void;
}

export function FileUploadZone({
    title,
    description,
    subtitle,
    icon,
    accept = "*",
    maxFiles = 1,
    maxSizeMB = 10,
    disabled = false,
    onFilesChange,
}: FileUploadZoneProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const iconMap = {
        document: FileText,
        "multi-document": FileStack,
        normativas: BookOpen,
        ofertas: Receipt,
    };
    const Icon = iconMap[icon] || FileText;

    const handleFiles = useCallback(
        (newFiles: FileList | null) => {
            if (!newFiles) return;

            const fileArray = Array.from(newFiles);
            const rejected: string[] = [];
            const validFiles = fileArray.filter((file) => {
                if (!matchesAccept(file, accept)) {
                    rejected.push(file.name);
                    return false;
                }
                const sizeMB = file.size / (1024 * 1024);
                if (sizeMB > maxSizeMB) {
                    rejected.push(file.name);
                    return false;
                }
                return true;
            });

            setError(
                rejected.length
                    ? `Archivos no válidos (solo ${accept}, máx. ${maxSizeMB} MB): ${rejected.join(", ")}`
                    : null
            );

            const selected = [...files, ...validFiles];
            const updatedFiles = selected.slice(0, maxFiles);
            const discarded = selected.length - updatedFiles.length;
            setNotice(
                discarded > 0
                    ? `Se alcanzó el máximo de ${maxFiles} archivos: ${discarded} ${discarded === 1 ? "archivo quedó fuera" : "archivos quedaron fuera"} de la selección.`
                    : null
            );

            setFiles(updatedFiles);
            onFilesChange?.(updatedFiles);
        },
        [files, accept, maxFiles, maxSizeMB, onFilesChange]
    );

    const removeFile = useCallback(
        (index: number) => {
            if (disabled) return;
            const updatedFiles = files.filter((_, i) => i !== index);
            setFiles(updatedFiles);
            onFilesChange?.(updatedFiles);
        },
        [files, disabled, onFilesChange]
    );

    const handleDragOver = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            if (disabled) return;
            setIsDragging(true);
        },
        [disabled]
    );

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            if (disabled) return;
            handleFiles(e.dataTransfer.files);
        },
        [disabled, handleFiles]
    );

    const handleClick = useCallback(() => {
        if (disabled) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = maxFiles > 1;
        input.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            handleFiles(target.files);
        };
        input.click();
    }, [accept, maxFiles, handleFiles, disabled]);

    return (
        <Card className="flex-1 min-w-[280px]" >
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                    <Icon className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div
                    onClick={handleClick}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
            flex flex-col items-center justify-center
            border-2 border-dashed rounded-lg
            p-6
            transition-colors duration-200
            ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            ${isDragging
                            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
                            : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }
          `}
                >
                    {files.length === 0 ? (
                        <>
                            <Upload className="h-10 w-10 text-zinc-400 dark:text-zinc-500 mb-3" />
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{description}</p>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{subtitle}</p>
                        </>
                    ) : (
                        <div className="w-full space-y-2">
                            {files.map((file, index) => (
                                <div
                                    key={`${file.name}-${index}`}
                                    className="flex items-center justify-between bg-zinc-100 dark:bg-zinc-800 rounded-md px-3 py-2"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
                                        <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                                            {file.name}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFile(index);
                                        }}
                                        className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition-colors"
                                    >
                                        <X className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
                                    </button>
                                </div>
                            ))}
                            {files.length < maxFiles && (
                                <p className="text-xs text-center text-zinc-500 dark:text-zinc-400 mt-2">
                                    Click o arrastra para agregar más ({files.length}/{maxFiles})
                                </p>
                            )}
                        </div>
                    )}
                </div>
                {error ? (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>
                ) : null}
                {notice ? (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{notice}</p>
                ) : null}
            </CardContent>
        </Card >
    );
}
