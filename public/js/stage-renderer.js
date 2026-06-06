/**
 * 主舞台渲染：review-mcq / slide / diagram / quiz
 */
const StageRenderer = {
  diagramStepIndex: 0,
  currentDiagram: null,

  init() {
    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
    }
  },

  renderReviewMcq(container, questions, onSubmit) {
    container.innerHTML = `
      <div class="mcq-stage">
        <h3 class="stage-title">节前回顾</h3>
        <p class="stage-desc">请完成以下选择题，检验前置知识掌握情况</p>
        <form id="mcq-form">${questions.map((q, i) => `
          <div class="mcq-item" data-id="${q.id}">
            <p class="mcq-q">${i + 1}. ${q.question}</p>
            <div class="mcq-options">${q.options.map((o) => `
              <label class="mcq-option">
                <input type="radio" name="q${q.id}" value="${o.id}">
                <span>${o.id}. ${o.text}</span>
              </label>`).join('')}
            </div>
          </div>`).join('')}
          <button type="submit" class="btn-primary">提交回顾</button>
        </form>
      </div>`;

    container.querySelector('#mcq-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const answers = questions.map((q) => {
        const sel = container.querySelector(`input[name="q${q.id}"]:checked`);
        return { questionId: q.id, selectedId: sel?.value || '' };
      });
      onSubmit(answers);
    });
  },

  renderReviewResult(container, result, questions, onContinue) {
    container.innerHTML = `
      <div class="mcq-result ${result.passed ? 'passed' : 'failed'}">
        <h3>${result.passed ? '回顾通过' : '需要加强'}</h3>
        <p class="result-score">${Math.round(result.score * 100)}% · ${result.feedback}</p>
        ${!result.passed && result.weakPoints?.length ? `
          <div class="weak-points"><h4>薄弱点</h4><ul>${result.weakPoints.map((w) => `<li>${w}</li>`).join('')}</ul></div>` : ''}
        ${result.passed ? '<p class="result-hint">即将进入知识讲解...</p>' : `
          <button class="btn-primary" id="mcq-continue-btn" style="margin-top:16px">继续进入讲解</button>`}
      </div>`;
    if (!result.passed) {
      container.querySelector('#mcq-continue-btn')?.addEventListener('click', onContinue);
    }
  },

  renderSlide(container, slide, index, total, options = {}) {
    const { showReturnBar, returnLabel, onReturn } = options;
    const codeBlock = slide.code ? `<pre class="slide-code"><code>${this.escape(slide.code)}</code></pre>` : '';
    container.innerHTML = `
      ${showReturnBar ? `
        <div class="stage-return-bar">
          <span>正在回顾知识点</span>
          <button type="button" class="btn-primary btn-sm" id="stage-return-btn">${this.escape(returnLabel || '返回继续答题')}</button>
        </div>` : ''}
      <div class="slide-stage">
        <div class="slide-inner">
          <span class="slide-badge">知识点 ${index + 1}${total ? ` / ${total}` : ''}</span>
          <h2 class="slide-title">${this.escape(slide.title)}</h2>
          <ul class="slide-bullets">${(slide.bullets || []).map((b, i) =>
            `<li style="animation-delay:${i * 0.1}s">${this.escape(b)}</li>`).join('')}
          </ul>
          ${codeBlock}
        </div>
      </div>`;
    container.querySelector('#stage-return-btn')?.addEventListener('click', onReturn);
  },

  renderDiagram(container, diagram, stepIndex, options = {}) {
    this.currentDiagram = diagram;
    this.diagramStepIndex = stepIndex;
    const steps = diagram.steps || [];
    const step = steps[stepIndex] || steps[0];
    if (!step) return;
    const { showReturnBar, returnLabel, onReturn } = options;

    container.innerHTML = `
      ${showReturnBar ? `
        <div class="stage-return-bar">
          <span>正在回顾流程图解</span>
          <button type="button" class="btn-primary btn-sm" id="stage-return-btn">${this.escape(returnLabel || '返回继续答题')}</button>
        </div>` : ''}
      <div class="diagram-stage">
        <h3 class="diagram-title">${this.escape(diagram.title)}</h3>
        <div class="diagram-step-label">${this.escape(step.label)}</div>
        <div class="diagram-nav">
          <button class="btn-ghost" id="diag-prev" ${stepIndex <= 0 ? 'disabled' : ''}>上一步</button>
          <span>${stepIndex + 1} / ${steps.length}</span>
          <button class="btn-ghost" id="diag-next" ${stepIndex >= steps.length - 1 ? 'disabled' : ''}>下一步</button>
        </div>
        <div class="mermaid-wrap" id="mermaid-target"></div>
      </div>`;

    container.querySelector('#stage-return-btn')?.addEventListener('click', onReturn);

    const target = container.querySelector('#mermaid-target');
    const mermaidCode = (step.mermaid || 'graph LR\n  A[Step] --> B[Next]').replace(/\\n/g, '\n');

    if (window.mermaid) {
      mermaid.render(`diag-${Date.now()}`, mermaidCode).then(({ svg }) => {
        target.innerHTML = svg;
      }).catch(() => {
        target.innerHTML = `<pre class="slide-code">${this.escape(mermaidCode)}</pre>`;
      });
    }

    container.querySelector('#diag-prev')?.addEventListener('click', () => {
      if (stepIndex > 0) this.renderDiagram(container, diagram, stepIndex - 1, options);
    });
    container.querySelector('#diag-next')?.addEventListener('click', () => {
      if (stepIndex < steps.length - 1) this.renderDiagram(container, diagram, stepIndex + 1, options);
    });
  },

  renderQuiz(container, question, index, total, options = {}) {
    const {
      onSubmit,
      onDraftChange,
      draft = '',
      submitted = false,
      score,
      feedback,
      answer,
      questionNav,
      onNavClick,
    } = options;

    const typeLabels = { concept: '概念题', code: '代码分析', scenario: '场景应用' };
    const navHtml = questionNav ? `
      <div class="quiz-nav">${questionNav.map((item, i) => `
        <button type="button" class="quiz-nav-btn ${item.submitted ? 'done' : ''} ${i === index ? 'active' : ''}" data-idx="${i}">
          ${item.submitted ? '✓' : ''} 第${i + 1}题
        </button>`).join('')}
      </div>` : '';

    container.innerHTML = `
      <div class="quiz-stage">
        ${navHtml}
        <div class="quiz-meta">
          <span>第 ${index + 1} / ${total} 题</span>
          <span class="quiz-badge">${typeLabels[question.type] || '练习'}</span>
          ${submitted ? `<span class="quiz-score-badge">${score}/5 分</span>` : ''}
        </div>
        <div class="quiz-q">${this.escape(question.question).replace(/\\n/g, '<br>')}</div>
        <div class="quiz-input-row">
          <button type="button" class="btn-icon" id="quiz-mic-btn" title="按住说话">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></svg>
          </button>
          <textarea id="quiz-answer-input" class="quiz-textarea" rows="5"
            placeholder="请输入你的答案，或按住麦克风说话..." ${submitted ? 'readonly' : ''}>${this.escape(submitted ? (answer || draft) : draft)}</textarea>
        </div>
        ${submitted ? `
          <div class="quiz-feedback ok">
            <strong>已提交 · 评分 ${score}/5</strong>
            <p>${this.escape(feedback || '')}</p>
          </div>` : `
          <button class="btn-primary" id="quiz-submit-btn">提交答案</button>`}
        <div id="quiz-feedback-area"></div>
      </div>`;

    container.querySelectorAll('.quiz-nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => onNavClick?.(parseInt(btn.dataset.idx, 10)));
    });

    const textarea = container.querySelector('#quiz-answer-input');
    if (!submitted && textarea) {
      textarea.addEventListener('input', () => onDraftChange?.(textarea.value));
    }

    const micBtn = container.querySelector('#quiz-mic-btn');
    if (micBtn && textarea && !submitted && window.Voice) {
      Voice.bindMicButton(micBtn, textarea, (text) => onDraftChange?.(text));
    }

    if (!submitted) {
      container.querySelector('#quiz-submit-btn')?.addEventListener('click', () => {
        const ans = textarea?.value.trim();
        if (!ans) { App.showToast('请输入答案'); return; }
        onSubmit?.(ans);
      });
    }
  },

  renderQuizFeedback(container, feedback, score, isLast, onNext) {
    const area = container.querySelector('#quiz-feedback-area');
    if (!area) return;
    area.innerHTML = `
      <div class="quiz-feedback ${score >= 3 ? 'ok' : 'warn'}">
        <strong>评分：${score}/5</strong>
        <p>${this.escape(feedback)}</p>
        ${!isLast ? '<button class="btn-primary" id="quiz-next-btn">下一题</button>' : ''}
      </div>`;
    area.querySelector('#quiz-next-btn')?.addEventListener('click', onNext);
  },

  renderQuizComplete(container, stars, scores, onDone) {
    const full = '★'.repeat(stars) + '☆'.repeat(5 - stars);
    container.innerHTML = `
      <div class="quiz-complete">
        <h3>本节学习完成</h3>
        <div class="stars-big">${full}</div>
        <p>综合掌握 ${stars}/5 星 · 各题 ${scores.join('、')} 分</p>
        <button class="btn-primary" id="quiz-done-btn">查看知识库</button>
      </div>`;
    container.querySelector('#quiz-done-btn')?.addEventListener('click', onDone);
  },

  renderRevisitSlides(container, slides, topic) {
    if (!slides?.length) {
      container.innerHTML = `<div class="slide-stage"><h2 class="slide-title">${this.escape(topic)}</h2><p>暂无历史 slide，可直接在右侧提问。</p></div>`;
      return;
    }
    const slide = slides[slides.length - 1];
    this.renderSlide(container, slide, slides.length - 1, slides.length);
  },

  renderLoading(container, text = '加载中...') {
    container.innerHTML = `<div class="stage-loading"><div class="loading-dots"><span></span><span></span><span></span></div><p>${text}</p></div>`;
  },

  escape(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },
};

StageRenderer.init();
window.StageRenderer = StageRenderer;
