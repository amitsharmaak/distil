"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Bell, X, Bot, Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { ChatPanel } from "@/components/agent/chat-panel";
import { AgentStatusPanel } from "@/components/agent/agent-status-panel";
import { config } from "@/lib/config";

export function Topbar() {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchValue(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.trim() === "") {
        router.push("/feed");
        return;
      }
      debounceRef.current = setTimeout(() => {
        router.push(`/feed?q=${encodeURIComponent(value.trim())}`);
      }, 300);
    },
    [router]
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const v = searchValue.trim();
        router.push(v ? `/feed?q=${encodeURIComponent(v)}` : "/feed");
      }
      if (e.key === "Escape") {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setSearchValue("");
        router.push("/feed");
      }
    },
    [router, searchValue]
  );

  const handleSearchClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchValue("");
    router.push("/feed");
  }, [router]);

  const fetchCount = useCallback(() => {
    fetch(`${config.apiBaseUrl}/api/notifications`)
      .then((res) => res.json())
      .then((data) => setUnreadCount(data.unreadCount ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  useEffect(() => {
    if (!open) fetchCount();
  }, [open, fetchCount]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* AgentBar: search + Ask Distil */}
      <div className="relative flex flex-1 max-w-md items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search articles, topics, authors..."
            className="pl-9 pr-8"
            value={searchValue}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
          />
          {searchValue && (
            <button
              onClick={handleSearchClear}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Sheet open={chatOpen} onOpenChange={setChatOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0" aria-label="Ask Distil">
              <Bot className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="flex flex-col w-full sm:max-w-xl p-0 gap-0"
            showCloseButton={true}
          >
            <SheetTitle className="sr-only">Distil Agent</SheetTitle>
            <Tabs defaultValue="chat" className="flex flex-col h-full">
              <TabsList className="w-full justify-start rounded-none border-b px-4 h-12">
                <TabsTrigger value="chat" className="gap-2">
                  <Bot className="h-4 w-4" />
                  Ask Distil
                </TabsTrigger>
                <TabsTrigger value="activity" className="gap-2">
                  <Activity className="h-4 w-4" />
                  Activity
                </TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="flex-1 m-0 min-h-0">
                <ChatPanel />
              </TabsContent>
              <TabsContent value="activity" className="flex-1 m-0 min-h-0 overflow-hidden">
                <AgentStatusPanel />
              </TabsContent>
            </Tabs>
          </SheetContent>
        </Sheet>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <Badge className="absolute -right-1 -top-1 h-5 w-5 rounded-full p-0 text-[10px] flex items-center justify-center">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <NotificationPanel
              onClose={() => setOpen(false)}
              onCountChange={setUnreadCount}
            />
          </PopoverContent>
        </Popover>

        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-sm">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
