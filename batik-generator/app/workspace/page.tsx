"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  type Variants,
} from "framer-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

type Outfit = {
  id: string;
  name: string;
  description: string;
  motifs: string[];
  colors: string[];
  accessories: string;
};

type PersonInput = {
  faceImageB64: string;
  gender: "female" | "male";
  outfit: Outfit;
};

type CapturePayload = {
  regionId: string;
  regionName: string;
  backgroundPrompt?: string;
  gender?: "female" | "male";
  outfit?: Outfit;
  faceImageB64?: string;
  facePreview?: string;
  groupMode?: boolean;
  persons?: PersonInput[];
  groupPhotoMode?: boolean;
  groupPhotoB64?: string;
  groupPhotoPreview?: string;
  femaleCount?: number;
  maleCount?: number;
  groupOutfitName?: string;
  emailAddress?: string;
};

type GenerateResponse = {
  images: string[];
  prompt: string;
  garmentReused?: boolean;
};

type GarmentEntry = {
  filename: string;
  outfitId: string;
  regionId: string;
  gender: string;
  prompt?: string;
  createdAt: string;
  url: string;
};

type LandscapeEntry = {
  filename: string;
  regionId: string;
  regionName?: string;
  tag?: string;
  createdAt: string;
  url: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "batik_capture_payload";

// ─── Animation variants ───────────────────────────────────────────────────────

const sidebarVariants = {
  hidden: { x: -60, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: "spring" as const, damping: 24, stiffness: 220, delay: 0.05 },
  },
} satisfies Variants;

const mainVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: "easeOut" as const, delay: 0.15 },
  },
} satisfies Variants;

const panelVariants = {
  hidden: { x: "100%", opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: "spring" as const, damping: 28, stiffness: 260 },
  },
  exit: {
    x: "100%",
    opacity: 0,
    transition: { duration: 0.25, ease: "easeIn" as const },
  },
} satisfies Variants;

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
} satisfies Variants;

const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.1, type: "spring" as const, damping: 20, stiffness: 260 },
  }),
};

const toastVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, damping: 22, stiffness: 280 },
  },
  exit: {
    opacity: 0,
    y: 20,
    scale: 0.9,
    transition: { duration: 0.2, ease: "easeIn" as const },
  },
} satisfies Variants;

const checkmarkVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: "spring" as const, damping: 14, stiffness: 400, delay: 0.05 },
  },
} satisfies Variants;

const emailSuccessVariants = {
  hidden: { scale: 0.5, opacity: 0 },
  visible: {
    scale: [0.5, 1.15, 0.95, 1],
    opacity: 1,
    transition: { duration: 0.5, times: [0, 0.5, 0.75, 1] },
  },
} satisfies Variants;

// ─── Decorative gold line section header ──────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="flex items-center gap-3 mb-1"
      initial={{ opacity: 0, y: -6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35 }}
    >
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#c5a05940]" />
      <label className="text-[11px] font-bold uppercase tracking-widest text-[#c5a059]">
        {children}
      </label>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#c5a05940]" />
    </motion.div>
  );
}

// ─── Shimmer/loading overlay ──────────────────────────────────────────────────

function LoadingOverlay({ regionName }: { regionName?: string }) {
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#120e0c]/90 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Animated batik-inspired spinner */}
      <div className="relative mb-8 h-24 w-24">
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-[#c5a059]/20"
        />
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-t-[#c5a059] border-r-transparent border-b-transparent border-l-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-3 rounded-full border-4 border-b-[#c5a059]/60 border-t-transparent border-r-transparent border-l-transparent"
          animate={{ rotate: -360 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-[#c5a059]">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      </div>
      <motion.p
        className="text-lg font-bold text-[#f7f1e6]"
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        Crafting your batik...
      </motion.p>
      {regionName && (
        <p className="mt-1 text-sm text-[#a89f91]">{regionName} collection</p>
      )}
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const router = useRouter();
  const { t } = useI18n();
  const prefersReduced = useReducedMotion();

  // ── State (all original state preserved) ────────────────────────────────────
  const [capture, setCapture] = useState<CapturePayload | null>(null);
  const [numImages, setNumImages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [images, setImages] = useState<string[]>([]);
  const [garments, setGarments] = useState<GarmentEntry[]>([]);
  const [selectedGarment, setSelectedGarment] = useState<string>("");
  const [garmentReused, setGarmentReused] = useState<boolean>(false);
  const [garmentPanelOpen, setGarmentPanelOpen] = useState<boolean>(false);
  const [landscapes, setLandscapes] = useState<LandscapeEntry[]>([]);
  const [selectedLandscape, setSelectedLandscape] = useState<string>("");
  const [landscapePanelOpen, setLandscapePanelOpen] = useState<boolean>(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [emailAddress, setEmailAddress] = useState<string>("");
  const [emailSending, setEmailSending] = useState<boolean>(false);
  const [emailStatus, setEmailStatus] = useState<string>("");

  // ── Effects (all original effects preserved) ─────────────────────────────────
  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      router.replace("/capture");
      return;
    }
    const payload = JSON.parse(raw) as CapturePayload;
    setCapture(payload);
    if (payload.emailAddress) {
      setEmailAddress(payload.emailAddress);
    }
  }, [router]);

  useEffect(() => {
    fetch("/api/garments")
      .then((r) => r.json())
      .then((data: { garments: GarmentEntry[] }) => {
        setGarments(data.garments ?? []);
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    const galleryRaw = sessionStorage.getItem("gallery_selected");
    if (galleryRaw) {
      sessionStorage.removeItem("gallery_selected");
      try {
        const sel = JSON.parse(galleryRaw) as { filename: string; category: string };
        if (sel.category === "garments" && sel.filename) {
          setSelectedGarment(sel.filename);
        } else if (sel.category === "landscapes" && sel.filename) {
          setSelectedLandscape(sel.filename);
        }
      } catch { /* ignore parse errors */ }
    }
  }, []);

  useEffect(() => {
    fetch("/api/landscapes")
      .then((r) => r.json())
      .then((data: { landscapes: LandscapeEntry[] }) => {
        setLandscapes(data.landscapes ?? []);
      })
      .catch(() => { });
  }, []);

  // ── Derived values (all original memos preserved) ────────────────────────────
  const matchingLandscapes = useMemo(
    () => landscapes.filter((l) => capture && l.regionId === capture.regionId),
    [landscapes, capture],
  );

  const selectedLandscapeObj = useMemo(
    () => landscapes.find((l) => l.filename === selectedLandscape),
    [landscapes, selectedLandscape],
  );

  const matchingGarments = useMemo(
    () => garments.filter((g) => capture?.outfit && g.outfitId === capture.outfit.id),
    [garments, capture],
  );

  const canGenerate = useMemo(() => {
    if (!capture) return false;
    if (capture.groupPhotoMode) return Boolean(capture.groupPhotoB64);
    if (capture.groupMode) return (capture.persons?.length ?? 0) >= 2 && capture.persons!.every((p) => p.faceImageB64);
    return Boolean(capture.faceImageB64 && capture.outfit);
  }, [capture]);

  const capturePreview = useMemo(() => {
    if (!capture) return "";
    if (capture.groupPhotoMode) return capture.groupPhotoPreview || (capture.groupPhotoB64 ? `data:image/jpeg;base64,${capture.groupPhotoB64}` : "");
    if (capture.groupMode) return "";
    if (!capture.faceImageB64) return "";
    return capture.facePreview || `data:image/jpeg;base64,${capture.faceImageB64}`;
  }, [capture]);

  // ── Handler (original preserved) ─────────────────────────────────────────────
  async function generateImages() {
    if (!capture) return;
    setIsLoading(true);
    setError("");
    setImages([]);

    const modelType = (() => {
      try {
        const s = localStorage.getItem("batik_settings");
        return s ? JSON.parse(s).activeModelId : undefined;
      } catch { return undefined; }
    })();

    try {
      const baseFields = {
        regionName: capture.regionName,
        regionId: capture.regionId,
        numImages,
        landscapeFilename: selectedLandscape || undefined,
        backgroundPrompt: capture.backgroundPrompt || undefined,
        modelType,
      };

      const bodyData = capture.groupPhotoMode && capture.groupPhotoB64
        ? {
          ...baseFields,
          groupPhotoMode: true,
          groupPhotoB64: capture.groupPhotoB64,
          femaleCount: capture.femaleCount,
          maleCount: capture.maleCount,
          groupOutfitName: capture.groupOutfitName,
        }
        : capture.groupMode && capture.persons
        ? { ...baseFields, persons: capture.persons }
        : {
          ...baseFields,
          gender: capture.gender,
          outfit: capture.outfit,
          faceImageB64: capture.faceImageB64,
          garmentFilename: selectedGarment || undefined,
        };

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      const result = (await response.json()) as GenerateResponse & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Generation failed");
      }
      setImages(result.images || []);
      setPrompt(result.prompt || "");
      setGarmentReused(result.garmentReused ?? false);

      fetch("/api/garments")
        .then((r) => r.json())
        .then((data: { garments: GarmentEntry[] }) => setGarments(data.garments ?? []))
        .catch(() => { });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">

      {/* ── Loading overlay ── */}
      <AnimatePresence>
        {isLoading && <LoadingOverlay regionName={capture?.regionName} />}
      </AnimatePresence>

      {/* ── Page header ── */}
      <motion.div
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div>
          <h1 className="text-3xl font-bold text-[#f7f1e6] tracking-tight">
            {t("workspace.title")}
          </h1>
          <p className="mt-1 text-sm text-[#a89f91]">{t("workspace.subtitle")}</p>
        </div>
        <motion.button
          type="button"
          onClick={() => router.push("/capture")}
          className="flex items-center gap-2 bg-[#2a201c] border border-[#3a2a22] hover:border-[#c5a059] text-[#f7f1e6] px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
          {t("workspace.backToCapture")}
        </motion.button>
      </motion.div>

      {/* ── Two-column layout ── */}
      <div className="grid flex-1 gap-6 lg:grid-cols-[360px_1fr]">

        {/* ── Left sidebar – glass morphism config panel ── */}
        <motion.aside
          variants={prefersReduced ? undefined : sidebarVariants}
          initial="hidden"
          animate="visible"
          className="relative flex h-full flex-col rounded-2xl border border-[#3a2a22] bg-[#1a1412]/95 backdrop-blur-sm overflow-hidden"
          style={{ boxShadow: "0 0 0 1px #c5a05920, 0 8px 32px #00000060" }}
        >
          {/* Gold top accent line */}
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#c5a059] to-transparent" />

          <div className="border-b border-[#3a2a22] px-5 py-4">
            <h2 className="text-xl font-semibold text-[#f7f1e6]">{t("workspace.studioConfig")}</h2>
            <p className="text-xs text-[#a89f91]">{t("workspace.studioSub")}</p>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto p-5">

            {/* Input source / face preview */}
            <div>
              <SectionHeader>{t("workspace.inputSource")}</SectionHeader>
              <div className="mt-3 rounded-xl border border-dashed border-[#ffffff2e] bg-black/25 p-3">
                {capture?.groupPhotoMode && capturePreview ? (
                  <div>
                    <img src={capturePreview} alt="Group photo" className="h-52 w-full rounded-lg object-cover" />
                    <p className="text-[9px] text-center text-[#a89f91] mt-1">
                      {t("capture.modeGroupPhoto")} — {capture.regionName}
                    </p>
                  </div>
                ) : capture?.groupMode && capture.persons ? (
                  <div className="grid grid-cols-2 gap-2">
                    {capture.persons.map((p, i) => (
                      <div key={i} className="rounded-lg overflow-hidden">
                        <img src={`data:image/jpeg;base64,${p.faceImageB64}`} alt={`Person ${i + 1}`} className="w-full aspect-[3/4] object-cover" />
                        <p className="text-[9px] text-center text-[#a89f91] mt-0.5 truncate">{p.outfit.name}</p>
                      </div>
                    ))}
                  </div>
                ) : capturePreview ? (
                  <img src={capturePreview} alt="Uploaded face" className="h-52 w-full rounded-lg object-cover" />
                ) : (
                  <div className="flex h-52 items-center justify-center text-sm text-[#f7f1e680]">
                    {t("workspace.noUploadedFace")}
                  </div>
                )}
              </div>
              <motion.button
                type="button"
                onClick={() => router.push("/capture")}
                className="mt-3 w-full rounded-lg border border-[#ffffff25] bg-[#ffffff0b] px-3 py-2 text-sm font-medium hover:bg-[#ffffff1a] text-[#f7f1e6] transition-colors"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {t("workspace.backToCapture")}
              </motion.button>
            </div>

            {/* Gender display */}
            <div>
              <SectionHeader>{t("workspace.subjectGender")}</SectionHeader>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-[#ffffff1a] bg-black/20 p-1.5">
                {(["male", "female"] as const).map((g) => (
                  <div
                    key={g}
                    className={`rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors ${
                      capture?.gender === g
                        ? "bg-[#c5a059] text-[#2a1d18]"
                        : "text-[#f7f1e6a0]"
                    }`}
                  >
                    {t(`capture.${g}`)}
                  </div>
                ))}
              </div>
            </div>

            {/* Region */}
            <div>
              <SectionHeader>{t("workspace.batikRegion")}</SectionHeader>
              <div className="mt-3 rounded-xl border border-[#ffffff1f] bg-black/25 px-3 py-2 text-sm text-[#f7f1e6]">
                {capture?.regionName || "-"}
              </div>
            </div>

            {/* Number of images */}
            <div>
              <SectionHeader>{t("workspace.numberOfImages")}</SectionHeader>
              <select
                value={numImages}
                onChange={(e) => setNumImages(Number(e.target.value))}
                className="batik-select mt-3 w-full rounded-lg border border-[#ffffff2b] bg-[#1a1412] px-3 py-2 text-sm text-[#f7f1e6]"
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </div>

            {/* Garment reuse picker */}
            <div>
              <SectionHeader>{t("workspace.garmentSource")}</SectionHeader>
              <div className="mt-3">
                <AnimatePresence mode="wait">
                  {selectedGarment ? (
                    <motion.div
                      key="selected-garment"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="rounded-xl border-2 border-[#c5a059] bg-black/20 p-2"
                      style={{ boxShadow: "0 0 16px #c5a05930" }}
                    >
                      <div className="relative">
                        <img
                          src={`/api/garments/image/${selectedGarment}`}
                          alt="Selected garment"
                          className="h-36 w-full rounded-lg object-contain"
                        />
                        <motion.div
                          className="absolute top-2 right-2 bg-[#c5a059] rounded-full p-1"
                          variants={checkmarkVariants}
                          initial="hidden"
                          animate="visible"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1412" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </motion.div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-[10px] text-[#e8c383] truncate max-w-[200px]">
                          {selectedGarment.split("_").slice(0, 2).join(" ")}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelectedGarment("")}
                          className="text-[10px] text-[#8b7e6a] hover:text-red-400 transition-colors"
                        >
                          {t("common.clear")}
                        </button>
                      </div>
                      <p className="text-center text-[10px] text-[#a89f91] mt-1">{t("workspace.skipGarment")}</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty-garment"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl border border-dashed border-[#ffffff2e] bg-black/20 p-3 text-center"
                    >
                      <p className="text-xs text-[#f7f1e6a0]">{t("workspace.generateNewGarment")}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  type="button"
                  onClick={() => setGarmentPanelOpen(true)}
                  className="mt-2 w-full rounded-lg border border-[#ffffff25] bg-[#ffffff0b] px-3 py-2 text-sm font-medium hover:bg-[#ffffff1a] hover:border-[#c5a059] transition-colors flex items-center justify-center gap-2 text-[#f7f1e6]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                  </svg>
                  {t("workspace.browseGarments")} ({garments.length})
                </motion.button>
              </div>
            </div>

            {/* Background scene picker */}
            <div>
              <SectionHeader>{t("workspace.backgroundScene")}</SectionHeader>
              <div className="mt-3">
                <AnimatePresence mode="wait">
                  {selectedLandscape ? (
                    <motion.div
                      key="selected-landscape"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="rounded-xl border border-[#6b8f59] bg-black/20 p-2"
                    >
                      <div className="relative overflow-hidden rounded-lg">
                        <img
                          src={`/api/landscapes/image/${selectedLandscape}`}
                          alt="Selected landscape"
                          className="h-24 w-full rounded-lg object-cover transition-transform duration-500 hover:scale-105"
                        />
                        <motion.div
                          className="absolute top-2 right-2 bg-[#6b8f59] rounded-full p-1"
                          variants={checkmarkVariants}
                          initial="hidden"
                          animate="visible"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1a1412" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </motion.div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-[10px] text-[#a8d08d] truncate max-w-[200px]">
                          {selectedLandscapeObj?.regionName || selectedLandscape.split("_landscape")[0].replace(/_/g, " ")}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelectedLandscape("")}
                          className="text-[10px] text-[#8b7e6a] hover:text-red-400 transition-colors"
                        >
                          {t("common.clear")}
                        </button>
                      </div>
                      <p className="text-center text-[10px] text-[#a89f91] mt-1">{t("workspace.useSceneReference")}</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty-landscape"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="rounded-xl border border-dashed border-[#ffffff2e] bg-black/20 p-3 text-center"
                    >
                      <p className="text-xs text-[#f7f1e6a0]">{t("workspace.autoBackground")}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.button
                  type="button"
                  onClick={() => setLandscapePanelOpen(true)}
                  className="mt-2 w-full rounded-lg border border-[#ffffff25] bg-[#ffffff0b] px-3 py-2 text-sm font-medium hover:bg-[#ffffff1a] hover:border-[#6b8f59] transition-colors flex items-center justify-center gap-2 text-[#f7f1e6]"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                  </svg>
                  {t("workspace.browseLandscapes")} ({landscapes.length})
                </motion.button>
              </div>
            </div>
          </div>

          {/* Generate button */}
          <div className="border-t border-[#ffffff14] p-5">
            <motion.button
              type="button"
              onClick={generateImages}
              disabled={!canGenerate || isLoading}
              className={`relative w-full overflow-hidden rounded-xl px-4 py-3.5 text-sm font-bold text-[#1a1412] transition-all disabled:opacity-60 ${
                canGenerate && !isLoading
                  ? "bg-gradient-to-r from-[#c5a059] via-[#e8c383] to-[#8b5e3c]"
                  : "bg-gradient-to-r from-[#c5a059] to-[#8b5e3c]"
              }`}
              animate={
                canGenerate && !isLoading
                  ? { boxShadow: ["0 0 0px #c5a05900", "0 0 20px #c5a05955", "0 0 0px #c5a05900"] }
                  : { boxShadow: "0 0 0px #c5a05900" }
              }
              transition={{ duration: 2, repeat: Infinity }}
              whileHover={canGenerate && !isLoading ? { scale: 1.02 } : {}}
              whileTap={canGenerate && !isLoading ? { scale: 0.98 } : {}}
            >
              {/* Shimmer sweep when ready */}
              {canGenerate && !isLoading && (
                <motion.span
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.5 }}
                />
              )}
              <span className="relative flex items-center justify-center gap-2">
                {isLoading ? (
                  <>
                    <motion.span
                      className="h-4 w-4 rounded-full border-2 border-[#1a1412]/40 border-t-[#1a1412]"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    />
                    {t("workspace.generating")}
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    {t("workspace.generateBatik")}
                  </>
                )}
              </span>
            </motion.button>
          </div>
        </motion.aside>

        {/* ── Right main area ── */}
        <motion.section
          variants={prefersReduced ? undefined : mainVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-5 rounded-2xl border border-[#3a2a22] bg-[#1a1412] p-5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-[#f7f1e6]">{t("workspace.generatedResults")}</h2>
              <AnimatePresence>
                {images.length > 0 && (
                  <motion.span
                    key="count-badge"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    className="rounded-full border border-[#c5a05950] bg-[#c5a05920] px-3 py-1 text-xs font-bold text-[#e8c383]"
                  >
                    {images.length}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="text-xs text-[#f7f1e699]">{t("common.newestFirst")}</div>
          </div>

          {/* Error toast */}
          <AnimatePresence>
            {error && (
              <motion.div
                key="error-toast"
                variants={toastVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="rounded-xl border border-red-800/60 bg-red-900/30 px-4 py-3 text-sm text-red-200 flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Prompt details */}
          <AnimatePresence>
            {prompt && (
              <motion.details
                key="prompt-detail"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0 }}
                className="rounded-xl bg-black/30 p-3 text-sm text-[#f7f1e6cc]"
              >
                <summary className="cursor-pointer font-medium select-none">
                  {t("workspace.prompt")}
                  {garmentReused && (
                    <span className="ml-2 rounded-full bg-[#c5a05930] px-2 py-0.5 text-[10px] font-bold text-[#e8c383]">
                      {t("workspace.garmentReused")}
                    </span>
                  )}
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{prompt}</p>
              </motion.details>
            )}
          </AnimatePresence>

          {/* Results grid */}
          <div className="flex-1">
            <AnimatePresence mode="wait">
              {images.length === 0 ? (
                <motion.div
                  key="empty-state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#ffffff30] px-4 py-20 text-center"
                >
                  <motion.div
                    animate={{ scale: [1, 1.05, 1], opacity: [0.4, 0.6, 0.4] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c5a059" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4 mx-auto">
                      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </motion.div>
                  <p className="text-sm text-[#f7f1e680]">{t("workspace.emptyResults")}</p>
                </motion.div>
              ) : (
                <motion.div
                  key="results-grid"
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                >
                  {images.map((image, index) => (
                    <motion.button
                      key={`${image.slice(0, 16)}-${index}`}
                      custom={index}
                      variants={cardVariants}
                      initial="hidden"
                      animate="visible"
                      onClick={() => setPreviewImage(image)}
                      type="button"
                      className="group relative overflow-hidden rounded-xl border border-[#ffffff1f] bg-black/20 text-left cursor-pointer"
                      whileHover={{ y: -4 }}
                      transition={{ type: "spring", damping: 20, stiffness: 300 }}
                    >
                      <div className="relative overflow-hidden aspect-[3/4]">
                        <img
                          src={image}
                          alt={`Generated ${index + 1}`}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        {/* Hover overlay */}
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        >
                          <div className="flex items-center gap-2 text-white text-xs font-medium">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            {t("workspace.open")}
                          </div>
                        </motion.div>
                      </div>
                      <div className="flex items-center justify-between px-3 py-2 text-xs text-[#f7f1e6b0]">
                        <span className="truncate">{capture?.outfit?.name || t("workspace.previewFallback")}</span>
                        <span className="text-[#c5a059] ml-2 shrink-0">#{index + 1}</span>
                      </div>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Email section */}
          <AnimatePresence>
            {images.length > 0 && (
              <motion.div
                key="email-section"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ delay: images.length * 0.1 + 0.2 }}
                className="rounded-xl border border-[#3a2a22] bg-black/20 p-4"
              >
                <SectionHeader>{t("workspace.sendEmail")}</SectionHeader>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => { setEmailAddress(e.target.value); setEmailStatus(""); }}
                    placeholder={t("workspace.emailPlaceholder")}
                    className="flex-1 bg-[#2a201c] border border-[#3a2a22] rounded-lg px-3 py-2 text-sm text-[#f7f1e6] placeholder-[#8b7e6a] focus:outline-none focus:border-[#c5a059] transition-colors"
                  />
                  <motion.button
                    type="button"
                    disabled={!emailAddress.includes("@") || emailSending}
                    onClick={async () => {
                      setEmailSending(true);
                      setEmailStatus("");
                      try {
                        const res = await fetch("/api/email", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            to: emailAddress,
                            imageUrls: images,
                            outfitName: capture?.outfit?.name,
                            regionName: capture?.regionName,
                          }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          setEmailStatus("sent");
                        } else {
                          setEmailStatus(data.error || "Failed to send");
                        }
                      } catch {
                        setEmailStatus("Network error");
                      } finally {
                        setEmailSending(false);
                      }
                    }}
                    className="px-4 py-2 bg-[#c5a059] text-[#1a1412] rounded-lg text-sm font-bold hover:bg-[#b38f4a] disabled:opacity-50 transition-colors flex items-center gap-2"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    {emailSending ? t("workspace.sending") : t("workspace.send")}
                  </motion.button>
                </div>

                {/* Email status messages */}
                <AnimatePresence>
                  {emailStatus === "sent" && (
                    <motion.div
                      key="email-success"
                      variants={emailSuccessVariants}
                      initial="hidden"
                      animate="visible"
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="mt-3 flex items-center gap-2 text-xs text-green-400"
                    >
                      <motion.span
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="text-base"
                      >
                        ✓
                      </motion.span>
                      {t("workspace.emailSent", { email: emailAddress })}
                    </motion.div>
                  )}
                  {emailStatus && emailStatus !== "sent" && (
                    <motion.p
                      key="email-error"
                      variants={toastVariants}
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      className="mt-2 text-xs text-red-400"
                    >
                      {emailStatus}
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      </div>

      {/* ── Garment Browser Slide-out Panel ── */}
      <AnimatePresence>
        {garmentPanelOpen && (
          <>
            <motion.div
              key="garment-backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setGarmentPanelOpen(false)}
            />
            <motion.aside
              key="garment-panel"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[#1a1412] border-l border-[#3a2a22] flex flex-col"
              style={{ boxShadow: "-8px 0 32px #00000080" }}
            >
              <div className="h-[2px] w-full bg-gradient-to-r from-[#c5a059] to-transparent" />
              <div className="flex items-center justify-between border-b border-[#3a2a22] px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold text-[#f7f1e6]">{t("workspace.garmentBrowser")}</h2>
                  <p className="text-xs text-[#a89f91]">{t("workspace.itemsAvailable", { count: garments.length })}</p>
                </div>
                <motion.button
                  type="button"
                  onClick={() => setGarmentPanelOpen(false)}
                  className="rounded-lg p-2 hover:bg-[#2a201c] transition-colors text-[#8b7e6a] hover:text-[#f7f1e6]"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </motion.button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {matchingGarments.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#c5a059] mb-3">
                      {t("workspace.matchingThisOutfit")}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {matchingGarments.map((g, i) => (
                        <motion.button
                          key={g.filename}
                          type="button"
                          onClick={() => { setSelectedGarment(g.filename); setGarmentPanelOpen(false); }}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.06 }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className={`group relative rounded-xl border overflow-hidden transition-all ${
                            selectedGarment === g.filename
                              ? "border-[#c5a059] ring-2 ring-[#c5a05966]"
                              : "border-[#3a2a22] hover:border-[#5a4a42]"
                          }`}
                        >
                          {selectedGarment === g.filename && (
                            <motion.div
                              className="absolute top-2 right-2 z-10 bg-[#c5a059] rounded-full p-1"
                              variants={checkmarkVariants}
                              initial="hidden"
                              animate="visible"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1a1412" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </motion.div>
                          )}
                          <img
                            src={`/api/garments/image/${g.filename}`}
                            alt={g.outfitId}
                            className="aspect-[3/4] w-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                          />
                          <div className="px-2 py-1.5 bg-black/40">
                            <p className="text-[10px] text-[#e8c383] truncate">{g.outfitId.replace(/_/g, " ")}</p>
                            <p className="text-[9px] text-[#8b7e6a]">{new Date(g.createdAt).toLocaleDateString()}</p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {garments.filter((g) => g.outfitId !== capture?.outfit?.id).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#8b7e6a] mb-3">
                      {t("workspace.otherGarments")}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {garments
                        .filter((g) => g.outfitId !== capture?.outfit?.id)
                        .map((g, i) => (
                          <motion.button
                            key={g.filename}
                            type="button"
                            onClick={() => { setSelectedGarment(g.filename); setGarmentPanelOpen(false); }}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 + 0.1 }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            className={`group relative rounded-xl border overflow-hidden transition-all ${
                              selectedGarment === g.filename
                                ? "border-[#c5a059] ring-2 ring-[#c5a05966]"
                                : "border-[#3a2a22] hover:border-[#5a4a42]"
                            }`}
                          >
                            {selectedGarment === g.filename && (
                              <motion.div
                                className="absolute top-2 right-2 z-10 bg-[#c5a059] rounded-full p-1"
                                variants={checkmarkVariants}
                                initial="hidden"
                                animate="visible"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1a1412" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </motion.div>
                            )}
                            <img
                              src={`/api/garments/image/${g.filename}`}
                              alt={g.outfitId}
                              className="aspect-[3/4] w-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                            />
                            <div className="px-2 py-1.5 bg-black/40">
                              <p className="text-[10px] text-[#e8c383] truncate">{g.outfitId.replace(/_/g, " ")}</p>
                              <p className="text-[9px] text-[#8b7e6a]">{g.gender} &bull; {new Date(g.createdAt).toLocaleDateString()}</p>
                            </div>
                          </motion.button>
                        ))}
                    </div>
                  </div>
                )}

                {garments.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-sm text-[#8b7e6a]">{t("workspace.noGarments")}</p>
                    <p className="text-xs text-[#5a4a42] mt-1">{t("workspace.noGarmentsSub")}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-[#3a2a22] p-4 flex gap-3">
                <motion.button
                  type="button"
                  onClick={() => { setSelectedGarment(""); setGarmentPanelOpen(false); }}
                  className="flex-1 rounded-xl border border-[#3a2a22] bg-[#2a201c] px-4 py-2.5 text-sm font-medium text-[#f7f1e6] hover:border-[#5a4a42] transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t("workspace.generateNew")}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setGarmentPanelOpen(false)}
                  className="flex-1 rounded-xl bg-[#c5a059] px-4 py-2.5 text-sm font-bold text-[#1a1412] hover:bg-[#b38f4a] transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t("common.done")}
                </motion.button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Landscape Browser Slide-out Panel ── */}
      <AnimatePresence>
        {landscapePanelOpen && (
          <>
            <motion.div
              key="landscape-backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setLandscapePanelOpen(false)}
            />
            <motion.aside
              key="landscape-panel"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[#1a1412] border-l border-[#3a2a22] flex flex-col"
              style={{ boxShadow: "-8px 0 32px #00000080" }}
            >
              <div className="h-[2px] w-full bg-gradient-to-r from-[#6b8f59] to-transparent" />
              <div className="flex items-center justify-between border-b border-[#3a2a22] px-5 py-4">
                <div>
                  <h2 className="text-lg font-bold text-[#f7f1e6]">{t("workspace.landscapeBrowser")}</h2>
                  <p className="text-xs text-[#a89f91]">{t("workspace.itemsAvailable", { count: landscapes.length })}</p>
                </div>
                <motion.button
                  type="button"
                  onClick={() => setLandscapePanelOpen(false)}
                  className="rounded-lg p-2 hover:bg-[#2a201c] transition-colors text-[#8b7e6a] hover:text-[#f7f1e6]"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </motion.button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {matchingLandscapes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#6b8f59] mb-3">
                      {capture?.regionName || t("workspace.thisRegion")}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {matchingLandscapes.map((l, i) => (
                        <motion.button
                          key={l.filename}
                          type="button"
                          onClick={() => { setSelectedLandscape(l.filename); setLandscapePanelOpen(false); }}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.06 }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className={`group relative rounded-xl border overflow-hidden transition-all ${
                            selectedLandscape === l.filename
                              ? "border-[#6b8f59] ring-2 ring-[#6b8f5966]"
                              : "border-[#3a2a22] hover:border-[#5a4a42]"
                          }`}
                        >
                          {selectedLandscape === l.filename && (
                            <motion.div
                              className="absolute top-2 right-2 z-10 bg-[#6b8f59] rounded-full p-1"
                              variants={checkmarkVariants}
                              initial="hidden"
                              animate="visible"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1a1412" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </motion.div>
                          )}
                          {/* Cinematic 16:9 thumbnail */}
                          <div className="relative aspect-video overflow-hidden">
                            <img
                              src={l.url}
                              alt={l.regionName || l.regionId}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                          </div>
                          <div className="px-2 py-1.5 bg-black/40">
                            <p className="text-[10px] text-[#a8d08d] truncate">{l.regionName || l.regionId.replace(/_/g, " ")}</p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                )}

                {landscapes.filter((l) => l.regionId !== capture?.regionId).length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#8b7e6a] mb-3">
                      {t("workspace.otherRegions")}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {landscapes
                        .filter((l) => l.regionId !== capture?.regionId)
                        .map((l, i) => (
                          <motion.button
                            key={l.filename}
                            type="button"
                            onClick={() => { setSelectedLandscape(l.filename); setLandscapePanelOpen(false); }}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 + 0.1 }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            className={`group relative rounded-xl border overflow-hidden transition-all ${
                              selectedLandscape === l.filename
                                ? "border-[#6b8f59] ring-2 ring-[#6b8f5966]"
                                : "border-[#3a2a22] hover:border-[#5a4a42]"
                            }`}
                          >
                            {selectedLandscape === l.filename && (
                              <motion.div
                                className="absolute top-2 right-2 z-10 bg-[#6b8f59] rounded-full p-1"
                                variants={checkmarkVariants}
                                initial="hidden"
                                animate="visible"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1a1412" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </motion.div>
                            )}
                            <div className="relative aspect-video overflow-hidden">
                              <img
                                src={l.url}
                                alt={l.regionName || l.regionId}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                              />
                            </div>
                            <div className="px-2 py-1.5 bg-black/40">
                              <p className="text-[10px] text-[#a8d08d] truncate">{l.regionName || l.regionId.replace(/_/g, " ")}</p>
                            </div>
                          </motion.button>
                        ))}
                    </div>
                  </div>
                )}

                {landscapes.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-sm text-[#8b7e6a]">{t("workspace.noLandscapes")}</p>
                    <p className="text-xs text-[#5a4a42] mt-1">{t("workspace.noLandscapesSub")}</p>
                  </div>
                )}
              </div>

              <div className="border-t border-[#3a2a22] p-4 flex gap-3">
                <motion.button
                  type="button"
                  onClick={() => { setSelectedLandscape(""); setLandscapePanelOpen(false); }}
                  className="flex-1 rounded-xl border border-[#3a2a22] bg-[#2a201c] px-4 py-2.5 text-sm font-medium text-[#f7f1e6] hover:border-[#5a4a42] transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t("workspace.useAuto")}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setLandscapePanelOpen(false)}
                  className="flex-1 rounded-xl bg-[#6b8f59] px-4 py-2.5 text-sm font-bold text-[#1a1412] hover:bg-[#5a7d4a] transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {t("common.done")}
                </motion.button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Lightbox Preview ── */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-8"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}
              className="relative max-w-3xl max-h-[85vh] bg-[#1a1412] border border-[#3a2a22] rounded-2xl overflow-hidden flex flex-col"
              style={{ boxShadow: "0 0 0 1px #c5a05930, 0 24px 64px #00000090" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex-1 overflow-auto flex items-center justify-center bg-black/50">
                <img
                  src={previewImage}
                  alt="Preview"
                  className="max-h-[75vh] w-auto object-contain"
                />
              </div>
              <div className="p-4 border-t border-[#3a2a22] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#1a1412] shrink-0">
                <div>
                  <p className="text-sm font-bold text-[#f7f1e6]">
                    {capture?.outfit?.name || t("workspace.previewFallback")}
                  </p>
                  <p className="text-xs text-[#8b7e6a] mt-0.5">
                    {capture?.regionName || t("workspace.generatedImage")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <motion.a
                    href={previewImage}
                    download="generated-batik.png"
                    className="px-4 py-2 bg-[#c5a059] text-[#1a1412] rounded-lg text-sm font-bold hover:bg-[#b38f4a] transition-colors"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    {t("common.download")}
                  </motion.a>
                  <motion.button
                    type="button"
                    onClick={() => setPreviewImage(null)}
                    className="px-4 py-2 bg-[#2a201c] border border-[#3a2a22] text-[#f7f1e6] rounded-lg text-sm font-medium hover:bg-[#3a2a22] transition-colors"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                  >
                    {t("common.close")}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
