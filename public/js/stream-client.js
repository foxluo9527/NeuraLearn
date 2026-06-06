/**
 * SSE 流解析 + SLIDE/DIAGRAM/STAGE 标记提取
 */
const StreamClient = {
  MARKERS: {
    SLIDE: /\[SLIDE:(\{[\s\S]*?\})\]/g,
    DIAGRAM: /\[DIAGRAM:(\{[\s\S]*?\})\]/g,
    STAGE: /\[STAGE:(\w+)\]/g,
    SCORE: /\[SCORE:(\{[\s\S]*?\})\]/g,
  },

  stripMarkers(text) {
    return text
      .replace(/\[SLIDE:\{[\s\S]*?\}\]/g, '')
      .replace(/\[DIAGRAM:\{[\s\S]*?\}\]/g, '')
      .replace(/\[STAGE:\w+\]/g, '')
      .replace(/\[SCORE:\{[\s\S]*?\}\]/g, '')
      .trim();
  },

  parseBlocks(text) {
    const slides = [];
    const diagrams = [];
    let stage = null;
    let score = null;

    let m;
    const slideRe = /\[SLIDE:(\{[\s\S]*?\})\]/g;
    while ((m = slideRe.exec(text)) !== null) {
      try { slides.push(JSON.parse(m[1])); } catch { /* skip */ }
    }

    const diagramRe = /\[DIAGRAM:(\{[\s\S]*?\})\]/g;
    while ((m = diagramRe.exec(text)) !== null) {
      try { diagrams.push(JSON.parse(m[1])); } catch { /* skip */ }
    }

    const stageM = text.match(/\[STAGE:(\w+)\]/);
    if (stageM) stage = stageM[1];

    const scoreM = text.match(/\[SCORE:(\{[\s\S]*?\})\]/);
    if (scoreM) {
      try { score = JSON.parse(scoreM[1]); } catch { /* skip */ }
    }

    return { slides, diagrams, stage, score, cleanText: this.stripMarkers(text) };
  },

  async streamChat(url, body, onDelta, onDone, onError) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `请求失败 (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const data = JSON.parse(line.slice(5).trim());
          if (data.type === 'delta') {
            fullText += data.text;
            onDelta(fullText, this.parseBlocks(fullText));
          } else if (data.type === 'error') {
            onError(new Error(data.message));
            return fullText;
          }
        } catch { /* skip */ }
      }
    }

    const final = this.parseBlocks(fullText);
    onDone(fullText, final);
    return fullText;
  },
};

window.StreamClient = StreamClient;
