'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip, Legend } from 'chart.js';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import type { Activite, Commentaire } from '@/lib/types';

ChartJS.register(ArcElement, ChartTooltip, Legend);

const DEPT_CONFIG: Record<string, { color: string; light: string }> = {
  'CTs & Experts':               { color: '#1a6fbd', light: '#ddeaf8' },
  'PMO':                         { color: '#2d8a3e', light: '#d6f0db' },
  'Audit interne':               { color: '#c0392b', light: '#fad7d4' },
  'Contrôle interne et Qualité': { color: '#7d5fa5', light: '#ecdff8' },
};

const STATUTS = ['Clos', 'En cours', 'Ouvert', 'Non démarré'];

function normalizeStatut(v: string): string | null {
  if (!v || v === 'null' || v.toLowerCase() === 'nan') return null;
  const u = v.trim().toLowerCase();
  if (u === 'clos' || u === 'clôturé') return 'Clos';
  if (u.includes('cours')) return 'En cours';
  if (u === 'ouvert') return 'Ouvert';
  if ((u.includes('non') && u.includes('démarré')) || u.includes('demarre')) return 'Non démarré';
  if (v.length > 30) return null;
  return v.trim();
}

function avatarColors(resp: string): [string, string] {
  const palette: [string, string][] = [
    ['#EEEDFE','#3C3489'],['#E1F5EE','#0F6E56'],['#FBEAF0','#72243E'],
    ['#E6F1FB','#185FA5'],['#FAEEDA','#854F0B'],['#EAF3DE','#3B6D11'],
    ['#fad7d4','#8b1a12'],['#ecdff8','#5c4478'],
  ];
  return palette[(resp.charCodeAt(0) + (resp.charCodeAt(1) || 0)) % palette.length];
}

function BadgeStatut({ statut }: { statut: string | null }) {
  if (!statut) return <span className="badge b-na">–</span>;
  if (statut === 'Clos')         return <span className="badge b-clos">Clos</span>;
  if (statut === 'En cours')     return <span className="badge b-encours">En cours</span>;
  if (statut === 'Ouvert')       return <span className="badge b-ouvert">Ouvert</span>;
  if (statut === 'Non démarré')  return <span className="badge b-nd">Non démarré</span>;
  return <span className="badge b-na">{statut}</span>;
}

export default function Dashboard() {
  const [allData, setAllData]         = useState<Activite[]>([]);
  const [currentDept, setCurrentDept] = useState<string>('');
  const [filterStatut, setFilterStatut] = useState('all');
  const [filterResp, setFilterResp]   = useState('all');
  const [filterSearch, setFilterSearch] = useState('');
  const [toast, setToast]             = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [darkMode, setDarkMode]       = useState(false);

  // Modals
  const [editModal,   setEditModal]   = useState<{ open: boolean; mode: 'add'|'edit'; row?: Activite }>({ open: false, mode: 'add' });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; row?: Activite }>({ open: false });
  const [importModal, setImportModal] = useState(false);
  const [importDragging, setImportDragging] = useState(false);
  const [importLoading, setImportLoading]   = useState(false);

  // Form
  const [form, setForm] = useState<Partial<Activite>>({});

  // Commentaires
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentModal,  setCommentModal]  = useState<{ open: boolean; row?: Activite; comments: Commentaire[] }>({ open: false, comments: [] });
  const [newComment,    setNewComment]    = useState('');
  const [commentAuteur, setCommentAuteur] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Init dark mode + auteur
  useEffect(() => {
    const saved = localStorage.getItem('ansut_theme');
    if (saved === 'dark') { setDarkMode(true); document.documentElement.setAttribute('data-theme','dark'); }
    const auteur = localStorage.getItem('ansut_comment_auteur');
    if (auteur) setCommentAuteur(auteur);
  }, []);

  function toggleDark() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('ansut_theme', next ? 'dark' : 'light');
  }

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 4000);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('activites').select('*').order('departement').order('numero');
    if (error) {
      showToast('Erreur Supabase : ' + error.message);
    } else {
      setAllData(data || []);
      if (data && data.length > 0 && !currentDept) {
        const depts = Array.from(new Set(data.map((r: Activite) => r.departement))).filter(Boolean);
        if (depts.length > 0) setCurrentDept(depts[0]);
      }
    }
    setLoading(false);
  }, [currentDept]);

  const fetchCommentCounts = useCallback(async () => {
    const { data } = await supabase.from('commentaires').select('activite_id');
    if (!data) return;
    const counts: Record<string, number> = {};
    data.forEach((r: { activite_id: string }) => { counts[r.activite_id] = (counts[r.activite_id] || 0) + 1; });
    setCommentCounts(counts);
  }, []);

  useEffect(() => { fetchData(); fetchCommentCounts(); }, []);

  const depts    = Array.from(new Set(allData.map(r => r.departement))).filter(Boolean);
  const deptData = allData.filter(r => r.departement === currentDept);
  const searchLower = filterSearch.toLowerCase();
  const filtered = deptData.filter(r =>
    (filterStatut === 'all' || (r.statut || '') === filterStatut) &&
    (filterResp === 'all' || r.responsable === filterResp) &&
    (!filterSearch || [r.numero, r.rubrique, r.activite, r.responsable].some(v => (v||'').toLowerCase().includes(searchLower)))
  );
  const resps = Array.from(new Set(deptData.map(r => r.responsable))).filter(Boolean);

  const total = filtered.length;
  const clos  = filtered.filter(r => r.statut === 'Clos').length;
  const ec    = filtered.filter(r => r.statut === 'En cours').length;
  const ouv   = filtered.filter(r => r.statut === 'Ouvert' || r.statut === 'Non démarré').length;
  const na    = filtered.filter(r => !r.statut).length;
  const pct   = (v: number) => total ? Math.round(v / total * 100) : 0;

  const cfg = DEPT_CONFIG[currentDept] || { color: '#004A9F', light: '#e6eef9' };

  /* ── CRUD ── */
  async function handleSave() {
    if (!form.numero || !form.responsable) { showToast('Numéro et responsable requis'); return; }
    if (editModal.mode === 'add') {
      const { error } = await supabase.from('activites').insert([{
        id: crypto.randomUUID(), departement: form.departement || currentDept,
        numero: form.numero, type_dept: form.type_dept || '',
        responsable: form.responsable, rubrique: form.rubrique || '',
        activite: form.activite || '', statut: form.statut || null,
      }]);
      if (error) { showToast('Erreur : ' + error.message); return; }
      showToast('✓ Activité ajoutée');
    } else {
      const { error } = await supabase.from('activites').update({
        numero: form.numero, type_dept: form.type_dept,
        responsable: form.responsable, rubrique: form.rubrique,
        activite: form.activite, statut: form.statut || null,
      }).eq('id', form.id!);
      if (error) { showToast('Erreur : ' + error.message); return; }
      showToast('✓ Activité mise à jour');
    }
    setEditModal({ open: false, mode: 'add' });
    await fetchData();
  }

  async function handleDelete() {
    if (!deleteModal.row) return;
    const { error } = await supabase.from('activites').delete().eq('id', deleteModal.row.id);
    if (error) { showToast('Erreur : ' + error.message); return; }
    showToast('✓ Activité supprimée');
    setDeleteModal({ open: false });
    await fetchData();
  }

  function openEdit(row: Activite) { setForm({ ...row }); setEditModal({ open: true, mode: 'edit', row }); }
  function openAdd()  { setForm({ departement: currentDept }); setEditModal({ open: true, mode: 'add' }); }

  /* ── COMMENTAIRES ── */
  async function openComments(row: Activite) {
    setCommentLoading(true);
    setCommentModal({ open: true, row, comments: [] });
    const { data } = await supabase.from('commentaires').select('*').eq('activite_id', row.id).order('created_at', { ascending: true });
    setCommentModal({ open: true, row, comments: data || [] });
    setCommentLoading(false);
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    const auteur = commentAuteur.trim() || 'Anonyme';
    localStorage.setItem('ansut_comment_auteur', auteur);
    const { data, error } = await supabase.from('commentaires').insert([{
      id: crypto.randomUUID(), activite_id: commentModal.row!.id, auteur, contenu: newComment.trim(),
    }]).select().single();
    if (error) { showToast('Erreur : ' + error.message); return; }
    setCommentModal(m => ({ ...m, comments: [...m.comments, data] }));
    setCommentCounts(c => ({ ...c, [commentModal.row!.id]: (c[commentModal.row!.id] || 0) + 1 }));
    setNewComment('');
  }

  async function handleDeleteComment(id: string) {
    const { error } = await supabase.from('commentaires').delete().eq('id', id);
    if (error) { showToast('Erreur : ' + error.message); return; }
    setCommentModal(m => ({ ...m, comments: m.comments.filter(c => c.id !== id) }));
    setCommentCounts(c => ({ ...c, [commentModal.row!.id]: Math.max(0, (c[commentModal.row!.id] || 1) - 1) }));
  }

  /* ── IMPORT EXCEL ── */
  async function handleImport(file: File) {
    setImportLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const rows: Activite[] = [];
      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        const rawArr: (string | null)[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as (string | null)[][];
        let headerRow = -1;
        for (let i = 0; i < rawArr.length; i++) {
          if (rawArr[i]?.some(c => String(c || '').trim() === 'N°')) { headerRow = i; break; }
        }
        if (headerRow < 0) return;
        const headers = rawArr[headerRow].map(h => String(h || '').trim());
        let lastDept = '', lastResp = '';
        for (let i = headerRow + 1; i < rawArr.length; i++) {
          const row = rawArr[i]; if (!row) continue;
          const obj: Record<string, string | null> = {};
          headers.forEach((h, idx) => { obj[h] = row[idx] != null ? String(row[idx]) : null; });
          const n = String(obj['N°'] || '').trim(); if (!n || n === 'nan') continue;
          const dept = String(obj['CT / DEPARTEMENT / SERVICE'] || '').trim();
          const resp = String(obj['RESPONSABLE'] || '').trim();
          if (dept && dept !== 'nan') lastDept = dept;
          if (resp && resp !== 'nan') lastResp = resp;
          rows.push({ id: crypto.randomUUID(), departement: sheetName, numero: n, type_dept: lastDept, responsable: lastResp, rubrique: String(obj['RUBRIQUE'] || '').trim(), activite: String(obj['ACTIVITES'] || '').trim(), statut: normalizeStatut(String(obj['STATUT'] || '')) });
        }
      });
      const { error: delErr } = await supabase.from('activites').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (delErr) throw delErr;
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('activites').insert(rows.slice(i, i + 500));
        if (error) throw error;
      }
      setImportModal(false);
      showToast(`✓ ${rows.length} activités importées`);
      await fetchData();
    } catch (err: unknown) { showToast('Erreur import : ' + (err instanceof Error ? err.message : String(err))); }
    setImportLoading(false);
  }

  /* ── RENDER ── */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── HEADER ── */}
      <header className="db-header">
        <div>
          <div className="db-header-title">Cabinet DG — ANSUT</div>
          <div className="db-header-sub">Suivi des activités</div>
        </div>
        <div className="db-header-actions no-print">
          <button className="dark-toggle" onClick={toggleDark} title={darkMode ? 'Mode clair' : 'Mode sombre'}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button className="hbtn" onClick={() => window.print()}>⬇ PDF</button>
          <button className="hbtn hbtn-accent" onClick={() => setImportModal(true)}>↑ Import Excel</button>
          <button className="hbtn hbtn-primary" onClick={openAdd}>+ Ajouter</button>
        </div>
      </header>

      {/* ── ONGLETS ── */}
      <div className="dept-tabs">
        {depts.map(dept => (
          <button key={dept} className={`tab-btn${dept === currentDept ? ' active' : ''}`}
            style={dept === currentDept ? { color: DEPT_CONFIG[dept]?.color || 'var(--primary)', borderBottomColor: DEPT_CONFIG[dept]?.color || 'var(--primary)' } : {}}
            onClick={() => { setCurrentDept(dept); setFilterResp('all'); setFilterSearch(''); }}>
            {dept}
          </button>
        ))}
      </div>

      {/* ── MAIN ── */}
      <main className="db-main">
        {loading ? (
          <div className="db-empty"><div className="db-empty-icon">⏳</div>Chargement…</div>
        ) : allData.length === 0 ? (
          <div className="db-empty">
            <div className="db-empty-icon">📂</div>
            <p>Aucune donnée. Cliquez sur <strong>↑ Import Excel</strong> pour commencer.</p>
          </div>
        ) : (<>

          {/* FILTRES */}
          <div className="db-filters no-print">
            <div className="db-search">
              <span className="db-search-icon">🔍</span>
              <input placeholder="Rechercher…" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
              {filterSearch && <button className="db-search-clear" onClick={() => setFilterSearch('')}>×</button>}
            </div>
            <select className="db-select" value={filterStatut} onChange={e => { setFilterStatut(e.target.value); setFilterResp('all'); }}>
              <option value="all">Tous les statuts</option>
              {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="db-select" value={filterResp} onChange={e => setFilterResp(e.target.value)}>
              <option value="all">Tous les responsables</option>
              {Array.from(new Set(deptData.map(r => r.responsable))).filter(Boolean).sort().map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {(filterSearch || filterStatut !== 'all' || filterResp !== 'all') && (
              <button className="db-reset" onClick={() => { setFilterSearch(''); setFilterStatut('all'); setFilterResp('all'); }}>Réinitialiser</button>
            )}
          </div>

          {/* KPIs */}
          <div className="kpi-grid">
            {[
              { label:'Total activités',          value:total, sub:`${pct(clos)}% clôturées`,  icon:'📋', bg:'var(--primary-light)', color:'var(--primary)' },
              { label:'Clôturées',                 value:clos,  sub:`${pct(clos)}% du total`,   icon:'✓',  bg:'var(--s-clos-bg)',    color:'var(--s-clos-fg)' },
              { label:'En cours',                  value:ec,    sub:`${pct(ec)}% du total`,     icon:'↻',  bg:'var(--s-ec-bg)',      color:'var(--s-ec-fg)' },
              { label:'Ouvertes / Non démarrées',  value:ouv,   sub:`${pct(ouv)}% du total`,   icon:'⚠',  bg:'var(--s-ouv-bg)',     color:'var(--s-ouv-fg)' },
            ].map(k => (
              <div key={k.label} className="db-card kpi-card-inner">
                <div className="kpi-icon" style={{ background: k.bg }}>{k.icon}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="kpi-label">{k.label}</div>
                  <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
                  <div className="kpi-sub">{k.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* MID ROW */}
          <div className="mid-row">
            {/* DONUT */}
            <div className="db-card db-card-pad">
              <div className="db-card-title">Répartition</div>
              <div className="donut-wrap">
                <div className="donut-container">
                  {total > 0 ? (
                    <Doughnut
                      data={{ labels:['Clos','En cours','Ouvert/ND','N/A'], datasets:[{ data:[clos,ec,ouv,na], backgroundColor:['#639922','#378ADD','#F47920','#97a3b8'], borderWidth:0, hoverOffset:4 }] }}
                      options={{ cutout:'70%', plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.label}: ${c.raw}`}} }, responsive:false }}
                      width={170} height={170}
                    />
                  ) : <div style={{ width:170, height:170, borderRadius:'50%', background:'var(--surface3)' }} />}
                  <div className="donut-center">
                    <div className="donut-center-val">{total}</div>
                    <div className="donut-center-lbl">activités</div>
                  </div>
                </div>
                <div className="donut-legend">
                  {[{l:'Clos',v:clos,c:'#639922'},{l:'En cours',v:ec,c:'#378ADD'},{l:'Ouvert/ND',v:ouv,c:'#F47920'}].map(li=>(
                    <div key={li.l} className="donut-legend-item">
                      <div className="donut-legend-left"><div className="donut-legend-dot" style={{ background:li.c }}/>{li.l}</div>
                      <span className="donut-legend-val">{li.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RESPONSABLES */}
            <div className="db-card db-card-pad">
              <div className="db-card-title">Par responsable</div>
              <div className="resp-list">
                {resps.map(resp => {
                  const rd = filtered.filter(r => r.responsable === resp);
                  if (!rd.length) return null;
                  const rt=rd.length, rc=rd.filter(r=>r.statut==='Clos').length,
                        re=rd.filter(r=>r.statut==='En cours').length,
                        ro=rd.filter(r=>r.statut==='Ouvert'||r.statut==='Non démarré').length;
                  const [bg,fg] = avatarColors(resp);
                  const initials = resp.split(/[\s\/\-]+/).map((w:string)=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
                  return (
                    <div key={resp}>
                      <div className="resp-header">
                        <div className="resp-name">
                          <div className="avatar" style={{ background:bg, color:fg }}>{initials}</div>
                          {resp}
                        </div>
                        <span className="resp-count">{rt} activité{rt>1?'s':''}</span>
                      </div>
                      <div className="seg-bar">
                        {rc>0 && <div style={{ width:`${rc/rt*100}%`, background:'#639922', borderRadius:4 }}/>}
                        {re>0 && <div style={{ width:`${re/rt*100}%`, background:'#378ADD', borderRadius:4 }}/>}
                        {ro>0 && <div style={{ width:`${ro/rt*100}%`, background:'#F47920', borderRadius:4 }}/>}
                      </div>
                      <div className="seg-legend">
                        <span className="seg-lbl"><span className="seg-dot" style={{ background:'#639922' }}/>{rc} clos</span>
                        <span className="seg-lbl"><span className="seg-dot" style={{ background:'#378ADD' }}/>{re} en cours</span>
                        {ro>0 && <span className="seg-lbl"><span className="seg-dot" style={{ background:'#F47920' }}/>{ro} ouvert/ND</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* TABLE */}
          <div className="db-card">
            <div className="db-card-pad" style={{ paddingBottom: 0 }}>
              <div className="db-card-title">Détail des activités
                <span style={{ fontWeight:400, color:'var(--text3)', fontSize:12, marginLeft:8 }}>
                  {filtered.length} résultat{filtered.length>1?'s':''}
                </span>
              </div>
            </div>
            <div className="db-table-wrap">
              <table className="db-table">
                <thead>
                  <tr>
                    <th style={{ width:36 }}>N°</th>
                    <th>Rubrique / Activité</th>
                    <th>Responsable</th>
                    <th>Statut</th>
                    <th style={{ width:40 }}>💬</th>
                    <th className="no-print" style={{ width:70 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={6} className="db-empty">Aucune activité pour cette sélection.</td></tr>
                  ) : filtered.map(row => (
                    <tr key={row.id}>
                      <td style={{ color:'var(--text3)', fontSize:12, fontVariantNumeric:'tabular-nums' }}>{row.numero}</td>
                      <td>
                        <div style={{ fontWeight:500, fontSize:13 }}>{row.rubrique || '—'}</div>
                        {row.activite && <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>{row.activite}</div>}
                      </td>
                      <td style={{ fontSize:12, whiteSpace:'nowrap', color:'var(--text2)' }}>{row.responsable || '—'}</td>
                      <td><BadgeStatut statut={row.statut} /></td>
                      <td style={{ padding:'11px 8px' }}>
                        <button onClick={() => openComments(row)} style={{ background:'none', border:'none', cursor:'pointer', padding:'0 2px', display:'inline-flex', alignItems:'center', gap:3 }} title="Commentaires">
                          <span style={{ fontSize:14, opacity: commentCounts[row.id] ? 1 : 0.35 }}>💬</span>
                          {commentCounts[row.id] > 0 && (
                            <span style={{ fontSize:10, fontWeight:700, background:'var(--primary)', color:'#fff', borderRadius:10, padding:'1px 5px', lineHeight:'14px' }}>{commentCounts[row.id]}</span>
                          )}
                        </button>
                      </td>
                      <td className="no-print" style={{ whiteSpace:'nowrap' }}>
                        <button onClick={() => openEdit(row)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:15, padding:'0 4px', opacity:0.5, transition:'opacity .15s' }} title="Modifier"
                          onMouseEnter={e=>(e.currentTarget.style.opacity='1')} onMouseLeave={e=>(e.currentTarget.style.opacity='0.5')}>✏️</button>
                        <button onClick={() => setDeleteModal({ open:true, row })} style={{ background:'none', border:'none', cursor:'pointer', fontSize:15, padding:'0 4px', opacity:0.5, transition:'opacity .15s' }} title="Supprimer"
                          onMouseEnter={e=>(e.currentTarget.style.opacity='1')} onMouseLeave={e=>(e.currentTarget.style.opacity='0.5')}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="add-row-btn no-print" onClick={openAdd}
              onMouseEnter={e => (e.currentTarget.style.color = cfg.color)}
              onMouseLeave={e => (e.currentTarget.style.color = '')}>
              <span style={{ fontSize:16, fontWeight:400 }}>+</span> Ajouter une activité
            </button>
          </div>

        </>)}
      </main>

      {/* ── MODAL EDIT / ADD ── */}
      {editModal.open && (
        <div className="modal-overlay" onClick={e => { if (e.target===e.currentTarget) setEditModal({open:false,mode:'add'}); }}>
          <div className="modal-box">
            <div className="modal-title">{editModal.mode==='add' ? '+ Nouvelle activité' : 'Modifier l\'activité'}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label className="modal-label">N°</label>
                  <input className="modal-input" value={form.numero||''} onChange={e=>setForm(f=>({...f,numero:e.target.value}))} placeholder="ex: 1.1"/>
                </div>
                <div>
                  <label className="modal-label">Statut</label>
                  <select className="modal-input db-select" value={form.statut||''} onChange={e=>setForm(f=>({...f,statut:e.target.value||null}))}>
                    <option value="">— Sélectionner —</option>
                    {STATUTS.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="modal-label">Responsable *</label>
                <input className="modal-input" value={form.responsable||''} onChange={e=>setForm(f=>({...f,responsable:e.target.value}))} placeholder="Nom du responsable"/>
              </div>
              <div>
                <label className="modal-label">Rubrique</label>
                <input className="modal-input" value={form.rubrique||''} onChange={e=>setForm(f=>({...f,rubrique:e.target.value}))}/>
              </div>
              <div>
                <label className="modal-label">Activité</label>
                <textarea className="modal-input" style={{ minHeight:70, resize:'vertical' }} value={form.activite||''} onChange={e=>setForm(f=>({...f,activite:e.target.value}))}/>
              </div>
              {editModal.mode==='add' && (
                <div>
                  <label className="modal-label">Département</label>
                  <select className="modal-input db-select" value={form.departement||currentDept} onChange={e=>setForm(f=>({...f,departement:e.target.value}))}>
                    {depts.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="hbtn" onClick={() => setEditModal({open:false,mode:'add'})}>Annuler</button>
              <button className="hbtn hbtn-primary" onClick={handleSave}>{editModal.mode==='add' ? 'Ajouter' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DELETE ── */}
      {deleteModal.open && (
        <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget) setDeleteModal({open:false}); }}>
          <div className="modal-box" style={{ maxWidth:380, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🗑️</div>
            <div className="modal-title" style={{ textAlign:'center' }}>Supprimer cette activité ?</div>
            <p style={{ fontSize:13, color:'var(--text2)', marginBottom:24, lineHeight:1.6 }}>
              <strong>{deleteModal.row?.rubrique || deleteModal.row?.numero}</strong><br/>Cette action est irréversible.
            </p>
            <div className="modal-footer" style={{ justifyContent:'center' }}>
              <button className="hbtn" onClick={() => setDeleteModal({open:false})}>Annuler</button>
              <button className="hbtn" style={{ background:'#c0392b', color:'#fff', borderColor:'#c0392b' }} onClick={handleDelete}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL IMPORT ── */}
      {importModal && (
        <div className="modal-overlay" onClick={e=>{ if(e.target===e.currentTarget&&!importLoading) setImportModal(false); }}>
          <div className="modal-box" style={{ maxWidth:420, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📂</div>
            <div className="modal-title" style={{ textAlign:'center' }}>Importer le fichier Excel</div>
            <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, marginBottom:20 }}>
              Cette opération <strong>remplace toutes les données</strong> existantes.
            </p>
            {importLoading ? (
              <div style={{ padding:20, color:'var(--text2)', fontSize:13 }}>⏳ Import en cours…</div>
            ) : (
              <>
                <div
                  onDragOver={e=>{e.preventDefault();setImportDragging(true);}}
                  onDragLeave={()=>setImportDragging(false)}
                  onDrop={e=>{e.preventDefault();setImportDragging(false);const f=e.dataTransfer.files[0];if(f)handleImport(f);}}
                  onClick={()=>document.getElementById('import-file-input')?.click()}
                  style={{ border:`2px dashed ${importDragging?'var(--accent)':'var(--border2)'}`, borderRadius:8, padding:'28px 20px', marginBottom:16, cursor:'pointer', background:importDragging?'var(--accent-light)':'var(--surface2)', transition:'all .2s' }}>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>Déposez le fichier .xlsx ici ou cliquez pour parcourir</div>
                </div>
                <input id="import-file-input" type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={e=>{if(e.target.files?.[0])handleImport(e.target.files[0]);}}/>
              </>
            )}
            <button onClick={()=>setImportModal(false)} style={{ fontSize:12, color:'var(--text3)', cursor:'pointer', background:'none', border:'none', textDecoration:'underline', marginTop:4 }}>Annuler</button>
          </div>
        </div>
      )}

      {/* ── PANNEAU COMMENTAIRES ── */}
      {commentModal.open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', backdropFilter:'blur(3px)', zIndex:100, display:'flex', alignItems:'stretch', justifyContent:'flex-end' }}
          onClick={e=>{if(e.target===e.currentTarget) setCommentModal({open:false,comments:[]});}}>
          <div className="comment-panel">
            <div style={{ padding:'18px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:3, color:'var(--text)' }}>💬 Commentaires</div>
                <div style={{ fontSize:12, color:'var(--text2)' }}>{commentModal.row?.rubrique || commentModal.row?.numero} — {commentModal.row?.responsable}</div>
              </div>
              <button onClick={()=>setCommentModal({open:false,comments:[]})} style={{ background:'none', border:'none', cursor:'pointer', fontSize:22, color:'var(--text3)', lineHeight:1, flexShrink:0 }}>×</button>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
              {commentLoading ? (
                <div style={{ textAlign:'center', color:'var(--text3)', fontSize:13, padding:20 }}>Chargement…</div>
              ) : commentModal.comments.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--text3)', fontSize:13, padding:30 }}>Aucun commentaire.<br/>Soyez le premier à commenter.</div>
              ) : commentModal.comments.map(c => {
                const [bg,fg] = avatarColors(c.auteur);
                const initials = c.auteur.split(/[\s\/\-]+/).map((w:string)=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
                const date = new Date(c.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
                return (
                  <div key={c.id} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div className="avatar" style={{ background:bg, color:fg, width:30, height:30, fontSize:10 }}>{initials}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--text)' }}>{c.auteur}</span>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ fontSize:10, color:'var(--text3)' }}>{date}</span>
                          <button onClick={()=>handleDeleteComment(c.id)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:13, color:'var(--text3)', padding:0 }} title="Supprimer">×</button>
                        </div>
                      </div>
                      <div className="comment-bubble">{c.contenu}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding:'14px 20px', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
              <input placeholder="Votre nom" value={commentAuteur} onChange={e=>setCommentAuteur(e.target.value)}
                className="modal-input" style={{ fontSize:12 }}/>
              <div style={{ display:'flex', gap:8 }}>
                <textarea placeholder="Ajouter un commentaire…" value={newComment} onChange={e=>setNewComment(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))handleAddComment();}}
                  className="modal-input" style={{ flex:1, fontSize:13, resize:'none', minHeight:68 }}/>
                <button onClick={handleAddComment} disabled={!newComment.trim()}
                  className="hbtn hbtn-primary" style={{ alignSelf:'flex-end', opacity:newComment.trim()?1:.4, cursor:newComment.trim()?'pointer':'default' }}>
                  Envoyer
                </button>
              </div>
              <div style={{ fontSize:10, color:'var(--text3)' }}>⌘/Ctrl + Entrée pour envoyer</div>
            </div>
          </div>
        </div>
      )}

      {/* ── TOAST ── */}
      {toast && <div className="db-toast no-print">{toast}</div>}
    </div>
  );
}
