import Link from "next/link";
import { ArrowRight, Image as ImageIcon, Layers, Zap, Sparkles, TrendingUp } from "lucide-react";
import { listAllResults } from "@/lib/image-store";
import { getServerLang } from "@/lib/i18n-server";
import { localeMap, translate } from "@/lib/i18n-dictionary";
import { promises as fs } from "node:fs";
import path from "node:path";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const lang = await getServerLang();
  const locale = localeMap[lang];
  const t = (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);

  const results = await listAllResults();
  results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const recentGenerations = results.slice(0, 6).map((item, index) => ({
    id: index,
    title: item.outfitId?.replace(/_/g, " ") || t("dashboard.defaultGenerationTitle"),
    subtitle: item.regionId?.replace(/_/g, " ") || t("dashboard.defaultStyle"),
    src: item.url,
    date: new Date(item.createdAt).toLocaleDateString(locale),
  }));

  const totalGenerations = results.length;

  let availableModels = 0;
  try {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "..");
    const filePath = path.join(dataDir, "models_config.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    availableModels = Object.keys(parsed).length;
  } catch {
    availableModels = 4;
  }

  const stats = [
    {
      icon: "image",
      label: t("dashboard.totalGenerations"),
      value: totalGenerations,
      suffix: "",
      color: "#c5a059",
    },
    {
      icon: "layers",
      label: t("dashboard.availableModels"),
      value: availableModels,
      suffix: "",
      color: "#7dd3fc",
    },
    {
      icon: "zap",
      label: t("dashboard.apiCredits"),
      value: t("dashboard.unlimited"),
      suffix: "",
      color: "#86efac",
      isText: true,
    },
  ];

  return (
    <DashboardClient
      stats={stats}
      recentGenerations={recentGenerations}
      newGenerationLabel={t("dashboard.newGeneration")}
      welcomeLabel={t("dashboard.welcome")}
      subtitleLabel={t("dashboard.subtitle")}
      recentLabel={t("dashboard.recentGenerations")}
      viewAllLabel={t("dashboard.viewAll")}
      emptyTitleLabel={t("dashboard.emptyTitle")}
      emptyCtaLabel={t("dashboard.emptyCta")}
      detailsLabel={t("common.details")}
    />
  );
}
