"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Outfit = {
  id: string;
  name: string;
  description: string;
  motifs: string[];
  colors: string[];
  accessories: string;
};

type CapturePayload = {
  regionId: string;
  regionName: string;
  gender: "female" | "male";
  outfit: Outfit;
  faceImageB64: string;
  facePreview: string;
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

const STORAGE_KEY = "batik_capture_payload";

export default function WorkspacePage() {
  const router = useRouter();
  const [capture, setCapture] = useState<CapturePayload | null>(null);
  const [numImages, setNumImages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [images, setImages] = useState<string[]>([]);
  const [garments, setGarments] = useState<GarmentEntry[]>([]);
  const [selectedGarment, setSelectedGarment] = useState<string>("");
  const [garmentReused, setGarmentReused] = useState<boolean>(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      router.replace("/capture");
      return;
    }
    setCapture(JSON.parse(raw) as CapturePayload);
  }, [router]);

  // Fetch stored garments on mount
  useEffect(() => {
    fetch("/api/garments")
      .then((r) => r.json())
      .then((data: { garments: GarmentEntry[] }) => {
        setGarments(data.garments ?? []);
      })
      .catch(() => {});
  }, []);

  // Filter garments matching current outfit
  const matchingGarments = useMemo(
    () => garments.filter((g) => capture?.outfit && g.outfitId === capture.outfit.id),
    [garments, capture],
  );

  const canGenerate = useMemo(() => Boolean(capture?.faceImageB64 && capture?.outfit), [capture]);

  async function generateImages() {
    if (!capture) {
      return;
    }
    setIsLoading(true);
    setError("");
    setImages([]);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          regionName: capture.regionName,
          regionId: capture.regionId,
          gender: capture.gender,
          outfit: capture.outfit,
          faceImageB64: capture.faceImageB64,
          numImages,
          garmentFilename: selectedGarment || undefined,
        }),
      });
      const result = (await response.json()) as GenerateResponse & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "Generation failed");
      }
      setImages(result.images || []);
      setPrompt(result.prompt || "");
      setGarmentReused(result.garmentReused ?? false);

      // Refresh garment list (new garment may have been saved)
      fetch("/api/garments")
        .then((r) => r.json())
        .then((data: { garments: GarmentEntry[] }) => setGarments(data.garments ?? []))
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="batik-bg min-h-screen text-[#f7f1e6]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px] flex-col px-4 py-4 md:px-6">
        <header className="glass-panel mb-4 flex h-14 items-center justify-between rounded-xl px-4">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold gold-gradient-text">NusaBatik</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#f7f1e6b5]">
            <span>Gallery</span>
            <span>Settings</span>
            <button className="rounded-full border border-[#ffffff2e] px-3 py-1">Profile</button>
          </div>
        </header>

        <div className="grid flex-1 gap-4 lg:grid-cols-[360px_1fr]">
          <aside className="glass-panel flex h-full flex-col rounded-2xl">
            <div className="border-b border-[#ffffff12] px-5 py-4">
              <h2 className="text-xl font-semibold">Studio Config</h2>
              <p className="text-xs text-[#f7f1e699]">Craft your masterpiece.</p>
            </div>

            <div className="flex-1 space-y-5 p-5">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#e8c383]">Input Source</label>
                <div className="mt-2 rounded-xl border border-dashed border-[#ffffff2e] bg-black/25 p-3">
                  {capture?.facePreview ? (
                    <img src={capture.facePreview} alt="Uploaded face" className="h-52 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-52 items-center justify-center text-sm text-[#f7f1e680]">No uploaded face.</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/capture")}
                  className="mt-3 w-full rounded-lg border border-[#ffffff25] bg-[#ffffff0b] px-3 py-2 text-sm font-medium hover:bg-[#ffffff1a]"
                >
                  Back to Capture
                </button>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#e8c383]">Subject Gender</label>
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-[#ffffff1a] bg-black/20 p-1.5">
                  <div className={`rounded-lg px-3 py-2 text-center text-sm ${capture?.gender === "male" ? "bg-[#c5a059] text-[#2a1d18]" : "text-[#f7f1e6a0]"}`}>
                    Male
                  </div>
                  <div className={`rounded-lg px-3 py-2 text-center text-sm ${capture?.gender === "female" ? "bg-[#c5a059] text-[#2a1d18]" : "text-[#f7f1e6a0]"}`}>
                    Female
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#e8c383]">Batik Style Region</label>
                <div className="mt-2 rounded-xl border border-[#ffffff1f] bg-black/25 px-3 py-2 text-sm">
                  {capture?.regionName || "-"}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#e8c383]">Number of Images</label>
                <select
                  value={numImages}
                  onChange={(event) => setNumImages(Number(event.target.value))}
                  className="batik-select mt-2 w-full rounded-lg border border-[#ffffff2b] px-3 py-2 text-sm"
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>

              {/* Garment Reuse Picker */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#e8c383]">Garment Source</label>
                <select
                  value={selectedGarment}
                  onChange={(event) => setSelectedGarment(event.target.value)}
                  className="batik-select mt-2 w-full rounded-lg border border-[#ffffff2b] px-3 py-2 text-sm"
                >
                  <option value="">Generate new garment (Imagen 4)</option>
                  {matchingGarments.length > 0 && (
                    <option value="" disabled>── Existing for this outfit ──</option>
                  )}
                  {matchingGarments.map((g) => (
                    <option key={g.filename} value={g.filename}>
                      {g.filename.split("_").slice(0, 2).join(" ")} — {new Date(g.createdAt).toLocaleDateString()}
                    </option>
                  ))}
                  {garments.filter((g) => g.outfitId !== capture?.outfit?.id).length > 0 && (
                    <option value="" disabled>── Other garments ──</option>
                  )}
                  {garments
                    .filter((g) => g.outfitId !== capture?.outfit?.id)
                    .map((g) => (
                      <option key={g.filename} value={g.filename}>
                        {g.outfitId} — {new Date(g.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                </select>
                {selectedGarment && (
                  <div className="mt-2 rounded-lg border border-[#ffffff1a] bg-black/20 p-2">
                    <img
                      src={`/api/garments/image/${selectedGarment}`}
                      alt="Selected garment"
                      className="h-32 w-full rounded object-contain"
                    />
                    <p className="mt-1 text-center text-[10px] text-[#e8c383]">Skip garment generation — VTO only</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-[#ffffff14] p-5">
              <button
                type="button"
                onClick={generateImages}
                disabled={!canGenerate || isLoading}
                className="w-full rounded-xl bg-gradient-to-r from-[#c5a059] to-[#8b5e3c] px-4 py-3 text-sm font-bold text-[#2a1d18] hover:brightness-110 disabled:opacity-60"
              >
                {isLoading ? "Generating..." : "Generate Batik"}
              </button>
            </div>
          </aside>

          <section className="glass-panel rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">Generated Results</h2>
                <span className="rounded-full border border-[#ffffff2d] bg-[#ffffff12] px-3 py-1 text-xs font-bold text-[#e8c383]">
                  {images.length}
                </span>
              </div>
              <div className="text-xs text-[#f7f1e699]">Newest First</div>
            </div>

            {error && <p className="mb-4 rounded-lg bg-red-900/40 px-3 py-2 text-sm text-red-200">{error}</p>}

            {isLoading && (
              <div className="mb-5 rounded-xl border border-[#e8c38355] bg-black/30 p-4">
                <p className="text-sm font-semibold text-[#e8c383]">Processing your request...</p>
                <p className="text-xs text-[#f7f1e699]">Weaving digital threads for {capture?.regionName || "selected region"} style.</p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#ffffff1f]">
                  <div className="h-full w-2/3 rounded-full bg-[#c5a059]" />
                </div>
              </div>
            )}

            {prompt && (
              <details className="mb-4 rounded-lg bg-black/30 p-3 text-sm text-[#f7f1e6cc]">
                <summary className="cursor-pointer font-medium">
                  Generation prompt
                  {garmentReused && (
                    <span className="ml-2 rounded-full bg-[#c5a05930] px-2 py-0.5 text-[10px] font-bold text-[#e8c383]">
                      GARMENT REUSED
                    </span>
                  )}
                </summary>
                <p className="mt-2 whitespace-pre-wrap">{prompt}</p>
              </details>
            )}

            {images.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#ffffff40] px-4 py-16 text-center text-sm text-[#f7f1e680]">
                Generated images will appear here.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {images.map((image, index) => (
                  <a
                    key={`${image.slice(0, 16)}-${index}`}
                    href={image}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-xl border border-[#ffffff1f] bg-black/20"
                  >
                    <img src={image} alt={`Generated ${index + 1}`} className="aspect-[3/4] w-full object-cover transition group-hover:scale-[1.03]" />
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-[#f7f1e6b0]">
                      <span>{capture?.outfit?.name || "Batik Result"}</span>
                      <span>Open</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
