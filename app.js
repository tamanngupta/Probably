// ==============================================
//  PROBABILITY OBSERVATORY — app.js
// ==============================================

// ---------- STATE ----------
const STATE_KEY = 'prob_obs_state';

function loadState() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; }
  catch { return {}; }
}
function saveState(s) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
}

let state = loadState();
// state shape:
// {
//   problems: { [bookId_probId]: { status, difficulty, insight, date } },
//   streak:   { [YYYY-MM-DD]: 'solved'|'partial'|'stuck' },
//   reviews:  Set → stored as array
// }
if (!state.problems) state.problems = {};
if (!state.streak)   state.streak   = {};
if (!state.reviews)  state.reviews  = [];

// ---------- BOOKS + QUESTIONS ----------
// questions.json is the default book (the fifty challenging problems JSON you provided)
// books.json can list more files
let allProblems = []; // { id, title, concepts, bookId, bookName }

async function loadBooks() {
  // Try loading books.json for a manifest; fall back to just questions.json
  let bookFiles = [];
  try {
    const r = await fetch('books.json');
    if (r.ok) bookFiles = await r.json();
  } catch {}

  if (bookFiles.length === 0) {
    bookFiles = [{ id: 'fifty', name: '50 Challenging Problems', file: 'questions.json' }];
  }

  for (const book of bookFiles) {
    try {
      const r = await fetch(book.file);
      if (!r.ok) continue;
      const probs = await r.json();
      for (const p of probs) {
        allProblems.push({ ...p, bookId: book.id, bookName: book.name });
      }
    } catch (e) {
      console.warn('Could not load', book.file, e);
    }
  }

  // Render books list in Books view
  const bookNames = [...new Set(bookFiles.map(b => b.name))];
  const bookCounts = {};
  for (const p of allProblems) {
    bookCounts[p.bookName] = (bookCounts[p.bookName] || 0) + 1;
  }
  const booksList = document.getElementById('books-list');
  booksList.innerHTML = bookFiles.map(b => `
    <div class="book-row">
      <div class="book-name">${b.name}</div>
      <div class="book-count">${bookCounts[b.name] || 0} problems</div>
    </div>
  `).join('');

  // Populate book filter
  const bookFilter = document.getElementById('book-filter');
  for (const b of bookFiles) {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    bookFilter.appendChild(opt);
  }
}

// ---------- DAILY PROBLEM ----------
function getDailyProblem() {
  if (allProblems.length === 0) return null;
  // Prefer unsolved; rotate by day-of-year
  const unsolved = allProblems.filter(p => {
    const key = p.bookId + '_' + p.id;
    return !state.problems[key] || state.problems[key].status === 'review';
  });
  const pool = unsolved.length > 0 ? unsolved : allProblems;
  const dayOfYear = Math.floor(Date.now() / 86400000);
  return pool[dayOfYear % pool.length];
}

function renderDailyCard() {
  const p = getDailyProblem();
  if (!p) return;
  document.getElementById('daily-book-tag').textContent = p.bookName;
  document.getElementById('daily-problem-num').textContent = `Problem #${p.id}`;
  document.getElementById('daily-title').textContent = p.title;
  // No "question" text in the JSON, so show concepts as the teaser
  document.getElementById('daily-question').textContent =
    `Explore this problem from ${p.bookName}. Concepts involved: ${(p.concepts || []).join(', ')}.`;
  const conceptsEl = document.getElementById('daily-concepts');
  conceptsEl.innerHTML = (p.concepts || []).map(c =>
    `<span class="concept-chip">${formatConcept(c)}</span>`
  ).join('');

  // Store reference for solve panel
  document.getElementById('btn-start-solving').dataset.bookId = p.bookId;
  document.getElementById('btn-start-solving').dataset.probId = p.id;
  document.getElementById('btn-mark-review').dataset.bookId = p.bookId;
  document.getElementById('btn-mark-review').dataset.probId = p.id;
}

// ---------- SOLVE PANEL ----------
let solveRating = 0;
let solveStatus = 'solved';

function initSolvePanel() {
  document.getElementById('btn-start-solving').addEventListener('click', () => {
    const panel = document.getElementById('solve-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  document.getElementById('btn-mark-review').addEventListener('click', (e) => {
    const key = e.currentTarget.dataset.bookId + '_' + e.currentTarget.dataset.probId;
    if (!state.reviews.includes(key)) state.reviews.push(key);
    if (!state.problems[key]) state.problems[key] = {};
    state.problems[key].status = 'review';
    saveState(state);
    renderAll();
    e.currentTarget.textContent = 'Marked ✓';
  });

  // Stars
  const stars = document.querySelectorAll('#star-row .star');
  stars.forEach(s => s.addEventListener('click', () => {
    solveRating = parseInt(s.dataset.val);
    stars.forEach(st => st.classList.toggle('active', parseInt(st.dataset.val) <= solveRating));
  }));

  // Status buttons
  const statusBtns = document.querySelectorAll('#solve-panel .status-btn');
  statusBtns.forEach(b => b.addEventListener('click', () => {
    solveStatus = b.dataset.status;
    statusBtns.forEach(sb => sb.classList.remove('active'));
    b.classList.add('active');
  }));

  document.getElementById('btn-log-solve').addEventListener('click', () => {
    const startBtn = document.getElementById('btn-start-solving');
    const key = startBtn.dataset.bookId + '_' + startBtn.dataset.probId;
    const insight = document.getElementById('insight-text').value.trim();
    const today = todayStr();
    state.problems[key] = {
      status: solveStatus,
      difficulty: solveRating,
      insight,
      date: today
    };
    state.streak[today] = solveStatus;
    saveState(state);
    document.getElementById('solve-panel').style.display = 'none';
    document.getElementById('insight-text').value = '';
    solveRating = 0;
    solveStatus = 'solved';
    document.querySelectorAll('#star-row .star').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#solve-panel .status-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#solve-panel .status-btn[data-status="solved"]').classList.add('active');
    renderAll();
  });
}

// ---------- PROBLEMS LIST ----------
function renderProblems() {
  const bookFilter  = document.getElementById('book-filter').value;
  const statusFilter = document.getElementById('status-filter').value;
  const list = document.getElementById('problems-list');

  let filtered = allProblems.filter(p => {
    if (bookFilter !== 'all' && p.bookId !== bookFilter) return false;
    if (statusFilter !== 'all') {
      const key = p.bookId + '_' + p.id;
      const s = (state.problems[key] || {}).status;
      if (statusFilter === 'unsolved' && s && s !== 'review') return false;
      if (statusFilter !== 'unsolved' && s !== statusFilter) return false;
    }
    return true;
  });

  list.innerHTML = filtered.map(p => {
    const key = p.bookId + '_' + p.id;
    const ps = state.problems[key];
    const status = ps ? ps.status : null;
    const badgeHtml = status
      ? `<span class="status-badge ${status}">${status}</span>`
      : '';
    return `
      <div class="problem-row" data-book="${p.bookId}" data-id="${p.id}">
        <div class="problem-row-left">
          <span class="problem-num-badge">#${p.id}</span>
          <div>
            <div class="problem-title">${p.title}</div>
            <div class="problem-concepts">
              ${(p.concepts || []).slice(0,3).map(c => `<span class="mini-chip">${formatConcept(c)}</span>`).join('')}
            </div>
          </div>
        </div>
        ${badgeHtml}
      </div>
    `;
  }).join('');

  list.querySelectorAll('.problem-row').forEach(row => {
    row.addEventListener('click', () => openModal(row.dataset.book, row.dataset.id));
  });
}

// ---------- MODAL ----------
let modalRating = 0;
let modalStatus = 'solved';
let modalBookId = null;
let modalProbId = null;

function openModal(bookId, probId) {
  const p = allProblems.find(x => String(x.bookId) === String(bookId) && String(x.id) === String(probId));
  if (!p) return;
  modalBookId = bookId; modalProbId = probId;
  const key = bookId + '_' + probId;
  const ps = state.problems[key] || {};

  document.getElementById('modal-eyebrow').textContent = p.bookName + ' · Problem #' + p.id;
  document.getElementById('modal-title').textContent = p.title;
  document.getElementById('modal-question').textContent =
    `Concepts: ${(p.concepts || []).join(', ')}.`;
  document.getElementById('modal-concepts').innerHTML = (p.concepts || []).map(c =>
    `<span class="concept-chip">${formatConcept(c)}</span>`
  ).join('');
  document.getElementById('modal-insight-text').value = ps.insight || '';

  modalRating = ps.difficulty || 0;
  const mStars = document.querySelectorAll('#modal-star-row .star');
  mStars.forEach(s => s.classList.toggle('active', parseInt(s.dataset.val) <= modalRating));

  modalStatus = ps.status || 'solved';
  const mStatusBtns = document.querySelectorAll('#modal-status-row .status-btn');
  mStatusBtns.forEach(b => b.classList.toggle('active', b.dataset.status === modalStatus));

  document.getElementById('modal-overlay').style.display = 'flex';
}

function initModal() {
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('modal-overlay').style.display = 'none';
  });
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) {
      document.getElementById('modal-overlay').style.display = 'none';
    }
  });

  const mStars = document.querySelectorAll('#modal-star-row .star');
  mStars.forEach(s => s.addEventListener('click', () => {
    modalRating = parseInt(s.dataset.val);
    mStars.forEach(st => st.classList.toggle('active', parseInt(st.dataset.val) <= modalRating));
  }));

  const mStatusBtns = document.querySelectorAll('#modal-status-row .status-btn');
  mStatusBtns.forEach(b => b.addEventListener('click', () => {
    modalStatus = b.dataset.status;
    mStatusBtns.forEach(sb => sb.classList.remove('active'));
    b.classList.add('active');
  }));

  document.getElementById('modal-log-btn').addEventListener('click', () => {
    const key = modalBookId + '_' + modalProbId;
    const insight = document.getElementById('modal-insight-text').value.trim();
    const today = todayStr();
    state.problems[key] = {
      status: modalStatus,
      difficulty: modalRating,
      insight,
      date: today
    };
    if (modalStatus !== 'review') state.streak[today] = modalStatus;
    saveState(state);
    document.getElementById('modal-overlay').style.display = 'none';
    renderAll();
  });
}

// ---------- STREAK GRID ----------
function renderStreakGrid() {
  const grid = document.getElementById('streak-grid');
  const today = new Date();
  const cells = [];
  for (let i = 181; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const status = state.streak[key];
    cells.push(`<div class="streak-cell${status ? ' ' + status : ''}" title="${key}"></div>`);
  }
  grid.innerHTML = cells.join('');

  // Compute streak
  let streak = 0;
  const d = new Date(today);
  while (true) {
    const k = d.toISOString().slice(0, 10);
    if (state.streak[k]) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  document.getElementById('streak-count').textContent = streak;
  document.getElementById('stat-streak').textContent = streak;
}

// ---------- WEAK AREAS ----------
function renderWeakAreas() {
  // Count concept occurrences weighted by difficulty
  const conceptStats = {}; // concept -> { attempts, lowScores }

  for (const [key, ps] of Object.entries(state.problems)) {
    const [bookId, probId] = key.split('_');
    const p = allProblems.find(x => String(x.bookId) === bookId && String(x.id) === probId);
    if (!p) continue;
    for (const c of (p.concepts || [])) {
      if (!conceptStats[c]) conceptStats[c] = { attempts: 0, hard: 0 };
      conceptStats[c].attempts++;
      // "hard" = stuck, or difficulty >= 4
      if (ps.status === 'stuck' || (ps.difficulty && ps.difficulty >= 4)) {
        conceptStats[c].hard++;
      }
    }
  }

  // Score: hard/attempts, only show concepts with ≥1 attempt
  const scored = Object.entries(conceptStats)
    .filter(([, v]) => v.attempts > 0)
    .map(([c, v]) => ({ concept: c, pct: Math.round((v.hard / v.attempts) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5);

  const el = document.getElementById('weak-list');
  if (scored.length === 0) {
    el.innerHTML = '<div class="weak-empty">Solve problems to surface weak areas.</div>';
    return;
  }

  el.innerHTML = scored.map(({ concept, pct }) => {
    const fillClass = pct >= 60 ? 'low' : pct >= 30 ? 'mid' : 'high';
    return `
      <div class="weak-item">
        <div class="weak-label">
          <span>${formatConcept(concept)}</span>
          <span class="weak-pct">${pct}%</span>
        </div>
        <div class="weak-bar-bg">
          <div class="weak-bar-fill ${fillClass}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}

// ---------- RECENT INSIGHTS ----------
function renderRecentInsights() {
  const insightsList = document.getElementById('recent-insights-list');
  const allInsightsEl = document.getElementById('insights-list');

  const withInsights = Object.entries(state.problems)
    .filter(([, ps]) => ps.insight && ps.insight.length > 0)
    .sort((a, b) => (b[1].date || '').localeCompare(a[1].date || ''))
    .slice(0, 20);

  // Right panel (recent 5)
  if (withInsights.length === 0) {
    insightsList.innerHTML = '<div class="weak-empty">No insights logged yet.</div>';
  } else {
    insightsList.innerHTML = withInsights.slice(0, 5).map(([key, ps]) => {
      const [bookId, probId] = key.split('_');
      const p = allProblems.find(x => String(x.bookId) === bookId && String(x.id) === probId);
      const label = p ? `#${p.id} ${p.title}` : key;
      const ago = ps.date ? relDate(ps.date) : '';
      return `
        <div class="recent-insight-row">
          <div class="recent-insight-problem">${label}</div>
          <div class="recent-insight-preview">${ps.insight}</div>
          <div class="recent-insight-date">${ago}</div>
        </div>
      `;
    }).join('');
  }

  // Insights view (all)
  if (withInsights.length === 0) {
    allInsightsEl.innerHTML = '<div class="glass-card"><p class="daily-question">No insights yet. Solve problems and write what clicked.</p></div>';
  } else {
    allInsightsEl.innerHTML = withInsights.map(([key, ps]) => {
      const [bookId, probId] = key.split('_');
      const p = allProblems.find(x => String(x.bookId) === bookId && String(x.id) === probId);
      const label = p ? `Problem #${p.id} — ${p.title}` : key;
      return `
        <div class="insight-card">
          <div class="insight-meta">${label} · ${ps.date || ''}</div>
          <div class="insight-text">${ps.insight}</div>
          <div class="insight-concepts">
            ${(p?.concepts || []).map(c => `<span class="mini-chip">${formatConcept(c)}</span>`).join('')}
          </div>
        </div>
      `;
    }).join('');
  }
}

// ---------- STATS ----------
function renderStats() {
  const solved = Object.values(state.problems).filter(p => p.status === 'solved').length;
  const withInsights = Object.values(state.problems).filter(p => p.insight && p.insight.length > 0).length;
  document.getElementById('stat-solved').textContent = solved;
  document.getElementById('stat-total').textContent = allProblems.length;
  document.getElementById('stat-insights').textContent = withInsights;
}

// ---------- RENDER ALL ----------
function renderAll() {
  renderDailyCard();
  renderStreakGrid();
  renderWeakAreas();
  renderRecentInsights();
  renderStats();
  renderProblems();
}

// ---------- NAV ----------
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const view = item.dataset.view;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + view).classList.add('active');
    });
  });

  document.getElementById('book-filter').addEventListener('change', renderProblems);
  document.getElementById('status-filter').addEventListener('change', renderProblems);
}

// ---------- HELPERS ----------
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatConcept(c) {
  return c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function relDate(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  return diff + ' days ago';
}

// ---------- BOOT ----------
(async function init() {
  await loadBooks();
  initNav();
  initSolvePanel();
  initModal();
  renderAll();
})();