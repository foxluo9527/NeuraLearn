/**
 * Web Speech API — 语音输入与播报
 */
const Voice = {
  recognition: null,
  supported: false,
  ttsEnabled: true,
  isListening: false,

  init() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SR;
    if (SR) {
      this.recognition = new SR();
      this.recognition.lang = 'zh-CN';
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
    }
  },

  bindMicButton(btn, inputEl, onResult) {
    if (!this.supported) {
      btn.style.display = 'none';
      return;
    }

    const start = () => {
      if (this.isListening) return;
      this.isListening = true;
      btn.classList.add('recording');
      this.recognition.start();
    };

    const stop = () => {
      if (!this.isListening) return;
      this.isListening = false;
      btn.classList.remove('recording');
      try { this.recognition.stop(); } catch { /* */ }
    };

    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', stop);
    btn.addEventListener('mouseleave', stop);
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(); });
    btn.addEventListener('touchend', stop);

    this.recognition.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      if (inputEl) inputEl.value = text;
      if (onResult) onResult(text);
    };

    this.recognition.onerror = () => {
      stop();
      App.showToast('语音识别失败，请重试', true);
    };

    this.recognition.onend = () => {
      btn.classList.remove('recording');
      this.isListening = false;
    };
  },

  speak(text) {
    if (!this.ttsEnabled || !text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.slice(0, 500));
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
