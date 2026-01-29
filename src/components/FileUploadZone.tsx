"use client";

import React, { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, FileStack, Upload, X } from "lucide-react";

interface FileUploadZoneProps {
    title: string;
    description: string;
    subtitle: string;
    icon: "document" | "multi-document";
    accept?: string;
    maxFiles?: number;
    maxSizeMB?: number;
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
    onFilesChange,
}: FileUploadZoneProps) {
    const [files, setFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const Icon = icon === "document" ? FileText : FileStack;

    const handleFiles = useCallback(
        (newFiles: FileList | null) => {
            if (!newFiles) return;

            const fileArray = Array.from(newFiles);
            const validFiles = fileArray.filter((file) => {
                const sizeMB = file.size / (1024 * 1024);
                return sizeMB <= maxSizeMB;
            });

            const updatedFiles = [...files, ...validFiles].slice(0, maxFiles);
            setFiles(updatedFiles);
            onFilesChange?.(updatedFiles);
        },
        [files, maxFiles, maxSizeMB, onFilesChange]
    );

    const removeFile = useCallback(
        (index: number) => {
            const updatedFiles = files.filter((_, i) => i !== index);
            setFiles(updatedFiles);
            onFilesChange?.(updatedFiles);
        },
        [files, onFilesChange]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
        },
        [handleFiles]
    );

    const handleClick = useCallback(() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = maxFiles > 1;
        input.onchange = (e) => {
            const target = e.target as HTMLInputElement;
            handleFiles(target.files);
        };
        input.click();
    }, [accept, maxFiles, handleFiles]);

    return (
        <Card className="flex-1 min-w-[280px]">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base font-medium">
                    <Icon className="h-5 w-5 text-blue-500" />
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
            p-6 cursor-pointer
            transition-colors duration-200
            ${isDragging
                            ? "border-blue-500 bg-blue-50"
                            : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                        }
          `}
                >
                    {files.length === 0 ? (
                        <>
                            <Upload className="h-10 w-10 text-zinc-400 mb-3" />
                            <p className="text-sm font-medium text-zinc-700">{description}</p>
                            <p className="text-xs text-zinc-500 mt-1">{subtitle}</p>
                        </>
                    ) : (
                        <div className="w-full space-y-2">
                            {files.map((file, index) => (
                                <div
                                    key={`${file.name}-${index}`}
                                    className="flex items-center justify-between bg-zinc-100 rounded-md px-3 py-2"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                                        <span className="text-sm text-zinc-700 truncate">
                                            {file.name}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFile(index);
                                        }}
                                        className="p-1 hover:bg-zinc-200 rounded-full transition-colors"
                                    >
                                        <X className="h-4 w-4 text-zinc-500" />
                                    </button>
                                </div>
                            ))}
                            {files.length < maxFiles && (
                                <p className="text-xs text-center text-zinc-500 mt-2">
                                    Click o arrastra para agregar más ({files.length}/{maxFiles})
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
