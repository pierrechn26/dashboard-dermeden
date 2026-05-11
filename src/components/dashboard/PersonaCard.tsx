import { motion } from "framer-motion";
import { TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface PersonaCardProps {
  name: string;
  tagline: string;
  image: string;
  ageRange: string;
  situation: string;
  prospectPercentage: number;
  psychology: string;
  problems: string[];
  keyNeeds: string[];
  behaviors: string[];
  topProducts: string[];
  aiInsights: string[];
  index: number;
  colorTheme: "emma" | "sophie" | "lea";
}

export function PersonaCard({
  name,
  tagline,
  image,
  ageRange,
  situation,
  prospectPercentage,
  psychology,
  problems,
  keyNeeds,
  behaviors,
  topProducts,
  aiInsights,
  index,
  colorTheme,
}: PersonaCardProps) {
  const colorClass = `bg-persona-${colorTheme}`;
  const foregroundClass = `text-persona-${colorTheme}-foreground`;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="h-full"
    >
      <Card className="overflow-hidden border-0 bg-card shadow-[var(--shadow-medium)] hover:shadow-[var(--shadow-strong)] transition-all duration-300 h-full flex flex-col">
        {/* Colored Header with stronger background */}
        <div className={`${colorClass} ${foregroundClass} p-6 relative`}>
          <div className="flex items-center gap-4">
            <motion.div
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <div className="w-20 h-20 rounded-full overflow-hidden bg-white/30 p-0.5 shadow-lg backdrop-blur-sm">
                <img
                  src={image}
                  alt={name}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
            </motion.div>
            <div>
              <h3 className="text-xl font-bold">{name}, {ageRange.split('-')[0]} ans</h3>
              <p className="text-sm opacity-90 mt-0.5 italic">{tagline}</p>
              <p className="text-xs opacity-80 mt-1">{situation}</p>
            </div>
          </div>
          
          {/* Progress bar for prospect percentage */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Représente {prospectPercentage}% de vos prospects</span>
            </div>
            <Progress value={prospectPercentage} className="h-2.5 bg-black/20 backdrop-blur-sm" />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 pb-5 space-y-5 flex-1">
          {/* Psychology */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">
              Psychologie
            </h4>
            <p className="text-xs text-foreground/80 leading-relaxed">{psychology}</p>
          </div>

          {/* Problems */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider">
                Problématiques clés
              </h4>
            </div>
            <ul className="space-y-1.5">
              {problems.map((problem, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-destructive mt-0.5">•</span>
                  <span className="text-foreground/80 leading-relaxed">{problem}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Key Needs */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-primary" />
              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">
                Besoins essentiels
              </h4>
            </div>
            <ul className="space-y-1.5">
              {keyNeeds.map((need, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-primary mt-0.5">•</span>
                  <span className="text-foreground/80 leading-relaxed">{need}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Behaviors */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              <h4 className="text-xs font-semibold text-accent uppercase tracking-wider">
                Comportements
              </h4>
            </div>
            <ul className="space-y-1.5">
              {behaviors.map((behavior, i) => (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-accent mt-0.5">•</span>
                  <span className="text-foreground/80 leading-relaxed">{behavior}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Top Products */}
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            <h4 className="text-xs font-semibold text-primary uppercase tracking-wider">
              Top produits recommandés
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {topProducts.map((product, i) => (
                <Badge key={i} variant="outline" className="text-xs bg-primary/5 border-primary/20">
                  {product}
                </Badge>
              ))}
            </div>
          </div>

        </div>

        {/* AI Insights with distinctive background */}
        <motion.div 
          className="h-[200px] space-y-2 pt-4 pb-6 px-6 bg-gradient-to-br from-destructive/10 to-destructive/5 border-t border-destructive/20 rounded-b-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: index * 0.1 + 0.3 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-destructive" />
            <h4 className="text-xs font-bold text-destructive uppercase tracking-wider">
              Insights IA
            </h4>
          </div>
          <div className="space-y-2">
            {aiInsights.map((insight, i) => (
              <motion.p
                key={i}
                className="text-xs text-destructive/90 leading-relaxed pl-3 border-l-2 border-destructive/40"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 + 0.4 + i * 0.1 }}
              >
                {insight}
              </motion.p>
            ))}
          </div>
        </motion.div>
      </Card>
    </motion.div>
  );
}
