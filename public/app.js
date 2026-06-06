/**
 * NeuraLearn App 入口
 */
const App = {
  async init() {
    Classroom.bindEvents();
    this.bindDrawer();
    this.bindProvider();
    await this.initProviders();
    await PathView.load();
    await this.loadKnowledgeDrawer();
  },

  getProvider() {
    return document.getElementById('ai-provider')?.value || 'deepseek';
  },

  async initProviders() {
    try {
      const res = await fetch('/api/providers');
      const data = await res.json();
      const sel = document.getElementById('ai-provider');
      if (!sel) return;
      sel.innerHTML = '';
      data.providers.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name}${p.configured ? '' : ' (未配置)'}`;
        opt.disabled = !p.configured;
        sel.appendChild(opt);
      });
      const def = data.providers.find((p) => p.id === data.default && p.configured)
        || data.providers.find((p) => p.configured);
      if (def) sel.value = def.id;
      else this.showToast('请在 .env 中配置 AI API Key', true);
    } catch (err) {
      console.error(err);
    }
  },

  bindDrawer() {
    document.getElementById('btn-knowledge-drawer')?.addEventListener('click', () => this.openKnowledgeDrawer());
    document.getElementById('btn-close-drawer')?.addEventListener('click', () => this.closeKnowledgeDrawer());
    document.getElementById('drawer-overlay')?.addEventListener('click', () => this.closeKnowledgeDrawer());
  },

  openKnowledgeDrawer() {
    document.getElementById('knowledge-drawer')?.classList.remove('hidden');
    document.getElementById('drawer-overlay')?.classList.remove('hidden');
    this.loadKnowledgeDrawer();
  },

  closeKnowledgeDrawer() {
    document.getElementById('knowledge-drawer')?.classList.add('hidden');
    document.getElementById('drawer-overlay')?.classList.add('hidden');
  },

  async loadKnowledgeDrawer() {
    try {
      const res = await fetch('/api/knowledge-base');
      const data = await res.json();
      const { mastered, total } = data.progress;
      const pct = total ? Math.round((mastered / total) * 100) : 0;

      document.getElementById('drawer-percent').textContent = `${pct}%`;
      const circ = 2 * Math.PI * 52;
      const ring = document.getElementById('drawer-ring');
      if (ring) ring.style.strokeDashoffset = circ - (pct / 100) * circ;

      const sug = data.suggestion;
      document.getElementById('drawer-suggestion').innerHTML = sug
        ? `建议下一步学习 <strong>${sug.next}</strong> — ${sug.reason}`
        : '';

      const cardsEl = document.getElementById('drawer-cards');
      if (!cardsEl) return;

      cardsEl.innerHTML = (data.cards || []).map((card) => {
        const stars = '★'.repeat(Math.round(card.stars)) + '☆'.repeat(5 - Math.round(card.stars));
        const canRevisit = card.status === 'mastered';
        return `
          <div class="drawer-card">
            <div class="drawer-card-head">
              <h4>${card.nodeName}</h4>
              <span class="card-stars">${stars}</span>
            </div>
            <p class="drawer-card-meta">${card.studyTime} · ${card.status === 'mastered' ? '已掌握' : '学习中'}</p>
            <ul class="memory-list">${card.memoryPoints.map((p) => `<li>${p}</li>`).join('')}</ul>
            ${canRevisit ? `<button class="btn-ghost btn-revisit" data-topic="${card.nodeName}">向 AI 提问</button>` : ''}
          </div>`;
      }).join('');

      cardsEl.querySelectorAll('.btn-revisit').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.closeKnowledgeDrawer();
          Classroom.enterRevisit(btn.dataset.topic);
        });
      });
    } catch (err) {
      console.error(err);
    }
  },

  bindProvider() { /* provider in header, used by Classroom */ },

  showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast show${isError ? ' error' : ''}`;
    setTimeout(() => t.classList.add('hidden'), 3500);
  },
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
