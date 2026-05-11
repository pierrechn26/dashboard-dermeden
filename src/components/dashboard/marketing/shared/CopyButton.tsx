import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  size?: "sm" | "xs";
}

export function CopyButton({ text, label = "Copier", className, size = "sm" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className={cn(
        "h-6 px-2 text-[10px] font-medium gap-1 shrink-0",
        copied
          ? "text-primary bg-primary/10 hover:bg-primary/10"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {copied ? (
        <><Check className="w-3 h-3" />Copié ✓</>
      ) : (
        <><Copy className="w-3 h-3" />{label}</>
      )}
    </Button>
  );
}
