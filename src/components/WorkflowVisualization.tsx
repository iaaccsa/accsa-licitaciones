"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Settings, GitBranch, CheckCircle2, AlertCircle, Clock, XCircle, RefreshCw } from 'lucide-react';
import { Loader2 } from "lucide-react";

const REFRESH_INTERVAL = 10;

interface WorkflowStep {
    code: string;
    parent_code: string | null;
    label: string;
    status: "pending" | "running" | "completed" | "failed" | "success" | "processing";
    display_name?: string;
}

interface NodeData extends WorkflowStep {
    id: string;
    x: number;
    y: number;
    children: NodeData[];
    height: number; // Used for layout calculation
}

/**
 * Custom Node component for the workflow.
 */
const Node = ({ label, status, x, y }: { label: string; status: string; x: number; y: number }) => {
    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'completed':
            case 'success':
                return {
                    bg: 'bg-blue-500',
                    border: 'border-blue-500',
                    iconColor: 'text-white',
                    textColor: 'text-slate-700',
                    Icon: CheckCircle2
                };
            case 'running':
            case 'processing':
                return {
                    bg: 'bg-white',
                    border: 'border-orange-400',
                    iconColor: 'text-orange-400',
                    textColor: 'text-slate-900',
                    pulse: true,
                    Icon: Settings // Default icon for running
                };
            case 'pending':
                return {
                    bg: 'bg-white',
                    border: 'border-slate-200',
                    iconColor: 'text-slate-300',
                    textColor: 'text-slate-400',
                    Icon: Clock
                };
            case 'failed':
                return {
                    bg: 'bg-red-100',
                    border: 'border-red-500',
                    iconColor: 'text-red-500',
                    textColor: 'text-red-700',
                    Icon: XCircle
                };
            default:
                return {
                    bg: 'bg-white',
                    border: 'border-slate-200',
                    iconColor: 'text-slate-300',
                    textColor: 'text-slate-400',
                    Icon: AlertCircle
                };
        }
    };

    const config = getStatusConfig(status);
    const Icon = config.Icon;

    return (
        <div
            className="absolute flex flex-col items-center group cursor-default"
            style={{ left: x, top: y, transform: 'translate(-50%, -50%)', width: '140px', zIndex: 10 }}
        >
            <div
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-300 shadow-sm ${config.bg} ${config.border} ${config.pulse ? 'animate-pulse ring-4 ring-orange-50' : 'group-hover:scale-110'}`}
            >
                <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <div className={`mt-2 px-2 py-1 rounded bg-white/80 backdrop-blur-sm border border-slate-100 shadow-sm opacity-90 transition-opacity`}>
                <span className={`text-[10px] font-bold uppercase tracking-tight text-center leading-tight block ${config.textColor}`}>
                    {label}
                </span>
            </div>
        </div>
    );
};

/**
 * Generates the SVG path for connections.
 */
const Connection = ({ start, end, status }: { start: { x: number; y: number }; end: { x: number; y: number }; status: string }) => {
    const isCompleted = status === 'completed' || status === 'success';
    const isRunning = status === 'running' || status === 'processing';

    const strokeColor = isCompleted ? '#3b82f6' : (isRunning ? '#fb923c' : '#e2e8f0');
    const strokeWidth = isCompleted || isRunning ? 2 : 1.5;

    // Bezier curve for smoother connections
    const midX = start.x + (end.x - start.x) / 2;
    const d = `M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`;

    return (
        <path
            d={d}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            className={`transition-all duration-500 ${isRunning ? 'animate-[dash_1s_linear_infinite]' : ''}`}
            style={{
                strokeDasharray: isRunning ? '8,4' : 'none'
            }}
        />
    );
};

export default function WorkflowVisualization({ analysisId }: { analysisId: string }) {
    const [steps, setSteps] = useState<WorkflowStep[]>([]);
    const [loading, setLoading] = useState(true);
    const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
    const isFirstLoad = useRef(true);

    const fetchWorkflow = useCallback(async () => {
        try {
            const res = await fetch(`/api/analyses/${analysisId}/workflow`, {
                method: 'POST',
                body: JSON.stringify({ uuid: analysisId })
            });

            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setSteps(data);
                } else {
                    console.warn("Unexpected workflow data format", data);
                    setSteps([]);
                }
            } else {
                console.error("Failed to fetch workflow");
                if (isFirstLoad.current) setSteps([]);
            }
        } catch (err) {
            console.error("Error fetching workflow:", err);
        } finally {
            if (isFirstLoad.current) {
                setLoading(false);
                isFirstLoad.current = false;
            }
        }
    }, [analysisId]);

    // Initial fetch
    useEffect(() => {
        if (analysisId) fetchWorkflow();
    }, [analysisId, fetchWorkflow]);

    // Countdown + auto-refresh
    useEffect(() => {
        if (!analysisId) return;

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    fetchWorkflow();
                    return REFRESH_INTERVAL;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [analysisId, fetchWorkflow]);

    // Layout Logic
    const layout = useMemo(() => {
        if (!steps.length) return { nodes: [], edges: [], width: 0, height: 0 };

        const NODE_WIDTH = 180; // Horizontal gap
        const NODE_HEIGHT = 80; // Vertical gap
        const START_X = 80;
        const START_Y = 60;

        // Build Tree
        const nodeMap = new Map<string, NodeData>();
        const roots: NodeData[] = [];

        // Initialize nodes
        steps.forEach(step => {
            nodeMap.set(step.code, {
                ...step,
                id: step.code,
                children: [],
                x: 0,
                y: 0,
                height: 1
            });
        });

        // Build hierarchy
        steps.forEach(step => {
            const node = nodeMap.get(step.code)!;
            if (step.parent_code && nodeMap.has(step.parent_code)) {
                nodeMap.get(step.parent_code)!.children.push(node);
            } else {
                roots.push(node);
            }
        });

        // Calculate heights (number of leaf descendants)
        const calcHeight = (node: NodeData): number => {
            if (node.children.length === 0) {
                node.height = 1;
                return 1;
            }
            node.height = node.children.reduce((acc, child) => acc + calcHeight(child), 0);
            return node.height;
        };

        roots.forEach(calcHeight);

        // Assign Coordinates (Recursive)
        const nodes: NodeData[] = [];
        const edges: { start: { x: number, y: number }, end: { x: number, y: number }, status: string, key: string }[] = [];

        const assignCoords = (node: NodeData, depth: number, startY: number) => {
            // X depends on depth (level)
            node.x = START_X + depth * NODE_WIDTH;

            // Y depends on allocated vertical space
            // Center node vertically within its allocated space
            const myHeightInPixels = node.height * NODE_HEIGHT;
            node.y = startY + myHeightInPixels / 2;

            nodes.push(node);

            let currentChildY = startY;
            node.children.forEach(child => {
                assignCoords(child, depth + 1, currentChildY);

                // Add edge
                edges.push({
                    start: { x: node.x, y: node.y },
                    end: { x: nodeMap.get(child.code)!.x, y: nodeMap.get(child.code)!.y },
                    status: node.status,
                    key: `${node.code}-${child.code}`
                });

                currentChildY += child.height * NODE_HEIGHT;
            });
        };

        let currentRootY = START_Y;
        roots.forEach(root => {
            assignCoords(root, 0, currentRootY);
            currentRootY += root.height * NODE_HEIGHT;
        });

        // Calculate bounding box
        const maxX = Math.max(...nodes.map(n => n.x)) + 100;
        const maxY = Math.max(...nodes.map(n => n.y)) + 80;

        return { nodes, edges, width: maxX, height: maxY };

    }, [steps]);

    if (loading) {
        return (
            <div className="w-full h-40 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-zinc-300 animate-spin" />
            </div>
        );
    }

    if (!steps.length) {
        return null; // Don't render empty container if no data
    }

    return (
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <h3 className="text-sm font-semibold text-zinc-900 uppercase tracking-tight flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-zinc-500" />
                    Flujo de Proceso
                </h3>
                <span className="text-xs text-zinc-400 flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3" />
                    {countdown}s
                </span>
            </div>

            <div className="relative overflow-x-auto overflow-y-hidden bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:20px_20px]">
                {/* CSS for dashed line animation */}
                <style dangerouslySetInnerHTML={{
                    __html: `
                    @keyframes dash {
                        to { stroke-dashoffset: -12; }
                    }
                `}} />

                <div style={{ width: Math.max(layout.width, 800), height: Math.max(layout.height, 200), minHeight: '200px' }} className="relative">
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
                        {layout.edges.map(edge => (
                            <Connection
                                key={edge.key}
                                start={edge.start}
                                end={edge.end}
                                status={edge.status}
                            />
                        ))}
                    </svg>

                    {layout.nodes.map(node => (
                        <Node
                            key={node.code}
                            label={node.display_name || node.label || node.code}
                            status={node.status}
                            x={node.x}
                            y={node.y}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
