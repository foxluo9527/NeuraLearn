/**
 * 沉浸式课堂 — 状态机 + 主从联动 + 分阶段进度保存
 */
const Classroom = {
  topic: '',
  stage: 'review',
  mode: 'review-mcq',
  messages: [],
  slides: [],
  diagrams: [],
  currentSlideIndex: 0,
  messageSlideMap: {},
  teachingContent: '',
  reviewQuestions: [],
  quizQuestions: [],
  quizIndex: 0,
  quizScores: [],
  pendingImages: [],
  isStreaming: false,
  revisitMode: false,
  phaseMessages: { review: [], teaching: [], quiz: [] },
  phasesCompleted: [],
  currentDockPhase: 'review',
  phaseLabels: { review: '节前回顾', teaching: '知识讲解', quiz: '课后练习' },
  REVIEW_INTRO: '请先在左侧完成节前回顾选择题，检验前置知识。',
  quizState: { answers: {} },
  stageView: 'primary',
  returnToQuizIndex: null,
  pendingSegments: [],
  pendingStageQuiz: false,
  awaitingConfirmation: false,

  dom: {},

  cacheDom() {
    this.dom = {
      viewPath: document.getElementById('view-path'),
      viewClassroom: document.getElementById('view-classroom'),
      title: document.getElementById('classroom-title'),
      stageContent: document.getElementById('stage-content'),
      stageModeLabel: document.getElementById('stage-mode-label'),
      stagePageIndicator: document.getElementById('stage-page-indicator'),
      dockMessages: document.getElementById('dock-messages'),
      dockContext: document.getElementById('dock-context'),
      dockLoading: document.getElementById('dock-loading'),
      dockInput: document.getElementById('dock-input'),
      btnSend: document.getElementById('btn-send'),
      btnBack: document.getElementById('btn-back-path'),
      phaseBar: document.getElementById('phase-bar'),
      imageInput: document.getElementById('image-input'),
      imagePreview: document.getElementById('image-preview'),
      btnImage: document.getElementById('btn-image'),
      btnMic: document.getElementById('btn-mic'),
      ttsEnabled: document.getElementById('tts-enabled'),
    };
  },

  bindEvents() {
    this.cacheDom();
    this.dom.btnBack?.addEventListener('click', () => this.exit());
    this.dom.btnSend?.addEventListener('click', () => this.sendMessage());
    this.dom.dockInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });
    this.dom.btnImage?.addEventListener('click', () => this.dom.imageInput?.click());
    this.dom.imageInput?.addEventListener('change', (e) => this.handleImageSelect(e));
    Voice.bindMicButton(this.dom.btnMic, this.dom.dockInput);
    this.dom.ttsEnabled?.addEventListener('change', (e) => Voice.setTtsEnabled(e.target.checked));

    this.dom.phaseBar?.querySelectorAll('.phase').forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => this.navigateToPhase(el.dataset.phase));
    });
  },

  showView(name) {
    App.showView(name);
  },

  getActivePhase() {
    if (this.stage === 'done') return 'quiz';
    if (this.stage === 'revisit') return 'teaching';
    return this.stage;
  },

  resetTeachingQueue() {
    this.pendingSegments = [];
    this.pendingStageQuiz = false;
    this.awaitingConfirmation = false;
    this._finalizedMsgIds = new Set();
  },

  isConfirmationMessage(text) {
    const t = (text || '').trim();
    if (!t) return false;
    return /^(理解|懂了|明白|继续|好的|好|ok|yes|嗯|可以|没问题|下一步|知道了|收到|go on|next)/i.test(t)
      || (t.length <= 6 && !/[?？]/.test(t));
  },

  ingestTeachingSegments(fullText, parsed, msgId) {
    if (this._finalizedMsgIds?.has(msgId)) {
      return {
        oral: parsed.cleanText || StreamClient.stripMarkers(fullText),
        slideIndex: this.messageSlideMap[msgId],
      };
    }

    const { segments, stage } = StreamClient.parseTeachingSegments(fullText);
    const indexedSegments = segments.map((seg) => {
      let slideIndex = this.slides.findIndex((x) => x.id === seg.slide.id);
      if (slideIndex === -1) {
        seg.slide.messageId = msgId;
        this.slides.push(seg.slide);
        slideIndex = this.slides.length - 1;
      }
      return { oral: seg.oral, slide: seg.slide, slideIndex };
    });

    if (stage === 'quiz') this.pendingStageQuiz = true;

    if (!indexedSegments.length) {
      return {
        oral: parsed.cleanText || StreamClient.stripMarkers(fullText),
        slideIndex: this.messageSlideMap[msgId],
      };
    }

    const first = indexedSegments[0];
    if (indexedSegments.length > 1) {
      this.pendingSegments.push(...indexedSegments.slice(1));
    }
    this.currentSlideIndex = first.slideIndex;
    this.messageSlideMap[msgId] = first.slideIndex;
    this.awaitingConfirmation = true;
    this.showCurrentSlide();

    if (!this._finalizedMsgIds) this._finalizedMsgIds = new Set();
    this._finalizedMsgIds.add(msgId);

    return { oral: first.oral, slideIndex: first.slideIndex };
  },

  previewTeachingStream(fullText, parsed, msgId) {
    const { segments } = StreamClient.parseTeachingSegments(fullText);
    if (!segments.length) {
      return { oral: parsed.cleanText || StreamClient.stripMarkers(fullText), slideIndex: undefined };
    }

    segments.forEach((seg) => {
      if (!this.slides.find((x) => x.id === seg.slide.id)) {
        seg.slide.messageId = msgId;
        this.slides.push(seg.slide);
      }
    });

    const slideIndex = this.slides.findIndex((x) => x.id === segments[0].slide.id);
    this.currentSlideIndex = slideIndex;
    this.showCurrentSlide();
    return { oral: segments[0].oral, slideIndex };
  },

  showQueuedTeachingSegment() {
    if (!this.pendingSegments.length) return false;

    const next = this.pendingSegments.shift();
    this.currentSlideIndex = next.slideIndex;
    this.awaitingConfirmation = true;

    const msgId = `msg-${Date.now()}`;
    this.messageSlideMap[msgId] = next.slideIndex;
    this.addDockMessage('ai', next.oral, msgId, null, { slideIndex: next.slideIndex });
    this.showCurrentSlide();
    Voice.speak(next.oral);
    this.saveSession();
    return true;
  },

  maybeFinishTeaching() {
    if (!this.pendingStageQuiz || this.pendingSegments.length || this.awaitingConfirmation) return false;
    this.pendingStageQuiz = false;
    this.completePhase('teaching');
    this.addDockMessage('system', '知识讲解已完成，进入课后练习');
    setTimeout(() => this.startQuiz(), 1000);
    return true;
  },

  tryAdvanceTeaching(userText, userImages) {
    if (this.stage !== 'teaching' || this.revisitMode) return false;
    if (!this.isConfirmationMessage(userText)) return false;

    const hasQueue = this.pendingSegments.length > 0;
    const shouldFinish = this.pendingStageQuiz && !hasQueue;

    if (!hasQueue && !shouldFinish) {
      this.awaitingConfirmation = false;
      return false;
    }

    this.addDockMessage('user', userText, null, userImages);
    this.messages.push({ role: 'user', content: userText, images: userImages || [] });
    this.awaitingConfirmation = false;

    if (this.showQueuedTeachingSegment()) return true;

    if (shouldFinish) {
      this.maybeFinishTeaching();
      return true;
    }

    return false;
  },

  async enter(topic, revisit = false) {
    this.topic = topic;
    this.revisitMode = revisit;
    this.messages = [];
    this.slides = [];
    this.diagrams = [];
    this.currentSlideIndex = 0;
    this.messageSlideMap = {};
    this.teachingContent = '';
    this.quizQuestions = [];
    this.quizIndex = 0;
    this.quizScores = [];
    this.quizState = { answers: {} };
    this.stageView = 'primary';
    this.returnToQuizIndex = null;
    this.resetTeachingQueue();
    this.pendingImages = [];
    this.phaseMessages = { review: [], teaching: [], quiz: [] };
    this.phasesCompleted = [];

    this.dom.title.textContent = topic;
    this.dom.dockContext.textContent = `正在讲解：${topic}`;
    this.dom.dockMessages.innerHTML = '';
    this.dom.dockInput.value = '';
    this.clearImagePreview();

    this.showView('classroom');

    if (revisit) {
      this.stage = 'revisit';
      this.currentDockPhase = 'teaching';
      this.dom.stageModeLabel.textContent = '复习模式';
      await this.loadRevisit();
      this.updatePhaseBar();
      return;
    }

    const session = await this.loadSession();
    if (session) {
      this.applySession(session);
      this.renderFullDock();
      this.updatePhaseBar();
      await this.resumeFromSession(session);
      return;
    }

    this.stage = 'review';
    this.currentDockPhase = 'review';
    this.updatePhaseBar();
    await this.startReviewMcq();
  },

  async loadSession() {
    try {
      const res = await fetch(`/api/lesson-session?topic=${encodeURIComponent(this.topic)}`);
      const data = await res.json();
      return data.session;
    } catch {
      return null;
    }
  },

  applySession(session) {
    this.phaseMessages = session.phaseMessages || { review: [], teaching: [], quiz: [] };
    this.phasesCompleted = session.phasesCompleted || [];
    this.slides = session.slides || [];
    this.teachingContent = session.teachingContent || '';
    this.messages = session.messages || [];
    this.stage = session.currentStage || 'review';
    this.currentDockPhase = this.getActivePhase();
    this.quizQuestions = session.quizQuestions || [];
    this.quizIndex = session.quizIndex ?? 0;
    this.quizState = session.quizState || { answers: {} };
    this.quizScores = Object.values(this.quizState.answers)
      .filter((a) => a.submitted && a.score != null)
      .map((a) => a.score);

    ['review', 'teaching', 'quiz'].forEach((phase) => {
      const seen = new Set();
      this.phaseMessages[phase] = (this.phaseMessages[phase] || []).filter((m) => {
        const key = `${m.role}:${m.content}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((m) => {
        if (m.quizIndex === undefined && m.content) {
          const qm = m.content.match(/\[第(\d+)题\]/);
          if (qm) m.quizIndex = parseInt(qm[1], 10) - 1;
          else {
            const am = m.content.match(/^第(\d+)题评分/);
            if (am) m.quizIndex = parseInt(am[1], 10) - 1;
          }
        }
        return m;
      });
    });
  },

  async resumeFromSession(session) {
    if (this.phasesCompleted.includes('quiz') || session.currentStage === 'done') {
      this.stage = 'done';
      this.updatePhaseBar();
      this.dom.stageModeLabel.textContent = '已完成';
      StageRenderer.renderLoading(this.dom.stageContent, '本课时已完成，可在知识库查看或复习。');
      return;
    }

    if (!this.phasesCompleted.includes('review')) {
      this.stage = 'review';
      this.currentDockPhase = 'review';
      await this.startReviewMcq();
      return;
    }

    if (!this.phasesCompleted.includes('teaching')) {
      this.stage = 'teaching';
      this.currentDockPhase = 'teaching';
      this.dom.stageModeLabel.textContent = '知识讲解';
      this.renderFullDock();
      if (this.slides.length) {
        this.showCurrentSlide();
      } else {
        await this.streamAI([], true);
      }
      return;
    }

    if (!this.phasesCompleted.includes('quiz')) {
      this.stage = 'quiz';
      this.currentDockPhase = 'quiz';
      this.renderFullDock();
      await this.startQuiz(true);
    }
  },

  async saveSession(extra = {}) {
    if (this.revisitMode) return;
    try {
      await fetch('/api/lesson-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: this.topic,
          phaseMessages: this.phaseMessages,
          phasesCompleted: this.phasesCompleted,
          currentStage: extra.currentStage ?? (this.stage === 'done' ? 'done' : this.stage),
          slides: this.slides,
          teachingContent: this.teachingContent,
          messages: this.messages,
          reviewResult: extra.reviewResult ?? null,
          quizQuestions: this.quizQuestions,
          quizIndex: this.quizIndex,
          quizState: this.quizState,
        }),
      });
    } catch (err) {
      console.error('save session failed', err);
    }
  },

  completePhase(phase, extra = {}) {
    if (!this.phasesCompleted.includes(phase)) {
      this.phasesCompleted.push(phase);
    }
    this.updatePhaseBar();
    this.renderFullDock();
    this.saveSession(extra);
  },

  exit() {
    this.saveSession();
    this.showView('path');
    PathView.refresh();
    App.loadKnowledgeDrawer();
  },

  updatePhaseBar() {
    const phases = ['review', 'teaching', 'quiz'];
    const current = this.revisitMode ? null : this.getActivePhase();
    const currentIdx = this.stage === 'done' ? 3 : phases.indexOf(current);

    this.dom.phaseBar?.querySelectorAll('.phase').forEach((el) => {
      const p = el.dataset.phase;
      const pi = phases.indexOf(p);
      el.classList.remove('active', 'done');
      if (this.phasesCompleted.includes(p) || this.stage === 'done') {
        el.classList.add('done');
      } else if (pi === currentIdx) {
        el.classList.add('active');
      }
    });
  },

  renderPhaseHeader(phase, done) {
    const labels = this.phaseLabels;
    const isActive = phase === this.currentDockPhase && !done && this.stage !== 'done';
    const isDone = done || this.phasesCompleted.includes(phase);
    const header = document.createElement('div');
    header.className = `dock-phase-header ${isDone ? 'done' : isActive ? 'active' : 'pending'}`;
    header.dataset.phase = phase;
    header.innerHTML = `
      <span class="phase-check">${isDone ? '✓' : isActive ? '●' : ''}</span>
      <span class="phase-header-text">${labels[phase]}</span>
      <span class="phase-header-status">${isDone ? '已完成' : isActive ? '进行中' : ''}</span>`;
    header.addEventListener('click', () => this.navigateToPhase(phase));
    this.dom.dockMessages.appendChild(header);
    return header;
  },

  renderFullDock() {
    this.dom.dockMessages.innerHTML = '';
    ['review', 'teaching', 'quiz'].forEach((phase) => {
      const msgs = this.phaseMessages[phase];
      if (!msgs?.length && !this.phasesCompleted.includes(phase) && phase !== this.currentDockPhase) {
        return;
      }
      const isDone = this.phasesCompleted.includes(phase);
      const isActive = phase === this.currentDockPhase && !isDone;
      if (msgs?.length || isDone || isActive) {
        this.renderPhaseHeader(phase, isDone);
        (msgs || []).forEach((m) => this.renderDockMessageEl(m, false));
      }
    });
    this.dom.dockMessages.scrollTop = this.dom.dockMessages.scrollHeight;
  },

  renderDockMessageEl(msg, scroll = true) {
    if (msg.quizIndex === undefined && msg.content) {
      const qm = msg.content.match(/\[第(\d+)题\]/);
      if (qm) msg.quizIndex = parseInt(qm[1], 10) - 1;
      else {
        const am = msg.content.match(/^第(\d+)题评分/);
        if (am) msg.quizIndex = parseInt(am[1], 10) - 1;
      }
    }

    const el = document.createElement('div');
    const linkable = msg.quizIndex !== undefined || msg.slideIndex !== undefined;
    el.className = `dock-msg ${msg.role}${linkable ? ' linkable' : ''}`;
    if (msg.msgId) el.dataset.msgId = msg.msgId;
    if (msg.slideIndex !== undefined) el.dataset.slideIndex = msg.slideIndex;
    if (msg.quizIndex !== undefined) el.dataset.quizIndex = msg.quizIndex;

    let imgHtml = '';
    if (msg.images?.length) {
      imgHtml = msg.images.map((img) => `<img src="${img}" class="dock-msg-img" alt="">`).join('');
    }

    const linkHint = msg.quizIndex !== undefined
      ? '<span class="dock-link-hint">点击查看该题</span>'
      : msg.slideIndex !== undefined
        ? '<span class="dock-link-hint">点击查看知识点</span>'
        : '';

    el.innerHTML = `
      ${msg.role === 'ai' ? '<div class="dock-avatar">AI</div>' : ''}
      <div class="dock-bubble">${msg.content}${imgHtml ? `<div>${imgHtml}</div>` : ''}${linkHint}</div>`;

    if (linkable || msg.role === 'ai' || msg.role === 'system') {
      el.addEventListener('click', () => this.handleDockMessageClick(msg, el));
    }

    this.dom.dockMessages.appendChild(el);
    if (scroll) this.dom.dockMessages.scrollTop = this.dom.dockMessages.scrollHeight;
    return el;
  },

  handleDockMessageClick(msg, el) {
    this.dom.dockMessages.querySelectorAll('.dock-msg').forEach((m) => m.classList.remove('linked-active'));
    el.classList.add('linked-active');

    if (msg.quizIndex !== undefined) {
      this.stage = 'quiz';
      this.currentDockPhase = 'quiz';
      this.stageView = 'primary';
      this.updatePhaseBar();
      this.navigateToQuiz(msg.quizIndex);
      return;
    }

    if (msg.slideIndex !== undefined) {
      const returnQuiz = this.quizQuestions.length
        ? (this.stage === 'quiz' || this.phasesCompleted.includes('quiz') ? this.quizIndex : null)
        : null;
      this.showSlideForReview(parseInt(msg.slideIndex, 10), returnQuiz);
    }
  },

  navigateToPhase(phase) {
    if (phase === 'quiz') {
      if (!this.quizQuestions.length) {
        App.showToast('课后练习尚未开始');
        return;
      }
      this.stage = 'quiz';
      this.currentDockPhase = 'quiz';
      this.stageView = 'primary';
      this.updatePhaseBar();
      this.navigateToQuiz(this.quizIndex);
      return;
    }

    if (phase === 'teaching') {
      if (!this.slides.length) {
        App.showToast('知识讲解尚未开始');
        return;
      }
      const returnQuiz = this.quizQuestions.length ? this.quizIndex : null;
      this.showSlideForReview(this.currentSlideIndex || 0, returnQuiz);
      return;
    }

    if (phase === 'review') {
      if (this.phasesCompleted.includes('review')) {
        App.showToast('节前回顾已完成，请查看对话记录');
      }
    }
  },

  saveQuizDraft() {
    if (this.stage !== 'quiz' && this.stageView !== 'primary') return;
    const input = document.getElementById('quiz-answer-input');
    if (!input) return;
    const entry = this.quizState.answers[this.quizIndex] || {};
    if (entry.submitted) return;
    entry.draft = input.value;
    this.quizState.answers[this.quizIndex] = entry;
  },

  navigateToQuiz(index) {
    this.saveQuizDraft();
    this.stage = 'quiz';
    this.stageView = 'primary';
    this.quizIndex = Math.max(0, Math.min(index, this.quizQuestions.length - 1));
    this.dom.stageModeLabel.textContent = '课后练习';
    this.renderQuizQuestion();
    this.saveSession();
  },

  showSlideForReview(slideIndex, returnQuizIndex) {
    this.saveQuizDraft();
    this.stageView = 'review-slide';
    this.returnToQuizIndex = returnQuizIndex;
    this.currentSlideIndex = slideIndex;
    this.mode = 'slide';

    const returnLabel = returnQuizIndex != null
      ? `返回继续答题（第 ${returnQuizIndex + 1} 题）`
      : '返回课后练习';

    StageRenderer.renderSlide(
      this.dom.stageContent,
      this.slides[slideIndex],
      slideIndex,
      this.slides.length,
      {
        showReturnBar: returnQuizIndex != null,
        returnLabel,
        onReturn: () => this.returnToQuiz(),
      },
    );
    this.dom.stagePageIndicator.textContent = `${slideIndex + 1} / ${this.slides.length}`;
    this.dom.stageModeLabel.textContent = '知识回顾';
  },

  returnToQuiz() {
    if (this.returnToQuizIndex == null && !this.quizQuestions.length) return;
    this.stageView = 'primary';
    this.stage = 'quiz';
    this.currentDockPhase = 'quiz';
    this.navigateToQuiz(this.returnToQuizIndex ?? this.quizIndex);
  },

  setLoading(show) {
    this.dom.dockLoading?.classList.toggle('hidden', !show);
    if (this.dom.btnSend) this.dom.btnSend.disabled = show;
  },

  async startReviewMcq() {
    StageRenderer.renderLoading(this.dom.stageContent, '正在生成回顾题目...');
    this.setLoading(true);
    try {
      const res = await fetch('/api/generate-review-mcq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: this.topic, provider: App.getProvider() }),
      });
      const data = await res.json();
      this.reviewQuestions = data.questions || [];
      StageRenderer.renderReviewMcq(this.dom.stageContent, this.reviewQuestions, (answers) => {
        this.submitReviewMcq(answers);
      });
      this.ensureReviewIntro();
    } catch (err) {
      App.showToast(err.message, true);
    } finally {
      this.setLoading(false);
    }
  },

  async submitReviewMcq(answers) {
    this.setLoading(true);
    try {
      const res = await fetch('/api/evaluate-review-mcq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: this.topic,
          answers,
          questions: this.reviewQuestions,
          provider: App.getProvider(),
        }),
      });
      const result = await res.json();
      StageRenderer.renderReviewResult(this.dom.stageContent, result, this.reviewQuestions, () => {
        this.completePhase('review', { reviewResult: result });
        this.startTeaching();
      });
      this.addDockMessage('ai', result.feedback);

      if (result.passed) {
        setTimeout(() => {
          this.completePhase('review', { reviewResult: result });
          this.startTeaching();
        }, 2000);
      } else {
        await this.saveSession({ reviewResult: result });
      }
    } catch (err) {
      App.showToast(err.message, true);
    } finally {
      this.setLoading(false);
    }
  },

  ensureReviewIntro() {
    const intro = this.REVIEW_INTRO;
    if (this.phaseMessages.review?.some((m) => m.content === intro)) {
      this.renderFullDock();
      return;
    }
    this.addDockMessage('ai', intro);
  },

  async startTeaching() {
    this.stage = 'teaching';
    this.currentDockPhase = 'teaching';
    this.resetTeachingQueue();
    this.updatePhaseBar();
    this.renderFullDock();
    this.dom.stageModeLabel.textContent = '知识讲解';
    StageRenderer.renderLoading(this.dom.stageContent, 'AI 老师准备中...');
    await this.streamAI([], true);
  },

  async loadRevisit() {
    try {
      const res = await fetch('/api/knowledge-base');
      const data = await res.json();
      const slides = data.topicSlides?.[this.topic] || [];
      this.slides = slides;
      StageRenderer.renderRevisitSlides(this.dom.stageContent, slides, this.topic);
      this.addDockMessage('ai', `欢迎复习「${this.topic}」！有任何问题随时提问，点击消息可跳转到对应知识点。`);
    } catch (err) {
      App.showToast(err.message, true);
    }
  },

  async streamAI(extraMessages, isOpening = false) {
    if (this.isStreaming) return;
    this.isStreaming = true;
    this.setLoading(true);

    const msgs = [...this.messages, ...extraMessages];
    let bubbleEl = null;
    let msgId = `msg-${Date.now()}`;

    try {
      if (!isOpening && extraMessages.length) {
        const userMsg = extraMessages[extraMessages.length - 1];
        this.addDockMessage('user', userMsg.content, null, userMsg.images);
      }

      this.setLoading(false);
      bubbleEl = this.addDockMessage('ai', '', msgId, null, { appendOnly: true });

      await StreamClient.streamChat(
        '/api/chat',
        { messages: msgs, stage: this.stage, topic: this.topic, provider: App.getProvider() },
        (fullText, parsed) => {
          let display = { oral: parsed.cleanText || StreamClient.stripMarkers(fullText), slideIndex: undefined };

          if (this.stage === 'teaching' && !this.revisitMode) {
            display = this.previewTeachingStream(fullText, parsed, msgId);
          } else if (parsed.slides.length) {
            parsed.slides.forEach((s) => {
              if (!this.slides.find((x) => x.id === s.id)) {
                s.messageId = msgId;
                this.slides.push(s);
              }
            });
            this.currentSlideIndex = this.slides.length - 1;
            this.messageSlideMap[msgId] = this.currentSlideIndex;
            display.slideIndex = this.currentSlideIndex;
            this.showCurrentSlide();
          }

          if (bubbleEl) {
            bubbleEl.querySelector('.dock-bubble').textContent = display.oral || '...';
            if (display.slideIndex !== undefined) {
              bubbleEl.dataset.slideIndex = display.slideIndex;
              bubbleEl.style.cursor = 'pointer';
            }
          }

          if (parsed.diagrams.length) {
            parsed.diagrams.forEach((d) => {
              if (!this.diagrams.find((x) => x.id === d.id)) this.diagrams.push(d);
            });
            this.mode = 'diagram';
            StageRenderer.renderDiagram(this.dom.stageContent, parsed.diagrams[parsed.diagrams.length - 1], 0);
            this.dom.stageModeLabel.textContent = '流程图解';
          }
        },
        (fullText, parsed) => {
          let display = { oral: parsed.cleanText || StreamClient.stripMarkers(fullText), slideIndex: undefined };

          if (this.stage === 'teaching' && !this.revisitMode) {
            display = this.ingestTeachingSegments(fullText, parsed, msgId);
          } else {
            display.slideIndex = this.messageSlideMap[msgId] ?? (this.slides.length ? this.slides.length - 1 : undefined);
          }

          if (bubbleEl) {
            bubbleEl.querySelector('.dock-bubble').textContent = display.oral || parsed.cleanText || '...';
            if (display.slideIndex !== undefined) {
              bubbleEl.dataset.slideIndex = display.slideIndex;
              bubbleEl.style.cursor = 'pointer';
            }
          }

          this.updatePhaseMessage(msgId, display.oral || parsed.cleanText, display.slideIndex);

          if (!isOpening) {
            extraMessages.forEach((m) => this.messages.push(m));
          }
          this.messages.push({ role: 'assistant', content: fullText });
          this.teachingContent += '\n' + (display.oral || parsed.cleanText);

          Voice.speak(display.oral || parsed.cleanText);
          this.saveSession();

          if (this.stage === 'teaching' && !this.revisitMode) {
            if (parsed.stage === 'quiz') this.pendingStageQuiz = true;
            if (!this.pendingSegments.length && !this.awaitingConfirmation && this.pendingStageQuiz) {
              this.maybeFinishTeaching();
            }
          } else if (parsed.stage === 'quiz' && this.stage === 'teaching') {
            this.completePhase('teaching');
            this.addDockMessage('system', '知识讲解已完成，进入课后练习');
            setTimeout(() => this.startQuiz(), 1000);
          }
        },
        (err) => { App.showToast(err.message, true); },
      );
    } catch (err) {
      App.showToast(err.message, true);
    } finally {
      this.isStreaming = false;
      this.setLoading(false);
    }
  },

  updatePhaseMessage(msgId, content, slideIndex) {
    const phase = this.getActivePhase();
    const arr = this.phaseMessages[phase] || [];
    const existing = arr.find((m) => m.msgId === msgId);
    const payload = { role: 'ai', content, msgId, slideIndex, images: null };
    if (existing) {
      Object.assign(existing, payload);
    } else {
      arr.push(payload);
    }
    this.phaseMessages[phase] = arr;
  },

  showCurrentSlide() {
    if (!this.slides.length) return;
    this.stageView = 'primary';
    this.mode = 'slide';
    const slide = this.slides[this.currentSlideIndex];
    const returnQuiz = (this.stage === 'quiz' || this.quizQuestions.length) ? this.quizIndex : null;
    if (returnQuiz != null && this.stage === 'quiz') {
      this.showSlideForReview(this.currentSlideIndex, returnQuiz);
      return;
    }
    StageRenderer.renderSlide(this.dom.stageContent, slide, this.currentSlideIndex, this.slides.length);
    this.dom.stagePageIndicator.textContent = `${this.currentSlideIndex + 1} / ${this.slides.length}`;
    this.dom.stageModeLabel.textContent = '知识讲解';
  },

  async sendMessage() {
    const text = this.dom.dockInput?.value.trim();
    if (!text && !this.pendingImages.length) return;
    if (this.isStreaming) return;

    const images = [...this.pendingImages];
    this.dom.dockInput.value = '';
    this.clearImagePreview();

    if (this.stage === 'review' && !this.revisitMode) {
      this.addDockMessage('user', text || '（图片）', null, images);
      this.addDockMessage('ai', '请先完成左侧节前回顾选择题，完成后即可进入知识讲解阶段。');
      return;
    }

    const userMsg = { role: 'user', content: text || '请分析这张图片', images };
    if (this.stage === 'teaching' && !this.revisitMode && this.tryAdvanceTeaching(text, images)) {
      return;
    }

    await this.streamAI([userMsg]);
  },

  async startQuiz(resume = false) {
    this.stage = 'quiz';
    this.currentDockPhase = 'quiz';
    this.stageView = 'primary';
    this.updatePhaseBar();
    this.renderFullDock();
    this.dom.stageModeLabel.textContent = '课后练习';

    try {
      if (!resume || !this.quizQuestions.length) {
        StageRenderer.renderLoading(this.dom.stageContent, '正在生成练习题...');
        const res = await fetch('/api/generate-quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: this.topic,
            teachingContent: this.teachingContent,
            provider: App.getProvider(),
          }),
        });
        const data = await res.json();
        this.quizQuestions = data.questions || [];
        if (!resume) {
          this.quizIndex = 0;
          this.quizState = { answers: {} };
          this.quizScores = [];
        }
      }

      if (!resume) {
        const quizStart = '课后练习开始，请在左侧主舞台作答。';
        if (!this.phaseMessages.quiz?.some((m) => m.content === quizStart)) {
          this.addDockMessage('system', quizStart);
        }
      }

      this.renderQuizQuestion();
      await this.saveSession();
    } catch (err) {
      App.showToast(err.message, true);
    }
  },

  getQuizNav() {
    return this.quizQuestions.map((_, i) => ({
      submitted: !!this.quizState.answers[i]?.submitted,
    }));
  },

  renderQuizQuestion() {
    const q = this.quizQuestions[this.quizIndex];
    if (!q) return;

    const entry = this.quizState.answers[this.quizIndex] || {};
    StageRenderer.renderQuiz(
      this.dom.stageContent,
      q,
      this.quizIndex,
      this.quizQuestions.length,
      {
        draft: entry.draft || '',
        submitted: !!entry.submitted,
        score: entry.score,
        feedback: entry.feedback,
        answer: entry.answer,
        questionNav: this.getQuizNav(),
        onNavClick: (idx) => this.navigateToQuiz(idx),
        onDraftChange: (text) => {
          if (!this.quizState.answers[this.quizIndex]) {
            this.quizState.answers[this.quizIndex] = {};
          }
          this.quizState.answers[this.quizIndex].draft = text;
          this.saveSession();
        },
        onSubmit: (ans) => this.submitQuizAnswer(ans, q),
      },
    );
  },

  async submitQuizAnswer(answer, question) {
    this.setLoading(true);
    try {
      const res = await fetch('/api/evaluate-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.question,
          userAnswer: answer,
          topic: this.topic,
          provider: App.getProvider(),
        }),
      });
      const result = await res.json();

      this.quizState.answers[this.quizIndex] = {
        draft: answer,
        answer,
        score: result.score,
        feedback: result.feedback,
        submitted: true,
      };
      this.quizScores[this.quizIndex] = result.score;

      this.addDockMessage('user', `[第${this.quizIndex + 1}题] ${answer.slice(0, 80)}${answer.length > 80 ? '...' : ''}`, null, null, { quizIndex: this.quizIndex });
      this.addDockMessage('ai', `第${this.quizIndex + 1}题评分 ${result.score}/5：${result.feedback.slice(0, 120)}${result.feedback.length > 120 ? '...' : ''}`, null, null, { quizIndex: this.quizIndex });

      const isLast = this.quizIndex >= this.quizQuestions.length - 1;

      if (isLast) {
        this.renderQuizQuestion();
        await this.saveSession();
        setTimeout(() => this.finishQuiz(), 1500);
      } else {
        this.quizIndex += 1;
        this.renderQuizQuestion();
        await this.saveSession();
      }
    } catch (err) {
      App.showToast(err.message, true);
    } finally {
      this.setLoading(false);
    }
  },

  async finishQuiz() {
    const scores = this.quizQuestions.map((_, i) => this.quizState.answers[i]?.score ?? 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stars = Math.round(avg);
    this.stage = 'done';

    this.completePhase('quiz', { currentStage: 'done' });
    this.addDockMessage('ai', `恭喜完成「${this.topic}」！综合掌握 ${stars}/5 星，对话记录已保存。`);

    StageRenderer.renderQuizComplete(this.dom.stageContent, stars, scores, () => {
      App.openKnowledgeDrawer();
      this.exit();
    });

    try {
      await fetch('/api/knowledge-base', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: this.topic,
          stars,
          teachingContent: this.teachingContent,
          slides: this.slides,
          provider: App.getProvider(),
        }),
      });
    } catch { /* */ }
  },

  addDockMessage(role, content, msgId, images, options = {}) {
    const { appendOnly = false, quizIndex, slideIndex: optSlideIndex } = options;
    const phase = this.revisitMode ? 'teaching' : this.getActivePhase();
    const slideIndex = optSlideIndex ?? (msgId ? this.messageSlideMap[msgId] : undefined);

    const msg = {
      role,
      content,
      msgId: msgId || null,
      slideIndex,
      quizIndex: quizIndex ?? undefined,
      images: images || null,
    };
    if (!this.phaseMessages[phase]) this.phaseMessages[phase] = [];

    if (msgId) {
      const existing = this.phaseMessages[phase].find((m) => m.msgId === msgId);
      if (existing) {
        existing.content = content;
        if (slideIndex !== undefined) existing.slideIndex = slideIndex;
        const el = this.dom.dockMessages.querySelector(`[data-msg-id="${msgId}"]`);
        if (el) {
          el.querySelector('.dock-bubble').textContent = content;
          return el;
        }
      }
    }

    if (!msgId || !this.phaseMessages[phase].find((m) => m.msgId === msgId)) {
      this.phaseMessages[phase].push(msg);
    }

    if (!this.revisitMode) this.saveSession();

    if (appendOnly || (msgId && !content)) {
      return this.renderDockMessageEl(msg);
    }

    this.renderFullDock();
    if (msgId) {
      return this.dom.dockMessages.querySelector(`[data-msg-id="${msgId}"]`);
    }
    return null;
  },

  handleImageSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      App.showToast('图片不能超过 2MB', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.pendingImages = [reader.result];
      this.dom.imagePreview.innerHTML = `<img src="${reader.result}" alt=""><button type="button" id="clear-img">&times;</button>`;
      this.dom.imagePreview.classList.remove('hidden');
      document.getElementById('clear-img')?.addEventListener('click', () => this.clearImagePreview());
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },

  clearImagePreview() {
    this.pendingImages = [];
    if (this.dom.imagePreview) {
      this.dom.imagePreview.innerHTML = '';
      this.dom.imagePreview.classList.add('hidden');
    }
  },

  enterRevisit(topic) {
    this.enter(topic, true);
  },
};

window.Classroom = Classroom;
