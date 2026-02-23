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

type Region = {
  id: string;
  name: string;
  description: string;
  clothes: {
    female: Outfit[];
    male: Outfit[];
  };
};

type ClothesResponse = {
  regions: Region[];
};

const STORAGE_KEY = "batik_capture_payload";

export default function CapturePage() {
  const router = useRouter();
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<string>("");
  const [gender, setGender] = useState<"female" | "male">("female");
  const [outfitId, setOutfitId] = useState<string>("");
  const [faceImageB64, setFaceImageB64] = useState<string>("");
  const [facePreview, setFacePreview] = useState<string>("");
  const [error, setError] = useState<string>("");

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
  }, []);

  const selectedRegion = useMemo(() => regions.find((region) => region.id === regionId), [regions, regionId]);

  const outfits = useMemo(() => {
    if (!selectedRegion) {
      return [];
    }
    return gender === "female" ? selectedRegion.clothes.female : selectedRegion.clothes.male;
  }, [selectedRegion, gender]);

  const effectiveOutfitId = useMemo(() => {
    if (!outfits.length) {
      return "";
    }
    return outfits.some((outfit) => outfit.id === outfitId) ? outfitId : outfits[0].id;
  }, [outfits, outfitId]);

  const selectedOutfit = useMemo(
    () => outfits.find((outfit) => outfit.id === effectiveOutfitId),
    [outfits, effectiveOutfitId],
  );

  function onFaceUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      setFacePreview(value);
      const encoded = value.includes(",") ? value.split(",")[1] : value;
      setFaceImageB64(encoded);
    };
    reader.readAsDataURL(file);
  }

  function continueToWorkspace() {
    if (!selectedRegion || !selectedOutfit || !faceImageB64) {
      setError("Please select region, outfit, and upload face image before continuing.");
      return;
    }
    setError("");
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        regionId: selectedRegion.id,
        regionName: selectedRegion.name,
        gender,
        outfit: selectedOutfit,
        faceImageB64,
        facePreview,
      }),
    );
    router.push("/workspace");
  }

  return (
    <main className="batik-bg min-h-screen px-6 py-8 text-[#f7f1e6] md:px-10">
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-center text-4xl font-bold">Nusantara Face Capture</h1>
        <p className="mt-2 text-center text-sm text-[#f7f1e6aa]">Align your face and configure style before generation.</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="glass-panel rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-[#f5e2bf]">Selection</h2>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium text-[#f7f1e6]">
                Region
                <select
                  className="batik-select mt-1 w-full rounded-lg border border-[#ffffff33] px-3 py-2"
                  value={regionId}
                  onChange={(event) => setRegionId(event.target.value)}
                >
                  {regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium text-[#f7f1e6]">
                Gender
                <select
                  className="batik-select mt-1 w-full rounded-lg border border-[#ffffff33] px-3 py-2"
                  value={gender}
                  onChange={(event) => setGender(event.target.value as "female" | "male")}
                >
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-[#f7f1e6]">
                Outfit
                <select
                  className="batik-select mt-1 w-full rounded-lg border border-[#ffffff33] px-3 py-2"
                  value={effectiveOutfitId}
                  onChange={(event) => setOutfitId(event.target.value)}
                >
                  {outfits.map((outfit) => (
                    <option key={outfit.id} value={outfit.id}>
                      {outfit.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedOutfit && (
              <div className="mt-4 rounded-xl border border-[#d4a37344] bg-[#0000002e] p-4">
                <p className="font-semibold text-[#f7f1e6]">{selectedOutfit.name}</p>
                <p className="mt-2 text-sm text-[#f7f1e6b3]">{selectedOutfit.description}</p>
              </div>
            )}
          </section>

          <section className="glass-panel rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-[#f5e2bf]">Face Photo</h2>
            <input type="file" accept="image/*" onChange={onFaceUpload} className="mt-4 w-full text-sm" />
            <div className="mt-4 rounded-xl border border-dashed border-[#ffffff40] bg-[#0000003a] p-3">
              {facePreview ? (
                <img src={facePreview} alt="Face preview" className="mx-auto max-h-96 w-auto rounded-lg" />
              ) : (
                <p className="py-12 text-center text-sm text-[#f7f1e680]">Upload a clear front-facing photo</p>
              )}
            </div>
            <img src="/stitch/capture.png" alt="Stitch capture reference" className="mt-4 w-full rounded-lg border border-[#ffffff20] opacity-80" />
          </section>
        </div>

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={continueToWorkspace}
            className="rounded-xl bg-gradient-to-r from-[#c5a059] to-[#8b5e3c] px-5 py-3 font-semibold text-[#2a1d18] hover:brightness-110"
          >
            Continue to Workspace
          </button>
        </div>
      </div>
    </main>
  );
}
