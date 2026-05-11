import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Send, Pencil, Trash2, MessageSquare, Menu, X, Check, ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PORTAL_BILLING_URL } from "@/lib/portal";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { useUsageLimits } from "@/hooks/useUsageLimits";
import { cn } from "@/lib/utils";

interface Chat {
  id: string;
  title: string;
  updated_at: string;
  is_archived: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aski-chat`;

export function AskiChat() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isSendingRef = useRef(false);
  const { toast } = useToast();

  // Usage limits
  const usageLimits = useUsageLimits();
  const { aski } = usageLimits;
  const questionsUsed = aski.used;
  const questionsLimit = aski.limit;
  const isLimitReached = aski.isExceeded;
  const isWarning = aski.isWarning;

  // Load chats
  const loadChats = useCallback(async () => {
    const { data } = await supabase
      .from("aski_chats")
      .select("*")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false });
    if (data) setChats(data as Chat[]);
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Load messages for selected chat
  const loadMessages = useCallback(async (chatId: string) => {
    const { data } = await supabase
      .from("aski_messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as Message[]);
  }, []);

  useEffect(() => {
    if (selectedChatId) loadMessages(selectedChatId);
    else setMessages([]);
  }, [selectedChatId, loadMessages]);

  // Auto-scroll
  useEffect(() => {
    if (messages.length > 0 || isLoading) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  const handleNewChat = () => {
    setSelectedChatId(null);
    setMessages([]);
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSelectChat = (chatId: string) => {
    setSelectedChatId(chatId);
    setSidebarOpen(false);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || isSendingRef.current || isLimitReached) return;

    isSendingRef.current = true;
    setInput("");
    setIsLoading(true);

    const tempId = "temp-" + Date.now();
    setMessages(prev => [...prev, { id: tempId, role: "user", content: text, created_at: new Date().toISOString() }]);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);
      const res = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ chatId: selectedChatId, userMessage: text }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "limit_reached") {
          toast({ title: "Limite atteinte", description: data.message, variant: "destructive" });
          setMessages(prev => prev.filter(m => m.id !== tempId));
          setInput(text);
          setIsLoading(false);
          return;
        }
        throw new Error(data.error ?? "Erreur inconnue");
      }

      if (!selectedChatId) {
        setSelectedChatId(data.chat_id);
        await loadChats();
      } else {
        setChats(prev => prev.map(c => c.id === data.chat_id ? { ...c, title: data.chat_title, updated_at: new Date().toISOString() } : c));
      }

      // Refresh usage after each message
      usageLimits.refresh();

      await loadMessages(data.chat_id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Aski est temporairement indisponible.";
      setMessages(prev => [
        ...prev.filter(m => m.id !== tempId),
        { id: "err-" + Date.now(), role: "assistant", content: `❌ ${msg}`, created_at: new Date().toISOString() },
      ]);
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  const handleRenameStart = (chat: Chat) => {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  };

  const handleRenameConfirm = async (chatId: string) => {
    if (!renameValue.trim()) return;
    await supabase.from("aski_chats").update({ title: renameValue.trim() }).eq("id", chatId);
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, title: renameValue.trim() } : c));
    setRenamingId(null);
  };

  const handleDelete = async (chatId: string) => {
    await supabase.from("aski_chats").update({ is_archived: true }).eq("id", chatId);
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (selectedChatId === chatId) {
      setSelectedChatId(null);
      setMessages([]);
    }
    setDeleteConfirmId(null);
  };

  // Counter color using semantic tokens via inline check
  const counterColor = isLimitReached
    ? "text-destructive font-semibold"
    : isWarning
    ? "text-warning font-medium"
    : "text-muted-foreground";

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[600px] rounded-xl overflow-hidden border border-border shadow-md bg-background">
      {/* Sidebar Overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          flex flex-col bg-muted/30 border-r border-border w-60 shrink-0
          md:relative md:translate-x-0 md:z-auto
          fixed inset-y-0 left-0 z-30 transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="p-3 border-b border-border">
          <button
            onClick={handleNewChat}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-medium text-foreground hover:bg-muted/50 transition-colors duration-150"
          >
            <Plus className="w-4 h-4 text-primary" />
            Nouvelle conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {chats.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center px-4 py-6">Aucune conversation</p>
          ) : (
            chats.map(chat => (
              <div
                key={chat.id}
                className={cn(
                  "group relative flex items-start px-3 py-2.5 cursor-pointer transition-colors duration-150",
                  selectedChatId === chat.id ? "bg-primary/10" : "hover:bg-muted/50"
                )}
                onClick={() => handleSelectChat(chat.id)}
              >
                <div className="flex-1 min-w-0 pr-2">
                  {renamingId === chat.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleRenameConfirm(chat.id); if (e.key === "Escape") setRenamingId(null); }}
                        className="flex-1 text-xs border border-primary rounded px-1.5 py-0.5 outline-none bg-background"
                      />
                      <button onClick={() => handleRenameConfirm(chat.id)} className="text-primary hover:opacity-80">
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-foreground truncate leading-tight">{chat.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(chat.updated_at), { addSuffix: true, locale: fr })}
                      </p>
                    </>
                  )}
                </div>

                {renamingId !== chat.id && (
                  <div
                    className="absolute right-2 top-2 hidden group-hover:flex items-center gap-1"
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleRenameStart(chat)}
                      className="p-1 rounded hover:bg-muted transition-colors"
                      title="Renommer"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground" />
                    </button>
                    {deleteConfirmId === chat.id ? (
                      <div className="flex items-center gap-1 bg-background border border-destructive/30 rounded px-2 py-1 shadow-sm">
                        <span className="text-xs text-destructive whitespace-nowrap">Supprimer ?</span>
                        <button onClick={() => handleDelete(chat.id)} className="text-xs font-medium text-destructive hover:opacity-80 ml-1">Oui</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-muted-foreground hover:text-foreground ml-1">Non</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(chat.id)}
                        className="p-1 rounded hover:bg-destructive/10 transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0 bg-background">
        {/* Counter + mobile menu */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <button
            className="md:hidden p-2 rounded-lg hover:bg-muted/50"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-muted-foreground" />
          </button>
          <p className={cn("text-xs ml-auto", counterColor)}>
            {isLimitReached
              ? `Limite mensuelle atteinte · renouvellement le ${aski.renewalDate}`
              : isWarning
              ? `${questionsUsed} / ${questionsLimit} conversations — vous approchez de votre limite`
              : `${questionsUsed} / ${questionsLimit} conversations ce mois`}
          </p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Limit exceeded banner inside chat area */}
          {isLimitReached && (
            <div className="rounded-xl border-2 border-destructive/30 bg-destructive/8 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-xl">💬</span>
                <div className="flex-1 space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">Limite mensuelle de conversations atteinte</p>
                  <p className="text-sm text-muted-foreground">
                    Vous avez utilisé vos{" "}
                    <span className="font-semibold text-foreground">{questionsLimit.toLocaleString("fr-FR")} conversations</span>{" "}
                    Aski ce mois. Vos conversations se renouvellent le{" "}
                    <span className="font-semibold text-foreground">{aski.renewalDate}</span>.
                  </p>
                  {usageLimits.upgrade.nextPlan && (
                    <p className="text-sm text-muted-foreground">
                      Passez au plan{" "}
                      <span className="font-semibold text-foreground">{usageLimits.upgrade.nextPlanLabel}</span> pour{" "}
                      <span className="font-semibold text-foreground">
                        {usageLimits.upgrade.askiGain} conversations/mois
                      </span>{" "}
                      (+{(Number(usageLimits.upgrade.askiGain.replace(/\s/g, "")) - questionsLimit).toLocaleString("fr-FR")} supplémentaires).
                    </p>
                  )}
                  {!usageLimits.upgrade.nextPlan && (
                    <p className="text-sm text-muted-foreground">Contactez-nous pour un plan personnalisé.</p>
                  )}
                </div>
              </div>
              {usageLimits.upgrade.nextPlan && (
                <Button
                  size="sm"
                  className="text-xs gap-1.5 bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => window.open(PORTAL_BILLING_URL, "_blank")}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Découvrir le plan {usageLimits.upgrade.nextPlanLabel} — {usageLimits.upgrade.nextPlanPrice}
                </Button>
              )}
            </div>
          )}

          {messages.length === 0 && !isLoading && !isLimitReached && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <MessageSquare className="w-10 h-10 text-muted/50 mb-3" />
              <p className="text-sm text-muted-foreground">Posez votre première question à Aski…</p>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex items-end gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-xs font-bold shadow-sm">
                  A
                </div>
              )}
              <div
                className={cn(
                  "max-w-[75%] px-4 py-3 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary/15 text-foreground rounded-[16px_16px_4px_16px]"
                    : "bg-muted text-foreground rounded-[16px_16px_16px_4px]"
                )}
              >
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground prose-p:my-4 prose-ul:my-4 prose-ol:my-4 prose-li:my-2 prose-headings:mt-6 prose-headings:mb-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_td]:py-2 [&_td]:pr-4 [&_th]:py-2 [&_th]:pr-4 [&_tr]:border-b [&_tr]:border-border/40 [&_blockquote]:my-4 [&_blockquote]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/30 [&_blockquote]:text-muted-foreground [&_hr]:my-5 [&_hr]:border-border/40">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-end gap-2 justify-start">
              <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-xs font-bold shadow-sm">
                A
              </div>
              <div className="bg-muted px-4 py-3 rounded-[16px_16px_16px_4px]">
                <div className="flex gap-1.5 items-center h-4">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-muted-foreground/50"
                      style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-4 py-3 border-t border-border">
          <div className="relative flex items-end">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={isLimitReached ? "Limite mensuelle atteinte" : "Posez votre question à Aski…"}
              disabled={isLoading || isLimitReached}
              className={cn(
                "w-full pr-12 pl-4 py-3 rounded-xl border text-sm outline-none transition-all bg-background resize-none overflow-y-auto leading-relaxed",
                "focus:border-primary focus:ring-2 focus:ring-primary/20",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                isWarning ? "border-warning/60" : "border-border"
              )}
              style={{ minHeight: "48px", maxHeight: "160px" }}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim() || isLimitReached}
              className="absolute right-3 bottom-3 p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Envoyer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
