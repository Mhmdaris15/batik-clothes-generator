"use client";

import { useState } from "react";
import { Download, Check, Eye, Trash2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

export type GalleryItem = {
  filename: string;
  outfitId: string;
  regionId: string;
  gender: string;
  category: "faces" | "garments" | "results" | "landscapes";
  url: string;
  prompt?: string;
  createdAt: string;
};

type Props = {
  items: GalleryItem[];
  selectable?: boolean;
  onSelect?: (item: GalleryItem) => void;
  selectedFilename?: string | null;
  onDelete?: (item: GalleryItem) => void;
};

export default function ImageGallery({
  items,
  selectable = false,
  onSelect,
  selectedFilename,
  onDelete,
}: Props) {
  const { t } = useI18n();
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);

  return (
    <>
      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {items.map((item) => {
          const isSelected = selectable && selectedFilename === item.filename;

          return (
            <div
              key={item.filename}
              onClick={() => selectable && onSelect?.(item)}
              className={`group relative bg-[#1a1412] border rounded-xl overflow-hidden transition-all duration-200 cursor-pointer ${
                isSelected
                  ? "border-[#c5a059] ring-2 ring-[#c5a059]/40 scale-[1.02]"
                  : "border-[#3a2a22] hover:border-[#5a4a42]"
              }`}
            >
              {/* Thumbnail */}
              <div className="relative aspect-square w-full overflow-hidden bg-[#2a201c]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={item.filename}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />

                {/* Selection check */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-7 h-7 bg-[#c5a059] rounded-full flex items-center justify-center shadow-lg z-10">
                    <Check size={16} className="text-[#1a1412]" />
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewItem(item);
                    }}
                    className="w-9 h-9 bg-white/20 backdrop-blur-sm text-white rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                    title={t("imageGallery.preview")}
                  >
                    <Eye size={16} />
                  </button>
                  <a
                    href={item.url}
                    download={item.filename}
                    onClick={(e) => e.stopPropagation()}
                    className="w-9 h-9 bg-[#c5a059]/80 backdrop-blur-sm text-[#1a1412] rounded-full flex items-center justify-center hover:bg-[#c5a059] transition-colors"
                    title={t("common.download")}
                  >
                    <Download size={16} />
                  </a>
                  {onDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(item);
                      }}
                      className="w-9 h-9 bg-red-500/80 backdrop-blur-sm text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                      title={t("imageGallery.delete")}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Info bar */}
              <div className="p-2 border-t border-[#3a2a22]">
                <p className="text-[11px] text-[#f7f1e6] font-medium truncate">
                  {item.outfitId?.replace(/_/g, " ") || item.filename}
                </p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-[10px] text-[#8b7e6a] capitalize">{item.gender}</span>
                  <span className="text-[10px] text-[#8b7e6a]">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#3a2a22] px-6 py-16 text-center">
          <p className="text-[#8b7e6a]">{t("imageGallery.noImages")}</p>
          <p className="text-sm text-[#5a4a42] mt-1">{t("imageGallery.noImagesSub")}</p>
        </div>
      )}

      {/* Lightbox Preview */}
      {previewItem && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-8"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="relative max-w-3xl max-h-[85vh] bg-[#1a1412] border border-[#3a2a22] rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewItem.url}
              alt={previewItem.filename}
              className="max-h-[75vh] w-auto object-contain"
            />
            <div className="p-4 border-t border-[#3a2a22] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#f7f1e6]">
                  {previewItem.outfitId?.replace(/_/g, " ") || previewItem.filename}
                </p>
                <p className="text-xs text-[#8b7e6a] mt-0.5">
                  {previewItem.regionId?.replace(/_/g, " ")} &bull; {previewItem.gender} &bull; {previewItem.category}
                </p>
              </div>
              <div className="flex gap-2">
                <a
                  href={previewItem.url}
                  download={previewItem.filename}
                  className="px-4 py-2 bg-[#c5a059] text-[#1a1412] rounded-lg text-sm font-bold hover:bg-[#b38f4a] transition-colors"
                >
                  {t("common.download")}
                </a>
                <button
                  onClick={() => setPreviewItem(null)}
                  className="px-4 py-2 bg-[#2a201c] border border-[#3a2a22] text-[#f7f1e6] rounded-lg text-sm font-medium hover:bg-[#3a2a22] transition-colors"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
