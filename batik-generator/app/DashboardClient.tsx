"use client";

import Link from "next/link";
import { ArrowRight, Image as ImageIcon, Layers, Zap, Sparkles, Camera } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { useEffect, useRef, useState } from "react";

type Stat = {
  icon: string;
  label: string;
  value: number | string;
  suffix: string;
  color: string;
  isText?: boolean;
};

type Generation = {
  id: number;
  title: string;
  subtitle: string;
  src: string;
  date: string;
};

type Props = {
  stats: Stat[];
  recentGenerations: Generation[];
  newGenerationLabel: string;
  welcomeLabel: string;
  subtitleLabel: string;
  recentLabel: string;
  viewAllLabel: string;
  emptyTitleLabel: string;
  emptyCtaLabel: string;
  detailsLabel: string;
};

function StatIcon({ icon, color }: { icon: string; color: string }) {
  const cls = "w-5 h-5";
  if (icon === "image") return <ImageIcon className={cls} style={{ color }} />;
  if (icon === "layers") return <Layers className={cls} style={{ color }} />;
  return <Zap className={cls} style={{ color }} />;
}

function AnimatedNumber({ target }: { target: number }) {
  const [count, setCount] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return <>{count}</>;
}

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function DashboardClient({
  stats,
  recentGenerations,
  newGenerationLabel,
  welcomeLabel,
  subtitleLabel,
  recentLabel,
  viewAllLabel,
  emptyTitleLabel,
  emptyCtaLabel,
  detailsLabel,
}: Props) {
  return (
    <motion.div
      className="space-y-8 max-w-7xl"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Hero row ──────────────────────────────────────────────────── */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <div className="flex items-center gap-2 mb-2">
            <motion.div
              animate={{ rotate: [0, 12, -6, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            >
              <Sparkles size={16} className="text-[#c5a059]" />
            </motion.div>
            <span className="text-xs font-bold uppercase tracking-widest text-[#c5a059]">
              Batik AI Studio
            </span>
          </div>
          <h1 className="text-3xl font-bold text-[#f7f1e6] leading-tight">{welcomeLabel}</h1>
          <p className="text-[#a89f91] mt-1 text-sm">{subtitleLabel}</p>
        </div>

        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Link
            href="/capture"
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-[#120e0c] text-sm relative overflow-hidden group"
            style={{ background: "linear-gradient(135deg, #c5a059, #e7cf9d, #c5a059)", backgroundSize: "200% 100%" }}
          >
            <motion.div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: "linear-gradient(135deg, #b38f4a, #d4b870)" }}
            />
            <Camera size={16} className="relative z-10" />
            <span className="relative z-10">{newGenerationLabel}</span>
          </Link>
        </motion.div>
      </motion.div>

      {/* Gold divider */}
      <motion.div variants={itemVariants} className="gold-divider" />

      {/* ── Stats grid ────────────────────────────────────────────────── */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            variants={itemVariants}
            whileHover={{ y: -3, boxShadow: "0 12px 32px rgba(0,0,0,0.3)" }}
            className="bg-[#1a1412] border border-[#3a2a22] rounded-2xl p-5 flex items-center gap-4 cursor-default"
            style={{ transition: "box-shadow 0.3s ease" }}
          >
            <motion.div
              whileHover={{ rotate: 10 }}
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${stat.color}18`, border: `1px solid ${stat.color}30` }}
            >
              <StatIcon icon={stat.icon} color={stat.color} />
            </motion.div>
            <div>
              <p className="text-xs text-[#8b7e6a] font-medium mb-0.5">{stat.label}</p>
              <p className="text-2xl font-bold text-[#f7f1e6] leading-none">
                {stat.isText ? (
                  stat.value
                ) : (
                  <AnimatedNumber target={stat.value as number} />
                )}
                {stat.suffix && <span className="text-sm text-[#a89f91] ml-1">{stat.suffix}</span>}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Recent generations ────────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 rounded-full bg-[#c5a059]" />
            <h2 className="text-lg font-bold text-[#f7f1e6]">{recentLabel}</h2>
          </div>
          <motion.div whileHover={{ x: 3 }} transition={{ duration: 0.15 }}>
            <Link
              href="/gallery"
              className="flex items-center gap-1.5 text-sm font-medium text-[#c5a059] hover:text-[#e7cf9d] transition-colors"
            >
              {viewAllLabel}
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        </div>

        {recentGenerations.length === 0 ? (
          <motion.div
            variants={itemVariants}
            className="py-16 text-center border border-dashed border-[#3a2a22] rounded-2xl batik-pattern-overlay"
          >
            <motion.div
              animate={{ y: [0, -6, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="w-14 h-14 rounded-2xl bg-[#c5a05918] border border-[#c5a05930] flex items-center justify-center mx-auto mb-4"
            >
              <ImageIcon size={24} className="text-[#c5a059]" />
            </motion.div>
            <p className="text-[#a89f91] mb-3">{emptyTitleLabel}</p>
            <Link
              href="/capture"
              className="text-sm font-semibold text-[#c5a059] hover:text-[#e7cf9d] transition-colors underline-offset-4 hover:underline"
            >
              {emptyCtaLabel}
            </Link>
          </motion.div>
        ) : (
          <motion.div
            variants={containerVariants}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
          >
            {recentGenerations.map((item, i) => (
              <motion.div
                key={item.id}
                variants={itemVariants}
                custom={i}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.2 }}
              >
                <Link
                  href="/gallery"
                  className="group block bg-[#1a1412] border border-[#3a2a22] rounded-2xl overflow-hidden card-hover-glow"
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#2a201c]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.src}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#120e0c] via-[#120e0c]/30 to-transparent" />
                    {/* Info */}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-[10px] text-[#c5a059] font-bold uppercase tracking-widest mb-0.5 truncate">
                        {item.subtitle}
                      </p>
                      <h3 className="text-sm font-bold text-white leading-tight truncate capitalize">
                        {item.title}
                      </h3>
                    </div>
                    {/* Hover overlay */}
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ background: "rgba(18,14,12,0.5)", backdropFilter: "blur(2px)" }}
                    >
                      <span className="text-xs font-semibold text-[#e7cf9d] border border-[#c5a05960] px-3 py-1.5 rounded-full bg-[#120e0c]/60">
                        {detailsLabel}
                      </span>
                    </motion.div>
                  </div>

                  <div className="px-3 py-2 flex items-center justify-between border-t border-[#3a2a22]">
                    <span className="text-[10px] text-[#5a4e42]">{item.date}</span>
                    <ArrowRight size={12} className="text-[#c5a059] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}
