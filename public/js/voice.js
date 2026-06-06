/**
 * Web Speech API — 语音输入与播报
 * 注意：Chrome/Edge 语音识别依赖 Google 云端，需 HTTPS（localhost 除外）且网络可访问 Google。
 */
const Voice = {
  recognition: null,
  supported: false,
  secureContext: false,
  blockReason: '',
  ttsEnabled: true,
  isListening: false,
  activeSession: null,
  _handlersBound: false,

  init() {
    this.secureContext = window.isSecureContext === true;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SR;

    if (!SR) {
      this.blockReason = '当前浏览器不支持 Web Speech 语音识别（请使用 Chrome 或 Edge）';
      console.warn('[Voice]', this.blockReason);
      return;
    }

    if (!this.secureContext) {
      this.blockReason = '语音识别需要 HTTPS 安全连接（localhost 除外，远程 HTTP 部署不可用）';
      console.warn('[Voice]', this.blockReason, 'origin:', location.origin);
      return;
    }

    this.recognition = new SR();
    this.recognition.lang = 'zh-CN';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this._bindRecognitionHandlers();
  },

  _bindRecognitionHandlers() {
    if (this._handlersBound || !this.recognition) return;
    this._handlersBound = true;

    this.recognition.onresult = (e) => {
      const session = this.activeSession;
      if (!session) return;

      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          text += e.results[i][0].transcript;
        }
      }
      if (!text) {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
        }
      }

      if (session.inputEl) session.inputEl.value = text;
      session.onResult?.(text);
    };

    this.recognition.onerror = (e) => {
      const code = e.error || 'unknown';
      console.warn('[Voice] recognition error:', code, e.message || '');

      // 正常停止或用户未说话，不算失败
      if (code === 'aborted' || code === 'no-speech') {
        this._finishSession();
        return;
      }

      this._finishSession();
      App.showToast(this.getErrorMessage(code), true);
    };

    this.recognition.onend = () => {
      this._finishSession();
    };
  },

  _finishSession() {
    if (this.activeSession?.btn) {
      this.activeSession.btn.classList.remove('recording');
    }
    this.isListening = false;
    this.activeSession = null;
  },

  getErrorMessage(code) {
    const map = {
      'not-allowed': '麦克风权限被拒绝，请在浏览器地址栏允许麦克风访问',
      'service-not-allowed': '当前页面不允许使用语音识别（需 HTTPS 或 localhost）',
      'network': '语音识别网络失败：Chrome 需访问 Google 服务，国内网络可能被阻断，可尝试 VPN 或换网络',
      'audio-capture': '未检测到麦克风设备，请检查系统麦克风设置',
      'language-not-supported': '不支持中文语音识别，请更换浏览器',
      'bad-grammar': '语音识别配置错误',
    };
    return map[code] || `语音识别失败（${code}），请重试`;
  },

  bindMicButton(btn, inputEl, onResult) {
    if (!btn) return;

    if (!this.supported || !this.secureContext) {
      btn.style.display = 'none';
      if (this.blockReason) btn.title = this.blockReason;
      return;
    }

    const session = { btn, inputEl, onResult };

    const start = () => {
      if (this.isListening) return;
      this.activeSession = session;
      session.btn.classList.add('recording');
      try {
        this.recognition.start();
        this.isListening = true;
      } catch (err) {
        console.error('[Voice] start failed:', err);
        this._finishSession();
        if (String(err.message || err).includes('already started')) {
          try { this.recognition.stop(); } catch { /* */ }
        } else {
          App.showToast('无法启动语音识别，请稍后重试', true);
        }
      }
    };

    const stop = () => {
      if (!this.isListening || this.activeSession !== session) return;
      session.btn.classList.remove('recording');
      try { this.recognition.stop(); } catch { /* */ }
    };

    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); });
    btn.addEventListener('touchend', stop);
  },

  speak(text) {
    if (!this.ttsEnabled || !text || !window.speechSynthesis) return;
    const clean = window.StreamClient?.toDisplayText?.(text) || text;
    if (!clean.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean.slice(0, 500));
    u.lang = 'zh-CN';
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  },

  setTtsEnabled(v) {
    this.ttsEnabled = v;
    if (!v) window.speechSynthesis?.cancel();
  },
};

Voice.init();
window.Voice = Voice;
