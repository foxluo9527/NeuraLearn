/**
 * 官网式前置首页 — 多技术方向选择（Demo 均跳转 AI 应用开发）
 */
const LandingView = {
  tracks: [
    {
      id: 'android',
      title: 'Android 高级开发',
      tagline: 'Kotlin · Jetpack · 架构实战',
      desc: '从 UI 组件到 MVVM 架构，掌握企业级 Android 应用开发全流程。',
      color: '#3ddc84',
      icon: 'android',
      lessons: 28,
      learners: '12.4k',
    },
    {
      id: 'web',
      title: 'Web 全栈开发',
      tagline: 'React · Node · TypeScript',
      desc: '前后端一体化学习路径，构建现代化 Web 应用与 API 服务。',
      color: '#61dafb',
      icon: 'web',
      lessons: 32,
      learners: '18.7k',
    },
    {
      id: 'cloud',
      title: '云原生与 DevOps',
      tagline: 'Docker · K8s · CI/CD',
      desc: '容器化部署、微服务治理与自动化运维，打通上线全流程。',
      color: '#326ce5',
      icon: 'cloud',
      lessons: 24,
      learners: '9.2k',
    },
    {
      id: 'data',
      title: '数据分析与可视化',
      tagline: 'Python · SQL · BI',
      desc: '数据采集、清洗分析与可视化呈现，用数据驱动业务决策。',
      color: '#f59e0b',
      icon: 'data',
      lessons: 20,
      learners: '7.8k',
    },
    {
      id: 'ai-app',
      title: 'AI 应用开发',
      tagline: 'Prompt · RAG · Agent',
      desc: '从 Prompt 工程到 Agent 编排，构建可落地的生产级 AI 应用。',
      color: '#4f9eff',
      icon: 'ai',
      lessons: 12,
      learners: '6.1k',
      featured: true,
    },
    {
      id: 'security',
      title: '网络安全入门',
      tagline: '渗透测试 · 安全加固',
      desc: 'Web 安全、漏洞分析与防御策略，建立系统化的安全思维。',
      color: '#ef4444',
      icon: 'security',
      lessons: 18,
      learners: '5.3k',
    },
  ],

  icons: {
    android: '<path d="M17 6l1-3M7 6L6 3M12 2v2M8 11h8M7 18a2 2 0 104 0 2 2 0 00-4 0zm6 0a2 2 0 104 0 2 2 0 00-4 0z"/>',
    web: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>',
    cloud: '<path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>',
    data: '<path d="M3 3v18h18M7 16l4-4 4 4 6-6"/>',
    ai: '<path d="M12 2a4 4 0 014 4v1a3 3 0 013 3v2a3 3 0 01-3 3H8a3 3 0 01-3-3v-2a3 3 0 013-3V6a4 4 0 014-4zM9 18h6M10 22h4"/>',
    security: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  },

  init() {
    this.render();
    this.bindEvents();
  },

  render() {
    const grid = document.getElementById('landing-tracks');
    if (!grid) return;

    grid.innerHTML = this.tracks.map((t) => `
      <button type="button" class="track-card ${t.featured ? 'featured' : ''}" data-track="${t.id}" style="--track-color:${t.color}">
        ${t.featured ? '<span class="track-badge">Demo 课程</span>' : '<span class="track-badge muted">即将上线</span>'}
        <div class="track-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">${this.icons[t.icon] || ''}</svg>
        </div>
        <h3 class="track-title">${t.title}</h3>
        <p class="track-tagline">${t.tagline}</p>
        <p class="track-desc">${t.desc}</p>
        <div class="track-meta">
          <span>${t.lessons} 课时</span>
          <span>${t.learners} 学员</span>
        </div>
        <span class="track-cta">${t.featured ? '开始学习' : '进入 Demo'} →</span>
      </button>`).join('');
  },

  bindEvents() {
    document.getElementById('landing-tracks')?.querySelectorAll('.track-card').forEach((card) => {
      card.addEventListener('click', () => this.enterTrack(card.dataset.track));
    });

    document.getElementById('btn-landing-start')?.addEventListener('click', () => this.enterTrack('ai-app'));
    document.getElementById('btn-landing-explore')?.addEventListener('click', () => {
      document.getElementById('landing-tracks-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.querySelector('.header-left')?.addEventListener('click', () => {
      if (document.getElementById('view-classroom')?.classList.contains('active')) return;
      App.showView('landing');
    });
  },

  enterTrack(trackId) {
    const track = this.tracks.find((t) => t.id === trackId);
    if (track && !track.featured) {
      App.showToast(`Demo 模式：「${track.title}」即将上线，已进入 AI 应用开发课程`);
    }
    App.showView('path');
    document.getElementById('view-path')?.scrollTo({ top: 0, behavior: 'smooth' });
  },
};

window.LandingView = LandingView;
