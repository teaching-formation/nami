'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
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
  if (!statut) return <span style={badgeStyle('#F1EFE8','#a0a09c')}>–</span>;
  if (statut === 'Clos') return <span style={badgeStyle('#EAF3DE','#3B6D11')}>Clos</span>;
  if (statut === 'En cours') return <span style={badgeStyle('#E6F1FB','#185FA5')}>En cours</span>;
  if (statut === 'Ouvert') return <span style={badgeStyle('#FAEEDA','#854F0B')}>Ouvert</span>;
  if (statut === 'Non démarré') return <span style={badgeStyle('#F1EFE8','#5F5E5A')}>Non démarré</span>;
  return <span style={badgeStyle('#F1EFE8','#a0a09c')}>{statut}</span>;
}

function badgeStyle(bg: string, color: string): React.CSSProperties {
  return { display:'inline-block', fontSize:11, fontWeight:500, padding:'3px 9px', borderRadius:20, whiteSpace:'nowrap', background:bg, color };
}

export default function Dashboard() {
  const [allData, setAllData] = useState<Activite[]>([]);
  const [currentDept, setCurrentDept] = useState<string>('');
  const [filterStatut, setFilterStatut] = useState('all');
  const [filterResp, setFilterResp] = useState('all');
  const [connected, setConnected] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal états
  const [editModal, setEditModal] = useState<{ open: boolean; mode: 'add' | 'edit'; row?: Activite }>({ open: false, mode: 'add' });
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; row?: Activite }>({ open: false });
  const [importModal, setImportModal] = useState(false);
  const [importDragging, setImportDragging] = useState(false);
  const [importLoading, setImportLoading] = useState(false);

  // Form état
  const [form, setForm] = useState<Partial<Activite>>({});

  // Commentaires
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentModal, setCommentModal] = useState<{ open: boolean; row?: Activite; comments: Commentaire[] }>({ open: false, comments: [] });
  const [newComment, setNewComment] = useState('');
  const [commentAuteur, setCommentAuteur] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger le nom d'auteur depuis localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ansut_comment_auteur');
    if (saved) setCommentAuteur(saved);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 4000);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('activites')
      .select('*')
      .order('departement')
      .order('numero');
    if (error) {
      setConnected(false);
      showToast('Erreur de connexion Supabase : ' + error.message);
    } else {
      setConnected(true);
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
    data.forEach((r: { activite_id: string }) => {
      counts[r.activite_id] = (counts[r.activite_id] || 0) + 1;
    });
    setCommentCounts(counts);
  }, []);

  useEffect(() => { fetchData(); fetchCommentCounts(); }, []);

  const depts = Array.from(new Set(allData.map(r => r.departement))).filter(Boolean);

  const deptData = allData.filter(r => r.departement === currentDept);
  const filtered = deptData.filter(r =>
    (filterStatut === 'all' || (r.statut || '') === filterStatut) &&
    (filterResp === 'all' || r.responsable === filterResp)
  );
  const resps = Array.from(new Set(deptData.map(r => r.responsable))).filter(Boolean);

  const total = filtered.length;
  const clos  = filtered.filter(r => r.statut === 'Clos').length;
  const ec    = filtered.filter(r => r.statut === 'En cours').length;
  const ouv   = filtered.filter(r => r.statut === 'Ouvert' || r.statut === 'Non démarré').length;
  const na    = filtered.filter(r => !r.statut).length;
  const pct   = (v: number) => total ? Math.round(v / total * 100) : 0;

  const cfg = DEPT_CONFIG[currentDept] || { color: '#378ADD', light: '#E6F1FB' };

  // CRUD
  async function handleSave() {
    if (!form.numero || !form.responsable) { showToast('Numéro et responsable requis'); return; }
    if (editModal.mode === 'add') {
      const { error } = await supabase.from('activites').insert([{
        id: crypto.randomUUID(),
        departement: currentDept,
        numero: form.numero,
        type_dept: form.type_dept || '',
        responsable: form.responsable,
        rubrique: form.rubrique || '',
        activite: form.activite || '',
        statut: form.statut || null,
      }]);
      if (error) { showToast('Erreur : ' + error.message); return; }
      showToast('✓ Activité ajoutée');
    } else {
      const { error } = await supabase.from('activites').update({
        numero: form.numero,
        type_dept: form.type_dept,
        responsable: form.responsable,
        rubrique: form.rubrique,
        activite: form.activite,
        statut: form.statut || null,
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

  function openEdit(row: Activite) {
    setForm({ ...row });
    setEditModal({ open: true, mode: 'edit', row });
  }

  // Commentaires CRUD
  async function openComments(row: Activite) {
    setCommentLoading(true);
    setCommentModal({ open: true, row, comments: [] });
    const { data } = await supabase
      .from('commentaires')
      .select('*')
      .eq('activite_id', row.id)
      .order('created_at', { ascending: true });
    setCommentModal({ open: true, row, comments: data || [] });
    setCommentLoading(false);
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    const auteur = commentAuteur.trim() || 'Anonyme';
    localStorage.setItem('ansut_comment_auteur', auteur);
    const { data, error } = await supabase.from('commentaires').insert([{
      id: crypto.randomUUID(),
      activite_id: commentModal.row!.id,
      auteur,
      contenu: newComment.trim(),
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

  function openAdd() {
    setForm({ departement: currentDept });
    setEditModal({ open: true, mode: 'add' });
  }

  // Import Excel
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
          const n = String(obj['N°'] || '').trim();
          if (!n || n === 'nan') continue;
          const dept = String(obj['CT / DEPARTEMENT / SERVICE'] || '').trim();
          const resp = String(obj['RESPONSABLE'] || '').trim();
          if (dept && dept !== 'nan') lastDept = dept;
          if (resp && resp !== 'nan') lastResp = resp;
          rows.push({
            id: crypto.randomUUID(),
            departement: sheetName,
            numero: n,
            type_dept: lastDept,
            responsable: lastResp,
            rubrique: String(obj['RUBRIQUE'] || '').trim(),
            activite: String(obj['ACTIVITES'] || '').trim(),
            statut: normalizeStatut(String(obj['STATUT'] || '')),
          });
        }
      });

      // Vider la table puis insérer
      const { error: delErr } = await supabase.from('activites').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (delErr) throw delErr;

      // Insérer par batch de 500
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase.from('activites').insert(batch);
        if (error) throw error;
      }

      setImportModal(false);
      showToast(`✓ ${rows.length} activités importées depuis ${file.name}`);
      await fetchData();
    } catch (err: unknown) {
      showToast('Erreur import : ' + (err instanceof Error ? err.message : String(err)));
    }
    setImportLoading(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)',
    fontSize: 13, fontFamily: 'inherit', background: '#fff', color: '#1a1a19', outline: 'none',
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: '#6b6b68', marginBottom: 4, display: 'block' };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f4' }}>
      {/* HEADER */}
      <header style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 20 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 600 }}>Tableau de bord — Cabinet DG</h1>
          <p style={{ fontSize: 12, color: '#6b6b68', marginTop: 2 }}>Suivi des activités · ANSUT</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Indicateur connexion */}
          <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 20, background: connected === true ? '#EAF3DE' : connected === false ? '#FAEEDA' : '#F1EFE8', color: connected === true ? '#3B6D11' : connected === false ? '#854F0B' : '#6b6b68', fontWeight: 500 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected === true ? '#639922' : connected === false ? '#c0392b' : '#aaa', display: 'inline-block' }} />
            {connected === true ? 'Connecté' : connected === false ? 'Erreur' : 'Connexion…'}
          </span>
          <button onClick={openAdd} style={{ fontSize: 12, padding: '7px 13px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)', background: '#1a6fbd', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            + Ajouter
          </button>
          <button onClick={() => setImportModal(true)} style={{ fontSize: 12, padding: '7px 13px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)', background: '#f0a500', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            ↑ Import Excel
          </button>
        </div>
      </header>

      {/* ONGLETS */}
      <div style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '0 24px', display: 'flex', gap: 4, position: 'sticky', top: 57, zIndex: 19, overflowX: 'auto' }}>
        {depts.map(dept => {
          const dc = DEPT_CONFIG[dept] || { color: '#378ADD', light: '#E6F1FB' };
          const isActive = dept === currentDept;
          return (
            <button key={dept} onClick={() => { setCurrentDept(dept); setFilterResp('all'); }}
              style={{ fontSize: 13, fontWeight: 500, padding: '12px 18px', border: 'none', cursor: 'pointer', borderBottom: isActive ? `3px solid ${dc.color}` : '3px solid transparent', background: 'transparent', color: isActive ? dc.color : '#6b6b68', opacity: isActive ? 1 : 0.6, transition: 'all .15s', whiteSpace: 'nowrap' }}>
              {dept}
            </button>
          );
        })}
      </div>

      {/* MAIN */}
      <main style={{ maxWidth: 1040, margin: '0 auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b6b68', fontSize: 14 }}>Chargement…</div>
        ) : allData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b6b68', fontSize: 14 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📂</div>
            <p>Aucune donnée. Cliquez sur <strong>↑ Import Excel</strong> pour charger votre fichier.</p>
          </div>
        ) : (
          <>
            {/* FILTRES */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <SelectFilter value={filterStatut} onChange={v => { setFilterStatut(v); setFilterResp('all'); }}>
                <option value="all">Tous les statuts</option>
                {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
              </SelectFilter>
              <SelectFilter value={filterResp} onChange={setFilterResp}>
                <option value="all">Tous les responsables</option>
                {Array.from(new Set(deptData.map(r => r.responsable))).filter(Boolean).sort().map(r => <option key={r} value={r}>{r}</option>)}
              </SelectFilter>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              <KpiCard bg="#EEEDFE" iconColor="#3C3489" label="Total activités" value={total} sub={`${pct(clos)}% clôturées`} icon="📋" />
              <KpiCard bg="#EAF3DE" iconColor="#3B6D11" label="Clôturées" value={clos} sub={`${pct(clos)}% du total`} valueColor="#3B6D11" icon="✓" />
              <KpiCard bg="#E6F1FB" iconColor="#185FA5" label="En cours" value={ec} sub={`${pct(ec)}% du total`} valueColor="#185FA5" icon="↻" />
              <KpiCard bg="#FAEEDA" iconColor="#854F0B" label="Ouvertes / Non démarrées" value={ouv} sub={`${pct(ouv)}% du total`} valueColor="#854F0B" icon="⚠" />
            </div>

            {/* MID ROW */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
              {/* DONUT */}
              <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Répartition par statut</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <div style={{ position: 'relative', width: 160, height: 160 }}>
                    {total > 0 ? (
                      <Doughnut
                        data={{ labels: ['Clos','En cours','Ouvert/ND','N/A'], datasets: [{ data: [clos,ec,ouv,na], backgroundColor: ['#639922','#378ADD','#BA7517','#B4B2A9'], borderWidth: 0, hoverOffset: 4 }] }}
                        options={{ cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.raw}` } } }, responsive: false }}
                        width={160} height={160}
                      />
                    ) : <div style={{ width: 160, height: 160, borderRadius: '50%', background: '#e8e8e6' }} />}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none' }}>
                      <div style={{ fontSize: 24, fontWeight: 600 }}>{total}</div>
                      <div style={{ fontSize: 10, color: '#6b6b68', marginTop: 1 }}>activités</div>
                    </div>
                  </div>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[{label:'Clos',val:clos,color:'#639922'},{label:'En cours',val:ec,color:'#378ADD'},{label:'Ouvert / ND',val:ouv,color:'#BA7517'}].map(li => (
                      <div key={li.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 12, height: 12, borderRadius: 2, background: li.color, flexShrink: 0 }} />
                          {li.label}
                        </div>
                        <strong>{li.val}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* RESPONSABLES */}
              <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '18px 20px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Par responsable</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {resps.map(resp => {
                    const rd = filtered.filter(r => r.responsable === resp);
                    if (!rd.length) return null;
                    const rt = rd.length, rc = rd.filter(r => r.statut === 'Clos').length,
                          re = rd.filter(r => r.statut === 'En cours').length,
                          ro = rd.filter(r => r.statut === 'Ouvert' || r.statut === 'Non démarré').length;
                    const [bg, fg] = avatarColors(resp);
                    const initials = resp.split(/[\s\/\-]+/).map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
                    return (
                      <div key={resp}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, background: bg, color: fg, flexShrink: 0 }}>{initials}</div>
                            {resp}
                          </div>
                          <span style={{ fontSize: 12, color: '#6b6b68' }}>{rt} activité{rt > 1 ? 's' : ''}</span>
                        </div>
                        <div style={{ display: 'flex', height: 10, borderRadius: 20, overflow: 'hidden', background: '#e8e8e6' }}>
                          {rc > 0 && <div style={{ width: `${rc/rt*100}%`, background: '#639922' }} />}
                          {re > 0 && <div style={{ width: `${re/rt*100}%`, background: '#378ADD' }} />}
                          {ro > 0 && <div style={{ width: `${ro/rt*100}%`, background: '#BA7517' }} />}
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: '#6b6b68', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: '#639922', display: 'inline-block' }} />{rc} clos</span>
                          <span style={{ fontSize: 10, color: '#6b6b68', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: '#378ADD', display: 'inline-block' }} />{re} en cours</span>
                          {ro > 0 && <span style={{ fontSize: 10, color: '#6b6b68', display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: 2, background: '#BA7517', display: 'inline-block' }} />{ro} ouvert/ND</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* TABLE */}
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '18px 20px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Détail des activités</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['N°','Rubrique / Activité','Responsable','Statut','💬','Actions'].map(h => (
                        <th key={h} style={{ fontSize: 11, fontWeight: 600, color: '#6b6b68', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid rgba(0,0,0,0.08)', background: '#f9f9f8' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6b6b68', fontSize: 13 }}>Aucune activité pour cette sélection.</td></tr>
                    ) : filtered.map(row => (
                      <tr key={row.id} style={{ transition: 'background .15s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f9f9f8')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: 10, borderBottom: '1px solid rgba(0,0,0,0.08)', color: '#a0a09c', fontSize: 12 }}>{row.numero}</td>
                        <td style={{ padding: 10, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                          <div style={{ fontWeight: 500, fontSize: 12 }}>{row.rubrique || '—'}</div>
                          {row.activite && <div style={{ fontSize: 11, color: '#6b6b68', marginTop: 2 }}>{row.activite}</div>}
                        </td>
                        <td style={{ padding: 10, borderBottom: '1px solid rgba(0,0,0,0.08)', fontSize: 12, whiteSpace: 'nowrap' }}>{row.responsable || '—'}</td>
                        <td style={{ padding: 10, borderBottom: '1px solid rgba(0,0,0,0.08)' }}><BadgeStatut statut={row.statut} /></td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap' }}>
                          <button onClick={() => openComments(row)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Commentaires">
                            <span style={{ fontSize: 14 }}>💬</span>
                            {commentCounts[row.id] > 0 && (
                              <span style={{ fontSize: 10, fontWeight: 700, background: '#1a6fbd', color: '#fff', borderRadius: 10, padding: '1px 5px', lineHeight: '14px' }}>{commentCounts[row.id]}</span>
                            )}
                          </button>
                        </td>
                        <td style={{ padding: 10, borderBottom: '1px solid rgba(0,0,0,0.08)', whiteSpace: 'nowrap' }}>
                          <button onClick={() => openEdit(row)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px', opacity: 0.6, transition: 'opacity .15s' }} title="Modifier">✏️</button>
                          <button onClick={() => setDeleteModal({ open: true, row })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px', opacity: 0.6, transition: 'opacity .15s' }} title="Supprimer">🗑️</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      {/* MODAL EDIT / ADD */}
      {editModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setEditModal({ open: false, mode: 'add' }); }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px', width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>{editModal.mode === 'add' ? '+ Nouvelle activité' : 'Modifier l\'activité'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>N°</label>
                  <input style={inputStyle} value={form.numero || ''} onChange={e => setForm(f => ({...f, numero: e.target.value}))} placeholder="ex: 1.1" />
                </div>
                <div>
                  <label style={labelStyle}>Statut</label>
                  <select style={inputStyle} value={form.statut || ''} onChange={e => setForm(f => ({...f, statut: e.target.value || null}))}>
                    <option value="">— Sélectionner —</option>
                    {STATUTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={labelStyle}>Responsable *</label>
                <input style={inputStyle} value={form.responsable || ''} onChange={e => setForm(f => ({...f, responsable: e.target.value}))} placeholder="Nom du responsable" />
              </div>
              <div>
                <label style={labelStyle}>Rubrique</label>
                <input style={inputStyle} value={form.rubrique || ''} onChange={e => setForm(f => ({...f, rubrique: e.target.value}))} />
              </div>
              <div>
                <label style={labelStyle}>Activité</label>
                <textarea style={{...inputStyle, minHeight: 70, resize: 'vertical'}} value={form.activite || ''} onChange={e => setForm(f => ({...f, activite: e.target.value}))} />
              </div>
              {editModal.mode === 'add' && (
                <div>
                  <label style={labelStyle}>Département</label>
                  <select style={inputStyle} value={form.departement || currentDept} onChange={e => setForm(f => ({...f, departement: e.target.value}))}>
                    {depts.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
              <button onClick={() => setEditModal({ open: false, mode: 'add' })} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)', background: '#fff', color: '#6b6b68', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={handleSave} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: cfg.color, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {editModal.mode === 'add' ? 'Ajouter' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DELETE */}
      {deleteModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteModal({ open: false }); }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px', width: '100%', maxWidth: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Supprimer cette activité ?</h2>
            <p style={{ fontSize: 13, color: '#6b6b68', marginBottom: 24 }}>
              <strong>{deleteModal.row?.rubrique || deleteModal.row?.numero}</strong><br />Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setDeleteModal({ open: false })} style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)', background: '#fff', color: '#6b6b68', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={handleDelete} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#c0392b', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORT */}
      {importModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget && !importLoading) setImportModal(false); }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '32px 36px', width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Importer le fichier Excel</h2>
            <p style={{ fontSize: 13, color: '#6b6b68', lineHeight: 1.6, marginBottom: 20 }}>
              Cette opération <strong>remplace toutes les données</strong> existantes dans Supabase.
            </p>
            {importLoading ? (
              <div style={{ padding: 20, color: '#6b6b68', fontSize: 13 }}>⏳ Import en cours…</div>
            ) : (
              <>
                <div
                  onDragOver={e => { e.preventDefault(); setImportDragging(true); }}
                  onDragLeave={() => setImportDragging(false)}
                  onDrop={e => { e.preventDefault(); setImportDragging(false); const f = e.dataTransfer.files[0]; if (f) handleImport(f); }}
                  onClick={() => document.getElementById('import-file-input')?.click()}
                  style={{ border: `2px dashed ${importDragging ? '#f0a500' : 'rgba(0,0,0,0.14)'}`, borderRadius: 8, padding: '28px 20px', marginBottom: 16, cursor: 'pointer', background: importDragging ? '#fff8e6' : '#f9f9f8', transition: 'all .2s' }}>
                  <div style={{ fontSize: 10, color: '#6b6b68' }}>Déposez le fichier .xlsx ici ou cliquez pour parcourir</div>
                </div>
                <input id="import-file-input" type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handleImport(e.target.files[0]); }} />
              </>
            )}
            <button onClick={() => setImportModal(false)} style={{ fontSize: 12, color: '#a0a09c', cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', marginTop: 4 }}>Annuler</button>
          </div>
        </div>
      )}

      {/* MODAL COMMENTAIRES */}
      {commentModal.open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setCommentModal({ open: false, comments: [] }); }}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', animation: 'slideIn .2s ease' }}>
            {/* Header */}
            <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
                  💬 Commentaires
                </div>
                <div style={{ fontSize: 12, color: '#6b6b68' }}>
                  {commentModal.row?.rubrique || commentModal.row?.numero} — {commentModal.row?.responsable}
                </div>
              </div>
              <button onClick={() => setCommentModal({ open: false, comments: [] })}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#a0a09c', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* Fil */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {commentLoading ? (
                <div style={{ textAlign: 'center', color: '#a0a09c', fontSize: 13, padding: 20 }}>Chargement…</div>
              ) : commentModal.comments.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#a0a09c', fontSize: 13, padding: 30 }}>
                  Aucun commentaire.<br />Soyez le premier à commenter.
                </div>
              ) : commentModal.comments.map(c => {
                const [bg, fg] = avatarColors(c.auteur);
                const initials = c.auteur.split(/[\s\/\-]+/).map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
                const date = new Date(c.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{c.auteur}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, color: '#a0a09c' }}>{date}</span>
                          <button onClick={() => handleDeleteComment(c.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#a0a09c', padding: 0, lineHeight: 1 }} title="Supprimer">×</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: '#1a1a19', background: '#f5f5f4', borderRadius: '0 8px 8px 8px', padding: '8px 12px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{c.contenu}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Saisie */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                placeholder="Votre nom"
                value={commentAuteur}
                onChange={e => setCommentAuteur(e.target.value)}
                style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)', outline: 'none', color: '#1a1a19' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  placeholder="Ajouter un commentaire…"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
                  style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)', outline: 'none', resize: 'none', minHeight: 68, fontFamily: 'inherit', color: '#1a1a19' }}
                />
                <button onClick={handleAddComment} disabled={!newComment.trim()}
                  style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: !newComment.trim() ? '#e8e8e6' : '#1a6fbd', color: !newComment.trim() ? '#a0a09c' : '#fff', cursor: !newComment.trim() ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, alignSelf: 'flex-end' }}>
                  Envoyer
                </button>
              </div>
              <div style={{ fontSize: 10, color: '#a0a09c' }}>⌘/Ctrl + Entrée pour envoyer</div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: '#1a1a19', color: '#fff', fontSize: 13, padding: '10px 18px', borderRadius: 6, zIndex: 999, maxWidth: 340, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function KpiCard({ bg, iconColor, label, value, sub, valueColor, icon }: {
  bg: string; iconColor: string; label: string; value: number; sub: string; valueColor?: string; icon: string;
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 6, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: '#6b6b68', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, color: valueColor }}>{value}</div>
        <div style={{ fontSize: 11, color: '#a0a09c', marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  );
}

function SelectFilter({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ fontSize: 13, padding: '7px 28px 7px 12px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)', background: '#fff', color: '#1a1a19', cursor: 'pointer', outline: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b68' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
      {children}
    </select>
  );
}
