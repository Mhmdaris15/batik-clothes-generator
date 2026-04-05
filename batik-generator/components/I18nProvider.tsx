"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { dictionaries, isSupportedLang, type Lang, translate } from "@/lib/i18n-dictionary";

type I18nContextValue = {
  lang: Lang;
  setLang: (nextLang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "batik_lang";
const COOKIE_KEY = "batik_lang";

type Props = {
  children: React.ReactNode;
};

export default function I18nProvider({ children }: Props) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") {
      return "en";
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isSupportedLang(saved)) {
      return saved;
    }

    const cookieLang = document.cookie
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${COOKIE_KEY}=`))
      ?.split("=")[1];

    if (cookieLang && isSupportedLang(cookieLang)) {
      return cookieLang;
    }

    return "en";
  });

  const setLang = (nextLang: Lang) => {
    setLangState(nextLang);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, nextLang);
    }
    if (typeof document !== "undefined") {
      document.cookie = `${COOKIE_KEY}=${nextLang}; Path=/; Max-Age=31536000; SameSite=Lax`;
    }
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

export { dictionaries };
