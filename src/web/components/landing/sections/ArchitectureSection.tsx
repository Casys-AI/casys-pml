/**
 * ArchitectureSection - Visual representation of PML Gateway architecture
 *
 * Shows the flow: Clients -> PML Gateway -> MCP Servers
 * Highlights the 3 pillars: Model-Agnostic, Observability, Intelligence
 *
 * @module web/components/landing/sections/ArchitectureSection
 */

export function ArchitectureSection() {
  return (
    <section class="relative py-16 px-8 sm:py-12 sm:px-5 bg-[#08080a]">
      <div class="max-w-[1100px] mx-auto">
        <div class="text-center mb-10">
          <p class="font-mono text-[0.7rem] font-medium text-pml-accent uppercase tracking-[0.2em] mb-3">
            Architecture
          </p>
          <h2 class="font-serif text-[clamp(1.5rem,3vw,2.25rem)] font-normal text-stone-100 mb-3">
            How it works
          </h2>
          <p class="text-[0.95rem] text-stone-400 max-w-[480px] mx-auto leading-relaxed">
            A unified gateway that connects any LLM to any MCP server, with full observability and continuous learning.
          </p>
        </div>

        <div class="hidden md:flex items-center justify-center gap-2">
          <div class="flex flex-col items-center gap-4 self-start">
            <div class="font-mono text-[0.7rem] font-semibold text-stone-500 uppercase tracking-[0.1em]">
              Clients
            </div>
            <div class="flex flex-col gap-2 p-5 rounded-xl bg-white/[0.02] border border-pml-accent/15 min-w-[120px]">
              <div class="font-mono text-[0.8rem] text-stone-400 py-1.5 px-3 bg-pml-accent/5 rounded-md text-center">Claude</div>
              <div class="font-mono text-[0.8rem] text-stone-400 py-1.5 px-3 bg-pml-accent/5 rounded-md text-center">GPT</div>
              <div class="font-mono text-[0.8rem] text-stone-400 py-1.5 px-3 bg-pml-accent/5 rounded-md text-center">Gemini</div>
              <div class="font-mono text-[0.8rem] text-stone-400 py-1.5 px-3 bg-pml-accent/5 rounded-md text-center">Ollama</div>
              <div class="font-mono text-[0.7rem] text-stone-600 text-center">(Any LLM)</div>
            </div>
            <div class="flex items-center gap-2 mt-3 py-1.5 px-3 rounded-md bg-pml-accent/5 border border-pml-accent/15">
              <span class="font-mono text-[0.65rem] font-bold text-[#08080a] bg-pml-accent w-[18px] h-[18px] flex items-center justify-center rounded-full">1</span>
              <span class="font-sans text-[0.7rem] font-medium text-pml-accent uppercase tracking-[0.05em]">Model-Agnostic</span>
            </div>
          </div>

          <div class="px-1">
            <svg viewBox="0 0 60 24" class="w-[50px] h-6">
              <defs>
                <linearGradient id="arrowGradH" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFB86F" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#FFB86F" stopOpacity="0.8" />
                </linearGradient>
              </defs>
              <path d="M0 12 L50 12 M44 6 L50 12 L44 18" stroke="url(#arrowGradH)" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </div>

          <div class="flex flex-col items-center gap-4 self-center">
            <div class="font-mono text-[0.7rem] font-semibold text-stone-500 uppercase tracking-[0.1em]">
              PML Gateway
            </div>
            <div class="p-5 rounded-xl bg-pml-accent/[0.03] border border-pml-accent/25 min-w-[340px]">
              <div class="flex items-center justify-center gap-2 mb-4">
                <div class="font-mono text-[0.75rem] font-medium text-stone-100 py-2 px-3 bg-[#0d0d10] border border-pml-accent/20 rounded-md">Registry</div>
                <span class="text-pml-accent opacity-50 text-[0.8rem]">→</span>
                <div class="font-mono text-[0.75rem] font-medium text-stone-100 py-2 px-3 bg-[#0d0d10] border border-pml-accent/20 rounded-md">DAG</div>
                <span class="text-pml-accent opacity-50 text-[0.8rem]">→</span>
                <div class="font-mono text-[0.75rem] font-medium text-stone-100 py-2 px-3 bg-[#0d0d10] border border-pml-accent/20 rounded-md">Sandbox</div>
              </div>
              <div class="flex items-center justify-center gap-3 pt-4 border-t border-dashed border-pml-accent/15">
                <div class="font-mono text-[0.7rem] text-green-400 py-2 px-3 bg-[#0d0d10] border border-green-400/30 rounded-md">
                  Symbolic World Model
                </div>
                <span class="font-mono text-[0.65rem] text-green-400 opacity-70">← learn</span>
                <div class="font-mono text-[0.7rem] text-blue-400 py-2 px-3 bg-[#0d0d10] border border-blue-400/30 rounded-md">
                  Observability
                </div>
              </div>
            </div>
            <div class="flex gap-3 mt-3">
              <div class="flex items-center gap-2 py-1.5 px-3 rounded-md bg-blue-400/5 border border-blue-400/20">
                <span class="font-mono text-[0.65rem] font-bold text-[#08080a] bg-blue-400 w-[18px] h-[18px] flex items-center justify-center rounded-full">2</span>
                <span class="font-sans text-[0.7rem] font-medium text-blue-400 uppercase tracking-[0.05em]">Observability</span>
              </div>
              <div class="flex items-center gap-2 py-1.5 px-3 rounded-md bg-green-400/5 border border-green-400/20">
                <span class="font-mono text-[0.65rem] font-bold text-[#08080a] bg-green-400 w-[18px] h-[18px] flex items-center justify-center rounded-full">3</span>
                <span class="font-sans text-[0.7rem] font-medium text-green-400 uppercase tracking-[0.05em]">Intelligence</span>
              </div>
            </div>
          </div>

          <div class="px-1">
            <svg viewBox="0 0 60 24" class="w-[50px] h-6">
              <path d="M0 12 L50 12 M44 6 L50 12 L44 18" stroke="url(#arrowGradH)" strokeWidth="2" fill="none" strokeLinecap="round" />
            </svg>
          </div>

          <div class="flex flex-col items-center gap-4 self-start">
            <div class="font-mono text-[0.7rem] font-semibold text-stone-500 uppercase tracking-[0.1em]">
              MCP Servers
            </div>
            <div class="flex flex-col gap-2 p-5 rounded-xl bg-white/[0.02] border border-pml-accent/15 min-w-[120px]">
              <div class="font-mono text-[0.8rem] text-stone-400 py-1.5 px-3 bg-pml-accent/5 rounded-md text-center">filesystem</div>
              <div class="font-mono text-[0.8rem] text-stone-400 py-1.5 px-3 bg-pml-accent/5 rounded-md text-center">postgres</div>
              <div class="font-mono text-[0.8rem] text-stone-400 py-1.5 px-3 bg-pml-accent/5 rounded-md text-center">github</div>
              <div class="font-mono text-[0.8rem] text-stone-400 py-1.5 px-3 bg-pml-accent/5 rounded-md text-center">memory</div>
              <div class="font-mono text-[0.7rem] text-stone-600 text-center">(Any Tools)</div>
            </div>
          </div>
        </div>

        <div class="flex md:hidden flex-col items-center gap-2">
          <div class="w-full max-w-[320px] p-5 rounded-xl bg-white/[0.02] border border-pml-accent/15 text-center">
            <div class="font-mono text-[0.7rem] font-semibold text-pml-accent uppercase tracking-[0.1em] mb-3">
              Any LLM Client
            </div>
            <div class="font-mono text-[0.8rem] text-stone-400">
              Claude · GPT · Gemini · Ollama
            </div>
          </div>
          <div class="text-xl text-pml-accent opacity-50">↓</div>
          <div class="w-full max-w-[320px] p-5 sm:p-4 rounded-xl bg-pml-accent/[0.03] border border-pml-accent/25 text-center">
            <div class="font-mono text-[0.7rem] font-semibold text-pml-accent uppercase tracking-[0.1em] mb-3">
              PML Gateway
            </div>
            <div class="flex justify-center gap-2 flex-wrap mb-4">
              <span class="font-mono text-[0.7rem] sm:text-[0.65rem] text-stone-100 py-1.5 px-2.5 sm:py-1 sm:px-2 bg-[#0d0d10] border border-pml-accent/20 rounded-md">Registry</span>
              <span class="font-mono text-[0.7rem] sm:text-[0.65rem] text-stone-100 py-1.5 px-2.5 sm:py-1 sm:px-2 bg-[#0d0d10] border border-pml-accent/20 rounded-md">DAG Executor</span>
              <span class="font-mono text-[0.7rem] sm:text-[0.65rem] text-stone-100 py-1.5 px-2.5 sm:py-1 sm:px-2 bg-[#0d0d10] border border-pml-accent/20 rounded-md">Sandbox</span>
            </div>
            <div class="flex justify-center gap-3 pt-3 border-t border-dashed border-pml-accent/15">
              <span class="font-mono text-[0.65rem] text-green-400 py-1 px-2 bg-green-400/10 border border-green-400/20 rounded">Symbolic World Model</span>
              <span class="font-mono text-[0.65rem] text-blue-400 py-1 px-2 bg-blue-400/10 border border-blue-400/20 rounded">Observability</span>
            </div>
          </div>
          <div class="text-xl text-pml-accent opacity-50">↓</div>
          <div class="w-full max-w-[320px] p-5 rounded-xl bg-white/[0.02] border border-pml-accent/15 text-center">
            <div class="font-mono text-[0.7rem] font-semibold text-pml-accent uppercase tracking-[0.1em] mb-3">
              MCP Servers
            </div>
            <div class="font-mono text-[0.8rem] text-stone-400">
              filesystem · postgres · github · (Any Tools)
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
