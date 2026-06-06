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

  /** 匹配 JSON 对象闭合括号（支持 code 字段内含 {}） */
  findMatchingBrace(text, start) {
    if (text[start] !== '{') return -1;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (inString) {
        if (c === '\\') escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  },

  /** 提取 [TAG:{...}] 块（比正则更可靠） */
  extractTaggedBlocks(text, tag) {
    const blocks = [];
    const open = `[${tag}:`;
    let searchFrom = 0;

    while (searchFrom < text.length) {
      const openIdx = text.indexOf(open, searchFrom);
      if (openIdx === -1) break;

      const jsonStart = openIdx + open.length;
      if (text[jsonStart] !== '{') {
        searchFrom = openIdx + 1;
        continue;
      }

      const jsonEnd = this.findMatchingBrace(text, jsonStart);
      if (jsonEnd === -1) break;
      if (text[jsonEnd + 1] !== ']') {
        searchFrom = openIdx + 1;
        continue;
      }

      const endIdx = jsonEnd + 2;
      blocks.push({
        tag,
        full: text.slice(openIdx, endIdx),
        json: text.slice(jsonStart, jsonEnd + 1),
        start: openIdx,
        end: endIdx,
      });
      searchFrom = endIdx;
    }

    return blocks;
  },

  stripMarkers(text) {
    if (!text) return '';
    let result = text;

    ['SLIDE', 'DIAGRAM', 'SCORE'].forEach((tag) => {
      this.extractTaggedBlocks(result, tag)
        .reverse()
        .forEach((b) => {
          result = result.slice(0, b.start) + result.slice(b.end);
        });
    });

    result = result.replace(/\[STAGE:\w+\]/g, '');
    result = result.replace(/\[SLIDE:[\s\S]*$/g, '');
    result = result.replace(/\[DIAGRAM:[\s\S]*$/g, '');
    result = result.replace(/\[SCORE:[\s\S]*$/g, '');
    return result.replace(/\n{3,}/g, '\n\n').trim();
  },

  toDisplayText(text) {
    return this.stripMarkers(text);
  },

  parseBlocks(text) {
    const { segments, stage, score } = this.parseTeachingSegments(text);
    const slides = segments.map((s) => s.slide);
    const diagrams = [];

    this.extractTaggedBlocks(text, 'DIAGRAM').forEach((block) => {
      try {
        diagrams.push(JSON.parse(block.json));
      } catch { /* skip */ }
    });

    return { slides, diagrams, stage, score, cleanText: this.stripMarkers(text), segments };
  },

  /** 按 SLIDE 标记拆分口语段，便于逐步展示 */
  parseTeachingSegments(text) {
    const segments = [];
    const blocks = this.extractTaggedBlocks(text, 'SLIDE');
    let lastIndex = 0;

    blocks.forEach((block) => {
      const oral = text.slice(lastIndex, block.start).replace(/\[STAGE:\w+\]/g, '').trim();
      try {
        segments.push({ oral, slide: JSON.parse(block.json) });
      } catch (err) {
        console.warn('[StreamClient] SLIDE JSON 解析失败', err.message);
      }
      lastIndex = block.end;
    });

    if (blocks.length) {
      const trailingOral = text.slice(lastIndex).replace(/\[STAGE:\w+\]/g, '').trim();
      if (trailingOral) {
        const last = segments[segments.length - 1];
        if (last) {
          last.oral = [last.oral, trailingOral].filter(Boolean).join(' ');
        }
      }
    }

    const trailing = text.slice(lastIndex);
    const stageM = trailing.match(/\[STAGE:(\w+)\]/);
    const stage = stageM ? stageM[1] : null;

    let score = null;
    const scoreBlocks = this.extractTaggedBlocks(text, 'SCORE');
    if (scoreBlocks.length) {
      try {
        score = JSON.parse(scoreBlocks[scoreBlocks.length - 1].json);
      } catch { /* skip */ }
    }

    return { segments, stage, score };
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
