"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, Image as ImageIcon, Settings, Layers } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { motion, AnimatePresence, type Variants } from "framer-motion";

const navItems = [
  { key: "nav.dashboard", href: "/",          icon: Home },
  { key: "nav.capture",   href: "/capture",   icon: Camera },
  { key: "nav.workspace", href: "/workspace", icon: Layers },
  { key: "nav.gallery",   href: "/gallery",   icon: ImageIcon },
  { key: "nav.settings",  href: "/settings",  icon: Settings },
];

const sidebarVariants: Variants = {
  hidden: { x: -20, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.3, staggerChildren: 0.05 },
  },
};

const navItemVariants: Variants = {
  hidden: { x: -12, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { duration: 0.25 } },
};

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <motion.aside
        initial="hidden"
        animate="visible"
        variants={sidebarVariants}
        className="hidden md:flex w-64 flex-col h-screen sticky top-0 border-r border-[#3a2a22] bg-[#1a1412]"
        style={{ backgroundImage: "radial-gradient(at 0% 100%, rgba(197,160,89,0.06) 0px, transparent 60%)" }}
      >
        {/* Logo */}
        <div className="p-5 flex items-center gap-3 border-b border-[#3a2a22]">
          <motion.div
            whileHover={{ rotate: 10, scale: 1.08 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="w-9 h-9 rounded-xl overflow-hidden border border-[#c5a05940] shadow-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/itmo-logo.png" alt="ITMO" className="w-full h-full object-contain" />
          </motion.div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-[#f7f1e6] tracking-tight">Batik Clothes</span>
            <span className="text-[10px] text-[#c5a059] font-semibold tracking-widest uppercase">Generator</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            const label = t(item.key);

            return (
              <motion.div key={item.key} variants={navItemVariants}>
                <Link href={item.href} className="block relative">
                  {/* Active background pill */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-pill"
                        className="absolute inset-0 rounded-xl bg-[#c5a05918] border border-[#c5a05940]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      />
                    )}
                  </AnimatePresence>

                  <motion.div
                    whileHover={{ x: 3 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150 ${
                      isActive ? "text-[#e7cf9d]" : "text-[#a89f91] hover:text-[#f7f1e6]"
                    }`}
                  >
                    <motion.div
                      animate={{ color: isActive ? "#c5a059" : "#8b7e6a" }}
                      transition={{ duration: 0.2 }}
                    >
                      <Icon size={18} />
                    </motion.div>
                    <span className="font-medium text-sm">{label}</span>

                    {/* Active dot */}
                    {isActive && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="ml-auto w-1.5 h-1.5 rounded-full bg-[#c5a059]"
                      />
                    )}
                  </motion.div>
                </Link>
              </motion.div>
            );
          })}
        </nav>

        {/* Bottom panel */}
        <motion.div
          variants={navItemVariants}
          className="p-3 border-t border-[#3a2a22] space-y-2"
        >
          <div className="bg-[#2a201c] rounded-xl p-3 border border-[#3a2a22]">
            <p className="text-[10px] text-[#8b7e6a] mb-2 uppercase tracking-widest font-bold">
              {t("nav.currentModel")}
            </p>
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ scale: [1, 1.4, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="w-2 h-2 rounded-full bg-green-500"
              />
              <span className="text-sm font-semibold text-[#e7cf9d]">Imagen 4</span>
            </div>
          </div>

          <div className="px-2 py-1 text-center">
            <p className="text-[10px] text-[#5a4e42]">{t("nav.developerBy")}</p>
            <a
              href="https://github.com/Mhmdaris15/"
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-[#c5a059] hover:text-[#e7cf9d] transition-colors hover:underline"
            >
              {t("nav.developerLabel")}
            </a>
          </div>
        </motion.div>
      </motion.aside>

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#3a2a22] bg-[#1a1412]/95 backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5 gap-1 px-2 py-2 safe-area-inset-bottom">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            const label = t(item.key);

            return (
              <Link key={item.key} href={item.href} className="relative flex flex-col items-center justify-center gap-1 py-2 rounded-lg">
                {isActive && (
                  <motion.div
                    layoutId="mobile-active-pill"
                    className="absolute inset-0 rounded-lg bg-[#c5a05918]"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <motion.div
                  whileTap={{ scale: 0.85 }}
                  className="relative flex flex-col items-center gap-0.5"
                >
                  <Icon
                    size={18}
                    className={isActive ? "text-[#c5a059]" : "text-[#8b7e6a]"}
                  />
                  <span className={`text-[10px] font-medium leading-none ${isActive ? "text-[#e7cf9d]" : "text-[#8b7e6a]"}`}>
                    {label.split(" ")[0]}
                  </span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
