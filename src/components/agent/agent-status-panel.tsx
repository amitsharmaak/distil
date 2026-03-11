"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, CheckCircle, Clock, AlertTriangle, DollarSign, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { config } from "@/lib/config";

interface AgentStatus {
  runningWorkflows: Array<{ id: string; workflow_type: string; current_step: string; item_id: string }>;
  recentWorkflows: Array<{ id: string; workflow_type: string; status: string; created_at: string }>;
  recentActions: Array<{ id: string; action_type: string; tool_name: string; created_at: string; reasoning: string }>;
  pendingApprovals: Array<{ id: string; action_type: string; description: string; created_at: string }>;
  stats: { dailyCost: number; totalCalls: number; totalTokens: number; jobs: { pending: number; running: number; completed: number; failed: number } };
}

export function AgentStatusPanel() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(() => {
    setLoading(true);
    fetch(`${config.apiBaseUrl}/api/agent/status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchStatus();
    const iv = setInterval(fetchStatus, 15000);
    return () => clearInterval(iv);
  }, [fetchStatus]);

  const handleApproval = async (id: string, decision: "approved" | "rejected") => {
    await fetch(`${config.apiBaseUrl}/api/agent/approvals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId: id, decision }),
    });
    fetchStatus();
  };

  if (loading && !status) return <div className="p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading agent status...</div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <span className="font-semibold">Agent Activity</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchStatus}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Stats */}
          {status?.stats && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted p-2"><DollarSign className="h-3 w-3 inline mr-1" />Today: ${status.stats.dailyCost?.toFixed(4) ?? '0'}</div>
              <div className="rounded-md bg-muted p-2"><Activity className="h-3 w-3 inline mr-1" />{status.stats.totalCalls ?? 0} AI calls</div>
            </div>
          )}

          {/* Running workflows */}
          {status?.runningWorkflows && status.runningWorkflows.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Running</p>
              {status.runningWorkflows.map(w => (
                <div key={w.id} className="flex items-center gap-2 text-xs py-1">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>{w.workflow_type}</span>
                  <Badge variant="outline" className="text-[10px]">{w.current_step}</Badge>
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Pending approvals */}
          {status?.pendingApprovals && status.pendingApprovals.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                <AlertTriangle className="h-3 w-3 inline mr-1" />Approvals Needed
              </p>
              {status.pendingApprovals.map(a => (
                <div key={a.id} className="rounded-md border p-2 mb-2 text-xs">
                  <p className="font-medium">{a.action_type}</p>
                  <p className="text-muted-foreground mt-0.5">{a.description.slice(0, 100)}</p>
                  <div className="flex gap-1 mt-2">
                    <Button size="sm" className="h-6 text-xs px-2" onClick={() => handleApproval(a.id, "approved")}>Approve</Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={() => handleApproval(a.id, "rejected")}>Reject</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent actions */}
          {status?.recentActions && status.recentActions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent Actions</p>
              {status.recentActions.slice(0, 10).map(a => (
                <div key={a.id} className="flex items-center gap-2 text-xs py-1">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  <span className="truncate">{a.tool_name ?? a.action_type}</span>
                  <span className="text-muted-foreground ml-auto shrink-0">{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent workflows */}
          {status?.recentWorkflows && status.recentWorkflows.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent Workflows</p>
              {status.recentWorkflows.slice(0, 5).map(w => (
                <div key={w.id} className="flex items-center gap-2 text-xs py-1">
                  {w.status === "completed" ? <CheckCircle className="h-3 w-3 text-green-500" /> :
                   w.status === "failed" ? <AlertTriangle className="h-3 w-3 text-destructive" /> :
                   <Clock className="h-3 w-3 text-muted-foreground" />}
                  <span>{w.workflow_type}</span>
                  <Badge variant={w.status === "completed" ? "default" : w.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">{w.status}</Badge>
                  <span className="text-muted-foreground ml-auto shrink-0">{timeAgo(w.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}
