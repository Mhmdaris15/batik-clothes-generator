"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { motion, AnimatePresence, type Variants } from "framer-motion";

type Outfit = {
  id: string;
  name: string;
  description: string;
  motifs: string[];
  colors: string[];
  accessories: string;
};

type Region = {
  id: string;
  name: string;
  description: string;
  landmark?: string;
  background_prompt?: string;
  clothes: {
    female: Outfit[];
    male: Outfit[];
  };
};

type ClothesResponse = {
  regions: Region[];
};

type FaceEntry = {
  filename: string;
  url: string;
  createdAt: string;
  outfitId?: string;
  regionId?: string;
};

type CaptureTab = "upload" | "camera" | "gallery" | "telegram";

const STORAGE_KEY = "batik_capture_payload";
const MAX_GROUP_PERSONS = 4;

type PersonSlot = {
  faceImageB64: string;
  facePreview: string;
  gender: "female" | "male";
  outfitId: string;
};

async function normalizeImageDataUrl(dataUrl: string): Promise<string> {
  const image = new Image();
  image.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load selected image"));
    image.src = dataUrl;
  });

  const maxWidth = 1024;
  const maxHeight = 1365;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to prepare uploaded image");
  }

  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.86);
}

function generateSessionId() {
  return `tg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Animation variants ─────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
} satisfies Variants;

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
} satisfies Variants;

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
} satisfies Variants;

const tabContent = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { type: "spring" as const, stiffness: 300, damping: 28 },
};

const personCardVariants = {
  hidden: { opacity: 0, scale: 0.88, y: 12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring" as const, stiffness: 280, damping: 22 } },
} satisfies Variants;

// ── Step indicator ─────────────────────────────────────────────────────────────
function StepIndicator({ currentStep }: { currentStep: number }) {
  const steps = ["Photo", "Configure", "Generate"];
  return (
    <div className="flex items-center gap-0 w-full max-w-xs mx-auto">
      {steps.map((label, i) => {
        const done = i < currentStep;
        const active = i === currentStep;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <motion.div
                animate={active ? { scale: [1, 1.15, 1] } : {}}
                transition={{ repeat: Infinity, repeatDelay: 2, duration: 0.6 }}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  done
                    ? "bg-[#c5a059] border-[#c5a059] text-[#1a1412]"
                    : active
                    ? "border-[#c5a059] text-[#c5a059] bg-transparent"
                    : "border-[#3a2a22] text-[#5a4a42] bg-transparent"
                }`}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  i + 1
                )}
              </motion.div>
              <span className={`text-[10px] mt-1 font-medium whitespace-nowrap ${active ? "text-[#c5a059]" : done ? "text-[#a89f91]" : "text-[#5a4a42]"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-px mx-2 mb-4 bg-[#3a2a22] relative overflow-hidden">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: done ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                  style={{ originX: 0 }}
                  className="absolute inset-0 bg-[#c5a059]"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const CAPTURE_TABS: { id: CaptureTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "upload",
    label: "Upload",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    id: "camera",
    label: "Camera",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    id: "gallery",
    label: "Gallery",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.012-1.252-.242-1.865-.442-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
];

export default function CapturePage() {
  const router = useRouter();
  const { t } = useI18n();
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<string>("");
  const [gender, setGender] = useState<"female" | "male">("female");
  const [outfitId, setOutfitId] = useState<string>("");
  const [faceImageB64, setFaceImageB64] = useState<string>("");
  const [facePreview, setFacePreview] = useState<string>("");
  const [error, setError] = useState<string>("");

  // ── Group / multi-person mode ──────────────────────────────────────────────
  const [groupMode, setGroupMode] = useState(false);
  const [groupPersons, setGroupPersons] = useState<PersonSlot[]>([]);
  const [activePersonIdx, setActivePersonIdx] = useState<number | null>(null);

  // ── Group photo mode (single photo of whole group, clothing inpaint + BGSwap) ──
  const [groupPhotoMode, setGroupPhotoMode] = useState(false);
  const [groupPhotoB64, setGroupPhotoB64] = useState("");
  const [groupPhotoPreview, setGroupPhotoPreview] = useState("");
  const [groupFemaleCount, setGroupFemaleCount] = useState(1);
  const [groupMaleCount, setGroupMaleCount] = useState(1);

  // ── Email collection (optional, carried to workspace) ──────────────────────
  const [emailAddress, setEmailAddress] = useState("");

  // Capture mode
  const [captureTab, setCaptureTab] = useState<CaptureTab>("upload");

  // Camera state
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string>("");
  const [cameraReady, setCameraReady] = useState(false);

  // Face gallery
  const [faceGallery, setFaceGallery] = useState<FaceEntry[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);

  // Drag-over state for upload zone
  const [dragOver, setDragOver] = useState(false);

  // Telegram bot
  const [tgSessionId, setTgSessionId] = useState<string>("");
  const [tgBotUsername, setTgBotUsername] = useState<string>("");
  const [tgLinked, setTgLinked] = useState(false);
  const [tgPolling, setTgPolling] = useState(false);
  const tgPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load regions and gallery-selected face ─────────────────────────────────
  useEffect(() => {
    async function load() {
      const response = await fetch("/api/clothes");
      const data = (await response.json()) as ClothesResponse;
      setRegions(data.regions || []);
      if (data.regions?.length) {
        setRegionId(data.regions[0].id);
      }
    }
    load();

    // Check if a face image was selected from the gallery page
    const galleryRaw = sessionStorage.getItem("gallery_selected");
    if (galleryRaw) {
      sessionStorage.removeItem("gallery_selected");
      try {
        const selected = JSON.parse(galleryRaw) as { url: string; category: string };
        if ((selected.category === "faces" || selected.category === "results") && selected.url) {
          fetch(selected.url)
            .then((r) => r.blob())
            .then((blob) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = String(reader.result || "");
                setFacePreview(dataUrl);
                const encoded = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
                setFaceImageB64(encoded);
              };
              reader.readAsDataURL(blob);
            })
            .catch(() => {});
        }
      } catch { /* ignore parse errors */ }
    }
  }, []);

  // ── Stop camera on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraStream]);

  // ── Camera: start/stop when tab switches ──────────────────────────────────
  useEffect(() => {
    if (captureTab === "camera") {
      startCamera();
    } else {
      stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureTab]);

  // ── Gallery: load faces when tab opens ────────────────────────────────────
  useEffect(() => {
    if (captureTab === "gallery" && faceGallery.length === 0) {
      setGalleryLoading(true);
      fetch("/api/faces")
        .then((r) => r.json())
        .then((data: { faces: FaceEntry[] }) => {
          setFaceGallery(data.faces ?? []);
        })
        .catch(() => {})
        .finally(() => setGalleryLoading(false));
    }
  }, [captureTab, faceGallery.length]);

  // ── Telegram: fetch bot info and start session ────────────────────────────
  useEffect(() => {
    if (captureTab === "telegram" && !tgSessionId) {
      const sid = generateSessionId();
      setTgSessionId(sid);
      // Fetch bot username
      fetch("/api/telegram/bot-info")
        .then((r) => r.json())
        .then((data: { configured: boolean; username: string | null }) => {
          if (data.configured && data.username) {
            setTgBotUsername(data.username);
          }
        })
        .catch(() => {});
    }
  }, [captureTab, tgSessionId]);

  // ── Telegram: poll for photo ──────────────────────────────────────────────
  useEffect(() => {
    if (captureTab === "telegram" && tgSessionId && !tgPolling) {
      setTgPolling(true);
      tgPollRef.current = setInterval(async () => {
        try {
          const resp = await fetch(`/api/telegram/poll?sessionId=${tgSessionId}`);
          const data = await resp.json() as { linked: boolean; hasPhoto: boolean; photoB64: string | null };
          if (data.linked && !tgLinked) setTgLinked(true);
          if (data.hasPhoto && data.photoB64) {
            // Got a photo! Set it as the face image
            const dataUrl = `data:image/jpeg;base64,${data.photoB64}`;
            setFacePreview(dataUrl);
            setFaceImageB64(data.photoB64);
            // Stop polling and switch to upload tab to show preview
            if (tgPollRef.current) clearInterval(tgPollRef.current);
            tgPollRef.current = null;
            setTgPolling(false);
            setCaptureTab("upload");
          }
        } catch {
          /* ignore poll errors */
        }
      }, 2000);
    }

    return () => {
      if (tgPollRef.current && captureTab !== "telegram") {
        clearInterval(tgPollRef.current);
        tgPollRef.current = null;
        setTgPolling(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureTab, tgSessionId]);

  // ── Camera helpers ─────────────────────────────────────────────────────────
  function startCamera() {
    setCameraError("");
    setCameraReady(false);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } } })
      .then((stream) => {
        setCameraStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => setCameraReady(true)).catch(() => {});
          };
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Camera not available";
        setCameraError(t("capture.cameraAccessError", { msg }));
      });
  }

  function stopCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
    setCameraReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror the captured frame to match the preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    setFacePreview(dataUrl);
    const encoded = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
    setFaceImageB64(encoded);

    // Stop camera after capture and show preview
    stopCamera();
    setCaptureTab("upload");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraStream]);

  // ── Upload handler ─────────────────────────────────────────────────────────
  function onFaceUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const value = String(reader.result || "");
        const normalized = await normalizeImageDataUrl(value);
        setFacePreview(normalized);
        const encoded = normalized.includes(",") ? normalized.split(",")[1] : normalized;
        setFaceImageB64(encoded);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("capture.processImageError"));
      }
    };
    reader.readAsDataURL(file);
  }

  // ── Gallery: select a stored face image ───────────────────────────────────
  function selectGalleryFace(face: FaceEntry) {
    fetch(face.url)
      .then((r) => r.blob())
      .then((blob) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          setFacePreview(dataUrl);
          const encoded = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
          setFaceImageB64(encoded);
        };
        reader.readAsDataURL(blob);
      })
      .catch(() => {});
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const selectedRegion = useMemo(() => regions.find((r) => r.id === regionId), [regions, regionId]);

  const outfits = useMemo(() => {
    if (!selectedRegion) return [];
    return gender === "female" ? selectedRegion.clothes.female : selectedRegion.clothes.male;
  }, [selectedRegion, gender]);

  const effectiveOutfitId = useMemo(() => {
    if (!outfits.length) return "";
    return outfits.some((o) => o.id === outfitId) ? outfitId : outfits[0].id;
  }, [outfits, outfitId]);

  const selectedOutfit = useMemo(
    () => outfits.find((o) => o.id === effectiveOutfitId),
    [outfits, effectiveOutfitId],
  );

  function randomizeRegion() {
    if (!regions.length) return;
    const randomRegion = regions[Math.floor(Math.random() * regions.length)];
    setRegionId(randomRegion.id);
  }

  const canContinue = groupPhotoMode
    ? !!groupPhotoB64 && !!selectedRegion
    : groupMode
    ? groupPersons.length >= 2 && groupPersons.every((p) => !!p.faceImageB64 && !!p.outfitId) && !!selectedRegion
    : !!faceImageB64 && !!selectedOutfit && !!selectedRegion;

  function continueToWorkspace() {
    if (!selectedRegion) { setError(t("capture.requiredError")); return; }

    if (groupPhotoMode) {
      if (!groupPhotoB64) { setError(t("capture.groupPhotoRequiredError")); return; }
    } else if (groupMode) {
      if (groupPersons.length < 2) {
        setError(t("capture.groupMinError"));
        return;
      }
      const missing = groupPersons.some((p) => !p.faceImageB64 || !p.outfitId);
      if (missing) { setError(t("capture.groupMissingError")); return; }
    } else {
      if (!selectedOutfit || !faceImageB64) { setError(t("capture.requiredError")); return; }
    }

    setError("");
    try {
      const basePayload = {
        regionId: selectedRegion.id,
        regionName: selectedRegion.name,
        backgroundPrompt: selectedRegion.background_prompt || "",
        emailAddress: emailAddress || undefined,
      };

      if (groupPhotoMode) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...basePayload,
          groupPhotoMode: true,
          groupPhotoB64,
          groupPhotoPreview,
          femaleCount: groupFemaleCount,
          maleCount: groupMaleCount,
          groupOutfitName: selectedOutfit?.name || "",
        }));
      } else if (groupMode) {
        const personsPayload = groupPersons.map((p) => {
          const outfits = [
            ...(selectedRegion.clothes.female || []),
            ...(selectedRegion.clothes.male || []),
          ];
          const outfit = outfits.find((o) => o.id === p.outfitId) ?? outfits[0];
          return { faceImageB64: p.faceImageB64, gender: p.gender, outfit };
        });
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...basePayload, groupMode: true, persons: personsPayload }));
      } else {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...basePayload,
          gender,
          outfit: selectedOutfit,
          faceImageB64,
        }));
      }
      router.push("/workspace");
    } catch (err) {
      setError(
        err instanceof Error ? t("capture.continueErrorWithReason", { reason: err.message }) : t("capture.continueError"),
      );
    }
  }

  const activeCaptureTabIndex = CAPTURE_TABS.findIndex((tab) => tab.id === captureTab);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mx-auto w-full max-w-6xl space-y-8 pb-8"
    >
      {/* ── Page header + step indicator ─────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#f7f1e6]">{t("capture.title")}</h1>
          <p className="mt-1 text-[#a89f91]">{t("capture.subtitle")}</p>
        </div>
        <StepIndicator currentStep={0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Style Selection ───────────────────────────────────── */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-[#1a1412] border border-[#3a2a22] rounded-2xl p-6"
        >
          <motion.h2 variants={staggerItem} className="text-xl font-bold text-[#f7f1e6] mb-6">
            {t("capture.styleSelection")}
          </motion.h2>

          <div className="space-y-5">
            {/* Region selector */}
            <motion.div variants={staggerItem}>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#a89f91] mb-2">
                {t("capture.region")}
              </label>
              <div className="flex gap-2">
                <select
                  className="flex-1 bg-[#2a201c] border border-[#3a2a22] rounded-xl px-4 py-3 text-[#f7f1e6] focus:outline-none focus:border-[#c5a059] transition-colors text-sm"
                  value={regionId}
                  onChange={(e) => setRegionId(e.target.value)}
                >
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <motion.button
                  whileTap={{ scale: 0.9, rotate: 180 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  type="button"
                  onClick={randomizeRegion}
                  title={t("capture.randomize")}
                  className="shrink-0 bg-[#2a201c] border border-[#3a2a22] hover:border-[#c5a059] hover:text-[#c5a059] text-[#8b7e6a] rounded-xl px-3 py-3 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
                  </svg>
                </motion.button>
              </div>
            </motion.div>

            {/* Gender selector — icon+label toggle buttons */}
            <motion.div variants={staggerItem}>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#a89f91] mb-2">
                {t("capture.gender")}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["female", "male"] as const).map((g) => {
                  const active = gender === g;
                  return (
                    <motion.button
                      key={g}
                      type="button"
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setGender(g)}
                      className={`relative flex items-center justify-center gap-2.5 py-3 rounded-xl border-2 font-semibold text-sm transition-colors overflow-hidden ${
                        active
                          ? "border-[#c5a059] bg-[#c5a05918] text-[#e8c383]"
                          : "border-[#3a2a22] text-[#8b7e6a] hover:border-[#5a4a42]"
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="gender-pill"
                          className="absolute inset-0 bg-[#c5a05912]"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 text-lg">{g === "female" ? "♀" : "♂"}</span>
                      <span className="relative z-10">{t(`capture.${g}`)}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>

            {/* Outfit selector */}
            <motion.div variants={staggerItem}>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#a89f91] mb-2">
                {t("capture.outfit")}
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {outfits.map((o) => {
                  const active = effectiveOutfitId === o.id;
                  return (
                    <motion.button
                      key={o.id}
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setOutfitId(o.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                        active
                          ? "border-[#c5a059] bg-[#c5a05918] text-[#e8c383]"
                          : "border-[#3a2a22] bg-[#2a201c] text-[#f7f1e6] hover:border-[#5a4a42]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{o.name}</span>
                        {active && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c5a059" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </motion.div>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </div>

          {/* Outfit detail card */}
          <AnimatePresence mode="wait">
            {selectedOutfit && (
              <motion.div
                key={selectedOutfit.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="mt-6 rounded-xl border border-[#c5a05944] bg-[#c5a05911] p-4"
              >
                <p className="font-bold text-[#e7cf9d]">{selectedOutfit.name}</p>
                <p className="mt-1 text-sm text-[#a89f91]">{selectedOutfit.description}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ── Photo Mode Selector ───────────────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.5, ease: "easeOut" }}
          className="bg-[#1a1412] border border-[#3a2a22] rounded-2xl p-6 lg:col-span-2"
        >
          {/* Mode selector row */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#f7f1e6] mb-4">{t("capture.photoMode")}</h2>
            <div className="grid grid-cols-3 gap-2">
              {/* Single person */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => { setGroupMode(false); setGroupPhotoMode(false); }}
                className={`flex flex-col items-center gap-2 px-3 py-4 rounded-xl border text-xs font-medium transition-colors ${!groupMode && !groupPhotoMode ? "border-[#c5a059] bg-[#c5a05918] text-[#e8c383]" : "border-[#3a2a22] text-[#8b7e6a] hover:border-[#5a4a42]"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                {t("capture.modeSingle")}
              </motion.button>

              {/* Multi-person VTO */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  setGroupPhotoMode(false);
                  setGroupMode((v) => {
                    if (!v && groupPersons.length === 0) {
                      setGroupPersons([{ faceImageB64, facePreview, gender, outfitId: effectiveOutfitId }]);
                    }
                    return !v;
                  });
                }}
                className={`flex flex-col items-center gap-2 px-3 py-4 rounded-xl border text-xs font-medium transition-colors ${groupMode ? "border-[#c5a059] bg-[#c5a05918] text-[#e8c383]" : "border-[#3a2a22] text-[#8b7e6a] hover:border-[#5a4a42]"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="8" r="3" /><path d="M1 20c0-3.3 3.1-6 8-6" /><path d="M23 20c0-3.3-3.1-6-8-6" /><path d="M9 14c2.7-.5 5.3-.5 8 0" /></svg>
                {t("capture.modeMulti")}
              </motion.button>

              {/* Group photo */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => { setGroupMode(false); setGroupPhotoMode((v) => !v); }}
                className={`flex flex-col items-center gap-2 px-3 py-4 rounded-xl border text-xs font-medium transition-colors ${groupPhotoMode ? "border-[#6b8f59] bg-[#6b8f5918] text-[#a8d08d]" : "border-[#3a2a22] text-[#8b7e6a] hover:border-[#5a4a42]"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="5" width="20" height="15" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M9 5V3M15 5V3" /></svg>
                {t("capture.modeGroupPhoto")}
              </motion.button>
            </div>
          </div>

          {/* Group photo upload area */}
          <AnimatePresence>
            {groupPhotoMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden mb-4 space-y-4"
              >
                <p className="text-xs text-[#a89f91]">{t("capture.modeGroupPhotoSubtitle")}</p>

                {/* Photo upload */}
                <div className="relative group">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async () => {
                        try {
                          const value = String(reader.result || "");
                          const normalized = await normalizeImageDataUrl(value);
                          setGroupPhotoPreview(normalized);
                          const encoded = normalized.includes(",") ? normalized.split(",")[1] : normalized;
                          setGroupPhotoB64(encoded);
                          setError("");
                        } catch { /* ignore */ }
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <motion.div
                    animate={groupPhotoPreview ? {} : { scale: [1, 1.005, 1] }}
                    transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                    className={`min-h-[200px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-6 transition-colors ${groupPhotoPreview ? "border-[#6b8f59] bg-[#6b8f5910]" : "border-[#3a2a22] group-hover:border-[#5a4a42]"}`}
                  >
                    {groupPhotoPreview ? (
                      <div className="flex flex-col items-center gap-3 w-full">
                        <img src={groupPhotoPreview} alt="Group photo" className="max-h-48 w-auto rounded-lg object-contain" />
                        <p className="text-xs text-[#a89f91]">{t("capture.groupPhotoReplaceHint")}</p>
                      </div>
                    ) : (
                      <>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5a4a42" strokeWidth="1.5" className="mb-3"><rect x="2" y="5" width="20" height="15" rx="2" /><circle cx="12" cy="12" r="3" /></svg>
                        <p className="text-[#f7f1e6] font-medium text-sm">{t("capture.uploadGroupPhoto")}</p>
                        <p className="text-xs text-[#8b7e6a] mt-1">{t("capture.groupPhotoHint")}</p>
                      </>
                    )}
                  </motion.div>
                </div>

                {/* Gender composition */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#2a201c] border border-[#3a2a22] rounded-xl p-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#e8c383] mb-2">♀ {t("capture.female")}</label>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setGroupFemaleCount(Math.max(0, groupFemaleCount - 1))} className="w-7 h-7 rounded-lg bg-[#1a1412] border border-[#3a2a22] text-[#f7f1e6] flex items-center justify-center hover:border-[#c5a059] transition-colors">−</button>
                      <span className="flex-1 text-center text-lg font-bold text-[#f7f1e6]">{groupFemaleCount}</span>
                      <button type="button" onClick={() => setGroupFemaleCount(Math.min(8, groupFemaleCount + 1))} className="w-7 h-7 rounded-lg bg-[#1a1412] border border-[#3a2a22] text-[#f7f1e6] flex items-center justify-center hover:border-[#c5a059] transition-colors">+</button>
                    </div>
                  </div>
                  <div className="bg-[#2a201c] border border-[#3a2a22] rounded-xl p-3">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#e8c383] mb-2">♂ {t("capture.male")}</label>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setGroupMaleCount(Math.max(0, groupMaleCount - 1))} className="w-7 h-7 rounded-lg bg-[#1a1412] border border-[#3a2a22] text-[#f7f1e6] flex items-center justify-center hover:border-[#c5a059] transition-colors">−</button>
                      <span className="flex-1 text-center text-lg font-bold text-[#f7f1e6]">{groupMaleCount}</span>
                      <button type="button" onClick={() => setGroupMaleCount(Math.min(8, groupMaleCount + 1))} className="w-7 h-7 rounded-lg bg-[#1a1412] border border-[#3a2a22] text-[#f7f1e6] flex items-center justify-center hover:border-[#c5a059] transition-colors">+</button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Multi-person VTO slots */}
          <AnimatePresence>
            {groupMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden space-y-4"
              >
                <motion.div
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                  className="grid grid-cols-2 md:grid-cols-4 gap-3"
                >
                  {groupPersons.map((person, idx) => {
                    const slotOutfits = [
                      ...(selectedRegion?.clothes.female ?? []),
                      ...(selectedRegion?.clothes.male ?? []),
                    ];
                    const slotOutfit = slotOutfits.find((o) => o.id === person.outfitId);
                    return (
                      <motion.div
                        key={idx}
                        variants={personCardVariants}
                        whileHover={{ scale: 1.03 }}
                        className={`relative rounded-xl border overflow-hidden cursor-pointer transition-all ${activePersonIdx === idx ? "border-[#c5a059] ring-2 ring-[#c5a05966]" : "border-[#3a2a22] hover:border-[#5a4a42]"}`}
                        onClick={() => setActivePersonIdx(idx)}
                      >
                        {person.facePreview ? (
                          <img src={person.facePreview} alt={`Person ${idx + 1}`} className="aspect-[3/4] w-full object-cover" />
                        ) : (
                          <div className="aspect-[3/4] w-full bg-[#2a201c] flex items-center justify-center">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5a4a42" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
                          </div>
                        )}
                        <div className="bg-black/60 px-2 py-1.5">
                          <p className="text-[10px] font-bold text-[#e8c383]">{t("capture.person")} {idx + 1}</p>
                          <p className="text-[9px] text-[#a89f91] truncate">{slotOutfit?.name ?? "—"}</p>
                          <div className="flex gap-1 mt-1">
                            {(["female", "male"] as const).map((g) => (
                              <button
                                key={g}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGroupPersons((prev) => prev.map((p, i) => i === idx ? { ...p, gender: g } : p));
                                }}
                                className={`flex-1 rounded text-[9px] py-0.5 transition-colors ${person.gender === g ? "bg-[#c5a059] text-[#1a1412] font-bold" : "bg-[#3a2a22] text-[#8b7e6a]"}`}
                              >
                                {t(`capture.${g}`)}
                              </button>
                            ))}
                          </div>
                          <select
                            className="mt-1 w-full bg-[#1a1412] border border-[#3a2a22] rounded text-[9px] text-[#f7f1e6] px-1 py-0.5 focus:outline-none"
                            value={person.outfitId}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const newId = e.target.value;
                              setGroupPersons((prev) => prev.map((p, i) => i === idx ? { ...p, outfitId: newId } : p));
                            }}
                          >
                            {slotOutfits.map((o) => (
                              <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGroupPersons((prev) => prev.filter((_, i) => i !== idx));
                            setActivePersonIdx((prev) =>
                              prev === null ? null
                              : prev === idx ? null
                              : prev > idx ? prev - 1
                              : prev
                            );
                          }}
                          className="absolute top-1.5 right-1.5 bg-black/60 rounded-full p-0.5 text-[#8b7e6a] hover:text-red-400 transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </motion.div>
                    );
                  })}

                  {/* Add person button */}
                  {groupPersons.length < MAX_GROUP_PERSONS && (
                    <motion.button
                      variants={personCardVariants}
                      type="button"
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        const newIdx = groupPersons.length;
                        setGroupPersons((prev) => [...prev, { faceImageB64: "", facePreview: "", gender: "female", outfitId: effectiveOutfitId }]);
                        setActivePersonIdx(newIdx);
                      }}
                      className="aspect-[3/4] rounded-xl border-2 border-dashed border-[#3a2a22] hover:border-[#c5a059] flex flex-col items-center justify-center gap-2 text-[#5a4a42] hover:text-[#c5a059] transition-colors"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      <span className="text-[10px] font-medium">{t("capture.addPerson")}</span>
                    </motion.button>
                  )}
                </motion.div>

                {/* Active person face upload */}
                <AnimatePresence>
                  {activePersonIdx !== null && activePersonIdx < groupPersons.length && (
                    <motion.div
                      key={activePersonIdx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                      className="rounded-xl border border-[#c5a05966] bg-[#c5a05908] p-4"
                    >
                      <p className="text-xs font-bold text-[#e8c383] mb-3">{t("capture.uploadForPerson")} {activePersonIdx + 1}</p>
                      <div className="relative group">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = async () => {
                              try {
                                const value = String(reader.result || "");
                                const normalized = await normalizeImageDataUrl(value);
                                const encoded = normalized.includes(",") ? normalized.split(",")[1] : normalized;
                                setGroupPersons((prev) => prev.map((p, i) => i === activePersonIdx ? { ...p, faceImageB64: encoded, facePreview: normalized } : p));
                              } catch { /* ignore */ }
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className={`min-h-[120px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-4 transition-colors ${groupPersons[activePersonIdx]?.facePreview ? "border-[#c5a059]" : "border-[#3a2a22] group-hover:border-[#5a4a42]"}`}>
                          {groupPersons[activePersonIdx]?.facePreview ? (
                            <div className="flex items-center gap-3">
                              <img src={groupPersons[activePersonIdx].facePreview} alt="Face" className="h-20 w-auto rounded-lg object-contain" />
                              <p className="text-xs text-[#a89f91]">{t("capture.replaceImage")}</p>
                            </div>
                          ) : (
                            <p className="text-sm text-[#8b7e6a]">{t("capture.uploadHint")}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ── Face Photo ────────────────────────────────────────────── */}
        <AnimatePresence>
          {!groupMode && !groupPhotoMode && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.35 }}
              className="bg-[#1a1412] border border-[#3a2a22] rounded-2xl p-6 flex flex-col"
            >
              <h2 className="text-xl font-bold text-[#f7f1e6] mb-5">{t("capture.facePhoto")}</h2>

              {/* ── Animated pill tab switcher ──────────────────────── */}
              <div className="relative flex bg-[#2a201c] border border-[#3a2a22] rounded-xl p-1 mb-5 gap-0.5">
                {/* Sliding pill */}
                <motion.div
                  layout
                  layoutId="capture-tab-pill"
                  style={{
                    position: "absolute",
                    top: 4,
                    bottom: 4,
                    left: `calc(${(activeCaptureTabIndex / CAPTURE_TABS.length) * 100}% + 4px)`,
                    width: `calc(${100 / CAPTURE_TABS.length}% - 8px / ${CAPTURE_TABS.length})`,
                  }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="bg-[#c5a059] rounded-lg"
                />
                {CAPTURE_TABS.map((tab) => {
                  const active = captureTab === tab.id;
                  const label =
                    tab.id === "gallery" && faceGallery.length > 0
                      ? `${t("capture.tabGallery")} (${faceGallery.length})`
                      : t(`capture.tab${tab.id.charAt(0).toUpperCase() + tab.id.slice(1)}`);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCaptureTab(tab.id)}
                      className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        active ? "text-[#1a1412]" : "text-[#8b7e6a] hover:text-[#f7f1e6]"
                      }`}
                    >
                      {tab.icon}
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  );
                })}
              </div>

              {/* ── Tab content with AnimatePresence ──────────────── */}
              <div className="flex-1 relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {/* Upload Tab */}
                  {captureTab === "upload" && (
                    <motion.div key="upload" {...tabContent} className="relative group">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onFaceUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        onDragEnter={() => setDragOver(true)}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={() => setDragOver(false)}
                      />
                      <motion.div
                        animate={
                          dragOver
                            ? { scale: 1.03, borderColor: "#c5a059" }
                            : facePreview
                            ? {}
                            : { scale: [1, 1.005, 1] }
                        }
                        transition={dragOver ? { type: "spring", stiffness: 300, damping: 20 } : { repeat: Infinity, duration: 3, ease: "easeInOut" }}
                        className={`h-full min-h-[280px] rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center p-8 ${
                          dragOver
                            ? "border-[#c5a059] bg-[#c5a05912]"
                            : facePreview
                            ? "border-[#c5a059] bg-[#c5a0590a]"
                            : "border-[#3a2a22] bg-[#2a201c] group-hover:border-[#5a4a42]"
                        }`}
                      >
                        {facePreview ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 22 }}
                            className="flex flex-col items-center gap-3"
                          >
                            <img src={facePreview} alt="Face preview" className="max-h-56 w-auto rounded-xl object-contain shadow-lg" />
                            <p className="text-xs text-[#a89f91]">{t("capture.replaceImage")}</p>
                          </motion.div>
                        ) : (
                          <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 bg-[#1a1412] rounded-full flex items-center justify-center mb-4 border border-[#3a2a22]">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b7e6a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                              </svg>
                            </div>
                            <p className="text-[#f7f1e6] font-medium">{t("capture.uploadHint")}</p>
                            <p className="text-sm text-[#8b7e6a] mt-1">{t("capture.uploadSubHint")}</p>
                          </div>
                        )}
                      </motion.div>
                    </motion.div>
                  )}

                  {/* Camera Tab */}
                  {captureTab === "camera" && (
                    <motion.div key="camera" {...tabContent} className="flex flex-col gap-3">
                      {cameraError ? (
                        <div className="flex-1 min-h-[280px] rounded-xl border border-red-500/30 bg-red-500/10 flex flex-col items-center justify-center p-8 text-center">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <p className="text-red-400 text-sm">{cameraError}</p>
                          <button
                            type="button"
                            onClick={startCamera}
                            className="mt-4 px-4 py-2 bg-[#2a201c] border border-[#3a2a22] rounded-lg text-sm text-[#f7f1e6] hover:border-[#c5a059] transition-colors"
                          >
                            {t("capture.cameraRetry")}
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="relative rounded-xl overflow-hidden bg-black min-h-[280px] flex items-center justify-center">
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              muted
                              className="w-full max-h-72 object-cover"
                              style={{ transform: "scaleX(-1)" }}
                            />
                            {!cameraReady && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                                <div className="animate-spin w-8 h-8 border-2 border-[#c5a059] border-t-transparent rounded-full" />
                              </div>
                            )}
                            {cameraReady && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <div className="w-24 h-28 border-2 border-[#c5a05980] rounded-full" />
                                <div className="w-44 h-24 border-2 border-t-0 border-[#c5a05980] rounded-b-2xl -mt-1" />
                              </div>
                            )}
                          </div>
                          <canvas ref={canvasRef} className="hidden" />
                          <p className="text-xs text-[#a89f91] text-center">{t("capture.cameraGuide")}</p>
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.97 }}
                            onClick={capturePhoto}
                            disabled={!cameraReady}
                            className="w-full py-3 rounded-xl bg-[#c5a059] disabled:opacity-40 text-[#1a1412] font-bold hover:bg-[#b38f4a] transition-colors flex items-center justify-center gap-2"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                              <circle cx="12" cy="13" r="4" />
                            </svg>
                            {t("capture.takePhoto")}
                          </motion.button>
                        </>
                      )}
                    </motion.div>
                  )}

                  {/* Gallery Tab */}
                  {captureTab === "gallery" && (
                    <motion.div key="gallery" {...tabContent} className="flex flex-col">
                      {galleryLoading ? (
                        <div className="flex-1 min-h-[280px] flex items-center justify-center">
                          <div className="animate-spin w-8 h-8 border-2 border-[#c5a059] border-t-transparent rounded-full" />
                        </div>
                      ) : faceGallery.length === 0 ? (
                        <div className="flex-1 min-h-[280px] flex flex-col items-center justify-center text-center p-6 rounded-xl border border-dashed border-[#3a2a22]">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5a4a42" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                          <p className="text-sm text-[#8b7e6a]">{t("capture.noSavedFaces")}</p>
                          <p className="text-xs text-[#5a4a42] mt-1">{t("capture.noSavedFacesSub")}</p>
                        </div>
                      ) : (
                        <div className="overflow-y-auto max-h-80 pr-1">
                          <motion.div
                            variants={staggerContainer}
                            initial="hidden"
                            animate="visible"
                            className="grid grid-cols-3 gap-2"
                          >
                            {faceGallery.map((face) => (
                              <motion.button
                                key={face.filename}
                                variants={staggerItem}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.97 }}
                                type="button"
                                onClick={() => {
                                  selectGalleryFace(face);
                                  setCaptureTab("upload");
                                }}
                                className="group rounded-xl overflow-hidden border border-[#3a2a22] hover:border-[#c5a059] transition-all"
                              >
                                <img
                                  src={face.url}
                                  alt="Saved face"
                                  className="aspect-[3/4] w-full object-cover"
                                />
                                <div className="px-1.5 py-1 bg-black/40">
                                  <p className="text-[9px] text-[#a89f91]">
                                    {new Date(face.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                              </motion.button>
                            ))}
                          </motion.div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Telegram Tab */}
                  {captureTab === "telegram" && (
                    <motion.div key="telegram" {...tabContent} className="flex flex-col items-center justify-center min-h-[280px] text-center p-6">
                      {!tgBotUsername ? (
                        <div className="space-y-3">
                          <div className="animate-spin w-8 h-8 border-2 border-[#c5a059] border-t-transparent rounded-full mx-auto" />
                          <p className="text-sm text-[#8b7e6a]">{t("capture.loadingTelegram")}</p>
                          <p className="text-xs text-[#5a4a42]">{t("capture.telegramConfigHint")}</p>
                        </div>
                      ) : (
                        <div className="space-y-4 w-full">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            className="mx-auto w-12 h-12 rounded-full bg-[#0088cc] flex items-center justify-center"
                          >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.012-1.252-.242-1.865-.442-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                            </svg>
                          </motion.div>

                          <div>
                            <p className="text-[#f7f1e6] font-medium">{t("capture.telegramTitle")}</p>
                            <p className="text-xs text-[#8b7e6a] mt-1">{t("capture.telegramSubtitle")}</p>
                          </div>

                          <div className="bg-white p-3 rounded-xl inline-block mx-auto shadow-lg">
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`https://t.me/${tgBotUsername}?start=${tgSessionId}`)}`}
                              alt="Telegram QR Code"
                              width={200}
                              height={200}
                              className="block"
                            />
                          </div>

                          <a
                            href={`https://t.me/${tgBotUsername}?start=${tgSessionId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0088cc] hover:bg-[#006daa] text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.257-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.012-1.252-.242-1.865-.442-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                            </svg>
                            {t("capture.openTelegram")}
                          </a>

                          <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-center gap-2 text-xs">
                              <motion.div
                                animate={tgLinked ? {} : { scale: [1, 1.4, 1] }}
                                transition={{ repeat: Infinity, duration: 1.2 }}
                                className={`w-2 h-2 rounded-full ${tgLinked ? "bg-green-400" : "bg-[#5a4a42]"}`}
                              />
                              <span className={tgLinked ? "text-green-400" : "text-[#8b7e6a]"}>
                                {tgLinked ? t("capture.connectedSendPhoto") : t("capture.waitingConnection")}
                              </span>
                            </div>
                            {tgLinked && (
                              <div className="flex items-center justify-center gap-2 text-xs">
                                <div className="animate-spin w-3 h-3 border border-[#c5a059] border-t-transparent rounded-full" />
                                <span className="text-[#8b7e6a]">{t("capture.waitingPhoto")}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      {/* ── Email collection ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="bg-[#1a1412] border border-[#3a2a22] rounded-2xl p-5"
      >
        <label className="block text-xs font-bold uppercase tracking-wider text-[#a89f91] mb-2">
          {t("capture.emailCapture")}
        </label>
        <input
          type="email"
          value={emailAddress}
          onChange={(e) => setEmailAddress(e.target.value)}
          placeholder={t("capture.emailCapturePlaceholder")}
          className="w-full bg-[#2a201c] border border-[#3a2a22] rounded-xl px-4 py-3 text-[#f7f1e6] placeholder-[#5a4a42] focus:outline-none focus:border-[#c5a059] transition-colors text-sm"
        />
        <p className="text-xs text-[#5a4a42] mt-1.5">{t("capture.emailCaptureHint")}</p>
      </motion.div>

      {/* ── Error message ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Continue button ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.4 }}
      >
        <motion.button
          type="button"
          onClick={continueToWorkspace}
          whileTap={{ scale: 0.98 }}
          animate={
            canContinue
              ? { boxShadow: ["0 0 0px #c5a05900", "0 0 24px #c5a05966", "0 0 0px #c5a05900"] }
              : { boxShadow: "none" }
          }
          transition={canContinue ? { repeat: Infinity, duration: 2.2, ease: "easeInOut" } : {}}
          className={`w-full flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all ${
            canContinue
              ? "bg-[#c5a059] hover:bg-[#b38f4a] text-[#1a1412] cursor-pointer"
              : "bg-[#2a201c] border border-[#3a2a22] text-[#5a4a42] cursor-not-allowed"
          }`}
        >
          {canContinue && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              ✦
            </motion.span>
          )}
          {t("capture.continueToWorkspace")}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
