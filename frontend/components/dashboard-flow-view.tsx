"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  useReactFlow,
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  connectionNodeTypes,
  NODE_BANK_ITEMS,
} from "@/components/connection-nodes";
import { getSupabase } from "@/lib/supabase/client";
import { IconDeviceFloppy } from "@tabler/icons-react";

const DARK_GRID_COLOR = "#404040";
const DARK_BG_COLOR = "#1a1a1a";
const DRAG_TYPE = "application/reactflow";

/** Build a JSON-serializable payload for Supabase: nodes (with positions + data) and edges (connections). */
function buildGraphPayload(nodes: Node[], edges: { id?: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }[]) {
  const sanitizedNodes = nodes.map((n) => {
    const data = n.data && typeof n.data === "object" ? { ...n.data } : {};
    return {
      id: n.id,
      type: n.type,
      position: n.position ?? { x: 0, y: 0 },
      data,
    };
  });
  const serializableEdges = edges.map((e) => ({
    id: e.id ?? `${e.source}-${e.target}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  }));
  return { nodes: sanitizedNodes, edges: serializableEdges };
}

/** Normalize saved nodes/edges from DB into React Flow shape. */
function parseSavedGraph(saved: { nodes?: unknown; edges?: unknown }): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = Array.isArray(saved.nodes)
    ? saved.nodes.map((n: Record<string, unknown>) => ({
        id: String(n.id ?? ""),
        type: (n.type as string) || "default",
        position: typeof n.position === "object" && n.position && "x" in n.position && "y" in n.position
          ? { x: Number((n.position as { x: number; y: number }).x), y: Number((n.position as { x: number; y: number }).y) }
          : { x: 0, y: 0 },
        data: (n.data as Record<string, unknown>) ?? {},
      }))
    : [];
  const edges: Edge[] = Array.isArray(saved.edges)
    ? saved.edges.map((e: Record<string, unknown>) => ({
        id: (e.id as string) ?? `${e.source}-${e.target}`,
        source: String(e.source ?? ""),
        target: String(e.target ?? ""),
        ...(e.sourceHandle != null && { sourceHandle: e.sourceHandle as string }),
        ...(e.targetHandle != null && { targetHandle: e.targetHandle as string }),
      }))
    : [];
  return { nodes, edges };
}

function ConnectionsCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loadStatus, setLoadStatus] = useState<"idle" | "loading" | "done" | "error">("loading");
  const { screenToFlowPosition } = useReactFlow();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setLoadStatus("done");
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || cancelled) {
        setLoadStatus("done");
        return;
      }
      const { data: row, error } = await supabase
        .from("user_connection_graphs")
        .select("nodes, edges")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error || !row) {
        setLoadStatus("done");
        return;
      }
      const { nodes: loadedNodes, edges: loadedEdges } = parseSavedGraph(row);
      if (loadedNodes.length > 0 || loadedEdges.length > 0) {
        setNodes(loadedNodes);
        setEdges(loadedEdges);
      }
      setLoadStatus("done");
    };
    load();
    return () => { cancelled = true; };
  }, [setNodes, setEdges]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DRAG_TYPE);
      if (!type) return;
      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      const id = `${type}-${Date.now()}`;
      const newNode: Node = {
        id,
        type,
        position,
        data: type === "rateLimit" ? { limit: "100 req/min" } : {},
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const handleSaveNodes = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setSaveStatus("error");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      setSaveStatus("error");
      return;
    }
    setSaveStatus("saving");
    const { nodes: serializedNodes, edges: serializedEdges } = buildGraphPayload(nodes, edges);
    const payload = {
      user_id: user.id,
      name: "My connections",
      nodes: serializedNodes,
      edges: serializedEdges,
    };
    const { error } = await supabase.from("user_connection_graphs").insert(payload);
    if (error) {
      setSaveStatus("error");
      return;
    }
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, [nodes, edges]);

  return (
    <div className="flex h-full w-full">
      {/* Node bank — left */}
      <div
        className="flex w-52 shrink-0 flex-col gap-1 border-r border-[#404040] bg-[#1a1a1a] p-3"
        style={{ fontFamily: "var(--font-geist-sans)" }}
      >
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#888]">
          Nodes
        </div>
        {NODE_BANK_ITEMS.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, item.type);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="flex cursor-grab items-center gap-2 rounded-md border border-[#404040] bg-[#252525] px-3 py-2 text-sm text-white shadow transition-colors hover:border-[#555] hover:bg-[#2a2a2a] active:cursor-grabbing"
          >
            <item.Icon className="size-4 shrink-0 text-[#888]" />
            <span>{item.label}</span>
          </div>
        ))}
        <button
          type="button"
          onClick={handleSaveNodes}
          disabled={saveStatus === "saving"}
          className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-[#404040] bg-[#252525] px-3 py-2.5 text-sm font-medium text-white shadow transition-colors hover:border-[#555] hover:bg-[#2a2a2a] disabled:opacity-50"
        >
          <IconDeviceFloppy className="size-4 shrink-0" />
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "saved"
              ? "Saved"
              : "Save nodes"}
        </button>
      </div>
      {/* Canvas */}
      <div className="min-w-0 flex-1 relative">
        {loadStatus === "loading" && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1a1a1a]/80 text-sm text-[#888]">
            Loading saved graph…
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={connectionNodeTypes}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onConnect={onConnect}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          colorMode="dark"
          className="dark-grid-flow dark-flow-controls"
          style={{ background: DARK_BG_COLOR }}
        >
          <Background
            variant={BackgroundVariant.Lines}
            gap={24}
            size={1}
            color={DARK_GRID_COLOR}
            style={{ background: DARK_BG_COLOR }}
          />
          <Controls className="dark-flow-controls" />
        </ReactFlow>
      </div>
    </div>
  );
}

export function DashboardFlowView() {
  return (
    <div className="h-full w-full" style={{ background: DARK_BG_COLOR }}>
      <ReactFlowProvider>
        <ConnectionsCanvas />
      </ReactFlowProvider>
    </div>
  );
}
