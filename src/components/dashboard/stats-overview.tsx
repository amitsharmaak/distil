"use client";

import { FileText, Eye, Plug, Hash } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const stats = [
  {
    label: "Total Items",
    value: "127",
    change: "+12 today",
    icon: FileText,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  {
    label: "Unread",
    value: "43",
    change: "34% of total",
    icon: Eye,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    label: "Sources",
    value: "6",
    change: "5 active",
    icon: Plug,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    label: "Topics",
    value: "10",
    change: "9 active",
    icon: Hash,
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
];

export function StatsOverview() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="flex items-center gap-4 p-5">
            <div className={`rounded-lg p-2.5 ${stat.bg}`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stat.change}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
