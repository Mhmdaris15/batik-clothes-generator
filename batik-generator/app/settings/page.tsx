"use client";

import { useEffect, useState, useCallback } from "react";
import { Save, Cpu, Key, Database, Check, Info, Zap } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type ModelInput = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  min?: number;
  max?: number;
  default?: number | string;
  options?: string[];
  placeholder?: string;
};

type ModelConfig = {
  id: string;
  name: string;
  description: string;
  backend: string;
  requires_face: boolean;
  supports_garment_reuse: boolean;
  inputs: ModelInput[];
  parameters: Record<string, unknown>;
};

type ModelsResponse = {
  models: ModelConfig[];
};

const SETTINGS_STORAGE_KEY = "batik_settings";

function loadSavedSettings(): { activeModelId: string } {
  if (typeof window === "undefined") return { activeModelId: "" };
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { activeModelId: "" };
}

function saveSettings(settings: { activeModelId: string }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export default function SettingsPage() {
  const { t } = useI18n();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [settingsTab, setSettingsTab] = useState<"models" | "keys" | "storage">("models");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch("/api/models");
        const data = (await resp.json()) as ModelsResponse;
        setModels(data.models || []);
        const savedSettings = loadSavedSettings();
        if (savedSettings.activeModelId && data.models?.some((m) => m.id === savedSettings.activeModelId)) {
          setActiveModelId(savedSettings.activeModelId);
        } else if (data.models?.length) {
          setActiveModelId(data.models[0].id);
        }
      } catch (err) {
        console.error("Failed to load models config", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeModel = models.find((m) => m.id === activeModelId);

  const handleSave = useCallback(() => {
    saveSettings({ activeModelId });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [activeModelId]);

  const inputTypeIcon = (type: string) => {
    switch (type) {
      case "image": return "📷";
      case "region_select": return "🗺️";
      case "gender_select": return "👤";
      case "outfit_select": return "👗";
      case "number": return "🔢";
      case "text": return "📝";
      case "select": return "📋";
      default: return "⚙️";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#c5a059]"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-[#f7f1e6]">{t("settings.title")}</h1>
        <p className="text-[#a89f91] mt-1">{t("settings.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Settings Sidebar */}
        <div className="space-y-2">
          <button
            onClick={() => setSettingsTab("models")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-colors ${settingsTab === "models" ? "bg-[#c5a05922] text-[#e7cf9d] border border-[#c5a05944]" : "text-[#a89f91] hover:bg-[#2a201c] hover:text-[#f7f1e6]"}`}
          >
            <Cpu size={18} />
            {t("settings.tabModels")}
          </button>
          <button
            onClick={() => setSettingsTab("keys")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-colors ${settingsTab === "keys" ? "bg-[#c5a05922] text-[#e7cf9d] border border-[#c5a05944]" : "text-[#a89f91] hover:bg-[#2a201c] hover:text-[#f7f1e6]"}`}
          >
            <Key size={18} />
            {t("settings.tabKeys")}
          </button>
          <button
            onClick={() => setSettingsTab("storage")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-left transition-colors ${settingsTab === "storage" ? "bg-[#c5a05922] text-[#e7cf9d] border border-[#c5a05944]" : "text-[#a89f91] hover:bg-[#2a201c] hover:text-[#f7f1e6]"}`}
          >
            <Database size={18} />
            {t("settings.tabStorage")}
          </button>
        </div>

        {/* Settings Content */}
        <div className="md:col-span-3 space-y-6">
          {settingsTab === "models" && (
            <>
              <div className="bg-[#1a1412] border border-[#3a2a22] rounded-2xl p-6">
                <h2 className="text-xl font-bold text-[#f7f1e6] mb-2">{t("settings.activeModel")}</h2>
                <p className="text-sm text-[#8b7e6a] mb-6">
                  {t("settings.modelHelp")}
                </p>

                <div className="space-y-3">
                  {models.map((model) => (
                    <label
                      key={model.id}
                      className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                        activeModelId === model.id
                          ? "bg-[#c5a05911] border-[#c5a059]"
                          : "bg-[#2a201c] border-[#3a2a22] hover:border-[#5a4a42]"
                      }`}
                    >
                      <div className="mt-1">
                        <input
                          type="radio"
                          name="model"
                          value={model.id}
                          checked={activeModelId === model.id}
                          onChange={() => setActiveModelId(model.id)}
                          className="w-4 h-4 accent-[#c5a059]"
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-[#f7f1e6]">{model.name}</h3>
                          {model.requires_face && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 uppercase tracking-wider">
                              {t("settings.requiresFace")}
                            </span>
                          )}
                          {model.supports_garment_reuse && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 uppercase tracking-wider">
                              {t("settings.garmentReuse")}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 uppercase tracking-wider">
                            {model.backend}
                          </span>
                        </div>
                        <p className="text-sm text-[#a89f91] mt-1">{model.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Dynamic Model Details */}
              {activeModel && (
                <div className="bg-[#1a1412] border border-[#3a2a22] rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Zap size={20} className="text-[#c5a059]" />
                    <h2 className="text-xl font-bold text-[#f7f1e6]">
                      {activeModel.name} - {t("settings.inputSchema")}
                    </h2>
                  </div>
                  <p className="text-sm text-[#8b7e6a] mb-6">
                    {t("settings.inputSchemaHelp")}
                  </p>

                  <div className="space-y-3">
                    {activeModel.inputs.map((input) => (
                      <div
                        key={input.key}
                        className="flex items-center gap-4 p-3 bg-[#2a201c] border border-[#3a2a22] rounded-xl"
                      >
                        <span className="text-lg">{inputTypeIcon(input.type)}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#f7f1e6]">{input.label}</span>
                            {input.required && (
                              <span className="text-[10px] font-bold text-red-400">{t("settings.required")}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[#8b7e6a] mt-0.5">
                            <span>{t("settings.type")}: {input.type}</span>
                            {input.min !== undefined && <span>{t("settings.min")}: {input.min}</span>}
                            {input.max !== undefined && <span>{t("settings.max")}: {input.max}</span>}
                            {input.default !== undefined && <span>{t("settings.default")}: {input.default}</span>}
                            {input.options && <span>{t("settings.options")}: {input.options.join(", ")}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {Object.keys(activeModel.parameters).length > 0 && (
                    <div className="mt-6 pt-4 border-t border-[#3a2a22]">
                      <div className="flex items-center gap-2 mb-3">
                        <Info size={16} className="text-[#8b7e6a]" />
                        <span className="text-sm font-medium text-[#a89f91]">{t("settings.internalParameters")}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {Object.entries(activeModel.parameters).map(([key, value]) => (
                          <div key={key} className="p-2 bg-[#2a201c] rounded-lg text-xs">
                            <span className="text-[#8b7e6a]">{key}:</span>{" "}
                            <span className="text-[#e7cf9d]">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {settingsTab === "keys" && (
            <div className="bg-[#1a1412] border border-[#3a2a22] rounded-2xl p-6">
              <h2 className="text-xl font-bold text-[#f7f1e6] mb-4">{t("settings.tabKeys")}</h2>
              <p className="text-sm text-[#8b7e6a] mb-6">{t("settings.keysHelp")}</p>
              <div className="space-y-3">
                {[
                  { name: "GOOGLE_CLOUD_API_KEY", desc: "Used by Imagen 4 and Gemini VTO" },
                  { name: "GEMINI_API_KEY", desc: "Used by Gemini Flash models" },
                  { name: "CHUTES_API_TOKEN", desc: "Used by Chutes custom endpoint" },
                ].map((k) => (
                  <div key={k.name} className="flex items-center gap-4 p-3 bg-[#2a201c] border border-[#3a2a22] rounded-xl">
                    <Key size={16} className="text-[#8b7e6a]" />
                    <div>
                      <span className="font-mono text-sm text-[#e7cf9d]">{k.name}</span>
                      <p className="text-xs text-[#8b7e6a]">{k.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {settingsTab === "storage" && (
            <div className="bg-[#1a1412] border border-[#3a2a22] rounded-2xl p-6">
              <h2 className="text-xl font-bold text-[#f7f1e6] mb-4">{t("settings.tabStorage")}</h2>
              <p className="text-sm text-[#8b7e6a] mb-6">{t("settings.storageHelp")}</p>
              <div className="space-y-2 text-sm text-[#a89f91]">
                <p>• <strong className="text-[#f7f1e6]">{t("settings.faces")}:</strong> generated-images/faces/</p>
                <p>• <strong className="text-[#f7f1e6]">{t("settings.garments")}:</strong> generated-images/garments/</p>
                <p>• <strong className="text-[#f7f1e6]">{t("settings.results")}:</strong> generated-images/results/</p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {saved && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <Check size={16} />
                {t("settings.saved")}
              </div>
            )}
            <div className="hidden sm:block flex-1" />
            <button
              onClick={handleSave}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-[#c5a059] hover:bg-[#b38f4a] text-[#1a1412] px-6 py-3 rounded-xl font-bold transition-colors"
            >
              <Save size={18} />
              {t("settings.save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
