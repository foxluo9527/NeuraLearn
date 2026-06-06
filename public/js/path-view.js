/**
 * 学习路径首页
 */
const PathView = {
  courseData: null,

  async load() {
    const res = await fetch('/api/course');
    this.courseData = await res.json();
    this.render();
    this.updateHeader();
  },

  updateHeader() {
    if (!this.courseData) return;
    document.getElementById('header-mastered').textContent = this.courseData.progress.mastered;
    document.getElementById('header-total').textContent = this.courseData.progress.total;
  },

  render() {
    if (!this.courseData) return;
    this.renderTimeline();
    this.renderModules();
    const btn = document.getElementById('btn-continue');
    if (btn) {
      btn.onclick = () => Classroom.enter(this.courseData.continueLesson);
    }
  },

  renderTimeline() {
    const el = document.getElementById('path-timeline');
    if (!el) return;

    el.innerHTML = this.courseData.modules.map((mod, i) => {
      const pct = mod.progress.total ? Math.round((mod.progress.mastered / mod.progress.total) * 100) : 0;
      return `
        <div class="timeline-item" style="--mod-color:${mod.color}">
          <div class="timeline-dot"></div>
          <div class="timeline-content">
            <span class="timeline-module">M${i + 1} ${mod.title}</span>
            <div class="timeline-bar"><div class="timeline-fill" style="width:${pct}%"></div></div>
            <span class="timeline-pct">${pct}%</span>
          </div>
        </div>`;
    }).join('');
  },

  renderModules() {
    const el = document.getElementById('path-modules');
    if (!el) return;

    el.innerHTML = this.courseData.modules.map((mod) => `
      <div class="module-card" style="--mod-color:${mod.color}">
        <div class="module-header">
          <h3>${mod.title}</h3>
          <span class="module-count">${mod.progress.mastered}/${mod.lessons.length} 已完成</span>
        </div>
        <div class="lesson-list">
          ${mod.lessons.map((lesson) => {
            const statusClass = lesson.status || 'not_started';
            const statusLabel = { mastered: '已掌握', learning: '学习中', not_started: '未开始' }[statusClass];
            return `
              <button class="lesson-card ${statusClass}" data-lesson="${lesson.title}">
                <div class="lesson-info">
                  <span class="lesson-title">${lesson.title}</span>
                  <span class="lesson-meta">${lesson.duration} · ${statusLabel}</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
              </button>`;
          }).join('')}
        </div>
      </div>`).join('');

    el.querySelectorAll('.lesson-card').forEach((card) => {
      card.addEventListener('click', () => Classroom.enter(card.dataset.lesson));
    });
  },

  async refresh() {
    await this.load();
  },
};

window.PathView = PathView;
