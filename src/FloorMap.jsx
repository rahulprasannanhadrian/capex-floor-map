import { useState, useRef, useEffect } from "react";

const WORK_AREAS = {
  WLD: { name: "Weld", color: "#ef4444", bg: "#450a0a" },
  NDT: { name: "NDT", color: "#f97316", bg: "#431407" },
  FAB: { name: "Fab Lab", color: "#eab308", bg: "#422006" },
  FLX: { name: "Flexible Line", color: "#22c55e", bg: "#052e16" },
  FRD: { name: "Factory R&D", color: "#06b6d4", bg: "#083344" },
  FRG: { name: "Forge", color: "#8b5cf6", bg: "#2e1065" },
  TLG: { name: "Tooling", color: "#ec4899", bg: "#500724" },
  AUT: { name: "Automation", color: "#3b82f6", bg: "#172554" },
  INV: { name: "Inventory", color: "#94a3b8", bg: "#1e293b" },
  ADD: { name: "Additive", color: "#14b8a6", bg: "#042f2e" },
};
const REVIEW_COLORS = { "Not Started": "#64748b", "In Progress": "#f59e0b", "In Review": "#3b82f6", Approved: "#22c55e" };
const PURPOSES = ["RND", "General Purpose", "Dedicated Customer"];
const CELL = 54, GAP = 2;
const EDIT_PASSWORD = "capex2026";
const STORAGE_KEY = "capex-floor-map-v3";

const makeRows = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
const makeCols = (n) => Array.from({ length: n }, (_, i) => i + 1);
const bk = (r, c) => `${r}${c}`;

// Convert selected bays into range string like A1:C3 or A1:C3+E1:E3
const baysToRangeStr = (keys) => {
  if (!keys.length) return "";
  const parsed = keys.map(k => ({ row: k.match(/[A-Z]+/)[0], col: parseInt(k.match(/\d+/)[0]) }));
  // Group into rectangular blocks
  const sorted = parsed.sort((a, b) => a.row.localeCompare(b.row) || a.col - b.col);
  const used = new Set();
  const ranges = [];
  for (const p of sorted) {
    const k = bk(p.row, p.col);
    if (used.has(k)) continue;
    // Find max rectangle starting from this point
    let maxR = p.row, maxC = p.col;
    // Extend columns
    while (keys.includes(bk(p.row, maxC + 1)) && !used.has(bk(p.row, maxC + 1))) maxC++;
    // Extend rows
    let canExtend = true;
    while (canExtend) {
      const nextRow = String.fromCharCode(maxR.charCodeAt(0) + 1);
      for (let c = p.col; c <= maxC; c++) {
        if (!keys.includes(bk(nextRow, c)) || used.has(bk(nextRow, c))) { canExtend = false; break; }
      }
      if (canExtend) maxR = nextRow;
    }
    // Mark used
    for (let ri = p.row.charCodeAt(0); ri <= maxR.charCodeAt(0); ri++) {
      for (let c = p.col; c <= maxC; c++) used.add(bk(String.fromCharCode(ri), c));
    }
    ranges.push(p.row === maxR && p.col === maxC ? `${p.row}${p.col}` : `${p.row}${p.col}:${maxR}${maxC}`);
  }
  return ranges.join("+");
};

const defaultState = () => ({
  rows: 10, cols: 12, disabled: {},
  // bays: { "A1": { area: "WLD" }, ... } — which work area owns the bay
  bays: {},
  // workCells: [ { id, name, area, bays: ["A1","A2"], purpose, reviewStatus, commissionStatus } ]
  workCells: [],
  // equipment: [ { id, name, status, cellId: null|id, bays: ["A1"], area: "WLD" } ]
  equipment: [],
  nextCellId: 1, nextEqId: 1,
});

const loadState = () => { try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : defaultState(); } catch { return defaultState(); } };
const saveState = (d) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} };

export default function FloorMap() {
  const [data, setData] = useState(loadState);
  const [mode, setMode] = useState("view"); // view | area | cell | equipment | disable
  const [unlocked, setUnlocked] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);
  const [pwInput, setPwInput] = useState("");
  const [pwErr, setPwErr] = useState(false);
  const [selectedArea, setSelectedArea] = useState("WLD");
  const [selectedPurpose, setSelectedPurpose] = useState("RND");
  const [cellName, setCellName] = useState("");
  const [eqName, setEqName] = useState("");
  const [eqCell, setEqCell] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selStart, setSelStart] = useState(null);
  const [selEnd, setSelEnd] = useState(null);
  const [hovBay, setHovBay] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showGrid, setShowGrid] = useState(false);
  const [tmpR, setTmpR] = useState(data.rows);
  const [tmpC, setTmpC] = useState(data.cols);
  const [selectedBay, setSelectedBay] = useState(null);
  const gridRef = useRef(null);

  const ROWS = makeRows(data.rows), COLS = makeCols(data.cols);

  useEffect(() => { saveState(data); }, [data]);
  useEffect(() => { const p = new URLSearchParams(window.location.search); if (p.get("edit") === "true") setUnlocked(true); }, []);

  const getSelBays = () => {
    if (!selStart || !selEnd) return [];
    const r1 = Math.min(ROWS.indexOf(selStart.row), ROWS.indexOf(selEnd.row));
    const r2 = Math.max(ROWS.indexOf(selStart.row), ROWS.indexOf(selEnd.row));
    const c1 = Math.min(selStart.col, selEnd.col), c2 = Math.max(selStart.col, selEnd.col);
    const keys = [];
    for (let ri = r1; ri <= r2; ri++) for (let ci = c1; ci <= c2; ci++) {
      const k = bk(ROWS[ri], ci);
      if (!data.disabled[k]) keys.push(k);
    }
    return keys;
  };
  const selBays = getSelBays();

  const tryEdit = (m) => {
    if (unlocked) { setMode(m); setSelStart(null); setSelEnd(null); }
    else { setPendingMode(m); setShowPw(true); setPwInput(""); setPwErr(false); }
  };
  const submitPw = () => {
    if (pwInput === EDIT_PASSWORD) { setUnlocked(true); setShowPw(false); if (pendingMode) { setMode(pendingMode); setSelStart(null); setSelEnd(null); } }
    else setPwErr(true);
  };

  const onDown = (row, col) => {
    if (mode === "disable") {
      const k = bk(row, col);
      if (data.bays[k]) return;
      setData(p => { const d = { ...p.disabled }; d[k] ? delete d[k] : (d[k] = true); return { ...p, disabled: d }; });
      setSelecting(true);
    } else if (mode === "area" || mode === "cell" || mode === "equipment") {
      setSelecting(true); setSelStart({ row, col }); setSelEnd({ row, col });
    }
  };
  const onEnter = (row, col, e) => {
    if (selecting) {
      if (mode === "disable") {
        const k = bk(row, col);
        if (!data.bays[k]) setData(p => ({ ...p, disabled: { ...p.disabled, [k]: true } }));
      } else setSelEnd({ row, col });
    }
    setHovBay(bk(row, col));
    if (mode === "view") {
      const k = bk(row, col);
      if (data.bays[k]) setTooltip({ bay: k, x: e.clientX, y: e.clientY });
      else setTooltip(null);
    }
  };
  const onMove = (e) => { if (tooltip) setTooltip(p => ({ ...p, x: e.clientX, y: e.clientY })); };
  const onUp = () => setSelecting(false);

  // Assign area to bays
  const assignArea = () => {
    if (!selBays.length) return;
    setData(p => {
      const nb = { ...p.bays };
      selBays.forEach(k => { nb[k] = { area: selectedArea }; });
      return { ...p, bays: nb };
    });
    setSelStart(null); setSelEnd(null);
  };

  // Create work cell from selected bays
  const assignCell = () => {
    if (!selBays.length || !cellName.trim()) return;
    // All selected bays must belong to the same area
    const areas = new Set(selBays.map(k => data.bays[k]?.area).filter(Boolean));
    if (areas.size === 0) { alert("Selected bays must be assigned to a work area first."); return; }
    if (areas.size > 1) { alert("Selected bays span multiple work areas. Select bays within one area."); return; }
    const area = [...areas][0];
    const id = data.nextCellId;
    setData(p => ({
      ...p,
      workCells: [...p.workCells, {
        id, name: cellName.trim(), area, bays: [...selBays],
        bayRange: baysToRangeStr(selBays), purpose: selectedPurpose,
        reviewStatus: null, commissionStatus: "Active",
      }],
      nextCellId: p.nextCellId + 1,
    }));
    setCellName(""); setSelStart(null); setSelEnd(null);
  };

  // Add equipment to selected bays
  const assignEquipment = () => {
    if (!selBays.length || !eqName.trim()) return;
    const areas = new Set(selBays.map(k => data.bays[k]?.area).filter(Boolean));
    if (areas.size === 0) { alert("Selected bays must be assigned to a work area first."); return; }
    const area = [...areas][0];
    const cellId = eqCell ? parseInt(eqCell) : null;
    const id = `EQ-${area}-${String(data.nextEqId).padStart(3, "0")}`;
    setData(p => ({
      ...p,
      equipment: [...p.equipment, { id, name: eqName.trim(), status: "ROM Quotes", cellId, bays: [...selBays], area }],
      nextEqId: p.nextEqId + 1,
    }));
    setEqName(""); setSelStart(null); setSelEnd(null);
  };

  // Get all data for a bay
  const bayInfo = (key) => {
    const area = data.bays[key]?.area;
    if (!area) return null;
    const cells = data.workCells.filter(c => c.bays.includes(key));
    const eqs = data.equipment.filter(eq => eq.bays.includes(key));
    return { area, cells, equipment: eqs };
  };

  // Clear area from bays
  const clearBayArea = (key) => {
    setData(p => {
      const nb = { ...p.bays }; delete nb[key];
      return { ...p, bays: nb, workCells: p.workCells.map(c => ({ ...c, bays: c.bays.filter(b => b !== key) })).filter(c => c.bays.length > 0), equipment: p.equipment.map(eq => ({ ...eq, bays: eq.bays.filter(b => b !== key) })).filter(eq => eq.bays.length > 0) };
    });
  };

  const removeCell = (id) => setData(p => ({ ...p, workCells: p.workCells.filter(c => c.id !== id), equipment: p.equipment.map(eq => eq.cellId === id ? { ...eq, cellId: null } : eq) }));
  const removeEquipment = (id) => setData(p => ({ ...p, equipment: p.equipment.filter(eq => eq.id !== id) }));

  const applyGrid = () => {
    if (tmpR < 1 || tmpR > 26 || tmpC < 1 || tmpC > 30) return;
    const valid = new Set(); makeRows(tmpR).forEach(r => makeCols(tmpC).forEach(c => valid.add(bk(r, c))));
    setData(p => ({
      ...p, rows: tmpR, cols: tmpC,
      bays: Object.fromEntries(Object.entries(p.bays).filter(([k]) => valid.has(k))),
      disabled: Object.fromEntries(Object.entries(p.disabled).filter(([k]) => valid.has(k))),
      workCells: p.workCells.map(c => ({ ...c, bays: c.bays.filter(b => valid.has(b)) })).filter(c => c.bays.length > 0),
      equipment: p.equipment.map(eq => ({ ...eq, bays: eq.bays.filter(b => valid.has(b)) })).filter(eq => eq.bays.length > 0),
    }));
    setShowGrid(false);
  };

  const resetAll = () => { if (confirm("Reset everything?")) { const f = defaultState(); setData(f); setTmpR(f.rows); setTmpC(f.cols); localStorage.removeItem(STORAGE_KEY); } };

  const stats = {
    total: ROWS.length * COLS.length - Object.keys(data.disabled).length,
    assigned: Object.keys(data.bays).length,
    cells: data.workCells.length,
    equipment: data.equipment.length,
  };

  // Cells in selected bays (for equipment assignment dropdown)
  const cellsInSelection = selBays.length > 0 ? data.workCells.filter(c => c.bays.some(b => selBays.includes(b))) : [];

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, sans-serif", background: "#090c10", color: "#c9d1d9", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid #21262d", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, background: "#1f6feb22", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><rect x="1" y="1" width="7" height="7" rx="1" stroke="#58a6ff" strokeWidth="1.5"/><rect x="10" y="1" width="7" height="7" rx="1" stroke="#58a6ff" strokeWidth="1.5"/><rect x="1" y="10" width="7" height="7" rx="1" stroke="#58a6ff" strokeWidth="1.5"/><rect x="10" y="10" width="7" height="7" rx="1" stroke="#58a6ff" strokeWidth="1.5"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>Factory Floor Map</div>
            <div style={{ fontSize: 10, color: "#484f58" }}>Fx · {data.rows}×{data.cols} · {stats.assigned} bays · {stats.cells} cells · {stats.equipment} equip</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button onClick={() => { setMode("view"); setSelStart(null); setSelEnd(null); }} style={{ ...B, background: mode === "view" ? "#1f6feb" : "#21262d", color: mode === "view" ? "#fff" : "#8b949e", border: mode === "view" ? "1px solid #388bfd" : "1px solid #30363d" }}>👁 View</button>
          {[["area", "🎨 Area"], ["cell", "📦 Cell"], ["equipment", "⚙ Equip"], ["disable", "🚫 Shape"]].map(([m, l]) => (
            <button key={m} onClick={() => tryEdit(m)} style={{
              ...B, background: mode === m ? (m === "disable" ? "#da3633" : "#1f6feb") : "#21262d",
              color: mode === m ? "#fff" : unlocked ? "#8b949e" : "#484f58",
              border: mode === m ? `1px solid ${m === "disable" ? "#f85149" : "#388bfd"}` : "1px solid #30363d",
              opacity: !unlocked && mode !== m ? 0.6 : 1,
            }}>{l}{!unlocked && " 🔒"}</button>
          ))}
          {unlocked && (
            <>
              <button onClick={() => { setShowGrid(!showGrid); setTmpR(data.rows); setTmpC(data.cols); }} style={{ ...B, background: "#21262d", color: "#8b949e", border: "1px solid #30363d" }}>⚙</button>
              <button onClick={resetAll} style={{ ...B, background: "#21262d", color: "#f85149", border: "1px solid #30363d", fontSize: 11 }}>Reset</button>
              <button onClick={() => { setUnlocked(false); setMode("view"); }} style={{ ...B, background: "#21262d", color: "#f59e0b", border: "1px solid #30363d", fontSize: 11 }}>🔒</button>
            </>
          )}
        </div>
      </div>

      {showGrid && (
        <div style={{ padding: "8px 20px", borderBottom: "1px solid #21262d", background: "#0d1117", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#8b949e" }}>Grid:</span>
          <input type="number" min="1" max="26" value={tmpR} onChange={e => setTmpR(parseInt(e.target.value) || 1)} style={{ ...INP, width: 50, textAlign: "center" }} />
          <span style={{ color: "#484f58" }}>×</span>
          <input type="number" min="1" max="30" value={tmpC} onChange={e => setTmpC(parseInt(e.target.value) || 1)} style={{ ...INP, width: 50, textAlign: "center" }} />
          <button onClick={applyGrid} style={{ ...B, background: "#238636", color: "#fff", border: "1px solid #2ea043" }}>Apply</button>
        </div>
      )}

      {/* Mode bar */}
      {mode !== "view" && (
        <div style={{ padding: "6px 20px", borderBottom: "1px solid #21262d", background: mode === "disable" ? "#1c0a0a" : "#0a1929", fontSize: 12, color: mode === "disable" ? "#f85149" : "#58a6ff" }}>
          {mode === "area" && <><strong>Area Mode:</strong> Drag to select bays → assign a work area. Multiple selections for the same area extend it. Use + notation for L/C shapes.</>}
          {mode === "cell" && <><strong>Cell Mode:</strong> Drag to select bays within an area → name a work cell. Bays can hold multiple cells.</>}
          {mode === "equipment" && <><strong>Equipment Mode:</strong> Drag to select bays → add equipment. Optionally assign to a work cell within those bays.</>}
          {mode === "disable" && <><strong>Shape Mode:</strong> Click/drag to disable bays for walls, corridors, non-usable areas.</>}
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 250, borderRight: "1px solid #21262d", padding: "12px", overflowY: "auto", flexShrink: 0 }}>
          {mode === "area" && (
            <>
              <div style={HDR}>Assign Work Area</div>
              <label style={LBL}>Work Area</label>
              <select value={selectedArea} onChange={e => setSelectedArea(e.target.value)} style={SEL}>
                {Object.entries(WORK_AREAS).map(([k, v]) => <option key={k} value={k}>{v.name} ({k})</option>)}
              </select>
              {selBays.length > 0 && (
                <div style={{ marginTop: 12, padding: 10, background: "#161b22", borderRadius: 6, border: "1px solid #30363d" }}>
                  <div style={{ fontSize: 12, color: "#8b949e" }}>Selected: <span style={{ color: "#58a6ff", fontFamily: "'DM Mono', monospace" }}>{baysToRangeStr(selBays)}</span></div>
                  <div style={{ fontSize: 11, color: "#484f58" }}>{selBays.length} bays</div>
                  <button onClick={assignArea} style={{ ...B, background: WORK_AREAS[selectedArea].bg, color: WORK_AREAS[selectedArea].color, border: `1px solid ${WORK_AREAS[selectedArea].color}44`, width: "100%", marginTop: 8, padding: "7px 0" }}>
                    Assign → {WORK_AREAS[selectedArea].name}
                  </button>
                </div>
              )}
            </>
          )}
          {mode === "cell" && (
            <>
              <div style={HDR}>Create Work Cell</div>
              <label style={LBL}>Cell Name</label>
              <input value={cellName} onChange={e => setCellName(e.target.value)} placeholder="e.g. Weld Cell Alpha" style={INP} />
              <label style={LBL}>Purpose</label>
              <select value={selectedPurpose} onChange={e => setSelectedPurpose(e.target.value)} style={SEL}>
                {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {selBays.length > 0 && (
                <div style={{ marginTop: 12, padding: 10, background: "#161b22", borderRadius: 6, border: "1px solid #30363d" }}>
                  <div style={{ fontSize: 12, color: "#8b949e" }}>Bays: <span style={{ color: "#58a6ff", fontFamily: "'DM Mono', monospace" }}>{baysToRangeStr(selBays)}</span></div>
                  <button onClick={assignCell} disabled={!cellName.trim()} style={{ ...B, background: "#238636", color: "#fff", border: "1px solid #2ea043", width: "100%", marginTop: 8, padding: "7px 0", opacity: cellName.trim() ? 1 : 0.4 }}>
                    Create Cell
                  </button>
                </div>
              )}
            </>
          )}
          {mode === "equipment" && (
            <>
              <div style={HDR}>Add Equipment</div>
              <label style={LBL}>Equipment Name</label>
              <input value={eqName} onChange={e => setEqName(e.target.value)} placeholder="e.g. Ultrasonic Scanner" style={INP} />
              <label style={LBL}>Assign to Cell (optional)</label>
              <select value={eqCell} onChange={e => setEqCell(e.target.value)} style={SEL}>
                <option value="">— Directly on area —</option>
                {cellsInSelection.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {selBays.length > 0 && (
                <div style={{ marginTop: 12, padding: 10, background: "#161b22", borderRadius: 6, border: "1px solid #30363d" }}>
                  <div style={{ fontSize: 12, color: "#8b949e" }}>Bays: <span style={{ color: "#58a6ff", fontFamily: "'DM Mono', monospace" }}>{baysToRangeStr(selBays)}</span></div>
                  <button onClick={assignEquipment} disabled={!eqName.trim()} style={{ ...B, background: "#238636", color: "#fff", border: "1px solid #2ea043", width: "100%", marginTop: 8, padding: "7px 0", opacity: eqName.trim() ? 1 : 0.4 }}>
                    Add Equipment
                  </button>
                </div>
              )}
            </>
          )}
          {mode === "disable" && (
            <>
              <div style={HDR}>Building Shape</div>
              <p style={{ fontSize: 12, color: "#8b949e", margin: "0 0 12px", lineHeight: 1.5 }}>Disable bays for walls/corridors.</p>
              <div style={{ padding: 10, background: "#161b22", borderRadius: 6, border: "1px solid #21262d" }}>
                <div style={{ fontSize: 18, color: "#f85149", fontWeight: 700 }}>{Object.keys(data.disabled).length}</div>
                <div style={{ fontSize: 11, color: "#484f58" }}>disabled · {stats.total} usable</div>
              </div>
              {Object.keys(data.disabled).length > 0 && (
                <button onClick={() => setData(p => ({ ...p, disabled: {} }))} style={{ ...B, background: "#21262d", color: "#f59e0b", border: "1px solid #30363d", width: "100%", marginTop: 8, padding: "7px 0" }}>Clear All</button>
              )}
            </>
          )}
          {mode === "view" && (
            <>
              <div style={HDR}>Filter</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 14 }}>
                <button onClick={() => setFilter("all")} style={{ ...B, background: filter === "all" ? "#30363d" : "transparent", color: filter === "all" ? "#e6edf3" : "#484f58", border: "1px solid #21262d", fontSize: 10, padding: "4px 8px" }}>All</button>
                {Object.entries(WORK_AREAS).map(([k, v]) => {
                  const c = Object.values(data.bays).filter(b => b.area === k).length;
                  if (!c) return null;
                  return <button key={k} onClick={() => setFilter(k)} style={{ ...B, background: filter === k ? v.bg : "transparent", color: filter === k ? v.color : "#484f58", border: `1px solid ${filter === k ? v.color + "44" : "#21262d"}`, fontSize: 10, padding: "4px 8px" }}>{k} ({c})</button>;
                })}
              </div>

              <div style={HDR}>Work Cells ({data.workCells.length})</div>
              {data.workCells.filter(c => filter === "all" || c.area === filter).map(c => (
                <div key={c.id} style={{ padding: "6px 8px", borderRadius: 4, marginBottom: 3, background: "#161b22", border: `1px solid ${WORK_AREAS[c.area]?.color}22` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: WORK_AREAS[c.area]?.color }} />
                    <span style={{ fontSize: 12, color: "#e6edf3", fontWeight: 600 }}>{c.name}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#484f58", fontFamily: "'DM Mono', monospace" }}>{c.bayRange} · {c.purpose}</div>
                  {unlocked && <button onClick={() => removeCell(c.id)} style={{ fontSize: 9, color: "#f85149", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}>remove</button>}
                </div>
              ))}

              <div style={{ ...HDR, marginTop: 14 }}>Equipment ({data.equipment.length})</div>
              {data.equipment.filter(eq => filter === "all" || eq.area === filter).map(eq => {
                const cell = eq.cellId ? data.workCells.find(c => c.id === eq.cellId) : null;
                return (
                  <div key={eq.id} style={{ padding: "6px 8px", borderRadius: 4, marginBottom: 3, background: "#161b22", border: "1px solid #21262d" }}>
                    <div style={{ fontSize: 11, color: "#e6edf3", fontWeight: 500 }}>{eq.name}</div>
                    <div style={{ fontSize: 9, color: "#484f58", fontFamily: "'DM Mono', monospace" }}>{eq.id} · {cell ? cell.name : eq.area} · {eq.status}</div>
                    {unlocked && <button onClick={() => removeEquipment(eq.id)} style={{ fontSize: 9, color: "#f85149", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}>remove</button>}
                  </div>
                );
              })}

              <div style={{ marginTop: 14, padding: 10, background: "#161b22", borderRadius: 6, border: "1px solid #21262d" }}>
                <div style={{ ...HDR, marginBottom: 6 }}>Summary</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[["Usable", stats.total], ["Assigned", `${stats.assigned} (${stats.total ? Math.round(stats.assigned / stats.total * 100) : 0}%)`], ["Cells", stats.cells], ["Equipment", stats.equipment]].map(([l, v], i) => (
                    <div key={i}><div style={{ fontSize: 9, color: "#484f58" }}>{l}</div><div style={{ fontSize: 13, color: "#e6edf3", fontWeight: 700 }}>{v}</div></div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Grid */}
        <div ref={gridRef} style={{ flex: 1, overflow: "auto", padding: 20, position: "relative" }}>
          <div onMouseUp={onUp} onMouseLeave={() => { setSelecting(false); setHovBay(null); setTooltip(null); }} style={{ display: "inline-block", userSelect: "none" }}>
            <div style={{ display: "flex", gap: GAP, marginLeft: 24 + GAP, marginBottom: GAP }}>
              {COLS.map(c => <div key={c} style={{ width: CELL, textAlign: "center", fontSize: 10, color: "#484f58", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{c}</div>)}
            </div>
            {ROWS.map(row => (
              <div key={row} style={{ display: "flex", gap: GAP, marginBottom: GAP, alignItems: "center" }}>
                <div style={{ width: 24, textAlign: "center", fontSize: 10, color: "#484f58", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{row}</div>
                {COLS.map(col => {
                  const key = bk(row, col);
                  if (data.disabled[key]) return (
                    <div key={key} onMouseDown={() => onDown(row, col)} onMouseEnter={(e) => onEnter(row, col, e)} style={{
                      width: CELL, height: CELL, borderRadius: 3,
                      background: mode === "disable" ? "#1c0a0a" : "#090c10",
                      border: mode === "disable" ? "1px dashed #f8514944" : "none",
                      cursor: mode === "disable" ? "pointer" : "default",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{mode === "disable" && <span style={{ fontSize: 10, color: "#f8514966" }}>✕</span>}</div>
                  );

                  const bd = data.bays[key];
                  const wa = bd ? WORK_AREAS[bd.area] : null;
                  const isSel = selBays.includes(key);
                  const isHov = hovBay === key;
                  const info = bd ? bayInfo(key) : null;
                  const isFilt = wa && filter !== "all" && bd.area !== filter;

                  return (
                    <div key={key}
                      onMouseDown={() => onDown(row, col)}
                      onMouseEnter={(e) => onEnter(row, col, e)}
                      onMouseMove={onMove}
                      onMouseLeave={() => { setHovBay(null); setTooltip(null); }}
                      onClick={() => { if (mode === "view" && bd) setSelectedBay(key); }}
                      style={{
                        width: CELL, height: CELL, borderRadius: 3,
                        background: isSel ? "#1f6feb33" : isFilt ? "#0d1117" : wa ? wa.bg : "#0d1117",
                        border: isSel ? "2px solid #58a6ff" : selectedBay === key ? `2px solid ${wa?.color || "#58a6ff"}` : isHov && mode !== "view" ? "2px solid #30363d" : `1px solid ${wa ? wa.color + "22" : "#161b22"}`,
                        cursor: mode !== "view" ? "crosshair" : bd ? "pointer" : "default",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        transition: "all 0.08s", opacity: isFilt ? 0.15 : 1, position: "relative",
                      }}>
                      {wa && !isFilt ? (
                        <>
                          <div style={{ fontSize: 8, fontWeight: 700, color: wa.color, letterSpacing: "0.05em", opacity: 0.9 }}>{bd.area}</div>
                          {info && info.cells.length > 0 && <div style={{ fontSize: 7, color: "#8b949e", marginTop: 1 }}>{info.cells.length}c</div>}
                          {info && info.equipment.length > 0 && <div style={{ position: "absolute", bottom: 1, fontSize: 7, color: "#8b949e" }}>⚙{info.equipment.length}</div>}
                        </>
                      ) : (
                        <div style={{ fontSize: 8, color: "#161b22", fontFamily: "'DM Mono', monospace" }}>{key}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", fontWeight: 600 }}>Areas:</span>
            {Object.entries(WORK_AREAS).map(([k, v]) => <span key={k} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#8b949e" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: v.color }} />{k}</span>)}
          </div>

          {/* Tooltip */}
          {tooltip && (() => {
            const info = bayInfo(tooltip.bay);
            if (!info) return null;
            const wa = WORK_AREAS[info.area];
            return (
              <div style={{
                position: "fixed", left: tooltip.x + 16, top: tooltip.y - 16,
                background: "#1c2128", border: `1px solid ${wa?.color || "#30363d"}44`,
                borderRadius: 8, padding: "10px 14px", minWidth: 210, maxWidth: 300,
                zIndex: 1000, pointerEvents: "none", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: wa?.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>{wa?.name}</span>
                  <span style={{ fontSize: 10, color: "#484f58", fontFamily: "'DM Mono', monospace" }}>{tooltip.bay}</span>
                </div>

                {info.cells.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", fontWeight: 600, marginBottom: 3 }}>Work Cells ({info.cells.length})</div>
                    {info.cells.map(c => (
                      <div key={c.id} style={{ fontSize: 11, color: "#e6edf3", padding: "1px 0" }}>
                        {c.name} <span style={{ color: "#484f58", fontSize: 9 }}>· {c.bayRange} · {c.purpose}</span>
                      </div>
                    ))}
                  </div>
                )}

                {info.equipment.length > 0 ? (
                  <div style={{ borderTop: info.cells.length > 0 ? "1px solid #21262d" : "none", paddingTop: info.cells.length > 0 ? 6 : 0 }}>
                    <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", fontWeight: 600, marginBottom: 3 }}>Equipment ({info.equipment.length})</div>
                    {info.equipment.map(eq => {
                      const cell = eq.cellId ? data.workCells.find(c => c.id === eq.cellId) : null;
                      return (
                        <div key={eq.id} style={{ display: "flex", justifyContent: "space-between", padding: "1px 0" }}>
                          <span style={{ fontSize: 11, color: "#e6edf3" }}>{eq.name}</span>
                          <span style={{ fontSize: 9, color: "#484f58", fontFamily: "'DM Mono', monospace" }}>{eq.id}{cell ? ` · ${cell.name}` : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: "#30363d", fontStyle: "italic" }}>No equipment</div>
                )}

                <div style={{ fontSize: 9, color: "#30363d", marginTop: 6, textAlign: "center" }}>Click for details</div>
              </div>
            );
          })()}
        </div>

        {/* Detail panel for selected bay */}
        {selectedBay && mode === "view" && (() => {
          const info = bayInfo(selectedBay);
          if (!info) return null;
          const wa = WORK_AREAS[info.area];
          return (
            <div style={{ width: 270, borderLeft: "1px solid #21262d", padding: "12px", overflowY: "auto", flexShrink: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: wa?.color }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3" }}>{wa?.name}</span>
                </div>
                <button onClick={() => setSelectedBay(null)} style={{ background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: "#58a6ff", fontFamily: "'DM Mono', monospace", marginBottom: 12 }}>Bay {selectedBay}</div>

              {/* Cells in this bay */}
              <div style={{ ...HDR, marginBottom: 6 }}>Work Cells ({info.cells.length})</div>
              {info.cells.map(c => (
                <div key={c.id} style={{ padding: "6px 8px", background: "#161b22", borderRadius: 4, marginBottom: 4, border: `1px solid ${wa?.color}22` }}>
                  <div style={{ fontSize: 12, color: "#e6edf3", fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 10, color: "#484f58", fontFamily: "'DM Mono', monospace" }}>{c.bayRange} · {c.purpose}</div>
                  {unlocked && (
                    <>
                      <div style={{ marginTop: 4 }}>
                        <label style={{ ...LBL, marginTop: 4 }}>Review</label>
                        <select value={c.reviewStatus || ""} onChange={e => setData(p => ({ ...p, workCells: p.workCells.map(wc => wc.id === c.id ? { ...wc, reviewStatus: e.target.value || null } : wc) }))} style={SEL}>
                          <option value="">— N/A —</option>
                          {["Not Started", "In Progress", "In Review", "Approved"].map(s => <option key={s}>{s}</option>)}
                        </select>
                      </div>
                      <button onClick={() => removeCell(c.id)} style={{ fontSize: 9, color: "#f85149", background: "none", border: "none", cursor: "pointer", padding: "2px 0", marginTop: 4 }}>remove cell</button>
                    </>
                  )}
                  {!unlocked && c.reviewStatus && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: REVIEW_COLORS[c.reviewStatus] }} />
                      <span style={{ fontSize: 10, color: REVIEW_COLORS[c.reviewStatus] }}>{c.reviewStatus}</span>
                    </div>
                  )}
                </div>
              ))}
              {info.cells.length === 0 && <div style={{ fontSize: 11, color: "#30363d", marginBottom: 8 }}>No work cells in this bay</div>}

              {/* Equipment in this bay */}
              <div style={{ ...HDR, marginTop: 12, marginBottom: 6 }}>Equipment ({info.equipment.length})</div>
              {info.equipment.map(eq => {
                const cell = eq.cellId ? data.workCells.find(c => c.id === eq.cellId) : null;
                return (
                  <div key={eq.id} style={{ padding: "5px 7px", background: "#161b22", borderRadius: 4, marginBottom: 3, border: "1px solid #21262d" }}>
                    <div style={{ fontSize: 11, color: "#e6edf3", fontWeight: 500 }}>{eq.name}</div>
                    <div style={{ fontSize: 9, color: "#484f58", fontFamily: "'DM Mono', monospace" }}>{eq.id} · {eq.status}{cell ? ` · ${cell.name}` : " · directly on area"}</div>
                    {unlocked && <button onClick={() => removeEquipment(eq.id)} style={{ fontSize: 9, color: "#f85149", background: "none", border: "none", cursor: "pointer", padding: "2px 0" }}>remove</button>}
                  </div>
                );
              })}
              {info.equipment.length === 0 && <div style={{ fontSize: 11, color: "#30363d" }}>No equipment in this bay</div>}

              {unlocked && (
                <button onClick={() => clearBayArea(selectedBay)} style={{ ...B, background: "#21262d", color: "#f85149", border: "1px solid #f8514933", width: "100%", marginTop: 12, padding: "7px 0" }}>Clear Bay Assignment</button>
              )}
            </div>
          );
        })()}
      </div>

      {/* Password Modal */}
      {showPw && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }} onClick={() => setShowPw(false)}>
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 24, width: 320 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3", marginBottom: 4 }}>🔐 Edit Mode</div>
            <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 16 }}>Enter password to enable editing.</div>
            <input type="password" value={pwInput} onChange={e => { setPwInput(e.target.value); setPwErr(false); }} onKeyDown={e => { if (e.key === "Enter") submitPw(); }} placeholder="Password" autoFocus style={{ ...INP, marginBottom: 8, borderColor: pwErr ? "#f85149" : "#30363d" }} />
            {pwErr && <div style={{ fontSize: 11, color: "#f85149", marginBottom: 8 }}>Incorrect password.</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowPw(false)} style={{ ...B, background: "#21262d", color: "#8b949e", border: "1px solid #30363d", flex: 1, padding: "8px 0" }}>Cancel</button>
              <button onClick={submitPw} style={{ ...B, background: "#238636", color: "#fff", border: "1px solid #2ea043", flex: 1, padding: "8px 0" }}>Unlock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const B = { padding: "5px 10px", borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s" };
const LBL = { fontSize: 10, color: "#484f58", display: "block", marginBottom: 3, marginTop: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
const HDR = { fontSize: 10, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 };
const SEL = { width: "100%", padding: "5px 7px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 4, color: "#c9d1d9", fontSize: 12, fontFamily: "'DM Sans', sans-serif" };
const INP = { width: "100%", padding: "5px 7px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 4, color: "#c9d1d9", fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" };
