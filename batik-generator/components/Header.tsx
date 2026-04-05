"use client";

import { Bell, Search, User, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import type { Lang } from "@/lib/i18n-dictionary";
import { motion } from "framer-motion";
import { useState } from "react";

export default function Header() {
  const { lang, setLang, t } = useI18n();
  const router = useRouter();
  const [searchFocused, setSearchFocused] = useState(false);
  const [hasNotif] = useState(true);

  function onLanguageChange(nextLang: Lang) {
    setLang(nextLang);
    router.refresh();
  }

  return (
    <motion.header
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="h-16 bg-[#1a1412]/80 backdrop-blur-md border-b border-[#3a2a22] flex items-center justify-between px-4 sm:px-6 md:px-8 sticky top-0 z-20"
      style={{ backgroundImage: "radial-gradient(at 100% 0%, rgba(197,160,89,0.05) 0px, transparent 60%)" }}
    >
      {/* Left: search */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="relative hidden md:block w-full max-w-sm">
          <motion.div
            animate={{ scale: searchFocused ? 1.01 : 1 }}
            transition={{ duration: 0.15 }}
          >
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200"
              size={15}
              style={{ color: searchFocused ? "#c5a059" : "#8b7e6a" }}
            />
            <input
              type="text"
              placeholder={t("header.searchPlaceholder")}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full bg-[#2a201c] border border-[#3a2a22] rounded-full py-2 pl-9 pr-4 text-sm text-[#f7f1e6] placeholder-[#8b7e6a] focus:outline-none transition-all duration-200"
              style={{
                borderColor: searchFocused ? "rgba(197,160,89,0.5)" : undefined,
                boxShadow: searchFocused ? "0 0 0 3px rgba(197,160,89,0.08)" : undefined,
              }}
            />
          </motion.div>
        </div>

        {/* Mobile title */}
        <div className="md:hidden flex items-center gap-2">
          <Sparkles size={14} className="text-[#c5a059]" />
          <p className="text-sm font-semibold text-[#f7f1e6]">{t("header.titleMobile")}</p>
        </div>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Language selector */}
        <label className="flex items-center gap-2 text-xs text-[#a89f91]">
          <span className="hidden lg:inline text-[#8b7e6a]">{t("header.language")}</span>
          <select
            value={lang}
            onChange={(e) => onLanguageChange(e.target.value as Lang)}
            className="bg-[#2a201c] border border-[#3a2a22] rounded-lg px-2 py-1.5 text-xs text-[#f7f1e6] focus:outline-none focus:border-[#c5a059] transition-colors cursor-pointer"
            aria-label={t("header.language")}
          >
            <option value="id">{t("header.langId")}</option>
            <option value="en">{t("header.langEn")}</option>
            <option value="ru">{t("header.langRu")}</option>
          </select>
        </label>

        {/* Notification bell */}
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-[#2a201c] border border-[#3a2a22] text-[#a89f91] hover:text-[#f7f1e6] hover:border-[#c5a05950] transition-colors"
        >
          <Bell size={16} />
          {hasNotif && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#c5a059] rounded-full border border-[#1a1412]"
            />
          )}
        </motion.button>

        {/* User profile */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-[#3a2a22]">
          <div className="hidden md:block text-right">
            <p className="text-sm font-semibold text-[#f7f1e6] leading-tight">Aris</p>
            <p className="text-[10px] text-[#8b7e6a] leading-tight">{t("header.userRole")}</p>
          </div>
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-9 h-9 bg-[#2a201c] rounded-full flex items-center justify-center border border-[#c5a05960] cursor-pointer"
            style={{ boxShadow: "0 0 12px rgba(197,160,89,0.12)" }}
          >
            <User size={16} className="text-[#c5a059]" />
          </motion.div>
        </div>
      </div>
    </motion.header>
  );
}
