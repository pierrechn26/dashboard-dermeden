import { useState, useRef, useEffect, useMemo } from "react";
import {
  format,
  subDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  isSameDay,
} from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
}

const PRESETS = [
  {
    label: "7 derniers jours",
    getValue: () => ({ from: subDays(new Date(), 6), to: new Date() }),
  },
  {
    label: "30 derniers jours",
    getValue: () => ({ from: subDays(new Date(), 29), to: new Date() }),
  },
  {
    label: "Ce mois-ci",
    getValue: () => ({ from: startOfMonth(new Date()), to: new Date() }),
  },
  {
    label: "Mois dernier",
    getValue: () => {
      const lastMonth = subMonths(new Date(), 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    },
  },
  {
    label: "90 derniers jours",
    getValue: () => ({ from: subDays(new Date(), 89), to: new Date() }),
  },
  {
    label: "Cette année",
    getValue: () => ({
      from: new Date(new Date().getFullYear(), 0, 1),
      to: new Date(),
    }),
  },
  {
    label: "Toute la période",
    getValue: () => ({ from: undefined as unknown as Date, to: undefined as unknown as Date }),
    isAllTime: true,
  },
];

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Pending range while user picks inside the popover
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(
    dateRange
  );
  const shouldReset = useRef(false);

  // Sync pending when external range changes (e.g. reset)
  useEffect(() => {
    setPendingRange(dateRange);
  }, [dateRange]);

  useEffect(() => {
    if (pendingRange?.from && pendingRange?.to) {
      shouldReset.current = true;
    }
  }, [pendingRange]);

  const activePreset = useMemo(() => {
    if (!pendingRange?.from && !pendingRange?.to) {
      return "Toute la période";
    }
    for (const preset of PRESETS) {
      if ((preset as any).isAllTime) continue;
      const val = preset.getValue();
      if (
        pendingRange?.from &&
        pendingRange?.to &&
        isSameDay(val.from, pendingRange.from) &&
        isSameDay(val.to, pendingRange.to)
      ) {
        return preset.label;
      }
    }
    return null;
  }, [pendingRange]);

  const handleSelect = (range: DateRange | undefined) => {
    if (!range) {
      setPendingRange(undefined);
      return;
    }
    if (shouldReset.current && range.from && pendingRange?.from && pendingRange?.to) {
      const clickedDate =
        range.to && range.to.getTime() !== pendingRange.to?.getTime()
          ? range.to
          : range.from;
      shouldReset.current = false;
      setPendingRange({ from: clickedDate, to: undefined });
      return;
    }
    shouldReset.current = false;
    setPendingRange(range);
  };

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    if ((preset as any).isAllTime) {
      setPendingRange(undefined);
      onDateRangeChange(undefined);
      setIsOpen(false);
      return;
    }
    const val = preset.getValue();
    setPendingRange(val);
    onDateRangeChange(val);
    setIsOpen(false);
  };

  const handleApply = () => {
    onDateRangeChange(pendingRange);
    setIsOpen(false);
  };

  const displayRange = dateRange;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-10 justify-start text-left font-normal text-sm gap-2",
            !displayRange && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">
            {displayRange?.from ? (
              displayRange.to ? (
                <>
                  {format(displayRange.from, "dd MMM yyyy", { locale: fr })} –{" "}
                  {format(displayRange.to, "dd MMM yyyy", { locale: fr })}
                </>
              ) : (
                <>
                  {format(displayRange.from, "dd MMM yyyy", { locale: fr })} – …
                </>
              )
            ) : (
              "Toute la période"
            )}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-popover border border-border shadow-lg z-50"
        align="start"
      >
        <div className="flex">
          {/* Presets sidebar */}
          <div className="border-r border-border p-3 space-y-1 w-44">
            <p className="text-sm font-medium text-foreground mb-2">
              Raccourcis
            </p>
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start text-left font-normal text-sm",
                  activePreset === preset.label &&
                    "bg-primary/15 text-primary hover:bg-primary/20 font-medium"
                )}
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Double-month calendar */}
          <div className="flex flex-col">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={pendingRange?.from ?? subMonths(new Date(), 1)}
              selected={pendingRange}
              onSelect={handleSelect}
              numberOfMonths={2}
              locale={fr}
            disabled={(date) => date > new Date() || date < new Date(new Date().getFullYear() - 1, new Date().getMonth(), 1)}
            weekStartsOn={1}
            className={cn("p-3 pointer-events-auto")}
            />
            <div className="flex justify-end px-4 pb-3">
              <Button size="sm" onClick={handleApply}>
                Actualiser
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
