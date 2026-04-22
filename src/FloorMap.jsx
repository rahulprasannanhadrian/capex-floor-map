import { useState, useRef, useEffect, useCallback } from "react";

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
const CELL = 52, GAP = 2;

const makeRows = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
const makeCols = (n) => Array.from({ length: n }, (_, i) => i + 1);
const bk = (r, c) => `${r}${c}`;

const STORAGE_KEY = "capex-floor-map-v2";

const defaultState = () => ({ rows: 10, cols: 12, bays: {}, disabled: {}, locations: [], nextLocId: 1 });

const loadState = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : defaultState();
  } catch { return defaultState(); }
};

const saveState = (data) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
};

const EDIT_PASSWORD = "capex2026";  // Change this to your preferred password

export default function FloorMap() {
  const [data, setData] = useState(loadState);
  const [mode, setMode] = useState("view");
  const [unlocked, setUnlocked] = useState(false);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingMode, setPendingMode] = useState(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [selectedArea, setSelectedArea] = useState("WLD");
  const [selectedPurpose, setSelectedPurpose] = useState("RND");
  const [cellName, setCellName] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selStart, setSelStart] = useState(null);
  const [selEnd, setSelEnd] = useState(null);
  const [hoveredBay, setHoveredBay] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showGridConfig, setShowGridConfig] = useState(false);
  const [tmpRows, setTmpRows] = useState(data.rows);
  const [tmpCols, setTmpCols] = useState(data.cols);
  const [tooltip, setTooltip] = useState(null); // { loc, x, y }
  const gridContainerRef = useRef(null);

  // Check URL for edit mode access
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "true") {
      setUnlocked(true);
    }
  }, []);

  const ROWS = makeRows(data.rows);
  const COLS = makeCols(data.cols);

  useEffect(() => { saveState(data); }, [data]);

  const getBayRange = (s, e) => {
    if (!s || !e) return [];
    const R = makeRows(data.rows);
    const r1 = Math.min(R.indexOf(s.row), R.indexOf(e.row));
    const r2 = Math.max(R.indexOf(s.row), R.indexOf(e.row));
    const c1 = Math.min(s.col, e.col), c2 = Math.max(s.col, e.col);
    const keys = [];
    for (let ri = r1; ri <= r2; ri++) for (let ci = c1; ci <= c2; ci++) {
      const k = bk(R[ri], ci);
      if (!data.disabled[k]) keys.push(k);
    }
    return keys;
  };

  const getBayRangeStr = (s, e) => {
    if (!s || !e) return "";
    const R = makeRows(data.rows);
    const r1 = Math.min(R.indexOf(s.row), R.indexOf(e.row));
    const r2 = Math.max(R.indexOf(s.row), R.indexOf(e.row));
    const c1 = Math.min(s.col, e.col), c2 = Math.max(s.col, e.col);
    return `${R[r1]}${c1}:${R[r2]}${c2}`;
  };

  const selBays = getBayRange(selStart, selEnd);

  const handleMouseDown = (row, col) => {
    if (mode === "assign") {
      setSelecting(true); setSelStart({ row, col }); setSelEnd({ row, col });
    } else if (mode === "disable") {
      const k = bk(row, col);
      if (data.bays[k]) return;
      setData(prev => {
        const nd = { ...prev.disabled };
        if (nd[k]) delete nd[k]; else nd[k] = true;
        return { ...prev, disabled: nd };
      });
      setSelecting(true);
    }
  };

  const handleMouseEnter = (row, col) => {
    if (selecting && mode === "assign") setSelEnd({ row, col });
    if (selecting && mode === "disable") {
      const k = bk(row, col);
      if (!data.bays[k]) {
        setData(prev => {
          const nd = { ...prev.disabled };
          nd[k] = true;
          return { ...prev, disabled: nd };
        });
      }
    }
    setHoveredBay(bk(row, col));
  };

  const handleMouseUp = () => setSelecting(false);
  const handleMouseLeave = () => setHoveredBay(null);

  const confirmAssignment = () => {
    if (!selStart || !selEnd) return;
    const keys = selBays;
    if (keys.some(k => data.bays[k])) { alert("Some bays already assigned."); return; }
    const locId = data.nextLocId;
    const newLoc = {
      id: locId, workArea: selectedArea, purpose: selectedPurpose,
      cellName: cellName || null, bayRange: getBayRangeStr(selStart, selEnd),
      bays: keys, commissionStatus: "Active", reviewStatus: null, equipment: [],
    };
    const newBays = { ...data.bays };
    keys.forEach(k => { newBays[k] = { locationId: locId, workArea: selectedArea }; });
    setData(prev => ({ ...prev, bays: newBays, locations: [...prev.locations, newLoc], nextLocId: prev.nextLocId + 1 }));
    setSelStart(null); setSelEnd(null); setCellName("");
  };

  const clearLocation = (locId) => {
    setData(prev => {
      const loc = prev.locations.find(l => l.id === locId);
      if (!loc) return prev;
      const nb = { ...prev.bays };
      loc.bays.forEach(k => { delete nb[k]; });
      return { ...prev, bays: nb, locations: prev.locations.filter(l => l.id !== locId) };
    });
    setSelectedLocation(null);
  };

  const updateLocation = (locId, updates) => {
    setData(prev => ({ ...prev, locations: prev.locations.map(l => l.id === locId ? { ...l, ...updates } : l) }));
  };

  const addEquipment = (locId, name) => {
    setData(prev => ({
      ...prev,
      locations: prev.locations.map(l => l.id === locId ? {
        ...l, equipment: [...l.equipment, { name, status: "ROM Quotes", id: `EQ-${l.workArea}-${String(l.equipment.length + 1).padStart(3, "0")}` }]
      } : l),
    }));
  };

  const applyGridSize = () => {
    if (tmpRows < 1 || tmpRows > 26 || tmpCols < 1 || tmpCols > 30) {
      alert("Rows: 1-26 (A-Z), Cols: 1-30"); return;
    }
    const newR = makeRows(tmpRows);
    const newC = makeCols(tmpCols);
    const validKeys = new Set();
    newR.forEach(r => newC.forEach(c => validKeys.add(bk(r, c))));
    const lostAssigned = Object.keys(data.bays).filter(k => !validKeys.has(k));
    const lostDisabled = Object.keys(data.disabled).filter(k => !validKeys.has(k));
    if (lostAssigned.length > 0) {
      if (!confirm(`Shrinking will remove ${lostAssigned.length} assigned bay(s). Continue?`)) return;
    }
    setData(prev => {
      const nb = { ...prev.bays }; const nd = { ...prev.disabled };
      lostAssigned.forEach(k => delete nb[k]); lostDisabled.forEach(k => delete nd[k]);
      const updatedLocs = prev.locations.map(l => ({ ...l, bays: l.bays.filter(k => validKeys.has(k)) })).filter(l => l.bays.length > 0);
      return { ...prev, rows: tmpRows, cols: tmpCols, bays: nb, disabled: nd, locations: updatedLocs };
    });
    setShowGridConfig(false);
  };

  const clearAllDisabled = () => setData(prev => ({ ...prev, disabled: {} }));

  const tryEditMode = (targetMode) => {
    if (unlocked) {
      setMode(targetMode); setSelStart(null); setSelEnd(null); setSelectedLocation(null);
    } else {
      setPendingMode(targetMode);
      setShowPasswordPrompt(true);
      setPasswordInput("");
      setPasswordError(false);
    }
  };

  const submitPassword = () => {
    if (passwordInput === EDIT_PASSWORD) {
      setUnlocked(true);
      setShowPasswordPrompt(false);
      setPasswordInput("");
      setPasswordError(false);
      if (pendingMode) {
        setMode(pendingMode); setSelStart(null); setSelEnd(null); setSelectedLocation(null);
      }
    } else {
      setPasswordError(true);
    }
  };

  const lockEditing = () => {
    setUnlocked(false);
    setMode("view");
  };

  const resetAll = () => {
    if (confirm("Reset the entire floor map?")) {
      const fresh = defaultState();
      setData(fresh); setSelectedLocation(null); setTmpRows(fresh.rows); setTmpCols(fresh.cols);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const filteredLocIds = filter === "all" ? new Set(data.locations.map(l => l.id)) : new Set(data.locations.filter(l => l.workArea === filter).map(l => l.id));
  const stats = {
    total: ROWS.length * COLS.length - Object.keys(data.disabled).length,
    assigned: Object.keys(data.bays).length,
    locations: data.locations.length,
    equipment: data.locations.reduce((a, l) => a + l.equipment.length, 0),
    disabled: Object.keys(data.disabled).length,
  };
  const selLoc = selectedLocation ? data.locations.find(l => l.id === selectedLocation) : null;

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
            <div style={{ fontSize: 10, color: "#484f58" }}>Fx · {data.rows}×{data.cols} grid · {stats.locations} locations · {stats.equipment} equip · {stats.disabled} disabled</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button onClick={() => { setMode("view"); setSelStart(null); setSelEnd(null); }} style={{
            ...B, background: mode === "view" ? "#1f6feb" : "#21262d",
            color: mode === "view" ? "#fff" : "#8b949e", border: mode === "view" ? "1px solid #388bfd" : "1px solid #30363d",
          }}>👁 View</button>
          {[["assign", "✏️ Assign"], ["disable", "🚫 Shape"]].map(([m, label]) => (
            <button key={m} onClick={() => tryEditMode(m)} style={{
              ...B, background: mode === m ? (m === "disable" ? "#da3633" : "#1f6feb") : "#21262d",
              color: mode === m ? "#fff" : unlocked ? "#8b949e" : "#484f58",
              border: mode === m ? `1px solid ${m === "disable" ? "#f85149" : "#388bfd"}` : "1px solid #30363d",
              opacity: !unlocked && mode !== m ? 0.6 : 1,
            }}>{label}{!unlocked && " 🔒"}</button>
          ))}
          {unlocked && (
            <>
              <button onClick={() => { setShowGridConfig(!showGridConfig); setTmpRows(data.rows); setTmpCols(data.cols); }} style={{ ...B, background: showGridConfig ? "#30363d" : "#21262d", color: "#8b949e", border: "1px solid #30363d" }}>⚙ Grid</button>
              <button onClick={resetAll} style={{ ...B, background: "#21262d", color: "#f85149", border: "1px solid #30363d", fontSize: 11 }}>Reset</button>
              <button onClick={lockEditing} style={{ ...B, background: "#21262d", color: "#f59e0b", border: "1px solid #30363d", fontSize: 11 }}>🔒 Lock</button>
            </>
          )}
        </div>
      </div>

      {showGridConfig && (
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #21262d", background: "#0d1117", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#8b949e" }}>Grid Size:</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 11, color: "#484f58" }}>Rows</span>
            <input type="number" min="1" max="26" value={tmpRows} onChange={e => setTmpRows(parseInt(e.target.value) || 1)} style={{ ...INP, width: 50, textAlign: "center" }} />
            <span style={{ fontSize: 11, color: "#484f58", margin: "0 4px" }}>×</span>
            <span style={{ fontSize: 11, color: "#484f58" }}>Cols</span>
            <input type="number" min="1" max="30" value={tmpCols} onChange={e => setTmpCols(parseInt(e.target.value) || 1)} style={{ ...INP, width: 50, textAlign: "center" }} />
          </div>
          <button onClick={applyGridSize} style={{ ...B, background: "#238636", color: "#fff", border: "1px solid #2ea043" }}>Apply</button>
          <span style={{ fontSize: 11, color: "#484f58" }}>A-{String.fromCharCode(64 + tmpRows)} rows, 1-{tmpCols} cols</span>
          {Object.keys(data.disabled).length > 0 && (
            <button onClick={clearAllDisabled} style={{ ...B, background: "#21262d", color: "#f59e0b", border: "1px solid #30363d", fontSize: 11 }}>Clear disabled ({Object.keys(data.disabled).length})</button>
          )}
        </div>
      )}

      {mode === "disable" && (
        <div style={{ padding: "8px 20px", borderBottom: "1px solid #21262d", background: "#1c0a0a", fontSize: 12, color: "#f85149" }}>
          <strong>Shape Mode:</strong> Click or drag on empty bays to disable/enable them. Disabled bays represent walls, corridors, or non-usable areas.
        </div>
      )}
      {mode === "assign" && (
        <div style={{ padding: "8px 20px", borderBottom: "1px solid #21262d", background: "#0a1929", fontSize: 12, color: "#58a6ff" }}>
          <strong>Assign Mode:</strong> Click and drag to select bays, then configure the location in the sidebar and click Assign.
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div style={{ width: 240, borderRight: "1px solid #21262d", padding: "12px", overflowY: "auto", flexShrink: 0 }}>
          {mode === "assign" ? (
            <>
              <div style={HDR}>Assign Location</div>
              <label style={LBL}>Work Area</label>
              <select value={selectedArea} onChange={e => setSelectedArea(e.target.value)} style={SEL}>
                {Object.entries(WORK_AREAS).map(([k, v]) => <option key={k} value={k}>{v.name} ({k})</option>)}
              </select>
              <label style={LBL}>Purpose</label>
              <select value={selectedPurpose} onChange={e => setSelectedPurpose(e.target.value)} style={SEL}>
                {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <label style={LBL}>Cell Name (optional)</label>
              <input value={cellName} onChange={e => setCellName(e.target.value)} placeholder="e.g. Cell Alpha" style={INP} />
              {selStart && selEnd && (
                <div style={{ marginTop: 14, padding: 10, background: "#161b22", borderRadius: 6, border: "1px solid #30363d" }}>
                  <div style={{ fontSize: 12, color: "#8b949e" }}>Selected: <span style={{ color: "#58a6ff", fontFamily: "'DM Mono', monospace" }}>{getBayRangeStr(selStart, selEnd)}</span></div>
                  <div style={{ fontSize: 11, color: "#484f58" }}>{selBays.length} usable bays{selBays.some(k => data.bays[k]) && <span style={{ color: "#f85149" }}> · {selBays.filter(k => data.bays[k]).length} conflicts</span>}</div>
                  <button onClick={confirmAssignment} disabled={selBays.length === 0} style={{ ...B, background: "#238636", color: "#fff", border: "1px solid #2ea043", width: "100%", marginTop: 8, padding: "7px 0", opacity: selBays.length === 0 ? 0.4 : 1 }}>
                    Assign → {WORK_AREAS[selectedArea].name}
                  </button>
                </div>
              )}
            </>
          ) : mode === "disable" ? (
            <>
              <div style={HDR}>Building Shape</div>
              <p style={{ fontSize: 12, color: "#8b949e", margin: "0 0 12px", lineHeight: 1.5 }}>Disable bays to define your building footprint. Use for L-shapes, C-shapes, or irregular layouts.</p>
              <div style={{ padding: 10, background: "#161b22", borderRadius: 6, border: "1px solid #21262d" }}>
                <div style={{ fontSize: 11, color: "#484f58" }}>Disabled bays</div>
                <div style={{ fontSize: 18, color: "#f85149", fontWeight: 700 }}>{Object.keys(data.disabled).length}</div>
                <div style={{ fontSize: 11, color: "#484f58", marginTop: 2 }}>Usable: {stats.total}</div>
              </div>
              {Object.keys(data.disabled).length > 0 && (
                <button onClick={clearAllDisabled} style={{ ...B, background: "#21262d", color: "#f59e0b", border: "1px solid #30363d", width: "100%", marginTop: 10, padding: "7px 0" }}>Clear All Disabled</button>
              )}
            </>
          ) : (
            <>
              <div style={HDR}>Filter</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 14 }}>
                <button onClick={() => setFilter("all")} style={{ ...B, background: filter === "all" ? "#30363d" : "transparent", color: filter === "all" ? "#e6edf3" : "#484f58", border: "1px solid #21262d", fontSize: 10, padding: "4px 8px" }}>All</button>
                {Object.entries(WORK_AREAS).map(([k, v]) => {
                  const c = data.locations.filter(l => l.workArea === k).length;
                  if (!c) return null;
                  return <button key={k} onClick={() => setFilter(k)} style={{ ...B, background: filter === k ? v.bg : "transparent", color: filter === k ? v.color : "#484f58", border: `1px solid ${filter === k ? v.color + "44" : "#21262d"}`, fontSize: 10, padding: "4px 8px" }}>{k} ({c})</button>;
                })}
              </div>
              <div style={HDR}>Locations</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {data.locations.filter(l => filter === "all" || l.workArea === filter).map(loc => (
                  <div key={loc.id} onClick={() => setSelectedLocation(loc.id)} style={{
                    padding: "7px 8px", borderRadius: 5, cursor: "pointer",
                    background: selectedLocation === loc.id ? "#161b22" : "transparent",
                    border: `1px solid ${selectedLocation === loc.id ? WORK_AREAS[loc.workArea].color + "44" : "transparent"}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: 2, background: WORK_AREAS[loc.workArea].color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#e6edf3", fontWeight: 600 }}>{loc.cellName || WORK_AREAS[loc.workArea].name}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#484f58", marginTop: 1, fontFamily: "'DM Mono', monospace" }}>{loc.bayRange} · {loc.bays.length}b{loc.equipment.length > 0 ? ` · ${loc.equipment.length}eq` : ""}</div>
                  </div>
                ))}
                {!data.locations.length && <div style={{ fontSize: 11, color: "#30363d", padding: 6 }}>No locations. Use Edit mode.</div>}
              </div>
              <div style={{ marginTop: 16, padding: 10, background: "#161b22", borderRadius: 6, border: "1px solid #21262d" }}>
                <div style={{ ...HDR, marginBottom: 6 }}>Summary</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[["Usable", stats.total], ["Assigned", `${stats.assigned} (${stats.total ? Math.round(stats.assigned / stats.total * 100) : 0}%)`], ["Locations", stats.locations], ["Equipment", stats.equipment]].map(([l, v], i) => (
                    <div key={i}><div style={{ fontSize: 9, color: "#484f58" }}>{l}</div><div style={{ fontSize: 13, color: "#e6edf3", fontWeight: 700 }}>{v}</div></div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Grid */}
        <div ref={gridContainerRef} style={{ flex: 1, overflow: "auto", padding: 20, position: "relative" }}>
          <div onMouseUp={handleMouseUp} onMouseLeave={() => { setSelecting(false); setHoveredBay(null); setTooltip(null); }} style={{ display: "inline-block", userSelect: "none" }}>
            <div style={{ display: "flex", gap: GAP, marginLeft: 24 + GAP, marginBottom: GAP }}>
              {COLS.map(c => <div key={c} style={{ width: CELL, textAlign: "center", fontSize: 10, color: "#484f58", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{c}</div>)}
            </div>
            {ROWS.map(row => (
              <div key={row} style={{ display: "flex", gap: GAP, marginBottom: GAP, alignItems: "center" }}>
                <div style={{ width: 24, textAlign: "center", fontSize: 10, color: "#484f58", fontWeight: 600, fontFamily: "'DM Mono', monospace" }}>{row}</div>
                {COLS.map(col => {
                  const key = bk(row, col);
                  const isDis = data.disabled[key];
                  const bd = data.bays[key];
                  const loc = bd ? data.locations.find(l => l.id === bd.locationId) : null;
                  const wa = loc ? WORK_AREAS[loc.workArea] : null;
                  const isSel = selBays.includes(key);
                  const isHov = hoveredBay === key;
                  const isLocSel = loc && selectedLocation === loc.id;
                  const isFilt = loc && !filteredLocIds.has(loc.id);

                  if (isDis) return (
                    <div key={key} onMouseDown={() => handleMouseDown(row, col)} onMouseEnter={() => handleMouseEnter(row, col)}
                      style={{
                        width: CELL, height: CELL, borderRadius: 3,
                        background: mode === "disable" ? "#1c0a0a" : "#090c10",
                        border: mode === "disable" ? "1px dashed #f8514944" : "none",
                        cursor: mode === "disable" ? "pointer" : "default",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                      {mode === "disable" && <span style={{ fontSize: 10, color: "#f8514966" }}>✕</span>}
                    </div>
                  );

                  return (
                    <div key={key}
                      onMouseDown={() => handleMouseDown(row, col)}
                      onMouseEnter={(e) => {
                        handleMouseEnter(row, col);
                        if (mode === "view" && loc && !isFilt) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const container = gridContainerRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
                          setTooltip({ loc, x: rect.left - container.left + CELL / 2, y: rect.top - container.top - 8 });
                        }
                      }}
                      onMouseLeave={() => { handleMouseLeave(); setTooltip(null); }}
                      onClick={() => { if (mode === "view" && loc) setSelectedLocation(loc.id); setTooltip(null); }}
                      style={{
                        width: CELL, height: CELL, borderRadius: 3,
                        background: isSel ? "#1f6feb33" : isFilt ? "#0d1117" : wa ? wa.bg : "#0d1117",
                        border: isSel ? "2px solid #58a6ff" : isLocSel ? `2px solid ${wa.color}` : isHov && mode !== "view" ? "2px solid #30363d" : `1px solid ${wa ? wa.color + "22" : "#161b22"}`,
                        cursor: mode === "assign" ? "crosshair" : mode === "disable" ? "pointer" : loc ? "pointer" : "default",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        transition: "all 0.08s", opacity: isFilt ? 0.15 : 1, position: "relative",
                      }}>
                      {wa && !isFilt ? (
                        <>
                          <div style={{ fontSize: 8, fontWeight: 700, color: wa.color, letterSpacing: "0.05em", opacity: 0.9 }}>{loc.workArea}</div>
                          {loc.reviewStatus && <div style={{ position: "absolute", top: 2, right: 2, width: 5, height: 5, borderRadius: "50%", background: REVIEW_COLORS[loc.reviewStatus] }} />}
                          {loc.equipment.length > 0 && <div style={{ position: "absolute", bottom: 1, fontSize: 7, color: "#8b949e" }}>⚙{loc.equipment.length}</div>}
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
          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", fontWeight: 600 }}>Areas:</span>
            {Object.entries(WORK_AREAS).map(([k, v]) => <span key={k} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#8b949e" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: v.color }} />{k}</span>)}
            <span style={{ fontSize: 9, color: "#484f58", marginLeft: 8, textTransform: "uppercase", fontWeight: 600 }}>Review:</span>
            {Object.entries(REVIEW_COLORS).map(([k, v]) => <span key={k} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#8b949e" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: v }} />{k}</span>)}
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#8b949e", marginLeft: 8 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: "#1c0a0a", border: "1px dashed #f8514944" }} />Disabled</span>
          </div>

          {/* Hover Tooltip */}
          {tooltip && tooltip.loc && (
            <div style={{
              position: "absolute",
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, -100%)",
              background: "#1c2128",
              border: `1px solid ${WORK_AREAS[tooltip.loc.workArea]?.color || "#30363d"}44`,
              borderRadius: 8,
              padding: "10px 14px",
              minWidth: 200,
              maxWidth: 280,
              zIndex: 100,
              pointerEvents: "none",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}>
              {/* Arrow */}
              <div style={{
                position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
                width: 12, height: 6, overflow: "hidden",
              }}>
                <div style={{
                  width: 10, height: 10, background: "#1c2128",
                  border: `1px solid ${WORK_AREAS[tooltip.loc.workArea]?.color || "#30363d"}44`,
                  transform: "rotate(45deg)", position: "absolute", top: -6, left: 1,
                }} />
              </div>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: WORK_AREAS[tooltip.loc.workArea]?.color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e6edf3" }}>
                  {tooltip.loc.cellName || WORK_AREAS[tooltip.loc.workArea]?.name}
                </span>
                {tooltip.loc.reviewStatus && (
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: REVIEW_COLORS[tooltip.loc.reviewStatus] + "22", color: REVIEW_COLORS[tooltip.loc.reviewStatus], fontWeight: 600 }}>
                    {tooltip.loc.reviewStatus}
                  </span>
                )}
              </div>

              {/* Info row */}
              <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 4, fontFamily: "'DM Mono', monospace" }}>
                {tooltip.loc.bayRange} · {tooltip.loc.bays.length} bays · {tooltip.loc.purpose}
              </div>

              {/* Commission status */}
              <div style={{ fontSize: 10, color: "#484f58", marginBottom: 6 }}>
                Commission: <span style={{ color: tooltip.loc.commissionStatus === "Active" ? "#22c55e" : "#f59e0b" }}>{tooltip.loc.commissionStatus}</span>
              </div>

              {/* Work Cell */}
              {tooltip.loc.cellName && (
                <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 6 }}>
                  Work Cell: <span style={{ color: "#e6edf3", fontWeight: 500 }}>{tooltip.loc.cellName}</span>
                </div>
              )}

              {/* Equipment list */}
              {tooltip.loc.equipment.length > 0 ? (
                <div style={{ borderTop: "1px solid #21262d", paddingTop: 6, marginTop: 2 }}>
                  <div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>
                    Equipment ({tooltip.loc.equipment.length})
                  </div>
                  {tooltip.loc.equipment.map((eq, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
                      <span style={{ fontSize: 11, color: "#e6edf3" }}>{eq.name}</span>
                      <span style={{ fontSize: 9, color: "#484f58", fontFamily: "'DM Mono', monospace" }}>{eq.id}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 10, color: "#30363d", fontStyle: "italic" }}>No equipment assigned</div>
              )}

              {/* Click hint */}
              <div style={{ fontSize: 9, color: "#30363d", marginTop: 6, textAlign: "center" }}>Click for details</div>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selLoc && mode === "view" && (
          <div style={{ width: 270, borderLeft: "1px solid #21262d", padding: "12px", overflowY: "auto", flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3" }}>{selLoc.cellName || WORK_AREAS[selLoc.workArea].name}</div>
              <button onClick={() => setSelectedLocation(null)} style={{ background: "none", border: "none", color: "#484f58", cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <F l="Bay Range" v={selLoc.bayRange} m />
              <F l="Bays" v={`${selLoc.bays.length} bays`} />
              <F l="Work Area" v={`${WORK_AREAS[selLoc.workArea].name} (${selLoc.workArea})`} c={WORK_AREAS[selLoc.workArea].color} />
              <F l="Purpose" v={selLoc.purpose} />
              <div>
                <label style={LBL}>Commission Status</label>
                <select value={selLoc.commissionStatus} onChange={e => updateLocation(selLoc.id, { commissionStatus: e.target.value })} disabled={!unlocked} style={{ ...SEL, opacity: unlocked ? 1 : 0.6 }}>
                  {["Active", "Inactive", "Decommissioned"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Location Review</label>
                <select value={selLoc.reviewStatus || ""} onChange={e => updateLocation(selLoc.id, { reviewStatus: e.target.value || null })} disabled={!unlocked} style={{ ...SEL, opacity: unlocked ? 1 : 0.6 }}>
                  <option value="">— N/A —</option>
                  {["Not Started", "In Progress", "In Review", "Approved"].map(s => <option key={s}>{s}</option>)}
                </select>
                {selLoc.reviewStatus && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: REVIEW_COLORS[selLoc.reviewStatus] }} />
                    <span style={{ fontSize: 11, color: REVIEW_COLORS[selLoc.reviewStatus] }}>{selLoc.reviewStatus}</span>
                  </div>
                )}
              </div>
              <div style={{ borderTop: "1px solid #21262d", paddingTop: 10, marginTop: 2 }}>
                <div style={{ ...HDR, marginBottom: 6 }}>Equipment ({selLoc.equipment.length})</div>
                {selLoc.equipment.map((eq, i) => (
                  <div key={i} style={{ padding: "5px 7px", background: "#161b22", borderRadius: 4, marginBottom: 3, border: "1px solid #21262d" }}>
                    <div style={{ fontSize: 11, color: "#e6edf3", fontWeight: 500 }}>{eq.name}</div>
                    <div style={{ fontSize: 9, color: "#484f58", fontFamily: "'DM Mono', monospace" }}>{eq.id} · {eq.status}</div>
                  </div>
                ))}
                {unlocked && (
                  <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
                    <input id="eq-inp" placeholder="Equipment name" style={{ ...INP, flex: 1 }} onKeyDown={e => { if (e.key === "Enter" && e.target.value) { addEquipment(selLoc.id, e.target.value); e.target.value = ""; } }} />
                    <button onClick={() => { const i = document.getElementById("eq-inp"); if (i.value) { addEquipment(selLoc.id, i.value); i.value = ""; } }} style={{ ...B, background: "#238636", color: "#fff", border: "1px solid #2ea043", padding: "4px 8px" }}>+</button>
                  </div>
                )}
              </div>
              {unlocked && <button onClick={() => clearLocation(selLoc.id)} style={{ ...B, background: "#21262d", color: "#f85149", border: "1px solid #f8514933", width: "100%", marginTop: 6, padding: "7px 0" }}>Remove Location</button>}
            </div>
          </div>
        )}
      </div>

      {/* Password Prompt Modal */}
      {showPasswordPrompt && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}
          onClick={() => setShowPasswordPrompt(false)}>
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: 24, width: 320 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3", marginBottom: 4 }}>🔐 Edit Mode</div>
            <div style={{ fontSize: 12, color: "#8b949e", marginBottom: 16 }}>Enter the password to enable editing.</div>
            <input
              type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={e => { if (e.key === "Enter") submitPassword(); }}
              placeholder="Password"
              autoFocus
              style={{ ...INP, marginBottom: 8, borderColor: passwordError ? "#f85149" : "#30363d" }}
            />
            {passwordError && <div style={{ fontSize: 11, color: "#f85149", marginBottom: 8 }}>Incorrect password.</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowPasswordPrompt(false)} style={{ ...B, background: "#21262d", color: "#8b949e", border: "1px solid #30363d", flex: 1, padding: "8px 0" }}>Cancel</button>
              <button onClick={submitPassword} style={{ ...B, background: "#238636", color: "#fff", border: "1px solid #2ea043", flex: 1, padding: "8px 0" }}>Unlock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function F({ l, v, m, c }) {
  return <div><div style={{ fontSize: 9, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 1 }}>{l}</div><div style={{ fontSize: 12, color: c || "#e6edf3", fontFamily: m ? "'DM Mono', monospace" : "inherit", fontWeight: 500 }}>{v}</div></div>;
}

const B = { padding: "5px 10px", borderRadius: 5, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.12s" };
const LBL = { fontSize: 10, color: "#484f58", display: "block", marginBottom: 3, marginTop: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
const HDR = { fontSize: 10, color: "#484f58", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, fontWeight: 600 };
const SEL = { width: "100%", padding: "5px 7px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 4, color: "#c9d1d9", fontSize: 12, fontFamily: "'DM Sans', sans-serif" };
const INP = { width: "100%", padding: "5px 7px", background: "#0d1117", border: "1px solid #30363d", borderRadius: 4, color: "#c9d1d9", fontSize: 12, fontFamily: "'DM Sans', sans-serif", outline: "none" };
