import Link from "next/link";
import Image from "next/image";

const latestCreations = [
  {
    title: "Mega Mendung",
    subtitle: "Cirebon Style",
    src: "/megamendung-batik-man.png",
  },
  {
    title: "Kawung",
    subtitle: "Yogyakarta Style",
    src: "/yogyakarta-batik-woman-kalawung.png",
  },
  {
    title: "Parang Barong",
    subtitle: "Royal Court Style",
    src: "/solo-parang-batik-man.png",
  },
  {
    title: "Batik Kontemporer",
    subtitle: "Modern Fusion",
    src: "/contemporary-batik-streetwear-portrait.png",
  },
];

export default function Home() {
  return (
    <main className="batik-bg min-h-screen text-[#f7f1e6]">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-6 py-10 md:px-10">
        <header className="glass-panel mb-8 flex items-center justify-between rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <Image src="/Minimal-geometric-batik-emblem.png" alt="BatikGen emblem" width={28} height={28} className="rounded-md" />
            <h1 className="text-xl font-bold tracking-tight">BatikGen</h1>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/capture" className="rounded-lg bg-[#8b5e3c] px-4 py-2 font-semibold text-white hover:bg-[#70482d]">
              Get Started
            </Link>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 inline-flex items-center rounded-full border border-[#c5a05966] bg-[#c5a0591a] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#e7cf9d]">
              AI-Powered Tradition
            </p>
            <h2 className="text-4xl font-black leading-tight md:text-6xl">
              Reimagine Yourself in <span className="gold-gradient-text">Nusantara Batik</span>
            </h2>
            <p className="mt-5 max-w-xl text-base text-[#e7ddd0cc] md:text-lg">
              Upload your portrait, select regional style and outfit, then generate culturally rich batik visuals ready to share.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/capture" className="rounded-lg bg-gradient-to-r from-[#8b5e3c] to-[#c58f56] px-6 py-3 font-bold text-white">
                Create My Portrait
              </Link>
              <Link href="/workspace" className="rounded-lg border border-[#d9c19666] bg-[#ffffff0d] px-6 py-3 font-medium text-[#f7f1e6]">
                View Workspace
              </Link>
            </div>
          </div>

          <div className="glass-panel overflow-hidden rounded-2xl p-2">
            <Image src="/woman-batik-hero.png" alt="Hero batik portrait" width={970} height={520} className="h-auto w-full rounded-xl" priority />
          </div>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          <article className="glass-panel rounded-2xl p-5">
            <h3 className="text-lg font-bold">1. Face Capture</h3>
            <p className="mt-2 text-sm text-[#e5d9c8b3]">Upload clear front-facing image with selection controls.</p>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h3 className="text-lg font-bold">2. Style Selection</h3>
            <p className="mt-2 text-sm text-[#e5d9c8b3]">Choose region, gender, and outfit from curated Indonesian data.</p>
          </article>
          <article className="glass-panel rounded-2xl p-5">
            <h3 className="text-lg font-bold">3. Generate Results</h3>
            <p className="mt-2 text-sm text-[#e5d9c8b3]">Generate 1–4 outputs and review in high-quality workspace gallery.</p>
          </article>
        </section>

        <section className="mt-14">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h3 className="text-3xl font-black leading-tight">Latest Creations</h3>
              <p className="mt-2 text-sm text-[#e7ddd0cc]">Showcase gallery inspired by Stitch design. Replace placeholders with your final generated assets.</p>
            </div>
            <Link href="/workspace" className="text-sm font-semibold text-[#dcbf8a] hover:text-[#f5e0b7]">
              View All →
            </Link>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {latestCreations.map((item) => (
              <article key={item.title} className="glass-panel group relative overflow-hidden rounded-2xl p-2">
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl">
                  <Image src={item.src} alt={item.title} fill className="object-cover opacity-90 transition duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="text-xs text-[#e7cf9d]">{item.subtitle}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="glass-panel relative mt-14 flex flex-col items-center justify-between gap-4 overflow-hidden rounded-2xl px-6 py-6 text-sm text-[#e7ddd0cc] md:flex-row">
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-20"
            style={{ backgroundImage: "url('/pattern-batik-cta.png')", backgroundSize: "cover", backgroundPosition: "center" }}
          />
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-[#f5e2bf]">BatikGen</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a href="#" className="hover:text-white">Privacy Policy</a>
            <a href="#" className="hover:text-white">Terms of Service</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
