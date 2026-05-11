import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  comparison?: {
    value: string;
    period: string;
    positive?: boolean;
    diff?: string;
  };
  index?: number;
  largeValue?: boolean;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  comparison,
  index = 0,
  largeValue = false,
}: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Card className="p-6 bg-gradient-to-br from-card via-card to-primary/5 border border-border/50 shadow-md hover:shadow-lg hover:border-primary/30 transition-all duration-300 h-full flex flex-col">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <div className="space-y-1">
              <p className={`font-bold text-foreground ${largeValue ? 'text-4xl' : 'text-3xl'}`}>{value}</p>
            {subtitle && (
                <p className="text-xs text-muted-foreground">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {trend && (
                <div
                  className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                    trend.isPositive
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  <span>{trend.isPositive ? "↑" : "↓"}</span>
                  <span>{Math.abs(trend.value)}%</span>
                </div>
              )}
            </div>
            {comparison && (
              <div className="mt-3 pt-3 border-t border-border/30">
                <p className="text-xs text-muted-foreground">{comparison.period}</p>
                <p className="text-sm font-semibold mt-0.5 text-foreground">
                  {comparison.value}
                  {comparison.diff && (
                    <span className={`ml-1 ${
                      comparison.positive === true ? "text-green-600" :
                      comparison.positive === false ? "text-red-600" :
                      "text-muted-foreground"
                    }`}>
                      ({comparison.diff})
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-accent/10">
            <Icon className="w-6 h-6 text-primary" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
