import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import api from '../api';
import { clearToken } from '../auth';
import { useNavigate } from 'react-router-dom';

/* ===================== FISCAL YEAR CONSTANTS ===================== */
const FY_LABEL = 'FY2027';
const FY_MONTH_LABELS = ['Apr 26','May 26','Jun 26','Jul 26','Aug 26','Sep 26','Oct 26','Nov 26','Dec 26','Jan 27','Feb 27','Mar 27'];

function fyMonthIndex(d) {
  const idx = (d.getFullYear() - 2026) * 12 + (d.getMonth() - 3);
  return idx >= 0 && idx <= 11 ? idx : -1;
}
function cr(n) {
  n = n || 0;
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Cr';
}
function todayDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 30;
}
function bucketFor(entry) {
  if (entry.bucketOverride && entry.bucketOverride !== 'auto') return entry.bucketOverride;
  if (!entry.date) return 'unsch';
  const today = todayDate();
  const d = new Date(entry.date);
  const diff = monthsBetween(today, d);
  if (diff <= 2) return 'short';
  if (diff <= 6) return 'mid';
  return 'long';
}
function isOverdue(entry) {
  if (!entry.date) return false;
  return new Date(entry.date) < todayDate();
}
function bucketLabel(b) {
  return { short: 'Short', mid: 'Mid', long: 'Long', unsch: 'Unscheduled' }[b] || b;
}
function toDateInputValue(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

const STATUS_OPTIONS = [
  'Quotation / Costing', 'Proposal Prepared', 'Tender in Progress', 'Quotation Cooling Period',
  'LOA Awaited', 'WIP', 'Processing', 'Invoice Submitted', 'Raised Invoice', 'Paid',
  'On Hold', 'Need to Follow Up',
];

const EMPTY_FORM = {
  project: '', milestone: '', current: '', potential: '', date: '',
  bucketOverride: 'auto', status: '', remarks: '',
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('dashboard');
  const [entries, setEntries] = useState([]);
  const [mgmtRemarks, setMgmtRemarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [mgmtDrafts, setMgmtDrafts] = useState({});
  const [savedFlag, setSavedFlag] = useState({});

  const monthlyCanvas = useRef(null);
  const bucketCanvas = useRef(null);
  const projectsCanvas = useRef(null);
  const monthlyChart = useRef(null);
  const bucketChart = useRef(null);
  const projectsChart = useRef(null);

  async function loadAll() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [entriesRes, mgmtRes] = await Promise.all([
        api.get('/entries'),
        api.get('/mgmt-remarks'),
      ]);
      setEntries(entriesRes.data);
      setMgmtRemarks(mgmtRes.data);
    } catch (err) {
      setErrorMsg('Could not load data from the server. Is the API running?');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  function logout() {
    clearToken();
    navigate('/login');
  }

  /* ===================== DERIVED METRICS ===================== */
  const metrics = useMemo(() => {
    const today = todayDate();
    const curMonth = today.getMonth(), curYear = today.getFullYear();
    const curFyIdx = fyMonthIndex(today);
    const curFyQuarter = curFyIdx >= 0 ? Math.floor(curFyIdx / 3) : null;

    let mMonth = 0, mQuarter = 0, mYearFy = 0, totalCommitted = 0, totalPotential = 0;
    let bShort = 0, bMid = 0, bLong = 0, bUnsch = 0, cShort = 0, cMid = 0, cLong = 0, cUnsch = 0;
    const monthly = new Array(12).fill(0);

    entries.forEach((e) => {
      totalCommitted += e.current || 0;
      totalPotential += e.potential || e.current || 0;
      const b = bucketFor(e);
      if (b === 'short') { bShort += e.current || 0; cShort++; }
      else if (b === 'mid') { bMid += e.current || 0; cMid++; }
      else if (b === 'long') { bLong += e.current || 0; cLong++; }
      else { bUnsch += e.current || 0; cUnsch++; }

      if (e.date) {
        const d = new Date(e.date);
        if (d.getMonth() === curMonth && d.getFullYear() === curYear) mMonth += e.current || 0;
        const fyIdx = fyMonthIndex(d);
        if (fyIdx >= 0) {
          monthly[fyIdx] += e.current || 0;
          mYearFy += e.current || 0;
          if (curFyQuarter !== null && Math.floor(fyIdx / 3) === curFyQuarter) mQuarter += e.current || 0;
        }
      }
    });

    return {
      curMonth, curYear, curFyQuarter,
      mMonth, mQuarter, mYearFy, totalCommitted, totalPotential,
      buckets: { short: bShort, mid: bMid, long: bLong, unsch: bUnsch },
      counts: { short: cShort, mid: cMid, long: cLong, unsch: cUnsch },
      monthly,
    };
  }, [entries]);

  function matchesActiveFilter(e) {
    if (activeFilter === 'all') return true;
    if (!e.date) return false;
    const d = new Date(e.date);
    if (activeFilter === 'month') return d.getMonth() === metrics.curMonth && d.getFullYear() === metrics.curYear;
    const fyIdx = fyMonthIndex(d);
    if (activeFilter === 'quarter') return fyIdx >= 0 && metrics.curFyQuarter !== null && Math.floor(fyIdx / 3) === metrics.curFyQuarter;
    if (activeFilter === 'fy') return fyIdx >= 0;
    return true;
  }

  const projectRows = useMemo(() => {
    const byProject = {};
    entries.filter(matchesActiveFilter).forEach((e) => {
      const key = e.project || 'Unnamed';
      if (!byProject[key]) byProject[key] = { committed: 0, potential: 0, nextDate: null, remarksList: [] };
      byProject[key].committed += e.current || 0;
      byProject[key].potential += e.potential || e.current || 0;
      if (e.date) {
        const d = new Date(e.date);
        if (!byProject[key].nextDate || d < byProject[key].nextDate) byProject[key].nextDate = d;
      }
      if (e.remarks && e.remarks.trim()) byProject[key].remarksList.push(e.remarks.trim());
    });
    return Object.entries(byProject).sort((a, b) => b[1].potential - a[1].potential);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, activeFilter, metrics.curMonth, metrics.curYear, metrics.curFyQuarter]);

  /* ===================== CHARTS ===================== */
  useEffect(() => {
    const gridColor = 'rgba(255,255,255,0.08)';
    const textColor = '#8D96AA';
    Chart.defaults.color = textColor;
    Chart.defaults.font.family = "'IBM Plex Sans', sans-serif";

    if (monthlyChart.current) monthlyChart.current.destroy();
    if (monthlyCanvas.current) {
      monthlyChart.current = new Chart(monthlyCanvas.current, {
        type: 'bar',
        data: {
          labels: FY_MONTH_LABELS,
          datasets: [{ label: 'Projected committed revenue', data: metrics.monthly, backgroundColor: '#FFAD42', borderRadius: 4, maxBarThickness: 34 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => cr(c.parsed.y) } } },
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: gridColor }, ticks: { callback: (v) => '₹' + v + ' Cr' } },
          },
        },
      });
    }

    if (bucketChart.current) bucketChart.current.destroy();
    if (bucketCanvas.current) {
      bucketChart.current = new Chart(bucketCanvas.current, {
        type: 'doughnut',
        data: {
          labels: ['Short (1-2mo)', 'Mid (2-6mo)', 'Long (6mo+)', 'Unscheduled'],
          datasets: [{
            data: [metrics.buckets.short, metrics.buckets.mid, metrics.buckets.long, metrics.buckets.unsch],
            backgroundColor: ['#FFAD42', '#2ED9C7', '#B79CFC', '#8792A8'],
            borderColor: '#1A1E29', borderWidth: 2,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14, font: { size: 11 } } },
            tooltip: { callbacks: { label: (c) => c.label + ': ' + cr(c.parsed) } },
          },
        },
      });
    }

    if (projectsChart.current) projectsChart.current.destroy();
    if (projectsCanvas.current) {
      const top = projectRows.slice(0, 10);
      projectsChart.current = new Chart(projectsCanvas.current, {
        type: 'bar',
        data: {
          labels: top.map(([n]) => n),
          datasets: [
            { label: 'Committed', data: top.map(([, d]) => d.committed), backgroundColor: '#FFAD42', borderRadius: 3, maxBarThickness: 22 },
            { label: 'Scaled Potential', data: top.map(([, d]) => d.potential), backgroundColor: '#2ED9C7', borderRadius: 3, maxBarThickness: 22 },
          ],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + cr(c.parsed.x) } },
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { callback: (v) => '₹' + v + ' Cr' } },
            y: { grid: { display: false } },
          },
        },
      });
    }

    return () => {
      if (monthlyChart.current) monthlyChart.current.destroy();
      if (bucketChart.current) bucketChart.current.destroy();
      if (projectsChart.current) projectsChart.current.destroy();
    };
  }, [metrics, projectRows]);

  /* ===================== ENTRY FORM ===================== */
  function startEdit(entry) {
    setEditingId(entry._id);
    setForm({
      project: entry.project || '',
      milestone: entry.milestone || '',
      current: entry.current ?? '',
      potential: entry.potential ?? '',
      date: toDateInputValue(entry.date),
      bucketOverride: entry.bucketOverride || 'auto',
      status: entry.status || '',
      remarks: entry.remarks || '',
    });
    setTab('entry');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!form.project.trim()) { alert('Project name is required.'); return; }
    const payload = {
      project: form.project.trim(),
      milestone: form.milestone.trim(),
      current: parseFloat(form.current) || 0,
      potential: form.potential === '' ? (parseFloat(form.current) || 0) : parseFloat(form.potential),
      date: form.date || null,
      bucketOverride: form.bucketOverride,
      status: form.status.trim(),
      remarks: form.remarks.trim(),
    };
    try {
      if (editingId) {
        const res = await api.put(`/entries/${editingId}`, payload);
        setEntries((prev) => prev.map((x) => (x._id === editingId ? res.data : x)));
      } else {
        const res = await api.post('/entries', payload);
        setEntries((prev) => [...prev, res.data]);
      }
      clearForm();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not save this entry.');
    }
  }

  async function deleteEntry(id) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try {
      await api.delete(`/entries/${id}`);
      setEntries((prev) => prev.filter((x) => x._id !== id));
    } catch {
      alert('Could not delete this entry.');
    }
  }

  /* ===================== MANAGEMENT REMARKS ===================== */
  function mgmtDraftFor(project) {
    return mgmtDrafts[project] !== undefined ? mgmtDrafts[project] : (mgmtRemarks[project] || '');
  }
  async function saveMgmtRemark(project) {
    const text = mgmtDraftFor(project);
    try {
      await api.put(`/mgmt-remarks/${encodeURIComponent(project)}`, { text });
      setMgmtRemarks((prev) => ({ ...prev, [project]: text }));
      setSavedFlag((prev) => ({ ...prev, [project]: true }));
      setTimeout(() => setSavedFlag((prev) => ({ ...prev, [project]: false })), 1800);
    } catch {
      alert('Could not save management remarks.');
    }
  }

  /* ===================== SORTED ENTRIES TABLE ===================== */
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });
  }, [entries]);

  const projectNames = useMemo(
    () => [...new Set(entries.map((e) => e.project).filter(Boolean))].sort(),
    [entries]
  );

  const filterLabels = { month: 'This Month', quarter: 'This FY Quarter', fy: FY_LABEL + ' Total' };

  function handleCardClick(f) {
    if (f === 'all') { setActiveFilter('all'); return; }
    setActiveFilter((prev) => (prev === f ? 'all' : f));
  }

  return (
    <div>
      <header>
        <div className="brand">
          <div className="mark">TR</div>
          <div>
            <h1>TRiDE Revenue Command <span className="fy-chip">FY2027</span></h1>
            <p>Project-wise &amp; company-wide revenue potential — Apr 2026 to Mar 2027 · figures in ₹ Crores</p>
          </div>
        </div>
        <div className="header-actions">
          <span className="as-of">as of {todayDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <button className="ghost" onClick={loadAll}>Refresh</button>
          <button className="ghost danger" onClick={logout}>Log out</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={`tab ${tab === 'entry' ? 'active' : ''}`} onClick={() => setTab('entry')}>Add / Manage Entries</button>
      </nav>

      <main>
        {loading && <div className="hint" style={{ padding: '20px 0' }}>Loading…</div>}
        {errorMsg && <div className="login-error" style={{ margin: '16px 0' }}>{errorMsg}</div>}

        {!loading && tab === 'dashboard' && (
          <section className="view active">
            <div className="metric-row">
              <div className={`metric-card accent-amber ${activeFilter === 'month' ? 'is-active' : ''}`} onClick={() => handleCardClick('month')} title="Click to filter Project-wise Summary to this month">
                <div className="label">This Month</div>
                <div className="value">{cr(metrics.mMonth)}</div>
                <div className="sub">{todayDate().toLocaleString('default', { month: 'long' })} {metrics.curYear}</div>
              </div>
              <div className={`metric-card accent-blue ${activeFilter === 'quarter' ? 'is-active' : ''}`} onClick={() => handleCardClick('quarter')} title="Click to filter Project-wise Summary to this FY quarter">
                <div className="label">This FY Quarter</div>
                <div className="value">{cr(metrics.mQuarter)}</div>
                <div className="sub">{metrics.curFyQuarter !== null ? `Q${metrics.curFyQuarter + 1} ${FY_LABEL}, committed value` : `outside ${FY_LABEL} window`}</div>
              </div>
              <div className={`metric-card accent-purple ${activeFilter === 'fy' ? 'is-active' : ''}`} onClick={() => handleCardClick('fy')} title="Click to filter Project-wise Summary to FY2027">
                <div className="label">FY2027 Total</div>
                <div className="value">{cr(metrics.mYearFy)}</div>
                <div className="sub">Apr 2026 – Mar 2027, committed value</div>
              </div>
              <div className="metric-card accent-pink" onClick={() => handleCardClick('all')} title="Click to show all projects">
                <div className="label">Total Committed Pipeline</div>
                <div className="value">{cr(metrics.totalCommitted)}</div>
                <div className="sub">all open entries, any date</div>
              </div>
              <div className="metric-card accent-teal" onClick={() => handleCardClick('all')} title="Click to show all projects">
                <div className="label">Total Scaled Potential</div>
                <div className="value">{cr(metrics.totalPotential)}</div>
                <div className="sub">if every project fully scales</div>
              </div>
            </div>
            <div className="hint" style={{ margin: '-14px 0 18px 2px' }}>💡 Tip: click a metric card above to filter the Project-wise Summary below to just those projects.</div>

            <div className="bucket-row">
              <div className="bucket-card short">
                <div className="top"><span className="name">Short Term</span><span className="count">{metrics.counts.short} item{metrics.counts.short !== 1 ? 's' : ''}</span></div>
                <div className="amt">{cr(metrics.buckets.short)}</div>
                <div className="window">Expected within 1–2 months</div>
              </div>
              <div className="bucket-card mid">
                <div className="top"><span className="name">Mid Term</span><span className="count">{metrics.counts.mid} item{metrics.counts.mid !== 1 ? 's' : ''}</span></div>
                <div className="amt">{cr(metrics.buckets.mid)}</div>
                <div className="window">Expected in 2–6 months</div>
              </div>
              <div className="bucket-card long">
                <div className="top"><span className="name">Long Term</span><span className="count">{metrics.counts.long} item{metrics.counts.long !== 1 ? 's' : ''}</span></div>
                <div className="amt">{cr(metrics.buckets.long)}</div>
                <div className="window">Expected beyond 6 months</div>
              </div>
              <div className="bucket-card unsch">
                <div className="top"><span className="name">Unscheduled</span><span className="count">{metrics.counts.unsch} item{metrics.counts.unsch !== 1 ? 's' : ''}</span></div>
                <div className="amt">{cr(metrics.buckets.unsch)}</div>
                <div className="window">No expected date set</div>
              </div>
            </div>

            <div className="chart-grid">
              <div className="panel">
                <h2>FY2027 Monthly Projected Revenue</h2>
                <div className="hint">Committed value, Apr 2026 – Mar 2027, bucketed by expected invoice month</div>
                <div className="chart-box"><canvas ref={monthlyCanvas}></canvas></div>
              </div>
              <div className="panel">
                <h2>Value by Term Bucket</h2>
                <div className="hint">Committed value split short / mid / long / unscheduled</div>
                <div className="chart-box"><canvas ref={bucketCanvas}></canvas></div>
              </div>
            </div>

            <div className="panel">
              <h2>Committed vs. Scaled Potential — by Project</h2>
              <div className="hint">Where the gap is biggest, that's where scaling unlocks the most upside</div>
              <div className="chart-box tall"><canvas ref={projectsCanvas}></canvas></div>
            </div>

            <div className="panel">
              <h2>Project-wise Summary</h2>
              <div className="hint">Rolled up across all invoice items / milestones per project</div>
              {activeFilter !== 'all' && (
                <div className="filter-bar">
                  <span className="filter-chip">Showing only projects with entries in: {filterLabels[activeFilter]}</span>
                  <button className="ghost" onClick={() => setActiveFilter('all')}>Clear filter</button>
                </div>
              )}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th className="num">Committed (₹ Cr)</th>
                      <th className="num">Potential (₹ Cr)</th>
                      <th className="num">Upside Gap (₹ Cr)</th>
                      <th>Next Expected Date</th>
                      <th>Remarks</th>
                      <th>Mang. Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectRows.map(([name, d]) => (
                      <tr key={name}>
                        <td className="proj-name">{name}</td>
                        <td className="num">{cr(d.committed)}</td>
                        <td className="num">{cr(d.potential)}</td>
                        <td className="num">{cr(Math.max(0, d.potential - d.committed))}</td>
                        <td>{d.nextDate ? d.nextDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                        <td className="remarks-cell">{d.remarksList.join(' • ') || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                        <td className="mgmt-remarks-cell">
                          <textarea
                            className="mgmt-input"
                            placeholder="Add management remarks..."
                            value={mgmtDraftFor(name)}
                            onChange={(e) => setMgmtDrafts((prev) => ({ ...prev, [name]: e.target.value }))}
                          />
                          <div className="mgmt-row-actions">
                            <button className="mgmt-save" onClick={() => saveMgmtRemark(name)}>Save</button>
                            <span className="mgmt-saved">{savedFlag[name] ? 'Saved ✓' : ''}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {projectRows.length === 0 && (
                <div className="empty-state">
                  <div className="big">📊</div>
                  <div>
                    {activeFilter === 'all'
                      ? <>No entries yet. Go to <strong>Add / Manage Entries</strong> to get started.</>
                      : <>No projects have entries matching this filter. <strong>Clear filter</strong> to see everything.</>}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {!loading && tab === 'entry' && (
          <section className="view active">
            <div className="panel">
              <h2>{editingId ? 'Edit Revenue Entry' : 'Add a Revenue Entry'}</h2>
              <div className="hint">One row per invoice item / milestone. All values in ₹ Crores.</div>
              <form className="form-panel" onSubmit={submitForm}>
                <div className="field span2">
                  <label>Project</label>
                  <input list="projectList" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} placeholder="e.g. Suraksha AI" />
                  <datalist id="projectList">
                    {projectNames.map((p) => <option key={p} value={p} />)}
                  </datalist>
                </div>
                <div className="field span2">
                  <label>Invoice Item / Milestone</label>
                  <input value={form.milestone} onChange={(e) => setForm({ ...form, milestone: e.target.value })} placeholder="e.g. Pilot PoC, AMC Q2, CCC Phase 1" />
                </div>
                <div className="field">
                  <label>Current / Committed Value (₹ Cr)</label>
                  <input type="number" min="0" step="0.01" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="0.00" />
                </div>
                <div className="field">
                  <label>Full Scaled Potential (₹ Cr)</label>
                  <input type="number" min="0" step="0.01" value={form.potential} onChange={(e) => setForm({ ...form, potential: e.target.value })} placeholder="Same as committed if unsure" />
                </div>
                <div className="field">
                  <label>Expected Invoice Date</label>
                  <input type="date" min="2026-04-01" max="2027-03-31" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="field">
                  <label>Term Bucket</label>
                  <select value={form.bucketOverride} onChange={(e) => setForm({ ...form, bucketOverride: e.target.value })}>
                    <option value="auto">Auto (from date)</option>
                    <option value="short">Force: Short term</option>
                    <option value="mid">Force: Mid term</option>
                    <option value="long">Force: Long term</option>
                  </select>
                </div>
                <div className="field span2">
                  <label>Status</label>
                  <input list="statusList" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} placeholder="e.g. Proposal Prepared, WIP, Invoice Submitted" />
                  <datalist id="statusList">
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div className="field span4">
                  <label>Remarks / Notes</label>
                  <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Context, blockers, next action..." />
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary">{editingId ? 'Save Changes' : 'Add Entry'}</button>
                  {editingId && <button type="button" className="ghost" onClick={clearForm}>Cancel edit</button>}
                  {editingId && <span id="editingNotice">Editing existing entry…</span>}
                </div>
              </form>
            </div>

            <div className="panel">
              <h2>All Entries</h2>
              <div className="hint">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Project</th><th>Milestone</th>
                      <th className="num">Committed (₹ Cr)</th><th className="num">Potential (₹ Cr)</th>
                      <th>Expected Date</th><th>Bucket</th><th>Status</th><th>Remarks</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedEntries.map((e) => {
                      const b = bucketFor(e);
                      const overdue = isOverdue(e);
                      return (
                        <tr key={e._id}>
                          <td className="proj-name">{e.project || '—'}</td>
                          <td>{e.milestone || '—'}</td>
                          <td className="num">{cr(e.current)}</td>
                          <td className="num">{cr(e.potential || e.current)}</td>
                          <td>{e.date ? new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                          <td><span className={`badge ${b}`}>{bucketLabel(b)}</span>{overdue && <span className="badge overdue">Overdue</span>}</td>
                          <td><span className="status-pill">{e.status || '—'}</span></td>
                          <td style={{ maxWidth: 220, color: 'var(--muted)', fontSize: '11.8px' }}>{e.remarks}</td>
                          <td>
                            <div className="row-actions">
                              <button onClick={() => startEdit(e)}>Edit</button>
                              <button className="danger" onClick={() => deleteEntry(e._id)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {entries.length === 0 && (
                <div className="empty-state">
                  <div className="big">🗂️</div>
                  <div>Nothing here yet — add your first entry above.</div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer>Data is stored centrally in MongoDB via the TRiDE Revenue Tracker API — accessible to anyone with the standard password, from any device.</footer>
    </div>
  );
}
