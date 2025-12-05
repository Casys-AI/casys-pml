// @ts-nocheck
import { page } from "fresh";
import { Head } from "fresh/runtime";

import {
  ThreeLoopIllustration,
  CapabilitiesIllustration,
  HypergraphIllustration,
  StructuralEmergenceIllustration,
  SandboxIllustration,
  HILIllustration,
  SearchIllustration
} from "../components/FeatureIllustrations.tsx";

export const handler = {
  GET(_ctx: any) {
    return page();
  },
};

export default function LandingPage() {
  return (
    <>
      <Head>
        <title>CAI - Collective Agentic Intelligence</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta
          name="description"
          content="The intelligence layer for MCP. Patterns become capabilities. Capabilities become collective. Your agents benefit from what all agents discover."
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div class="page">
        {/* Animated Network Background */}
        <div class="network-bg">
          <svg class="network-svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
            <defs>
              <radialGradient id="node-pulse" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="#FFB86F" stop-opacity="0.8"/>
                <stop offset="100%" stop-color="#FFB86F" stop-opacity="0"/>
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Network connections - animated */}
            <g class="connections" stroke="#FFB86F" stroke-width="1" fill="none" opacity="0.15">
              <path d="M100,200 Q300,100 500,200 T900,150" class="path-1"/>
              <path d="M200,400 Q400,300 600,400 T1000,350" class="path-2"/>
              <path d="M0,600 Q200,500 400,600 T800,550" class="path-3"/>
              <path d="M300,100 L500,300 L700,200 L900,400" class="path-4"/>
              <path d="M100,500 L300,350 L500,500 L700,350 L900,500" class="path-5"/>
            </g>

            {/* Floating nodes */}
            <g class="nodes">
              <circle cx="200" cy="200" r="4" fill="#FFB86F" opacity="0.6" class="node-float-1"/>
              <circle cx="500" cy="300" r="6" fill="#FFB86F" opacity="0.8" class="node-float-2"/>
              <circle cx="800" cy="200" r="3" fill="#FFB86F" opacity="0.5" class="node-float-3"/>
              <circle cx="300" cy="500" r="5" fill="#FFB86F" opacity="0.7" class="node-float-4"/>
              <circle cx="700" cy="450" r="4" fill="#FFB86F" opacity="0.6" class="node-float-5"/>
              <circle cx="1000" cy="300" r="5" fill="#FFB86F" opacity="0.4" class="node-float-6"/>
            </g>

            {/* Data packets traveling along paths */}
            <circle r="3" fill="#FFB86F" filter="url(#glow)">
              <animateMotion dur="8s" repeatCount="indefinite" path="M100,200 Q300,100 500,200 T900,150"/>
            </circle>
            <circle r="2" fill="#FFB86F" filter="url(#glow)">
              <animateMotion dur="10s" repeatCount="indefinite" path="M200,400 Q400,300 600,400 T1000,350"/>
            </circle>
            <circle r="2.5" fill="#FFB86F" filter="url(#glow)">
              <animateMotion dur="12s" repeatCount="indefinite" path="M0,600 Q200,500 400,600 T800,550"/>
            </circle>
          </svg>
        </div>

        {/* Navigation */}
        <header class="header">
          <div class="header-inner">
            <a href="/" class="logo">
              <span class="logo-mark">CAI</span>
              <span class="logo-text">Collective Agentic Intelligence</span>
            </a>
            <nav class="nav">
              <a href="#problem" class="nav-link">Why</a>
              <a href="#how" class="nav-link">How</a>
              <a href="#moat" class="nav-link">Moat</a>
              <a href="/dashboard" class="nav-link">Dashboard</a>
              <a href="https://github.com/Casys-AI/casys-intelligence" class="nav-link nav-link-github" target="_blank" rel="noopener">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              </a>
            </nav>
          </div>
        </header>

        {/* ═══════════════════════════════════════════════════════════════════
            HERO - The Core Promise
        ═══════════════════════════════════════════════════════════════════ */}
        <main class="hero">
          <div class="hero-content">
            <p class="hero-eyebrow">The Intelligence Layer for MCP</p>
            <h1 class="hero-title">
              Patterns become capabilities.<br/>
              Capabilities become <span class="hero-title-accent">collective.</span>
            </h1>
            <p class="hero-desc">
              CAI isn't a gateway. It's where agent intelligence emerges.<br/>
              Every execution reveals patterns. Patterns crystallize into capabilities.<br/>
              The more agents use it, the smarter everyone gets.
            </p>
            <div class="hero-actions">
              <a href="#how" class="btn btn-primary">
                See How It Works
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>
              </a>
              <a href="https://github.com/Casys-AI/casys-intelligence" class="btn btn-ghost" target="_blank" rel="noopener">
                View Source
              </a>
            </div>
          </div>

          {/* The Key Insight */}
          <div class="insight-card">
            <div class="insight-quote">"</div>
            <p class="insight-text">
              Smithery is npm — the packages.<br/>
              <strong>CAI is the intelligent runtime</strong> that knows how to combine them.
            </p>
          </div>
        </main>

        {/* ═══════════════════════════════════════════════════════════════════
            THE PROBLEM
        ═══════════════════════════════════════════════════════════════════ */}
        <section id="problem" class="section-problem">
          <div class="container">
            <div class="problem-grid">
              <div class="problem-content">
                <span class="section-label">The Problem</span>
                <h2 class="problem-title">
                  Agents discover patterns.<br/>
                  <span class="problem-highlight">Then they're lost.</span>
                </h2>
                <p class="problem-desc">
                  Your agent finds a brilliant way to combine three MCPs.
                  Session ends. Pattern gone. Next agent? Rediscovers the same thing.
                </p>
                <p class="problem-desc">
                  No one learns. No patterns get promoted. No capabilities emerge.
                  Every agent reinvents the wheel, alone.
                </p>
              </div>
              <div class="problem-visual">
                <div class="amnesia-diagram">
                  <div class="session session-1">
                    <span class="session-label">Session 1</span>
                    <div class="session-discovery">discovers pattern A</div>
                  </div>
                  <div class="amnesia-arrow">
                    <span>forgotten</span>
                    <svg width="40" height="40" viewBox="0 0 40 40">
                      <path d="M10 20 L30 20 M25 15 L30 20 L25 25" stroke="#f87171" stroke-width="2" fill="none"/>
                    </svg>
                  </div>
                  <div class="session session-2">
                    <span class="session-label">Session 2</span>
                    <div class="session-discovery">re-discovers pattern A</div>
                  </div>
                  <div class="amnesia-arrow">
                    <span>forgotten</span>
                    <svg width="40" height="40" viewBox="0 0 40 40">
                      <path d="M10 20 L30 20 M25 15 L30 20 L25 25" stroke="#f87171" stroke-width="2" fill="none"/>
                    </svg>
                  </div>
                  <div class="session session-3">
                    <span class="session-label">Session 3</span>
                    <div class="session-discovery">re-discovers pattern A</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            THE SOLUTION - Two Levels of Emergence
        ═══════════════════════════════════════════════════════════════════ */}
        <section id="how" class="section-solution">
          <div class="container">
            <div class="section-header">
              <span class="section-label">The Solution</span>
              <h2 class="section-title">Two Levels of Emergence</h2>
              <p class="section-desc">
                CAI tracks how agents combine MCPs — both planned and improvised.<br/>
                Patterns that work get promoted to explicit capabilities.
              </p>
            </div>

            <div class="emergence-grid">
              {/* Level 1: Structural */}
              <div class="emergence-card">
                <div class="emergence-icon">
                  <svg viewBox="0 0 48 48" fill="none">
                    <path d="M8 24h8M32 24h8M24 8v8M24 32v8" stroke="#FFB86F" stroke-width="2"/>
                    <rect x="16" y="16" width="16" height="16" rx="2" stroke="#FFB86F" stroke-width="2"/>
                    <circle cx="8" cy="24" r="3" fill="#FFB86F"/>
                    <circle cx="40" cy="24" r="3" fill="#FFB86F"/>
                    <circle cx="24" cy="8" r="3" fill="#FFB86F"/>
                    <circle cx="24" cy="40" r="3" fill="#FFB86F"/>
                  </svg>
                </div>
                <span class="emergence-level">Level 1</span>
                <h3 class="emergence-title">Structural Emergence</h3>
                <p class="emergence-desc">
                  The orchestrator analyzes intent and builds optimal DAGs.
                  Routes calls intelligently, parallelizes where possible.
                  <strong>Relationships emerge from planning.</strong>
                </p>
                <div class="emergence-visual">
                  <StructuralEmergenceIllustration />
                </div>
              </div>

              {/* Level 2: Behavioral */}
              <div class="emergence-card emergence-card-accent">
                <div class="emergence-icon">
                  <svg viewBox="0 0 48 48" fill="none">
                    <path d="M12 36 L24 12 L36 36" stroke="#a78bfa" stroke-width="2" fill="none"/>
                    <circle cx="24" cy="12" r="4" stroke="#a78bfa" stroke-width="2"/>
                    <circle cx="12" cy="36" r="4" stroke="#a78bfa" stroke-width="2"/>
                    <circle cx="36" cy="36" r="4" stroke="#a78bfa" stroke-width="2"/>
                    <path d="M18 28 Q24 20 30 28" stroke="#a78bfa" stroke-width="2" stroke-dasharray="3 3"/>
                  </svg>
                </div>
                <span class="emergence-level">Level 2</span>
                <h3 class="emergence-title">Behavioral Emergence</h3>
                <p class="emergence-desc">
                  Agents generate code that combines MCPs in improvised ways.
                  Novel combinations that no one designed upfront.
                  <strong>Capabilities emerge from execution.</strong>
                </p>
                <div class="emergence-visual">
                  <CapabilitiesIllustration />
                </div>
              </div>
            </div>

            {/* The Learning Loop */}
            <div class="learning-loop">
              <div class="loop-visual">
                <ThreeLoopIllustration />
              </div>
              <div class="loop-content">
                <h3 class="loop-title">The Three Loops</h3>
                <div class="loop-item">
                  <span class="loop-badge loop-execution">Adaptation</span>
                  <p>Execution → DAG. Immediate correction.</p>
                </div>
                <div class="loop-item">
                  <span class="loop-badge loop-adaptation">Speculation</span>
                  <p>Execution → Patterns. Rule optimization.</p>
                </div>
                <div class="loop-item">
                  <span class="loop-badge loop-meta">Crystallization</span>
                  <p>Execution → Capabilities. Context evolution.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            THE MOAT - Network Effect
        ═══════════════════════════════════════════════════════════════════ */}
        <section id="moat" class="section-moat">
          <div class="container">
            <div class="section-header">
              <span class="section-label">The Moat</span>
              <h2 class="section-title">Network Effect on Capabilities</h2>
              <p class="section-desc">
                The code is 100% open source. The value is in the emerged capabilities.
              </p>
            </div>

            <div class="moat-comparison">
              <div class="moat-card moat-local">
                <div class="moat-header">
                  <span class="moat-icon">💻</span>
                  <h3>Local / Self-Hosted</h3>
                </div>
                <ul class="moat-features">
                  <li>Your instance, your patterns</li>
                  <li>Capabilities from your agents only</li>
                  <li>Isolated learning</li>
                  <li class="moat-feature-highlight">Starts from zero patterns</li>
                </ul>
                <div class="moat-graph">
                  <svg viewBox="0 0 200 80" fill="none">
                    <path d="M10 70 L190 60" stroke="#8a8078" stroke-width="2"/>
                    <text x="100" y="40" fill="#8a8078" font-size="10" text-anchor="middle">Linear growth</text>
                  </svg>
                </div>
              </div>

              <div class="moat-vs">VS</div>

              <div class="moat-card moat-hosted">
                <div class="moat-header">
                  <span class="moat-icon">🌐</span>
                  <h3>Hosted / Collective</h3>
                </div>
                <ul class="moat-features">
                  <li>Every execution reveals patterns</li>
                  <li>Patterns promoted into capabilities</li>
                  <li>Collective learning</li>
                  <li class="moat-feature-highlight">Starts with everyone's capabilities</li>
                </ul>
                <div class="moat-graph">
                  <svg viewBox="0 0 200 80" fill="none">
                    <path d="M10 70 Q60 65 100 40 T190 10" stroke="#FFB86F" stroke-width="2"/>
                    <text x="100" y="60" fill="#FFB86F" font-size="10" text-anchor="middle">Exponential growth</text>
                  </svg>
                </div>
              </div>
            </div>

            <div class="moat-insight">
              <p>
                A fork starts with zero patterns. Zero capabilities.<br/>
                <strong>The value is in the learned patterns, not the code.</strong>
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            TECHNICAL FOUNDATION
        ═══════════════════════════════════════════════════════════════════ */}
        <section class="section-tech">
          <div class="container">
            <div class="section-header">
              <span class="section-label">Under the Hood</span>
              <h2 class="section-title">Built for Emergence</h2>
            </div>

            <div class="tech-grid">
              <div class="tech-card">
                <div class="tech-icon">
                  <HypergraphIllustration />
                </div>
                <h4>Hypergraph Structure</h4>
                <p>N-ary relationships capture how tools combine into capabilities. Not just pairs — full patterns.</p>
              </div>

              <div class="tech-card">
                <div class="tech-icon">
                  <SandboxIllustration />
                </div>
                <h4>Secure Sandbox</h4>
                <p>Deno runtime executes generated code safely. PII filtering before storage.</p>
              </div>

              <div class="tech-card">
                <div class="tech-icon">
                  <HILIllustration />
                </div>
                <h4>Human-in-the-Loop</h4>
                <p>Granular AIL/HIL checkpoints. Approve sensitive operations before execution.</p>
              </div>

              <div class="tech-card">
                <div class="tech-icon">
                  <SearchIllustration />
                </div>
                <h4>Semantic Routing</h4>
                <p>BGE embeddings understand intent. Find tools by description, not memorization.</p>
              </div>
            </div>

            <div class="tech-stats">
              <div class="stat">
                <span class="stat-value">229×</span>
                <span class="stat-label">Context Reduction</span>
              </div>
              <div class="stat">
                <span class="stat-value">∞</span>
                <span class="stat-label">Emergent Capabilities</span>
              </div>
              <div class="stat">
                <span class="stat-value">15+</span>
                <span class="stat-label">MCP Servers</span>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            CTA
        ═══════════════════════════════════════════════════════════════════ */}
        <section class="section-cta">
          <div class="container">
            <div class="cta-content">
              <h2>Ready to stop reinventing?</h2>
              <p>Self-host with full control, or join the collective intelligence.</p>
              <div class="cta-actions">
                <a href="https://github.com/Casys-AI/casys-intelligence" class="btn btn-primary" target="_blank" rel="noopener">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  Clone & Self-Host
                </a>
                <a href="https://casys.ai" class="btn btn-accent" target="_blank" rel="noopener">
                  Join the Collective
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer class="footer">
          <div class="footer-inner">
            <div class="footer-brand">
              <span class="logo-mark">CAI</span>
              <span class="footer-tagline">Collective Agentic Intelligence</span>
            </div>
            <div class="footer-links">
              <a href="https://casys.ai" target="_blank" rel="noopener">Casys.ai</a>
              <a href="https://github.com/Casys-AI/casys-intelligence" target="_blank" rel="noopener">GitHub</a>
              <a href="/dashboard">Dashboard</a>
            </div>
          </div>
        </footer>

        <style>{`
          /* ═══════════════════════════════════════════════════════════════════
             DESIGN TOKENS
          ═══════════════════════════════════════════════════════════════════ */
          :root {
            --bg: #08080a;
            --bg-elevated: #0f0f12;
            --bg-card: #141418;
            --accent: #FFB86F;
            --accent-dim: rgba(255, 184, 111, 0.1);
            --accent-medium: rgba(255, 184, 111, 0.2);
            --purple: #a78bfa;
            --green: #4ade80;
            --red: #f87171;
            --text: #f0ede8;
            --text-muted: #a8a29e;
            --text-dim: #6b6560;
            --border: rgba(255, 184, 111, 0.08);
            --border-strong: rgba(255, 184, 111, 0.15);

            --font-display: 'Instrument Serif', Georgia, serif;
            --font-sans: 'Geist', -apple-system, system-ui, sans-serif;
            --font-mono: 'Geist Mono', monospace;
          }

          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          /* ═══════════════════════════════════════════════════════════════════
             BASE LAYOUT
          ═══════════════════════════════════════════════════════════════════ */
          .page {
            min-height: 100vh;
            background: var(--bg);
            color: var(--text);
            font-family: var(--font-sans);
            position: relative;
            overflow-x: hidden;
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 0 2rem;
          }

          /* ═══════════════════════════════════════════════════════════════════
             ANIMATED NETWORK BACKGROUND
          ═══════════════════════════════════════════════════════════════════ */
          .network-bg {
            position: fixed;
            inset: 0;
            z-index: 0;
            pointer-events: none;
            opacity: 0.4;
          }

          .network-svg {
            width: 100%;
            height: 100%;
          }

          .connections path {
            stroke-dasharray: 1000;
            stroke-dashoffset: 1000;
            animation: draw-path 20s ease-in-out infinite;
          }

          .path-1 { animation-delay: 0s; }
          .path-2 { animation-delay: 2s; }
          .path-3 { animation-delay: 4s; }
          .path-4 { animation-delay: 6s; }
          .path-5 { animation-delay: 8s; }

          @keyframes draw-path {
            0%, 100% { stroke-dashoffset: 1000; }
            50% { stroke-dashoffset: 0; }
          }

          .node-float-1 { animation: float 8s ease-in-out infinite; }
          .node-float-2 { animation: float 10s ease-in-out infinite 1s; }
          .node-float-3 { animation: float 12s ease-in-out infinite 2s; }
          .node-float-4 { animation: float 9s ease-in-out infinite 3s; }
          .node-float-5 { animation: float 11s ease-in-out infinite 4s; }
          .node-float-6 { animation: float 7s ease-in-out infinite 5s; }

          @keyframes float {
            0%, 100% { transform: translate(0, 0); }
            25% { transform: translate(10px, -15px); }
            50% { transform: translate(-5px, 10px); }
            75% { transform: translate(15px, 5px); }
          }

          /* ═══════════════════════════════════════════════════════════════════
             HEADER
          ═══════════════════════════════════════════════════════════════════ */
          .header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 100;
            padding: 1rem 2rem;
            background: rgba(8, 8, 10, 0.8);
            backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
          }

          .header-inner {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .logo {
            display: flex;
            align-items: center;
            gap: 1rem;
            text-decoration: none;
          }

          .logo-mark {
            font-family: var(--font-display);
            font-size: 1.5rem;
            font-weight: 400;
            color: var(--accent);
            letter-spacing: -0.02em;
          }

          .logo-text {
            font-size: 0.75rem;
            color: var(--text-dim);
            letter-spacing: 0.1em;
            text-transform: uppercase;
          }

          .nav {
            display: flex;
            align-items: center;
            gap: 2rem;
          }

          .nav-link {
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.875rem;
            font-weight: 500;
            transition: color 0.2s;
          }

          .nav-link:hover {
            color: var(--text);
          }

          .nav-link-github {
            display: flex;
            align-items: center;
            padding: 0.5rem;
            border-radius: 6px;
            transition: background 0.2s;
          }

          .nav-link-github:hover {
            background: var(--accent-dim);
          }

          /* ═══════════════════════════════════════════════════════════════════
             HERO
          ═══════════════════════════════════════════════════════════════════ */
          .hero {
            position: relative;
            z-index: 10;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 8rem 2rem 4rem;
            max-width: 1200px;
            margin: 0 auto;
          }

          .hero-content {
            max-width: 800px;
          }

          .hero-eyebrow {
            font-family: var(--font-mono);
            font-size: 0.75rem;
            font-weight: 500;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: 0.2em;
            margin-bottom: 1.5rem;
          }

          .hero-title {
            font-family: var(--font-display);
            font-size: clamp(3rem, 7vw, 5rem);
            font-weight: 400;
            line-height: 1.1;
            letter-spacing: -0.02em;
            margin-bottom: 1.5rem;
            color: var(--text);
          }

          .hero-title-accent {
            color: var(--accent);
            font-style: italic;
          }

          .hero-desc {
            font-size: 1.125rem;
            line-height: 1.8;
            color: var(--text-muted);
            max-width: 600px;
            margin-bottom: 2.5rem;
          }

          .hero-actions {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
          }

          /* Buttons */
          .btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.875rem 1.5rem;
            font-size: 0.9rem;
            font-weight: 600;
            font-family: var(--font-sans);
            text-decoration: none;
            border-radius: 8px;
            transition: all 0.2s;
            cursor: pointer;
            border: none;
          }

          .btn-primary {
            background: var(--accent);
            color: var(--bg);
          }

          .btn-primary:hover {
            filter: brightness(1.1);
            transform: translateY(-2px);
          }

          .btn-ghost {
            background: transparent;
            color: var(--text-muted);
            border: 1px solid var(--border-strong);
          }

          .btn-ghost:hover {
            background: var(--accent-dim);
            border-color: var(--accent);
            color: var(--text);
          }

          .btn-accent {
            background: transparent;
            color: var(--accent);
            border: 1px solid var(--accent);
          }

          .btn-accent:hover {
            background: var(--accent);
            color: var(--bg);
          }

          /* Insight Card */
          .insight-card {
            margin-top: 4rem;
            padding: 2rem 2.5rem;
            background: var(--bg-elevated);
            border: 1px solid var(--border-strong);
            border-radius: 12px;
            max-width: 500px;
            position: relative;
          }

          .insight-quote {
            font-family: var(--font-display);
            font-size: 4rem;
            color: var(--accent);
            opacity: 0.3;
            position: absolute;
            top: 0.5rem;
            left: 1rem;
            line-height: 1;
          }

          .insight-text {
            font-size: 1rem;
            line-height: 1.7;
            color: var(--text-muted);
            position: relative;
          }

          .insight-text strong {
            color: var(--accent);
            font-weight: 600;
          }

          /* ═══════════════════════════════════════════════════════════════════
             SECTION: PROBLEM
          ═══════════════════════════════════════════════════════════════════ */
          .section-problem {
            position: relative;
            z-index: 10;
            padding: 8rem 2rem;
            background: linear-gradient(180deg, var(--bg) 0%, var(--bg-elevated) 100%);
          }

          .section-label {
            display: inline-block;
            font-family: var(--font-mono);
            font-size: 0.7rem;
            font-weight: 500;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: 0.15em;
            padding: 0.5rem 1rem;
            background: var(--accent-dim);
            border-radius: 4px;
            margin-bottom: 1.5rem;
          }

          .problem-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4rem;
            align-items: center;
          }

          .problem-title {
            font-family: var(--font-display);
            font-size: 2.5rem;
            font-weight: 400;
            line-height: 1.2;
            margin-bottom: 1.5rem;
          }

          .problem-highlight {
            color: var(--red);
          }

          .problem-desc {
            font-size: 1.125rem;
            line-height: 1.7;
            color: var(--text-muted);
            margin-bottom: 1rem;
          }

          /* Amnesia Diagram */
          .amnesia-diagram {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            padding: 2rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
          }

          .session {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem 1.5rem;
            background: var(--bg-elevated);
            border-radius: 8px;
            border-left: 3px solid var(--text-dim);
          }

          .session-label {
            font-family: var(--font-mono);
            font-size: 0.75rem;
            color: var(--text-dim);
          }

          .session-discovery {
            font-size: 0.875rem;
            color: var(--text-muted);
          }

          .amnesia-arrow {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            color: var(--red);
            font-size: 0.75rem;
            font-family: var(--font-mono);
            opacity: 0.7;
          }

          /* ═══════════════════════════════════════════════════════════════════
             SECTION: SOLUTION
          ═══════════════════════════════════════════════════════════════════ */
          .section-solution {
            position: relative;
            z-index: 10;
            padding: 8rem 2rem;
            background: var(--bg-elevated);
          }

          .section-header {
            text-align: center;
            margin-bottom: 4rem;
          }

          .section-title {
            font-family: var(--font-display);
            font-size: 2.5rem;
            font-weight: 400;
            margin-bottom: 1rem;
          }

          .section-desc {
            font-size: 1.125rem;
            color: var(--text-muted);
            max-width: 600px;
            margin: 0 auto;
            line-height: 1.7;
          }

          /* Emergence Grid */
          .emergence-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
            margin-bottom: 4rem;
          }

          .emergence-card {
            padding: 2.5rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            transition: all 0.3s;
          }

          .emergence-card:hover {
            border-color: var(--accent);
            transform: translateY(-4px);
          }

          .emergence-card-accent {
            border-color: var(--purple);
          }

          .emergence-card-accent:hover {
            border-color: var(--purple);
            box-shadow: 0 0 40px rgba(167, 139, 250, 0.1);
          }

          .emergence-icon {
            width: 48px;
            height: 48px;
            margin-bottom: 1.5rem;
          }

          .emergence-level {
            font-family: var(--font-mono);
            font-size: 0.7rem;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 0.1em;
          }

          .emergence-title {
            font-family: var(--font-display);
            font-size: 1.5rem;
            font-weight: 400;
            margin: 0.5rem 0 1rem;
          }

          .emergence-desc {
            font-size: 0.95rem;
            line-height: 1.7;
            color: var(--text-muted);
            margin-bottom: 1.5rem;
          }

          .emergence-desc strong {
            color: var(--accent);
          }

          .emergence-card-accent .emergence-desc strong {
            color: var(--purple);
          }

          .emergence-visual {
            height: 200px;
            background: var(--bg);
            border-radius: 8px;
            overflow: hidden;
          }

          /* Learning Loop */
          .learning-loop {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4rem;
            align-items: center;
            padding: 3rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
          }

          .loop-visual {
            height: 300px;
          }

          .loop-title {
            font-family: var(--font-display);
            font-size: 1.75rem;
            margin-bottom: 2rem;
          }

          .loop-item {
            display: flex;
            align-items: flex-start;
            gap: 1rem;
            margin-bottom: 1.5rem;
          }

          .loop-badge {
            font-family: var(--font-mono);
            font-size: 0.7rem;
            font-weight: 600;
            padding: 0.35rem 0.75rem;
            border-radius: 4px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            white-space: nowrap;
          }

          .loop-execution {
            background: rgba(255, 184, 111, 0.2);
            color: var(--accent);
            border: 1px solid rgba(255, 184, 111, 0.3);
          }

          .loop-adaptation {
            background: rgba(255, 184, 111, 0.1);
            color: var(--accent);
            border: 1px dashed rgba(255, 184, 111, 0.3);
          }

          .loop-meta {
            background: rgba(255, 184, 111, 0.05);
            color: var(--text-muted);
            border: 1px dotted rgba(255, 184, 111, 0.3);
          }

          .loop-item p {
            font-size: 0.95rem;
            color: var(--text-muted);
            line-height: 1.5;
          }

          /* ═══════════════════════════════════════════════════════════════════
             SECTION: MOAT
          ═══════════════════════════════════════════════════════════════════ */
          .section-moat {
            position: relative;
            z-index: 10;
            padding: 8rem 2rem;
            background: var(--bg);
          }

          .moat-comparison {
            display: flex;
            align-items: stretch;
            gap: 2rem;
            margin-bottom: 3rem;
          }

          .moat-card {
            flex: 1;
            padding: 2.5rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
          }

          .moat-local {
            opacity: 0.7;
          }

          .moat-hosted {
            border-color: var(--accent);
            box-shadow: 0 0 60px rgba(255, 184, 111, 0.1);
          }

          .moat-header {
            display: flex;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1.5rem;
          }

          .moat-icon {
            font-size: 1.5rem;
          }

          .moat-header h3 {
            font-family: var(--font-display);
            font-size: 1.25rem;
            font-weight: 400;
          }

          .moat-features {
            list-style: none;
            margin-bottom: 2rem;
          }

          .moat-features li {
            padding: 0.5rem 0;
            color: var(--text-muted);
            font-size: 0.95rem;
            border-bottom: 1px solid var(--border);
          }

          .moat-features li:last-child {
            border-bottom: none;
          }

          .moat-feature-highlight {
            color: var(--text) !important;
            font-weight: 500;
          }

          .moat-hosted .moat-feature-highlight {
            color: var(--accent) !important;
          }

          .moat-graph {
            height: 80px;
          }

          .moat-graph svg {
            width: 100%;
            height: 100%;
          }

          .moat-vs {
            display: flex;
            align-items: center;
            font-family: var(--font-mono);
            font-size: 0.875rem;
            color: var(--text-dim);
          }

          .moat-insight {
            text-align: center;
            padding: 2rem;
            background: var(--bg-elevated);
            border-radius: 12px;
          }

          .moat-insight p {
            font-size: 1.125rem;
            color: var(--text-muted);
            line-height: 1.7;
          }

          .moat-insight strong {
            color: var(--accent);
            font-weight: 600;
          }

          /* ═══════════════════════════════════════════════════════════════════
             SECTION: TECH
          ═══════════════════════════════════════════════════════════════════ */
          .section-tech {
            position: relative;
            z-index: 10;
            padding: 8rem 2rem;
            background: var(--bg-elevated);
          }

          .tech-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1.5rem;
            margin-bottom: 4rem;
          }

          .tech-card {
            padding: 2rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 12px;
            transition: all 0.2s;
          }

          .tech-card:hover {
            border-color: var(--accent);
          }

          .tech-icon {
            height: 120px;
            margin-bottom: 1rem;
            border-radius: 8px;
            overflow: hidden;
            background: transparent;
          }

          .tech-icon-svg {
            width: 48px;
            height: 48px;
            margin-bottom: 1rem;
          }

          .tech-card h4 {
            font-family: var(--font-display);
            font-size: 1.125rem;
            font-weight: 400;
            margin-bottom: 0.5rem;
          }

          .tech-card p {
            font-size: 0.875rem;
            color: var(--text-muted);
            line-height: 1.6;
          }

          .tech-stats {
            display: flex;
            justify-content: center;
            gap: 4rem;
            padding-top: 3rem;
            border-top: 1px solid var(--border);
          }

          .stat {
            text-align: center;
          }

          .stat-value {
            display: block;
            font-family: var(--font-mono);
            font-size: 2.5rem;
            font-weight: 600;
            color: var(--accent);
            margin-bottom: 0.5rem;
          }

          .stat-label {
            font-size: 0.75rem;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 0.1em;
          }

          /* ═══════════════════════════════════════════════════════════════════
             SECTION: CTA
          ═══════════════════════════════════════════════════════════════════ */
          .section-cta {
            position: relative;
            z-index: 10;
            padding: 8rem 2rem;
            background: var(--bg);
            border-top: 1px solid var(--border);
          }

          .cta-content {
            text-align: center;
            max-width: 600px;
            margin: 0 auto;
          }

          .cta-content h2 {
            font-family: var(--font-display);
            font-size: 2.5rem;
            font-weight: 400;
            margin-bottom: 1rem;
          }

          .cta-content p {
            font-size: 1.125rem;
            color: var(--text-muted);
            margin-bottom: 2rem;
          }

          .cta-actions {
            display: flex;
            justify-content: center;
            gap: 1rem;
          }

          /* ═══════════════════════════════════════════════════════════════════
             FOOTER
          ═══════════════════════════════════════════════════════════════════ */
          .footer {
            position: relative;
            z-index: 10;
            padding: 2rem;
            background: var(--bg);
            border-top: 1px solid var(--border);
          }

          .footer-inner {
            max-width: 1200px;
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .footer-brand {
            display: flex;
            align-items: center;
            gap: 1rem;
          }

          .footer-tagline {
            font-size: 0.75rem;
            color: var(--text-dim);
            text-transform: uppercase;
            letter-spacing: 0.1em;
          }

          .footer-links {
            display: flex;
            gap: 2rem;
          }

          .footer-links a {
            color: var(--text-muted);
            text-decoration: none;
            font-size: 0.875rem;
            transition: color 0.2s;
          }

          .footer-links a:hover {
            color: var(--accent);
          }

          /* ═══════════════════════════════════════════════════════════════════
             RESPONSIVE
          ═══════════════════════════════════════════════════════════════════ */
          @media (max-width: 1024px) {
            .tech-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          @media (max-width: 768px) {
            .header {
              padding: 1rem;
            }

            .logo-text {
              display: none;
            }

            .nav {
              gap: 1rem;
            }

            .nav-link:not(.nav-link-github) {
              display: none;
            }

            .hero {
              padding: 6rem 1.5rem 3rem;
            }

            .hero-title {
              font-size: 2.5rem;
            }

            .problem-grid,
            .emergence-grid,
            .learning-loop {
              grid-template-columns: 1fr;
              gap: 2rem;
            }

            .moat-comparison {
              flex-direction: column;
            }

            .moat-vs {
              justify-content: center;
              padding: 1rem;
            }

            .tech-grid {
              grid-template-columns: 1fr;
            }

            .tech-stats {
              flex-direction: column;
              gap: 2rem;
            }

            .cta-actions {
              flex-direction: column;
            }

            .footer-inner {
              flex-direction: column;
              gap: 1.5rem;
              text-align: center;
            }

            .insight-card {
              margin-top: 2rem;
            }
          }

          /* ═══════════════════════════════════════════════════════════════════
             UTILITIES
          ═══════════════════════════════════════════════════════════════════ */
          html {
            scroll-behavior: smooth;
            scroll-padding-top: 80px;
          }

          ::selection {
            background: var(--accent);
            color: var(--bg);
          }
        `}</style>
      </div>
    </>
  );
}
