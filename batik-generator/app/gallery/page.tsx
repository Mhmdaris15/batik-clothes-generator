"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowRight, Search, ArrowUpDown, Images, SlidersHorizontal } from "lucide-react";
import ImageGallery, { type GalleryItem } from "@/components/ImageGallery";
import { useI18n } from "@/components/I18nProvider";
import { motion, AnimatePresence } from "framer-motion";

type GalleryResponse = {
  items: GalleryItem[];
  counts: { faces: number; garments: number; results: number; landscapes: number; total: number };
};

const TABS = ["All", "Results", "Garments", "Faces", "Landscapes"] as const;
type Tab = (typeof TABS)[number];
type SortKey = "newest" | "oldest" | "name-asc" | "name-desc";

function tabToCategory(tab: Tab): GalleryItem["category"] | null {
  if (tab === "All") return null;
  return tab.toLowerCase() as GalleryItem["category"];
}

export default function GalleryPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [counts, setCounts] = useState({ faces: 0, garments: 0, results: 0, landscapes: 0, total: 0 });
  const [activeTab, setActiveTab] = useState<Tab>("All");
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [searchFocused, setSearchFocused] = useState(false);

  const fetchGallery = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/gallery");
      const data = (await resp.json()) as GalleryResponse;
      setItems(data.items ?? []);
      setCounts(data.counts ?? { faces: 0, garments: 0, results: 0, landscapes: 0, total: 0 });
    } catch { /* noop */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGallery(); }, [fetchGallery]);

  const category = tabToCategory(activeTab);

  const filtered = useMemo(() => {
    let result = category ? items.filter((i) => i.category === category) : items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((item) =>
        (item.outfitId?.replace(/_/g, " ") || "").toLowerCase().includes(q) ||
        (item.regionId?.replace(/_/g, " ") || "").toLowerCase().includes(q) ||
        item.filename.toLowerCase().includes(q) ||
        (item.gender || "").toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    const sorted = [...result];
    switch (sortKey) {
      case "newest": sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case "oldest": sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case "name-asc": sorted.sort((a, b) => (a.outfitId || a.filename).localeCompare(b.outfitId || b.filename)); break;
      case "name-desc": sorted.sort((a, b) => (b.outfitId || b.filename).localeCompare(a.outfitId || a.filename)); break;
    }
    return sorted;
  }, [items, category, searchQuery, sortKey]);

  async function handleDelete(item: GalleryItem) {
    if (!confirm(t("gallery.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/${item.category}/image/${item.filename}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.filename !== item.filename));
        if (selected?.filename === item.filename) setSelected(null);
        fetchGallery();
      } else { alert(t("gallery.deleteFailed")); }
    } catch { alert(t("gallery.deleteError")); }
  }

  const tabLabels: Record<Tab, string> = {
    All: t("gallery.tabAll"),
    Results: t("gallery.tabResults"),
    Garments: t("gallery.tabGarments"),
    Faces: t("gallery.tabFaces"),
    Landscapes: t("gallery.tabLandscapes"),
  };

  function useSelectedImage() {
    if (!selected) return;
    sessionStorage.setItem("gallery_selected", JSON.stringify(selected));
    if (selected.category === "garments") router.push("/workspace");
    else router.push("/capture");
  }

  const tabCount = (tab: Tab) =>
    tab === "All" ? counts.total :
    tab === "Faces" ? counts.faces :
    tab === "Garments" ? counts.garments :
    tab === "Landscapes" ? counts.landscapes :
    counts.results;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Images size={14} className="text-[#c5a059]" />
            <span className="text-xs font-bold uppercase tracking-widest text-[#c5a059]">Gallery</span>
          </div>
          <h1 className="text-2xl font-bold text-[#f7f1e6]">{t("gallery.title")}</h1>
          <p className="text-sm text-[#a89f91] mt-0.5">
            {t("gallery.subtitlePrefix")}{" "}
            <motion.span
              key={counts.total}
              initial={{ scale: 1.3, color: "#c5a059" }}
              animate={{ scale: 1, color: "#e7cf9d" }}
              className="font-semibold"
            >
              {counts.total}
            </motion.span>{" "}
            {t("gallery.subtitleSuffix")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <AnimatePresence>
            {selected && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: 10 }}
                onClick={useSelectedImage}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 bg-[#c5a059] text-[#1a1412] px-4 py-2.5 rounded-xl font-semibold text-sm"
              >
                {t("gallery.useSelected")}
                <ArrowRight size={14} />
              </motion.button>
            )}
          </AnimatePresence>

          <motion.button
            onClick={fetchGallery}
            disabled={loading}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 bg-[#2a201c] border border-[#3a2a22] hover:border-[#c5a05950] text-[#f7f1e6] px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("gallery.refresh")}
          </motion.button>
        </div>
      </div>

      {/* ── Search & Sort ────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <motion.div className="relative flex-1" animate={{ scale: searchFocused ? 1.005 : 1 }}>
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
            size={15}
            style={{ color: searchFocused ? "#c5a059" : "#8b7e6a" }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder={t("gallery.searchPlaceholder")}
            className="w-full bg-[#2a201c] border border-[#3a2a22] rounded-xl py-2.5 pl-9 pr-4 text-sm text-[#f7f1e6] placeholder-[#8b7e6a] focus:outline-none transition-all duration-200"
            style={{
              borderColor: searchFocused ? "rgba(197,160,89,0.5)" : undefined,
              boxShadow: searchFocused ? "0 0 0 3px rgba(197,160,89,0.08)" : undefined,
            }}
          />
        </motion.div>

        <div className="flex items-center gap-2 bg-[#2a201c] border border-[#3a2a22] rounded-xl px-3 py-1">
          <SlidersHorizontal size={13} className="text-[#8b7e6a] flex-shrink-0" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-transparent text-sm text-[#f7f1e6] focus:outline-none cursor-pointer pr-1"
          >
            <option value="newest">{t("gallery.newest")}</option>
            <option value="oldest">{t("gallery.oldest")}</option>
            <option value="name-asc">{t("gallery.nameAsc")}</option>
            <option value="name-desc">{t("gallery.nameDesc")}</option>
          </select>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-1 overflow-x-auto pb-px">
        <div className="absolute bottom-0 left-0 right-0 h-px bg-[#3a2a22]" />
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150"
              style={{ color: isActive ? "#c5a059" : "#8b7e6a" }}
            >
              {isActive && (
                <motion.div
                  layoutId="gallery-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c5a059] rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              {tabLabels[tab]}
              <motion.span
                animate={{
                  backgroundColor: isActive ? "rgba(197,160,89,0.15)" : "rgba(42,32,28,0.8)",
                  color: isActive ? "#c5a059" : "#8b7e6a",
                }}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              >
                {tabCount(tab)}
              </motion.span>
            </button>
          );
        })}
      </div>

      {/* ── Selected banner ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-[#c5a05910] border border-[#c5a05940] rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-[#c5a059]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selected.url} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#e7cf9d]">
                    {selected.outfitId?.replace(/_/g, " ") || t("gallery.selectedLabel")}
                  </p>
                  <p className="text-xs text-[#a89f91]">{selected.category} · {selected.gender}</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-[#8b7e6a] hover:text-[#f7f1e6] transition-colors px-2 py-1"
              >
                {t("gallery.clear")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search results label */}
      <AnimatePresence>
        {searchQuery && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs text-[#8b7e6a]"
          >
            {t("gallery.showingResults", { count: filtered.length, query: searchQuery })}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[3/4] rounded-xl" />
            ))}
          </motion.div>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ImageGallery
              items={filtered}
              selectable
              onSelect={setSelected}
              selectedFilename={selected?.filename ?? null}
              onDelete={handleDelete}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
