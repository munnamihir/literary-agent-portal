import { useState, useEffect } from "react";

// ── Storage keys ──────────────────────────────────────────────────────────
const K_AGENTS = "lap_agents_v3";
const K_BOOK   = "lap_book_v3";
const K_APIKEY = "lap_apikey";

// ── Status config ─────────────────────────────────────────────────────────
const STATUSES = {
  researching: { label: "Researching",     color: "#60a5fa", bg: "rgba(96,165,250,0.10)"   },
  querying:    { label: "Queried",          color: "#fbbf24", bg: "rgba(251,191,36,0.10)"   },
  partial_req: { label: "Partial Request",  color: "#fb923c", bg: "rgba(251,146,60,0.10)"   },
  full_req:    { label: "Full Request",     color: "#c084fc", bg: "rgba(192,132,252,0.10)"  },
  rejected:    { label: "Passed",           color: "#f87171", bg: "rgba(248,113,113,0.10)"  },
  offer:       { label: "Offer! 🎉",        color: "#34d399", bg: "rgba(52,211,153,0.10)"   },
  withdrawn:   { label: "Withdrawn",        color: "#94a3b8", bg: "rgba(148,163,184,0.10)"  },
};

// ── localStorage helpers ──────────────────────────────────────────────────
const lsGet = (key, fallback = null) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const lsSet = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

// ── Anthropic API ─────────────────────────────────────────────────────────
async function callClaude({ apiKey, messages, system, max_tokens = 1800 }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens, messages, ...(system && { system }) }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function callClaudeSearch({ apiKey, messages, system, max_tokens = 2400 }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens, messages, ...(system && { system }), tools: [{ type: "web_search_20250305", name: "web_search" }] }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}


// ── Robust JSON extractor ─────────────────────────────────────────────────
function extractJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const s = clean.indexOf("["), e = clean.lastIndexOf("]");
  if (s === -1 || e === -1) throw new Error("No JSON array found in response.");
  let slice = clean.slice(s, e + 1);
  // Fix common AI JSON issues: trailing commas before ] or }
  slice = slice.replace(/,\s*([}\]])/g, "$1");
  // Remove control characters
  slice = slice.replace(/[\u0000-\u001F\u007F]/g, (c) => {
    if (c === "\n" || c === "\r" || c === "\t") return c;
    return "";
  });
  try {
    return JSON.parse(slice);
  } catch(err) {
    // Last resort: try to extract objects one by one
    const items = [];
    const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    let match;
    while ((match = objRegex.exec(slice)) !== null) {
      try { items.push(JSON.parse(match[0])); } catch {}
    }
    if (items.length > 0) return items;
    throw new Error("Could not parse AI response as JSON. Try again.");
  }
}

// ── Misc helpers ──────────────────────────────────────────────────────────
const mkId  = () => `a${Date.now()}${Math.floor(Math.random() * 1000)}`;
const today = () => new Date().toISOString().split("T")[0];
const iS    = { background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "8px 11px", color: "#c9d1d9", fontFamily: "'Crimson Text',Georgia,serif", fontSize: 14, width: "100%", boxSizing: "border-box" };
const bdg   = (s) => ({ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: STATUSES[s]?.color || "#8b949e", background: STATUSES[s]?.bg || "rgba(139,148,158,0.08)", border: `1px solid ${(STATUSES[s]?.color || "#8b949e")}30`, whiteSpace: "nowrap" });

const Spinner = ({ size = 18, color = "#d4a853" }) => (
  <span style={{ display: "inline-block", width: size, height: size, border: `2px solid ${color}30`, borderTop: `2px solid ${color}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
);

const AIBadge = () => (
  <span style={{ fontSize: 10, background: "rgba(212,168,83,0.15)", color: "#d4a853", border: "1px solid rgba(212,168,83,0.3)", borderRadius: 4, padding: "2px 7px", fontWeight: 700, letterSpacing: "0.04em" }}>AI</span>
);

const Btn = ({ onClick, disabled, children, variant = "gold", style = {} }) => {
  const styles = {
    gold:   { background: disabled ? "#2a2318" : "#d4a853", color: disabled ? "#6b5c3a" : "#0d1117", border: "none" },
    ghost:  { background: "transparent", color: "#d4a853", border: "1px solid #30363d" },
    danger: { background: "transparent", color: "#f87171", border: "1px solid #f8717130" },
    dark:   { background: "#21262d", color: "#c9d1d9", border: "1px solid #30363d" },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...styles[variant], borderRadius: 7, padding: "8px 18px", fontFamily: "'Crimson Text',Georgia,serif", fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, transition: "opacity 0.15s", ...style }}>
      {children}
    </button>
  );
};

const Textarea = ({ value, onChange, rows = 4, placeholder = "" }) => (
  <textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder}
    style={{ ...iS, resize: "vertical", lineHeight: 1.6 }} />
);

// ── Default book profile ──────────────────────────────────────────────────
const DEFAULT_BOOK = { title: "", wordCount: "", genre: "Epic Fantasy", subgenres: "", logline: "", synopsis: "", themes: "", comps: "", authorBio: "", hooks: "", status: "complete" };

// ── Seed agents ───────────────────────────────────────────────────────────
const SEED = [
  { id: "s1", name: "DongWon Song", agency: "Howard Morhaim Literary", website: "https://howardmorhaim.com", queryMethod: "QueryManager", responseTime: "6–8 weeks", status: "researching", priority: "high", subDate: "", notes: "", wishlist: "Political complexity, non-western settings, ensemble casts, morally grey characters. Strong distinct prose voice.", genres: ["Epic Fantasy", "High Fantasy", "Sci-Fi"], req: { queryLetter: true, synopsis: true, synopsisLen: "2 pages", samplePages: 10, bio: true, comps: true, wordCount: true, other: "" }, history: [], added: today() },
  { id: "s2", name: "Suzie Townsend", agency: "New Leaf Literary & Media", website: "https://newleafliterary.com", queryMethod: "QueryManager", responseTime: "8–12 weeks", status: "researching", priority: "high", subDate: "", notes: "", wishlist: "Sweeping epic fantasy, found family, multiple POVs, rich magic systems. Series welcome. Big emotional stakes.", genres: ["Epic Fantasy", "YA Fantasy", "Adult Fantasy"], req: { queryLetter: true, synopsis: true, synopsisLen: "2 pages", samplePages: 50, bio: false, comps: true, wordCount: true, other: "First 50 pages pasted in body" }, history: [], added: today() },
  { id: "s3", name: "Hannah Bowman", agency: "Liza Dawson Associates", website: "https://lizadawsonassociates.com", queryMethod: "QueryManager", responseTime: "6–8 weeks", status: "researching", priority: "high", subDate: "", notes: "", wishlist: "LGBTQ+ rep, complex magic systems, anti-hero protagonists, moral ambiguity, subverted tropes.", genres: ["Epic Fantasy", "High Fantasy"], req: { queryLetter: true, synopsis: false, synopsisLen: "", samplePages: 25, bio: false, comps: true, wordCount: true, other: "" }, history: [], added: today() },
  { id: "s4", name: "Thao Le", agency: "Sandra Dijkstra Literary", website: "https://dijkstraagency.com", queryMethod: "Email", responseTime: "8 weeks", status: "researching", priority: "high", subDate: "", notes: "", wishlist: "Diverse voices, Asian-inspired settings, sweeping epics with emotional depth.", genres: ["Epic Fantasy", "Speculative Fiction"], req: { queryLetter: true, synopsis: true, synopsisLen: "1 page", samplePages: 50, bio: true, comps: true, wordCount: true, other: "" }, history: [], added: today() },
  { id: "s5", name: "Naomi Davis", agency: "BookEnds Literary", website: "https://bookendsliterary.com", queryMethod: "QueryManager", responseTime: "6–8 weeks", status: "researching", priority: "medium", subDate: "", notes: "", wishlist: "Immersive world-building, political intrigue, strong female protagonists.", genres: ["Epic Fantasy", "Fantasy", "Sci-Fi"], req: { queryLetter: true, synopsis: true, synopsisLen: "1 page", samplePages: 15, bio: false, comps: true, wordCount: true, other: "" }, history: [], added: today() },
];

// ═══════════════════════════════════════════════════════════════════════════
//  API KEY SETUP SCREEN
// ═══════════════════════════════════════════════════════════════════════════
function ApiKeySetup({ onSave }) {
  const [key, setKey]     = useState("");
  const [show, setShow]   = useState(false);
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  const test = async () => {
    if (!key.startsWith("sk-ant-")) { setErr("Key should start with sk-ant-"); return; }
    setLoading(true); setErr("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 10, messages: [{ role: "user", content: "hi" }] }),
      });
      if (!res.ok) { const t = await res.text(); throw new Error(t); }
      onSave(key);
    } catch (e) { setErr("Invalid key or network error: " + e.message); }
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: "'Crimson Text',Georgia,serif", background: "#0d1117", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Crimson+Text:wght@400;600;700&family=Space+Grotesk:wght@400;500;700&display=swap'); @keyframes spin { to { transform:rotate(360deg); } }`}</style>
      <div style={{ maxWidth: 520, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
          <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 700, color: "#f0f6fc", margin: "0 0 8px" }}>Literary Agent Portal</h1>
          <p style={{ fontSize: 15, color: "#8b949e" }}>Enter your Anthropic API key to enable AI features</p>
        </div>

        <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 12, padding: 24 }}>
          <div style={{ background: "rgba(212,168,83,0.08)", border: "1px solid rgba(212,168,83,0.2)", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#c9d1d9", lineHeight: 1.6 }}>
            <strong style={{ color: "#d4a853" }}>Get a free API key:</strong><br />
            1. Go to <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>console.anthropic.com</a><br />
            2. Sign up / log in → click <strong>API Keys</strong> → <strong>Create Key</strong><br />
            3. New accounts get free credits to start<br />
            <span style={{ color: "#8b949e", fontSize: 12 }}>Your key is stored only in your browser's localStorage — never sent anywhere except Anthropic's API.</span>
          </div>

          <label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" }}>Anthropic API Key</label>
          <div style={{ position: "relative", marginBottom: 14 }}>
            <input
              type={show ? "text" : "password"}
              value={key}
              onChange={e => setKey(e.target.value)}
              onKeyDown={e => e.key === "Enter" && test()}
              placeholder="sk-ant-api03-..."
              style={{ ...iS, paddingRight: 70 }}
            />
            <button onClick={() => setShow(s => !s)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#8b949e", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif" }}>
              {show ? "Hide" : "Show"}
            </button>
          </div>

          {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 7, padding: "8px 12px" }}>⚠️ {err}</div>}

          <Btn onClick={test} disabled={loading || !key} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? <><Spinner size={14} /> Verifying…</> : "Connect & Launch Portal →"}
          </Btn>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#8b949e", marginTop: 16 }}>
          The portal works without AI — you can skip this by adding a placeholder key, but AI features will be disabled.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROOT
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [apiKey,  setApiKey]  = useState(() => lsGet(K_APIKEY, ""));
  const [tab,     setTab]     = useState("dashboard");
  const [agents,  setAgents]  = useState(() => lsGet(K_AGENTS, SEED));
  const [book,    setBook]    = useState(() => lsGet(K_BOOK, DEFAULT_BOOK));
  const [selId,   setSelId]   = useState(null);
  const [subView, setSubView] = useState("list");

  const saveApiKey = (k) => { lsSet(K_APIKEY, k); setApiKey(k); };
  const saveAgents = (a) => { setAgents(a); lsSet(K_AGENTS, a); };
  const saveBook   = (b) => { setBook(b);   lsSet(K_BOOK, b);   };

  const upsertAgent = (a) => saveAgents(agents.some(x => x.id === a.id) ? agents.map(x => x.id === a.id ? a : x) : [...agents, a]);
  const removeAgent = (id) => { saveAgents(agents.filter(a => a.id !== id)); goList(); };
  const goList      = () => { setSubView("list"); setSelId(null); };
  const goDetail    = (id) => { setSelId(id); setSubView("detail"); setTab("agents"); };
  const addAgent    = (a) => { upsertAgent({ ...a, id: mkId(), added: today(), history: [] }); goList(); };

  if (!apiKey) return <ApiKeySetup onSave={saveApiKey} />;

  const sel = agents.find(a => a.id === selId);

  return (
    <div style={{ fontFamily: "'Crimson Text',Georgia,serif", background: "#0d1117", minHeight: "100vh", color: "#c9d1d9" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400&family=Space+Grotesk:wght@400;500;700&display=swap');
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        textarea,input,select { outline:none; transition:border-color 0.15s; }
        textarea:focus,input:focus,select:focus { border-color:#d4a85380 !important; }
        .card  { background:#161b22; border:1px solid #21262d; border-radius:10px; padding:18px; }
        .st    { font-family:'Space Grotesk',sans-serif; font-size:10px; color:#8b949e; letter-spacing:0.1em; text-transform:uppercase; margin-bottom:12px; display:flex; align-items:center; gap:8px; }
        .fi    { animation: fadeIn 0.3s ease both; }
        ::-webkit-scrollbar { width:5px; } ::-webkit-scrollbar-track { background:#161b22; } ::-webkit-scrollbar-thumb { background:#30363d; border-radius:3px; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#0d1117", borderBottom: "1px solid #21262d", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#d4a853,#8b5e1a)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📖</div>
          <div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 700, color: "#f0f6fc" }}>Literary Agent Portal</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#d4a853", letterSpacing: "0.08em" }}>EPIC FICTION · AI-POWERED QUERY TRACKER</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={() => { setTab("ai"); setSubView("finder"); }} style={{ fontSize: 13, padding: "6px 14px" }}>🤖 AI Agent Finder</Btn>
          <Btn onClick={() => { setSubView("add"); setTab("agents"); }} style={{ fontSize: 13, padding: "6px 14px" }}>+ Add Agent</Btn>
          <button onClick={() => { if (window.confirm("Change API key?")) { lsSet(K_APIKEY, ""); setApiKey(""); } }}
            style={{ background: "none", border: "1px solid #30363d", borderRadius: 7, padding: "6px 12px", color: "#8b949e", cursor: "pointer", fontSize: 12, fontFamily: "Georgia,serif" }} title="Change API key">🔑</button>
        </div>
      </div>

      {/* Nav */}
      <div style={{ background: "#0d1117", borderBottom: "1px solid #21262d", display: "flex", padding: "0 24px", gap: 4 }}>
        {[["dashboard","📊","Dashboard"],["agents","📋","Agents"],["pipeline","🎯","Pipeline"],["ai","✨","AI Tools"],["book","📝","My Book"]].map(([id, ic, lbl]) => (
          <button key={id} onClick={() => { setTab(id); if (id !== "agents") setSubView("list"); }}
            style={{ background: "none", border: "none", borderBottom: `2px solid ${tab === id ? "#d4a853" : "transparent"}`, cursor: "pointer", padding: "11px 16px", fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, color: tab === id ? "#d4a853" : "#8b949e", letterSpacing: "0.04em", transition: "color 0.15s" }}>
            {ic} {lbl}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "22px 24px", maxWidth: 1200, margin: "0 auto" }} className="fi">
        {tab === "dashboard" && <Dashboard agents={agents} book={book} onAgent={goDetail} onTab={setTab} onSubView={setSubView} />}
        {tab === "agents" && subView === "list"   && <AgentList agents={agents} onSelect={goDetail} onAdd={() => setSubView("add")} />}
        {tab === "agents" && subView === "detail" && sel && <AgentDetail agent={sel} book={book} apiKey={apiKey} onBack={goList} onSave={upsertAgent} onDelete={removeAgent} />}
        {tab === "agents" && subView === "add"    && <AddAgent onBack={goList} onSave={addAgent} />}
        {tab === "pipeline" && <Pipeline agents={agents} onAgent={goDetail} />}
        {tab === "ai"      && <AITools book={book} agents={agents} apiKey={apiKey} onAgentAdd={addAgent} subView={subView} setSubView={setSubView} />}
        {tab === "book"    && <BookProfile book={book} onSave={saveBook} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function Dashboard({ agents, book, onAgent, onTab, onSubView }) {
  const s = {
    total: agents.length,
    queried: agents.filter(a => a.status === "querying").length,
    partial: agents.filter(a => a.status === "partial_req").length,
    full: agents.filter(a => a.status === "full_req").length,
    rejected: agents.filter(a => a.status === "rejected").length,
    offer: agents.filter(a => a.status === "offer").length,
  };
  const waiting = agents.filter(a => a.status === "querying" && a.subDate);
  const highPri = agents.filter(a => a.priority === "high" && a.status === "researching").slice(0, 5);
  const bookOk  = book.title && book.logline && book.synopsis;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10 }}>
        {[["Total", s.total, "#c9d1d9"], ["Queried", s.queried, "#fbbf24"], ["Requests", s.partial + s.full, "#c084fc"], ["Rejected", s.rejected, "#f87171"], ["Offers 🎉", s.offer, "#34d399"], ["Researching", agents.filter(a => a.status === "researching").length, "#60a5fa"]].map(([l, v, c]) => (
          <div key={l} className="card" style={{ textAlign: "center", padding: "14px 10px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: c, lineHeight: 1, marginBottom: 5 }}>{v}</div>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", letterSpacing: "0.06em", textTransform: "uppercase" }}>{l}</div>
          </div>
        ))}
      </div>

      {!bookOk && (
        <div className="card" style={{ border: "1px solid rgba(212,168,83,0.3)", background: "rgba(212,168,83,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 700, color: "#d4a853", marginBottom: 3 }}>📝 Set up your Book Profile first</div>
            <div style={{ fontSize: 13, color: "#8b949e" }}>Add your title, logline & synopsis — the AI tools need these to generate personalized query letters.</div>
          </div>
          <Btn onClick={() => onTab("book")} style={{ flexShrink: 0, marginLeft: 16 }}>Go to Book Profile →</Btn>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div className="card">
          <div className="st">⭐ High Priority — Not Yet Queried</div>
          {highPri.length === 0
            ? <div style={{ fontSize: 13, color: "#34d399" }}>All high-priority agents queried! 🎉</div>
            : highPri.map(a => (
              <div key={a.id} onClick={() => onAgent(a.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #21262d", cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc" }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: "#8b949e" }}>{a.agency}</div>
                </div>
                <span style={{ color: "#d4a853", fontSize: 12 }}>View →</span>
              </div>
            ))
          }
        </div>

        <div className="card" style={{ border: "1px solid rgba(212,168,83,0.2)" }}>
          <div className="st">✨ AI Automation <AIBadge /></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {[
              { ic: "🔍", label: "Find New Agents",       desc: "AI searches & discovers matching agents",            sub: "finder" },
              { ic: "✍️", label: "Write Query Letter",    desc: "AI crafts a personalized query letter",              sub: "query_writer" },
              { ic: "📚", label: "Find Comp Titles",      desc: "AI finds recent comparable titles via web search",   sub: "comps" },
              { ic: "🎯", label: "Pitch Coach",           desc: "AI reviews your logline & gives direct feedback",    sub: "pitch_coach" },
            ].map(({ ic, label, desc, sub }) => (
              <button key={sub} onClick={() => { onTab("ai"); onSubView(sub); }}
                style={{ background: "rgba(212,168,83,0.05)", border: "1px solid rgba(212,168,83,0.15)", borderRadius: 8, padding: "10px 14px", cursor: "pointer", display: "flex", gap: 10, alignItems: "center", textAlign: "left" }}>
                <span style={{ fontSize: 20 }}>{ic}</span>
                <div>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#d4a853" }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#8b949e" }}>{desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {waiting.length > 0 && (
        <div className="card">
          <div className="st">⏳ Awaiting Response ({waiting.length})</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 9 }}>
            {waiting.map(a => {
              const days = Math.floor((Date.now() - new Date(a.subDate)) / 86400000);
              const overdue = days > 84;
              return (
                <div key={a.id} onClick={() => onAgent(a.id)} style={{ background: "#0d1117", border: `1px solid ${overdue ? "#f8717122" : "#21262d"}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc" }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 4 }}>{a.agency}</div>
                  <div style={{ fontSize: 11, color: overdue ? "#f87171" : "#fbbf24" }}>{days} day{days !== 1 ? "s" : ""} waiting · {a.responseTime}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <div className="st">📋 Pre-Query Checklist</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {["Verify agent is open to queries on their website", "Read agent's full MSWL at manuscriptwishlist.com", "Check recent deals on Publisher's Marketplace", "Personalize the first 1–2 sentences of your query", "Follow exact submission guidelines precisely", "Word count 90k–150k for adult Epic Fantasy", "No simultaneous sub if agent requests exclusive", "Set follow-up reminder for end of response window"].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 16, height: 16, borderRadius: 4, background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                <span style={{ fontSize: 9, color: "#34d399" }}>✓</span>
              </div>
              <span style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.5 }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  BOOK PROFILE
// ═══════════════════════════════════════════════════════════════════════════
function BookProfile({ book, onSave }) {
  const [b, setB]     = useState({ ...book });
  const [saved, setSaved] = useState(false);
  const up   = (k, v) => { setB(p => ({ ...p, [k]: v })); setSaved(false); };
  const save = ()     => { onSave(b); setSaved(true); setTimeout(() => setSaved(false), 2500); };

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h2 style={{ margin: 0, color: "#f0f6fc", fontFamily: "'Space Grotesk',sans-serif", fontSize: 18 }}>My Book Profile</h2>
        <Btn onClick={save}>{saved ? "✅ Saved!" : "💾 Save Profile"}</Btn>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card">
          <div className="st">Book Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
            {[["title","TITLE","Your Book Title"],["wordCount","WORD COUNT","e.g. 127,000"],["genre","GENRE","Epic Fantasy"],["subgenres","SUBGENRES / TAGS","Dark Fantasy, Political Intrigue…"],["comps","COMP TITLES","e.g. The Name of the Wind meets Mistborn"]].map(([k, label, ph]) => (
              <div key={k} style={{ gridColumn: k === "comps" ? "1/-1" : "auto" }}>
                <label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</label>
                <input value={b[k] || ""} onChange={e => up(k, e.target.value)} placeholder={ph} style={iS} />
              </div>
            ))}
            <div>
              <label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>STATUS</label>
              <select value={b.status} onChange={e => up("status", e.target.value)} style={iS}>
                {["complete", "revising", "drafting"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="st">Query Materials</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["logline", "📌 ONE-SENTENCE LOGLINE (used by AI query writer)", 2, "A [protagonist] must [goal] before [stakes] in a world where [world detail]."],
              ["synopsis", "📖 QUERY SYNOPSIS (2–3 paragraphs — used by AI)", 6, "The main plot, protagonist arc, central conflict and stakes. Include the ending for a full synopsis."],
              ["themes", "KEY THEMES", 1, "e.g. Power & corruption, found family, colonialism, redemption…"],
              ["hooks", "UNIQUE HOOKS", 2, "What makes this book stand out? Unique magic, setting, structure, voice…"],
              ["authorBio", "AUTHOR BIO", 2, "Brief bio: writing experience, published credits, memberships…"],
            ].map(([k, label, rows, ph]) => (
              <div key={k}>
                <label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: k === "logline" || k === "synopsis" ? "#d4a853" : "#8b949e", display: "block", marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</label>
                <Textarea value={b[k] || ""} onChange={e => up(k, e.target.value)} rows={rows} placeholder={ph} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  AI TOOLS
// ═══════════════════════════════════════════════════════════════════════════
function AITools({ book, agents, apiKey, onAgentAdd, subView, setSubView }) {
  const tools = [
    { id: "finder",       ic: "🔍", label: "Agent Finder"        },
    { id: "query_writer", ic: "✍️", label: "Query Letter Writer" },
    { id: "comps",        ic: "📚", label: "Comp Title Finder"   },
    { id: "pitch_coach",  ic: "🎯", label: "Pitch Coach"         },
    { id: "synopsis_ai",  ic: "📄", label: "Synopsis Helper"     },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 9, marginBottom: 20, flexWrap: "wrap" }}>
        {tools.map(t => (
          <button key={t.id} onClick={() => setSubView(t.id)}
            style={{ background: subView === t.id ? "rgba(212,168,83,0.12)" : "#161b22", border: `1px solid ${subView === t.id ? "rgba(212,168,83,0.4)" : "#21262d"}`, borderRadius: 8, padding: "9px 15px", cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif", fontSize: 12, fontWeight: 700, color: subView === t.id ? "#d4a853" : "#8b949e", transition: "all 0.15s" }}>
            {t.ic} {t.label}
          </button>
        ))}
      </div>
      <div className="fi">
        {subView === "finder"       && <AgentFinder  apiKey={apiKey} book={book} agents={agents} onAdd={onAgentAdd} />}
        {subView === "query_writer" && <QueryWriter   apiKey={apiKey} book={book} agents={agents} />}
        {subView === "comps"        && <CompFinder    apiKey={apiKey} book={book} />}
        {subView === "pitch_coach"  && <PitchCoach    apiKey={apiKey} book={book} />}
        {subView === "synopsis_ai"  && <SynopsisHelper apiKey={apiKey} book={book} agents={agents} />}
      </div>
    </div>
  );
}

// ── AI: Agent Finder ──────────────────────────────────────────────────────
function AgentFinder({ apiKey, book, agents, onAdd }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [err,     setErr]     = useState("");
  const [added,   setAdded]   = useState({});

  const find = async () => {
    setLoading(true); setErr(""); setResults([]);
    try {
      const bookCtx = book.title ? `Book: "${book.title}", ${book.genre}, ${book.wordCount} words. Themes: ${book.themes}. Hooks: ${book.hooks}.` : "Adult Epic Fantasy novel.";
      const text = await callClaudeSearch({
        apiKey, max_tokens: 2800,
        system: `You are a literary agent research assistant. Search for agents and return ONLY a JSON array (no markdown, no backticks):
[{"name":"","agency":"","website":"https://...","queryMethod":"QueryManager or Email","responseTime":"X weeks","genres":["Epic Fantasy"],"wishlist":"what they want","priority":"high","req":{"queryLetter":true,"synopsis":true,"synopsisLen":"1 page","samplePages":50,"bio":false,"comps":true,"wordCount":true,"other":""},"notes":""}]
Return 5-8 agents currently open to Epic Fantasy queries.`,
        messages: [{ role: "user", content: `Search the web for literary agents currently open to Epic Fantasy or High Fantasy manuscripts in 2025. ${bookCtx} Find agents who are open and include their submission requirements. Return only the JSON array.` }],
      });
      const arr = extractJSON(text);
      setResults(arr.map(a => ({ ...a, id: mkId(), history: [], added: today(), status: "researching", req: { queryLetter: true, synopsis: false, synopsisLen: "", samplePages: 10, bio: false, comps: true, wordCount: true, other: "", ...(a.req || {}) } })));
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: "#f0f6fc", marginBottom: 4 }}>🔍 AI Agent Finder <AIBadge /></div>
        <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 14 }}>Searches the web in real-time to find agents open to Epic Fantasy queries, with current requirements and wishlist notes.</div>
        <Btn onClick={find} disabled={loading}>{loading ? <><Spinner size={14} /> Searching the web…</> : "🔍 Find Epic Fantasy Agents"}</Btn>
      </div>

      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px" }}>⚠️ {err}</div>}
      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "#8b949e" }}><Spinner size={32} /><div style={{ marginTop: 14, fontSize: 14 }}>Searching the web for Epic Fantasy agents…</div></div>}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="st">Found {results.length} agents — always verify on their website before querying</div>
          {results.map(a => {
            const exists  = agents.some(x => x.name.toLowerCase() === a.name.toLowerCase());
            const wasAdded = added[a.id];
            return (
              <div key={a.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#f0f6fc" }}>{a.name}</span>
                      <span style={{ fontSize: 13, color: "#8b949e" }}>{a.agency}</span>
                      {a.website && <a href={a.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#60a5fa", textDecoration: "none" }}>↗ {a.website.replace("https://", "")}</a>}
                    </div>
                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
                      {(a.genres || []).map((g, i) => <span key={i} style={{ fontSize: 11, background: "rgba(212,168,83,0.1)", color: "#d4a853", border: "1px solid rgba(212,168,83,0.2)", borderRadius: 20, padding: "2px 9px" }}>{g}</span>)}
                      <span style={{ fontSize: 11, color: "#8b949e" }}>via {a.queryMethod}</span>
                      <span style={{ fontSize: 11, color: "#8b949e" }}>⏱ {a.responseTime}</span>
                    </div>
                    {a.wishlist && <div style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.5 }}><span style={{ color: "#d4a853" }}>Wishlist: </span>{a.wishlist}</div>}
                  </div>
                  <div style={{ flexShrink: 0 }}>
                    {exists ? <span style={{ fontSize: 12, color: "#8b949e", fontStyle: "italic" }}>Already tracked</span>
                      : wasAdded ? <span style={{ fontSize: 12, color: "#34d399" }}>✅ Added!</span>
                        : <Btn onClick={() => { onAdd(a); setAdded(p => ({ ...p, [a.id]: true })); }} style={{ fontSize: 13, padding: "7px 16px" }}>+ Add to Tracker</Btn>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── AI: Query Letter Writer ───────────────────────────────────────────────
function QueryWriter({ apiKey, book, agents }) {
  const [selAgent, setSelAgent] = useState("");
  const [custom,   setCustom]   = useState({ name: "", wishlist: "", agency: "" });
  const [loading,  setLoading]  = useState(false);
  const [letter,   setLetter]   = useState("");
  const [err,      setErr]      = useState("");
  const [copied,   setCopied]   = useState(false);

  const agent = selAgent === "custom" ? custom : agents.find(a => a.id === selAgent);
  const ready = book.title && book.logline && book.synopsis && agent?.name;

  const generate = async () => {
    setLoading(true); setErr(""); setLetter("");
    try {
      const data = await callClaude({
        apiKey, max_tokens: 1400,
        system: "You are an expert literary query letter consultant. Write professional, compelling, personalized query letters. Target 250–320 words for the body.",
        messages: [{ role: "user", content: `Write a personalized query letter for my Epic Fantasy novel.

BOOK: Title: ${book.title} | Words: ${book.wordCount} | Genre: ${book.genre}
Logline: ${book.logline}
Synopsis: ${book.synopsis}
Themes: ${book.themes}  |  Hooks: ${book.hooks}  |  Comps: ${book.comps}
Author Bio: ${book.authorBio}

AGENT: ${agent.name} at ${agent.agency || ""}
Wishlist: ${agent.wishlist || "not specified"}
Query method: ${agent.queryMethod || ""}

Write a complete, ready-to-send query letter that:
1. Opens with a personalized hook referencing what this agent specifically wants
2. Delivers the logline and hook in the first paragraph
3. Summarizes plot (protagonist, conflict, stakes) in 2 paragraphs
4. Includes bio and comp titles
5. Closes professionally
Use [YOUR NAME] and [DATE] placeholders.` }],
      });
      setLetter((data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n"));
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: "#f0f6fc", marginBottom: 4 }}>✍️ AI Query Letter Writer <AIBadge /></div>
        <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 14 }}>Generates a personalized query letter tailored to each agent's specific wishlist. Fill in your Book Profile first.</div>
        {!book.title && <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 7, padding: "10px 14px", fontSize: 13, color: "#fbbf24", marginBottom: 14 }}>⚠️ Complete your Book Profile (title, logline, synopsis) first.</div>}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>SELECT AGENT</label>
          <select value={selAgent} onChange={e => setSelAgent(e.target.value)} style={iS}>
            <option value="">— Choose an agent from your tracker —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name} · {a.agency}</option>)}
            <option value="custom">✏️ Enter agent manually</option>
          </select>
        </div>
        {selAgent === "custom" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>AGENT NAME</label><input value={custom.name} onChange={e => setCustom(p => ({ ...p, name: e.target.value }))} style={iS} /></div>
            <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>AGENCY</label><input value={custom.agency} onChange={e => setCustom(p => ({ ...p, agency: e.target.value }))} style={iS} /></div>
            <div style={{ gridColumn: "1/-1" }}><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>AGENT WISHLIST / MSWL</label><Textarea value={custom.wishlist} onChange={e => setCustom(p => ({ ...p, wishlist: e.target.value }))} rows={3} /></div>
          </div>
        )}
        <Btn onClick={generate} disabled={loading || !ready}>{loading ? <><Spinner size={14} /> Generating…</> : "✍️ Generate Query Letter"}</Btn>
        {!ready && !loading && <span style={{ fontSize: 12, color: "#8b949e", marginLeft: 12 }}>Complete book profile + select an agent first</span>}
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px" }}>⚠️ {err}</div>}
      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "#8b949e" }}><Spinner size={32} /><div style={{ marginTop: 14, fontSize: 14 }}>Writing your personalized query letter…</div></div>}
      {letter && (
        <div className="card fi">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#d4a853" }}>Generated Query Letter</div>
            <Btn onClick={() => { navigator.clipboard.writeText(letter); setCopied(true); setTimeout(() => setCopied(false), 2500); }} variant="dark" style={{ fontSize: 12, padding: "6px 14px" }}>{copied ? "✅ Copied!" : "📋 Copy Letter"}</Btn>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.75, color: "#c9d1d9", whiteSpace: "pre-wrap", borderTop: "1px solid #21262d", paddingTop: 14 }}>{letter}</div>
        </div>
      )}
    </div>
  );
}

// ── AI: Comp Title Finder ─────────────────────────────────────────────────
function CompFinder({ apiKey, book }) {
  const [loading, setLoading] = useState(false);
  const [comps,   setComps]   = useState([]);
  const [err,     setErr]     = useState("");

  const find = async () => {
    setLoading(true); setErr(""); setComps([]);
    try {
      const ctx = book.synopsis ? `Synopsis: ${book.synopsis}. Themes: ${book.themes}. Hooks: ${book.hooks}.` : "Adult Epic Fantasy with political intrigue and ensemble cast.";
      const text = await callClaudeSearch({
        apiKey, max_tokens: 2000,
        system: `Find recent Epic Fantasy comp titles and return ONLY a JSON array (no markdown):
[{"title":"","author":"","year":2023,"publisher":"","why":"why it's a good comp","agentFriendly":true}]`,
        messages: [{ role: "user", content: `Search for Epic Fantasy books published 2021–2025 for query letter comps. ${ctx} Find 6–8 traditionally published books with similar themes, tone, or audience. Return only JSON array.` }],
      });
      setComps(extractJSON(text));
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: "#f0f6fc", marginBottom: 4 }}>📚 AI Comp Title Finder <AIBadge /></div>
        <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 14 }}>Searches for recent (2021–2025) traditionally published Epic Fantasy books to use as comp titles. Comps should be 2–5 years old and from major publishers.</div>
        <Btn onClick={find} disabled={loading}>{loading ? <><Spinner size={14} /> Searching…</> : "📚 Find Comp Titles"}</Btn>
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px" }}>⚠️ {err}</div>}
      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "#8b949e" }}><Spinner size={32} /><div style={{ marginTop: 14, fontSize: 14 }}>Searching for comparable Epic Fantasy titles…</div></div>}
      {comps.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {comps.map((c, i) => (
            <div key={i} className="card fi" style={{ border: `1px solid ${c.agentFriendly ? "rgba(52,211,153,0.2)" : "#21262d"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#f0f6fc", fontStyle: "italic" }}>{c.title}</div>
                {c.agentFriendly && <span style={{ fontSize: 10, color: "#34d399", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.25)", borderRadius: 4, padding: "2px 8px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, whiteSpace: "nowrap" }}>✓ STRONG</span>}
              </div>
              <div style={{ fontSize: 13, color: "#d4a853", marginBottom: 6 }}>{c.author} · {c.year} · {c.publisher}</div>
              <div style={{ fontSize: 13, color: "#8b949e", lineHeight: 1.5 }}>{c.why}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AI: Pitch Coach ───────────────────────────────────────────────────────
function PitchCoach({ apiKey, book }) {
  const [loading,  setLoading]  = useState(false);
  const [feedback, setFeedback] = useState("");
  const [err,      setErr]      = useState("");

  const analyze = async () => {
    setLoading(true); setErr(""); setFeedback("");
    try {
      const data = await callClaude({
        apiKey, max_tokens: 1200,
        system: "You are a literary agent and query letter expert. Give direct, specific, actionable feedback. Use ## headers to organize.",
        messages: [{ role: "user", content: `Analyze my Epic Fantasy pitch materials and give specific feedback.

Title: ${book.title || "(not set)"} | Logline: ${book.logline || "(not set)"}
Synopsis: ${book.synopsis || "(not set)"}
Themes: ${book.themes || "(not set)"} | Hooks: ${book.hooks || "(not set)"}
Comps: ${book.comps || "(not set)"} | Word Count: ${book.wordCount || "(not set)"}

Give feedback on: 1) Logline strength 2) Synopsis effectiveness 3) Comp titles 4) Commercial positioning 5) Three specific improvements before querying. Be honest.` }],
      });
      setFeedback((data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n"));
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: "#f0f6fc", marginBottom: 4 }}>🎯 Pitch Coach <AIBadge /></div>
        <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 14 }}>AI analyzes your logline, synopsis, and comp titles and gives direct, actionable feedback before you query.</div>
        <Btn onClick={analyze} disabled={loading || (!book.logline && !book.synopsis)}>{loading ? <><Spinner size={14} /> Analyzing…</> : "🎯 Analyze My Pitch"}</Btn>
        {!book.logline && !book.synopsis && <span style={{ fontSize: 12, color: "#8b949e", marginLeft: 12 }}>Add your logline & synopsis in Book Profile first</span>}
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px" }}>⚠️ {err}</div>}
      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "#8b949e" }}><Spinner size={32} /><div style={{ marginTop: 14, fontSize: 14 }}>Analyzing your pitch materials…</div></div>}
      {feedback && (
        <div className="card fi">
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#d4a853", marginBottom: 14 }}>Pitch Analysis</div>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: "#c9d1d9", whiteSpace: "pre-wrap" }}>
            {feedback.split(/\n(#{1,3} .+)/).map((part, i) =>
              part.match(/^#{1,3} /)
                ? <div key={i} style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#d4a853", marginTop: 16, marginBottom: 6 }}>{part.replace(/^#{1,3} /, "")}</div>
                : <span key={i}>{part}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI: Synopsis Helper ───────────────────────────────────────────────────
function SynopsisHelper({ apiKey, book, agents }) {
  const [selAgent, setSelAgent] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState("");
  const [err,      setErr]      = useState("");
  const agent  = agents.find(a => a.id === selAgent);
  const synLen = agent?.req?.synopsisLen || "1 page";

  const generate = async () => {
    setLoading(true); setErr(""); setResult("");
    try {
      const data = await callClaude({
        apiKey, max_tokens: 1200,
        system: "You are an expert in writing novel synopses for literary agents. Write tight, professional, spoiler-inclusive synopses.",
        messages: [{ role: "user", content: `Write an agent-ready synopsis for my Epic Fantasy novel.

Title: ${book.title || "(untitled)"} | Plot: ${book.synopsis || "(no synopsis provided)"}
Themes: ${book.themes} | Hooks: ${book.hooks}

${agent ? `Agent: ${agent.name} at ${agent.agency} | Requires: ${synLen} | Wishlist: ${agent.wishlist || "not specified"}` : "Format: 1-page synopsis (~400–500 words)"}

Write a complete, spoiler-inclusive synopsis covering protagonist, conflict, arc, and resolution.` }],
      });
      setResult((data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n"));
    } catch (e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: "#f0f6fc", marginBottom: 4 }}>📄 Synopsis Helper <AIBadge /></div>
        <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 14 }}>Writes a polished synopsis calibrated to the exact length an agent requires.</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 5, letterSpacing: "0.06em", textTransform: "uppercase" }}>TARGET AGENT (optional)</label>
          <select value={selAgent} onChange={e => setSelAgent(e.target.value)} style={iS}>
            <option value="">— General 1-page synopsis —</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name} · {a.agency} {a.req?.synopsis ? `(needs ${a.req.synopsisLen || "synopsis"})` : "(no synopsis req.)"}</option>)}
          </select>
        </div>
        <Btn onClick={generate} disabled={loading || !book.synopsis}>{loading ? <><Spinner size={14} /> Writing…</> : "📄 Generate Synopsis"}</Btn>
        {!book.synopsis && <span style={{ fontSize: 12, color: "#8b949e", marginLeft: 12 }}>Add your plot summary in Book Profile first</span>}
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 12, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, padding: "10px 14px" }}>⚠️ {err}</div>}
      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "#8b949e" }}><Spinner size={32} /><div style={{ marginTop: 14, fontSize: 14 }}>Writing your synopsis…</div></div>}
      {result && (
        <div className="card fi">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700, color: "#d4a853" }}>Generated Synopsis {agent ? `for ${agent.name}` : "(1-page)"}</div>
            <Btn onClick={() => navigator.clipboard.writeText(result)} variant="dark" style={{ fontSize: 12, padding: "6px 14px" }}>📋 Copy</Btn>
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.75, color: "#c9d1d9", whiteSpace: "pre-wrap", borderTop: "1px solid #21262d", paddingTop: 14 }}>{result}</div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  AGENT LIST
// ═══════════════════════════════════════════════════════════════════════════
function AgentList({ agents, onSelect, onAdd }) {
  const [search, setSearch] = useState("");
  const [sFilt,  setSFilt]  = useState("all");
  const [pFilt,  setPFilt]  = useState("all");

  const filtered = agents.filter(a =>
    (!search || a.name.toLowerCase().includes(search.toLowerCase()) || a.agency.toLowerCase().includes(search.toLowerCase()) || (a.wishlist || "").toLowerCase().includes(search.toLowerCase())) &&
    (sFilt === "all" || a.status === sFilt) &&
    (pFilt === "all" || a.priority === pFilt)
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 9, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, agency, wishlist…" style={{ ...iS, paddingLeft: 32 }} />
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#8b949e", pointerEvents: "none", fontSize: 13 }}>🔍</span>
        </div>
        <select value={sFilt} onChange={e => setSFilt(e.target.value)} style={{ ...iS, width: "auto" }}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={pFilt} onChange={e => setPFilt(e.target.value)} style={{ ...iS, width: "auto" }}>
          <option value="all">All Priorities</option>
          <option value="high">⬆ High</option>
          <option value="medium">— Medium</option>
          <option value="low">⬇ Low</option>
        </select>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "50px 0", color: "#8b949e" }}><div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div><div style={{ fontSize: 14 }}>No agents match. <span onClick={onAdd} style={{ color: "#d4a853", cursor: "pointer" }}>Add one →</span></div></div>}
        {filtered.map(a => (
          <div key={a.id} onClick={() => onSelect(a.id)}
            style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 10, padding: "13px 17px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, transition: "border-color 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#d4a85340"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#21262d"}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: a.priority === "high" ? "#ef4444" : a.priority === "medium" ? "#f59e0b" : "#6b7280", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 9, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#f0f6fc" }}>{a.name}</span>
                <span style={{ fontSize: 13, color: "#8b949e" }}>{a.agency}</span>
                {a.closed && <span style={{ fontSize: 10, color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 4, padding: "1px 7px" }}>CLOSED</span>}
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                <span style={bdg(a.status)}>{STATUSES[a.status]?.label}</span>
                <span style={{ fontSize: 11, color: "#8b949e" }}>via {a.queryMethod}</span>
                {a.subDate && <span style={{ fontSize: 11, color: "#8b949e" }}>📅 {a.subDate}</span>}
                <span style={{ fontSize: 11, color: "#8b949e" }}>⏱ {a.responseTime}</span>
              </div>
            </div>
            <span style={{ fontSize: 12, color: "#d4a853", flexShrink: 0 }}>View →</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  AGENT DETAIL
// ═══════════════════════════════════════════════════════════════════════════
function AgentDetail({ agent, book, apiKey, onBack, onSave, onDelete }) {
  const [a,      setA]      = useState({ ...agent });
  const [dirty,  setDirty]  = useState(false);
  const [del,    setDel]    = useState(false);
  const [aiNote, setAiNote] = useState("");
  const [aiLoad, setAiLoad] = useState(false);

  const up    = ch => { setA(p => ({ ...p, ...ch })); setDirty(true); };
  const upReq = ch => { setA(p => ({ ...p, req: { ...p.req, ...ch } })); setDirty(true); };
  const save  = ()  => { onSave(a); setDirty(false); };
  const chSt  = (s) => { const e = { status: s, date: today() }; setA(p => ({ ...p, status: s, history: [...(p.history || []), e] })); setDirty(true); };

  const genHints = async () => {
    setAiLoad(true); setAiNote("");
    try {
      const data = await callClaude({
        apiKey, max_tokens: 600,
        system: "You are a query letter consultant. Give concise, specific personalization advice.",
        messages: [{ role: "user", content: `Give me 3 specific personalization ideas for querying this agent. Be brief and actionable.\n\nAGENT: ${a.name} at ${a.agency}\nWISHLIST: ${a.wishlist || "not specified"}\n\nMY BOOK:\nTitle: ${book.title || "(not set)"}\nLogline: ${book.logline || "(not set)"}\nThemes: ${book.themes || "(not set)"}\nHooks: ${book.hooks || "(not set)"}\n\nGive 3 specific opening lines or angles I could use.` }],
      });
      setAiNote((data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n"));
    } catch (e) { setAiNote("Error: " + e.message); }
    setAiLoad(false);
  };

  const packet = [a.req?.queryLetter && "✓ Query Letter", a.req?.synopsis && `✓ Synopsis (${a.req.synopsisLen || "?"})`, (a.req?.samplePages || 0) > 0 && `✓ First ${a.req.samplePages} pages`, a.req?.bio && "✓ Author Bio", a.req?.comps && "✓ Comp Titles", a.req?.wordCount && "✓ Word Count", a.req?.other && `✓ ${a.req.other}`].filter(Boolean);

  return (
    <div className="fi">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#d4a853", cursor: "pointer", fontSize: 14, fontFamily: "'Crimson Text',Georgia,serif" }}>← Back</button>
        <div style={{ display: "flex", gap: 8 }}>
          {del ? (<><span style={{ fontSize: 13, color: "#f87171" }}>Delete?</span><Btn onClick={() => onDelete(a.id)} variant="danger">Yes</Btn><Btn onClick={() => setDel(false)} variant="dark">Cancel</Btn></>)
            : (<><Btn onClick={() => setDel(true)} variant="danger">Delete</Btn>{dirty && <Btn onClick={save}>💾 Save</Btn>}</>)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <input value={a.name} onChange={e => up({ name: e.target.value })} style={{ background: "transparent", border: "none", color: "#f0f6fc", fontFamily: "'Crimson Text',Georgia,serif", fontSize: 22, fontWeight: 700, width: "100%", padding: 0, outline: "none" }} />
                <input value={a.agency} onChange={e => up({ agency: e.target.value })} style={{ background: "transparent", border: "none", color: "#8b949e", fontFamily: "'Crimson Text',Georgia,serif", fontSize: 14, width: "100%", padding: 0, marginTop: 2, outline: "none" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, alignItems: "flex-end", flexShrink: 0, marginLeft: 12 }}>
                <select value={a.status} onChange={e => chSt(e.target.value)} style={{ ...bdg(a.status), fontFamily: "'Crimson Text',Georgia,serif", cursor: "pointer" }}>
                  {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={a.priority || "medium"} onChange={e => up({ priority: e.target.value })} style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 6, padding: "3px 8px", color: a.priority === "high" ? "#f87171" : a.priority === "medium" ? "#fbbf24" : "#6b7280", fontFamily: "'Crimson Text',Georgia,serif", fontSize: 12, cursor: "pointer" }}>
                  <option value="high">⬆ High</option><option value="medium">— Medium</option><option value="low">⬇ Low</option>
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>WEBSITE</label><input value={a.website || ""} onChange={e => up({ website: e.target.value })} style={iS} /></div>
              <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>QUERY METHOD</label>
                <select value={a.queryMethod || "Email"} onChange={e => up({ queryMethod: e.target.value })} style={iS}>
                  {["QueryManager", "Email", "Submittable", "Publisher's Marketplace", "Website Form"].map(m => <option key={m}>{m}</option>)}
                </select></div>
              <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>SUBMITTED</label><input type="date" value={a.subDate || ""} onChange={e => up({ subDate: e.target.value })} style={iS} /></div>
              <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>RESPONSE TIME</label><input value={a.responseTime || ""} onChange={e => up({ responseTime: e.target.value })} style={iS} /></div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, cursor: "pointer" }}>
              <input type="checkbox" checked={a.closed || false} onChange={e => up({ closed: e.target.checked })} />
              <span style={{ fontSize: 13, color: "#f87171" }}>Currently closed to queries</span>
            </label>
          </div>

          <div className="card">
            <div className="st">📋 Submission Requirements</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 12 }}>
              {[{ k: "queryLetter", l: "Query Letter" }, { k: "bio", l: "Author Bio" }, { k: "comps", l: "Comp Titles" }, { k: "wordCount", l: "Word Count" }].map(({ k, l }) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={a.req?.[k] || false} onChange={e => upReq({ [k]: e.target.checked })} />
                  <span style={{ fontSize: 13, color: a.req?.[k] ? "#c9d1d9" : "#8b949e" }}>{l}</span>
                </label>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}>
                  <input type="checkbox" checked={a.req?.synopsis || false} onChange={e => upReq({ synopsis: e.target.checked })} />
                  <span style={{ fontSize: 13, color: a.req?.synopsis ? "#c9d1d9" : "#8b949e" }}>Synopsis</span>
                </label>
                {a.req?.synopsis && <input value={a.req?.synopsisLen || ""} onChange={e => upReq({ synopsisLen: e.target.value })} placeholder="Length" style={{ ...iS, fontSize: 12 }} />}
              </div>
              <div>
                <label style={{ fontSize: 13, color: "#c9d1d9", display: "block", marginBottom: 6 }}>Sample Pages</label>
                <input type="number" value={a.req?.samplePages || 0} onChange={e => upReq({ samplePages: parseInt(e.target.value) || 0 })} style={{ ...iS, fontSize: 12 }} />
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>OTHER</label>
              <input value={a.req?.other || ""} onChange={e => upReq({ other: e.target.value })} placeholder="e.g. paste in email body" style={iS} />
            </div>
          </div>

          <div className="card">
            <div className="st">🌟 Agent Wishlist / MSWL</div>
            <Textarea value={a.wishlist || ""} onChange={e => up({ wishlist: e.target.value })} rows={4} placeholder="What this agent wants in Epic Fantasy…" />
          </div>

          <div className="card" style={{ border: "1px solid rgba(212,168,83,0.2)" }}>
            <div className="st">✨ AI Personalization Hints <AIBadge /></div>
            <Btn onClick={genHints} disabled={aiLoad} style={{ marginBottom: 10, fontSize: 13 }}>{aiLoad ? <><Spinner size={13} /> Generating…</> : "Generate Hints"}</Btn>
            {aiNote && <div style={{ fontSize: 13, color: "#c9d1d9", lineHeight: 1.7, whiteSpace: "pre-wrap", borderTop: "1px solid #21262d", paddingTop: 10 }}>{aiNote}</div>}
          </div>

          <div className="card">
            <div className="st">📝 My Notes</div>
            <Textarea value={a.notes || ""} onChange={e => up({ notes: e.target.value })} rows={3} placeholder="Personalization ideas, research notes…" />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <div className="st">Submission Packet</div>
            {packet.length === 0 ? <p style={{ fontSize: 12, color: "#8b949e" }}>No requirements set.</p>
              : packet.map((t, i) => <div key={i} style={{ fontSize: 13, color: "#34d399", marginBottom: 7 }}>{t}</div>)}
          </div>

          <div className="card">
            <div className="st">Status History</div>
            {(!a.history || a.history.length === 0) ? <p style={{ fontSize: 12, color: "#8b949e" }}>No changes yet.</p>
              : [...a.history].reverse().map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: i < a.history.length - 1 ? "1px solid #21262d" : "none" }}>
                  <span style={bdg(h.status)}>{STATUSES[h.status]?.label}</span>
                  <span style={{ fontSize: 11, color: "#8b949e" }}>{h.date}</span>
                </div>
              ))
            }
          </div>

          <div className="card">
            <div className="st">Quick Links</div>
            {a.website && <a href={a.website} target="_blank" rel="noreferrer" style={{ display: "block", color: "#d4a853", fontSize: 13, marginBottom: 8, textDecoration: "none" }}>🌐 Agent Website ↗</a>}
            {[["https://querytracker.net", "📊 QueryTracker"], ["https://manuscriptwishlist.com", "⭐ MSWL.com"], ["https://www.publishersmarketplace.com", "📚 Publishers Marketplace"], ["https://querymanager.com", "🗂 QueryManager"]].map(([url, label]) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" style={{ display: "block", color: "#60a5fa", fontSize: 13, marginBottom: 8, textDecoration: "none" }}>{label} ↗</a>
            ))}
          </div>

          {dirty && <Btn onClick={save} style={{ width: "100%", justifyContent: "center" }}>💾 Save Changes</Btn>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  ADD AGENT
// ═══════════════════════════════════════════════════════════════════════════
function AddAgent({ onBack, onSave }) {
  const [d, setD] = useState({ name: "", agency: "", website: "", queryMethod: "QueryManager", responseTime: "", status: "researching", priority: "medium", wishlist: "", closed: false, notes: "", genres: ["Epic Fantasy"], req: { queryLetter: true, synopsis: false, synopsisLen: "", samplePages: 10, bio: false, comps: true, wordCount: true, other: "" } });
  const up    = ch => setD(p => ({ ...p, ...ch }));
  const upReq = ch => setD(p => ({ ...p, req: { ...p.req, ...ch } }));
  const ok    = d.name.trim() && d.agency.trim();

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#d4a853", cursor: "pointer", fontSize: 14, fontFamily: "'Crimson Text',Georgia,serif" }}>← Back</button>
        <Btn onClick={() => ok && onSave(d)} disabled={!ok}>Add Agent</Btn>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
          {[["name", "AGENT NAME *", "Agent's full name"], ["agency", "AGENCY *", "Agency name"], ["website", "WEBSITE", "https://…"], ["responseTime", "RESPONSE TIME", "6–8 weeks"]].map(([k, label, ph]) => (
            <div key={k}>
              <label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</label>
              <input value={d[k] || ""} onChange={e => up({ [k]: e.target.value })} placeholder={ph} style={iS} />
            </div>
          ))}
          <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>QUERY METHOD</label>
            <select value={d.queryMethod} onChange={e => up({ queryMethod: e.target.value })} style={iS}>
              {["QueryManager", "Email", "Submittable", "Publisher's Marketplace", "Website Form"].map(m => <option key={m}>{m}</option>)}
            </select></div>
          <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>PRIORITY</label>
            <select value={d.priority} onChange={e => up({ priority: e.target.value })} style={iS}>
              <option value="high">⬆ High</option><option value="medium">— Medium</option><option value="low">⬇ Low</option>
            </select></div>
        </div>
        <div style={{ borderTop: "1px solid #21262d", paddingTop: 12 }}>
          <div className="st">Requirements</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 10 }}>
            {[{ k: "queryLetter", l: "Query Letter" }, { k: "bio", l: "Bio" }, { k: "comps", l: "Comps" }, { k: "wordCount", l: "Word Count" }, { k: "synopsis", l: "Synopsis" }].map(({ k, l }) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}>
                <input type="checkbox" checked={d.req[k] || false} onChange={e => upReq({ [k]: e.target.checked })} />
                <span style={{ fontSize: 13, color: "#c9d1d9" }}>{l}</span>
              </label>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {d.req.synopsis && <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>SYNOPSIS LENGTH</label><input value={d.req.synopsisLen || ""} onChange={e => upReq({ synopsisLen: e.target.value })} placeholder="1 page" style={iS} /></div>}
            <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>SAMPLE PAGES</label><input type="number" value={d.req.samplePages || 0} onChange={e => upReq({ samplePages: parseInt(e.target.value) || 0 })} style={iS} /></div>
          </div>
        </div>
        <div><label style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "#8b949e", display: "block", marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>WISHLIST / MSWL</label><Textarea value={d.wishlist || ""} onChange={e => up({ wishlist: e.target.value })} rows={3} /></div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={d.closed || false} onChange={e => up({ closed: e.target.checked })} />
          <span style={{ fontSize: 13, color: "#f87171" }}>Closed to queries</span>
        </label>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  PIPELINE
// ═══════════════════════════════════════════════════════════════════════════
function Pipeline({ agents, onAgent }) {
  const cols = Object.keys(STATUSES);
  return (
    <div>
      <p style={{ fontSize: 13, color: "#8b949e", marginBottom: 14 }}>Kanban view of your query pipeline. Click any card to open the agent detail.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 10 }}>
        {cols.slice(0, 4).map(s => <PCol key={s} status={s} agents={agents} onAgent={onAgent} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {cols.slice(4).map(s => <PCol key={s} status={s} agents={agents} onAgent={onAgent} />)}
      </div>
    </div>
  );
}

function PCol({ status, agents, onAgent }) {
  const col = agents.filter(a => a.status === status);
  const c   = STATUSES[status];
  return (
    <div style={{ background: "#161b22", border: `1px solid ${c.color}20`, borderTop: `3px solid ${c.color}`, borderRadius: 10, padding: 12, minHeight: 100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, fontWeight: 700, color: c.color }}>{c.label}</span>
        <span style={{ fontSize: 11, color: "#8b949e", background: "#21262d", borderRadius: 10, padding: "2px 8px" }}>{col.length}</span>
      </div>
      {col.length === 0 && <p style={{ fontSize: 12, color: "#8b949e", fontStyle: "italic" }}>Empty</p>}
      {col.map(a => (
        <div key={a.id} onClick={() => onAgent(a.id)}
          style={{ background: "#0d1117", border: "1px solid #21262d", borderRadius: 6, padding: "8px 10px", marginBottom: 7, cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.borderColor = c.color + "44"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#21262d"}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f0f6fc" }}>{a.name}</div>
          <div style={{ fontSize: 11, color: "#8b949e" }}>{a.agency}</div>
          {a.subDate && <div style={{ fontSize: 11, color: "#8b949e", marginTop: 3 }}>📅 {a.subDate}</div>}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.priority === "high" ? "#ef4444" : a.priority === "medium" ? "#f59e0b" : "#6b7280", marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}
