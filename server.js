/**
 * NeuraLearn - AI 知识体系教学平台
 * 启动：配置 .env → npm install → npm start → http://localhost:3000
 */

require('dotenv').config();

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const courseData = require('./course-data');

const {
  COURSE_MODULES,
  TOPIC_META,
  ALL_LESSON_IDS,
  LEARNING_SUGGESTIONS,
  INITIAL_GRAPH_NODES,
  INITIAL_KNOWLEDGE_CARDS,
  getFallbackReviewMcq,
} = courseData;

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_PROVIDER = process.env.DEFAULT_AI_PROVIDER || 'deepseek';

app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const store = {
  graphNodes: { ...INITIAL_GRAPH_NODES },
  knowledgeCards: [...INITIAL_KNOWLEDGE_CARDS],
  topicSlides: {
    'Prompt 工程': [
      { id: 's1', title: 'Prompt 三层结构', bullets: ['System 定角色', 'User 给任务', 'Assistant 输出'], messageId: 'm1' },
    ],
  },
  lessonSessions: {},
  lastSession: { topic: null, stage: null, messages: [] },
};

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

function buildSystemPrompt(stage, topic) {
  const meta = TOPIC_META[topic] || { prerequisites: 'AI 应用开发基础知识' };
  const prerequisites = meta.prerequisites;
  const slides = store.topicSlides[topic] || [];
  const card = store.knowledgeCards.find((c) => c.nodeName === topic);
  const memoryPoints = card?.memoryPoints?.join('\n- ') || '';

  if (stage === 'teaching') {
    return `你是 NeuraLearn 平台的 AI 教师，正在教授 AI 应用开发课程中的：${topic}
当前任务：主动教学，你主导讲解节奏。

教学方式：
- 每次讲解一个子概念，结合 Python/TypeScript 代码示例
- 每讲完一段，用简短口语确认学生理解
- 保持自然，像技术分享而非念课本

【重要】每讲解一个知识点，必须输出结构化标记（与口语内容一起输出）：

[SLIDE:{"id":"s1","title":"标题","bullets":["要点1","要点2"],"code":null}]
- id 递增：s1, s2, s3...
- code 字段可选，放代码字符串

遇到复杂流程时，额外输出分步图解：
[DIAGRAM:{"id":"d1","title":"流程名","steps":[{"label":"步骤1","mermaid":"graph LR\\n  A[输入]-->B[处理]"}]}]

对话栏只写简短口语（50字以内/段），详细内容放 SLIDE/DIAGRAM 里。
讲完核心内容后，末尾单独一行：[STAGE:quiz]
用户打断提问时，先回答再继续。`;
  }

  if (stage === 'quiz') {
    return `你是 NeuraLearn AI 教师，批改「${topic}」练习题。
- 肯定正确部分 → 指出不足 → 给出解析 → 1-5 分
- 末尾输出：[SCORE:{"score":4,"correct":true}]`;
  }

  if (stage === 'revisit') {
    return `你是 NeuraLearn AI 教师，学生正在复习已学知识点：${topic}
基于以下已学内容回答问题，不推进新课程：
记忆要点：${memoryPoints}
历史 slides：${JSON.stringify(slides.slice(0, 5))}

规则：
- 每次回答可关联一个 slide：[SLIDE:{"id":"r1","title":"...","bullets":["..."],"code":null}]
- 仅答疑，不输出 STAGE 切换标记
- 专业、简洁、鼓励性`;
  }

  return `你是 NeuraLearn AI 教师，请用中文回答。当前节点：${topic}，前置：${prerequisites}`;
}

function buildQuizPrompt(topic, teachingContent) {
  return `为 AI 应用课程「${topic}」生成 3 道练习题。教学内容：${teachingContent.slice(0, 3000)}
1 概念题 concept  2 代码题 code（Python/TS）  3 场景题 scenario
严格只输出 JSON：{"questions":[{"id":1,"type":"concept","question":"..."},...]}`;
}

function buildReviewMcqPrompt(topic) {
  const meta = TOPIC_META[topic] || {};
  return `为 AI 应用课程「${topic}」生成 2-3 道节前回顾选择题，测试前置知识：${meta.prerequisites || 'AI 基础'}
严格只输出 JSON：
{"questions":[{"id":1,"question":"...","options":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."},{"id":"D","text":"..."}],"correctId":"B"}]}`;
}

function buildEvaluatePrompt(topic, question, userAnswer) {
  return `批改「${topic}」练习题。题目：${question}\n学生答案：${userAnswer}
严格只输出 JSON：{"score":4,"feedback":"...","correct":true}`;
}

function buildMemoryPointsPrompt(topic, teachingContent, avgScore) {
  return `为 AI 应用「${topic}」生成 3 条记忆点（每条≤50字）。掌握度 ${avgScore}/5。内容：${teachingContent.slice(0, 2000)}
严格只输出 JSON：{"memoryPoints":["...","...","..."]}`;
}

// ============================================================================
// AI PROVIDER ADAPTER
// ============================================================================

const PROVIDER_CONFIG = {
  claude: {
    name: 'Claude',
    envKey: 'ANTHROPIC_API_KEY',
    model: 'claude-sonnet-4-20250514',
    visionModel: 'claude-sonnet-4-20250514',
  },
  mimo: {
    name: 'MiMo',
    envKey: 'MIMO_API_KEY',
    model: 'mimo-v2.5-pro',
    visionModel: 'mimo-v2-omni',
    baseUrl: 'https://api.xiaomimimo.com/v1/chat/completions',
  },
  deepseek: {
    name: 'DeepSeek',
    envKey: 'DEEPSEEK_API_KEY',
    model: 'deepseek-chat',
    visionModel: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/chat/completions',
  },
};

function getProviderKey(provider) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return null;
  return process.env[config.envKey] || null;
}

function validateProvider(provider) {
  if (!PROVIDER_CONFIG[provider]) return { ok: false, message: `不支持的 AI 提供商: ${provider}` };
  const key = getProviderKey(provider);
  if (!key) return { ok: false, message: `请在 .env 中配置 ${PROVIDER_CONFIG[provider].envKey}` };
  return { ok: true };
}

function hasImages(messages) {
  return (messages || []).some((m) => m.images?.length > 0);
}

function normalizeMessages(messages) {
  return (messages || [])
    .filter((m) => m && (m.content?.trim() || m.images?.length))
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: (m.content || '').trim(),
      images: m.images || [],
    }));
}

function buildOpenAIContent(msg) {
  if (!msg.images?.length) return msg.content;
  const parts = [{ type: 'text', text: msg.content || '请分析这张图片' }];
  msg.images.forEach((img) => {
    parts.push({ type: 'image_url', image_url: { url: img } });
  });
  return parts;
}

function buildClaudeContent(msg) {
  if (!msg.images?.length) return msg.content;
  const parts = [];
  msg.images.forEach((img) => {
    const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
    if (match) {
      parts.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
    }
  });
  parts.push({ type: 'text', text: msg.content || '请分析这张图片' });
  return parts;
}

async function streamClaude(system, messages, writeSSE) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: PROVIDER_CONFIG.claude.model,
    max_tokens: 4096,
    system,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.images?.length ? buildClaudeContent(m) : m.content,
    })),
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      writeSSE({ type: 'delta', text: event.delta.text });
    }
  }
}

async function streamOpenAICompatible(provider, system, messages, writeSSE) {
  const config = PROVIDER_CONFIG[provider];
  const useVision = hasImages(messages);
  const model = useVision && provider === 'mimo' ? config.visionModel : config.model;

  const apiMessages = [{ role: 'system', content: system }];
  messages.forEach((m) => {
    apiMessages.push({
      role: m.role,
      content: useVision && m.role === 'user' && m.images?.length
        ? buildOpenAIContent(m)
        : m.content,
    });
  });

  const body = { model, messages: apiMessages, stream: true, max_tokens: 4096, temperature: 0.7 };
  if (provider === 'mimo') body.thinking = { type: 'disabled' };

  const headers = { 'Content-Type': 'application/json' };
  if (provider === 'mimo') headers['api-key'] = process.env.MIMO_API_KEY;
  else headers.Authorization = `Bearer ${process.env.DEEPSEEK_API_KEY}`;

  const response = await fetch(config.baseUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${config.name} API 错误 (${response.status}): ${errText.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const text = parsed.choices?.[0]?.delta?.content;
        if (text) writeSSE({ type: 'delta', text });
      } catch { /* skip */ }
    }
  }
}

async function streamChat(provider, system, messages, res) {
  const writeSSE = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  try {
    if (hasImages(messages) && provider === 'deepseek') {
      writeSSE({ type: 'delta', text: '当前 DeepSeek 文本模型无法直接识图，请用文字描述图片内容，或切换至 MiMo 引擎。' });
      writeSSE({ type: 'done' });
      return;
    }
    if (provider === 'claude') await streamClaude(system, messages, writeSSE);
    else await streamOpenAICompatible(provider, system, messages, writeSSE);
    writeSSE({ type: 'done' });
  } catch (err) {
    writeSSE({ type: 'error', message: err.message || 'AI 服务调用失败' });
  }
}

async function completeChat(provider, system, userContent) {
  const validation = validateProvider(provider);
  if (!validation.ok) throw new Error(validation.message);

  if (provider === 'claude') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: PROVIDER_CONFIG.claude.model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: userContent }],
    });
    return response.content.find((b) => b.type === 'text')?.text || '';
  }

  const config = PROVIDER_CONFIG[provider];
  const body = {
    model: config.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
    stream: false,
    max_tokens: 4096,
    temperature: 0.7,
  };
  if (provider === 'mimo') body.thinking = { type: 'disabled' };

  const headers = { 'Content-Type': 'application/json' };
  if (provider === 'mimo') headers['api-key'] = process.env.MIMO_API_KEY;
  else headers.Authorization = `Bearer ${process.env.DEEPSEEK_API_KEY}`;

  const response = await fetch(config.baseUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${config.name} API 错误 (${response.status}): ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function extractJSON(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try { return JSON.parse(jsonMatch[0]); } catch { return null; }
}

function getFallbackQuiz(topic) {
  return {
    questions: [
      { id: 1, type: 'concept', question: `解释「${topic}」的核心概念及其在 AI 应用中的价值。` },
      { id: 2, type: 'code', question: `以下 Python 代码与「${topic}」相关，请分析其作用：\n\`\`\`python\nfrom openai import OpenAI\nclient = OpenAI()\nresponse = client.chat.completions.create(model="gpt-4", messages=[{"role":"user","content":"Hello"}])\n\`\`\`` },
      { id: 3, type: 'scenario', question: `你的 AI 产品需要实现「${topic}」，请描述技术方案与关键挑战。` },
    ],
  };
}

function saveTopicSlides(topic, slides) {
  if (!slides?.length) return;
  if (!store.topicSlides[topic]) store.topicSlides[topic] = [];
  slides.forEach((s) => {
    if (!store.topicSlides[topic].find((x) => x.id === s.id)) {
      store.topicSlides[topic].push(s);
    }
  });
}

// ============================================================================
// API ROUTES
// ============================================================================

app.get('/api/providers', (_req, res) => {
  res.json({
    providers: Object.entries(PROVIDER_CONFIG).map(([id, cfg]) => ({
      id, name: cfg.name, configured: !!getProviderKey(id),
    })),
    default: DEFAULT_PROVIDER,
  });
});

app.get('/api/course', (_req, res) => {
  const mastered = Object.values(store.graphNodes).filter((s) => s === 'mastered').length;
  const modules = COURSE_MODULES.map((mod) => ({
    ...mod,
    lessons: mod.lessons.map((l) => ({
      ...l,
      title: l.title,
      status: store.graphNodes[l.title] || 'not_started',
    })),
    progress: {
      mastered: mod.lessons.filter((l) => store.graphNodes[l.title] === 'mastered').length,
      total: mod.lessons.length,
    },
  }));
  const suggestion = store.lastSession.topic
    ? LEARNING_SUGGESTIONS[store.lastSession.topic] || LEARNING_SUGGESTIONS.default
    : LEARNING_SUGGESTIONS.default;

  res.json({
    modules,
    progress: { mastered, total: ALL_LESSON_IDS.length },
    suggestion,
    continueLesson: ALL_LESSON_IDS.find((id) => store.graphNodes[id] === 'learning') || 'RAG 检索增强',
  });
});

app.post('/api/generate-review-mcq', async (req, res) => {
  const { topic, provider = DEFAULT_PROVIDER } = req.body;
  const validation = validateProvider(provider);
  if (!validation.ok) return res.status(400).json({ error: validation.message });
  if (!topic) return res.status(400).json({ error: '缺少 topic' });

  try {
    const raw = await completeChat(provider, '只输出合法 JSON', buildReviewMcqPrompt(topic));
    const parsed = extractJSON(raw);
    if (parsed?.questions?.length >= 2) return res.json({ questions: parsed.questions });
  } catch (err) {
    console.error('review-mcq error:', err.message);
  }
  res.json(getFallbackReviewMcq(topic));
});

app.post('/api/evaluate-review-mcq', async (req, res) => {
  const { topic, answers, questions, provider = DEFAULT_PROVIDER } = req.body;
  if (!topic || !answers || !questions) return res.status(400).json({ error: '缺少参数' });

  let correct = 0;
  const weakPoints = [];
  questions.forEach((q) => {
    const ans = answers.find((a) => a.questionId === q.id);
    if (ans?.selectedId === q.correctId) correct += 1;
    else weakPoints.push(q.question);
  });

  const score = correct / questions.length;
  const passed = score >= 0.6;

  res.json({
    passed,
    score,
    feedback: passed
      ? `回顾通过！${correct}/${questions.length} 题正确，可以开始今天的学习。`
      : `回顾需加强：${correct}/${questions.length} 题正确，建议先复习薄弱点。`,
    weakPoints,
  });
});

app.post('/api/chat', async (req, res) => {
  const { messages, stage, topic, provider = DEFAULT_PROVIDER } = req.body;
  const validation = validateProvider(provider);
  if (!validation.ok) return res.status(400).json({ error: validation.message });
  if (!topic || !stage) return res.status(400).json({ error: '缺少 topic 或 stage' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const system = buildSystemPrompt(stage, topic);
  const normalized = normalizeMessages(messages);
  store.lastSession = { topic, stage, messages: normalized };

  await streamChat(provider, system, normalized, res);
  res.end();
});

app.post('/api/generate-quiz', async (req, res) => {
  const { topic, teachingContent, provider = DEFAULT_PROVIDER } = req.body;
  const validation = validateProvider(provider);
  if (!validation.ok) return res.status(400).json({ error: validation.message });
  if (!topic) return res.status(400).json({ error: '缺少 topic' });

  try {
    const raw = await completeChat(provider, '只输出合法 JSON', buildQuizPrompt(topic, teachingContent || ''));
    const parsed = extractJSON(raw);
    if (parsed?.questions?.length >= 3) return res.json({ questions: parsed.questions.slice(0, 3) });
  } catch (err) {
    console.error('generate-quiz error:', err.message);
  }
  res.json(getFallbackQuiz(topic));
});

app.post('/api/evaluate-answer', async (req, res) => {
  const { question, userAnswer, topic, provider = DEFAULT_PROVIDER } = req.body;
  const validation = validateProvider(provider);
  if (!validation.ok) return res.status(400).json({ error: validation.message });
  if (!question || !userAnswer || !topic) return res.status(400).json({ error: '缺少参数' });

  try {
    const raw = await completeChat(provider, '只输出合法 JSON', buildEvaluatePrompt(topic, question, userAnswer));
    const parsed = extractJSON(raw);
    if (parsed && typeof parsed.score === 'number') {
      return res.json({
        score: Math.min(5, Math.max(1, Math.round(parsed.score))),
        feedback: parsed.feedback || '已完成批改',
        correct: parsed.correct ?? parsed.score >= 3,
      });
    }
  } catch (err) {
    console.error('evaluate-answer error:', err.message);
    return res.status(500).json({ error: err.message });
  }
  res.json({ score: 3, feedback: '已收到答案，建议结合课堂内容复习。', correct: true });
});

app.get('/api/knowledge-base', (_req, res) => {
  const mastered = Object.values(store.graphNodes).filter((s) => s === 'mastered').length;
  const suggestion = store.lastSession.topic
    ? LEARNING_SUGGESTIONS[store.lastSession.topic] || LEARNING_SUGGESTIONS.default
    : LEARNING_SUGGESTIONS.default;

  res.json({
    cards: store.knowledgeCards,
    graphNodes: store.graphNodes,
    topicSlides: store.topicSlides,
    progress: { mastered, total: ALL_LESSON_IDS.length },
    suggestion,
    lastTopic: store.lastSession.topic,
  });
});

app.get('/api/lesson-session', (req, res) => {
  const topic = req.query.topic;
  if (!topic) return res.status(400).json({ error: '缺少 topic' });
  const session = store.lessonSessions[topic] || null;
  res.json({ session });
});

app.post('/api/lesson-session', (req, res) => {
  const {
    topic,
    phaseMessages,
    phasesCompleted,
    currentStage,
    slides,
    teachingContent,
    messages,
    reviewResult,
    quizQuestions,
    quizIndex,
    quizState,
  } = req.body;

  if (!topic) return res.status(400).json({ error: '缺少 topic' });

  store.lessonSessions[topic] = {
    topic,
    phaseMessages: phaseMessages || { review: [], teaching: [], quiz: [] },
    phasesCompleted: phasesCompleted || [],
    currentStage: currentStage || 'review',
    slides: slides || [],
    teachingContent: teachingContent || '',
    messages: messages || [],
    reviewResult: reviewResult || null,
    quizQuestions: quizQuestions || [],
    quizIndex: quizIndex ?? 0,
    quizState: quizState || { answers: {} },
    updatedAt: new Date().toISOString(),
  };

  res.json({ success: true, session: store.lessonSessions[topic] });
});

app.post('/api/knowledge-base', async (req, res) => {
  const { topic, stars, teachingContent, slides, provider = DEFAULT_PROVIDER } = req.body;
  if (!topic) return res.status(400).json({ error: '缺少 topic' });

  if (slides?.length) saveTopicSlides(topic, slides);

  let memoryPoints = [`${topic} 的核心原理需结合项目实践`, '建议阅读官方文档加深理解', '多做练习巩固'];
  try {
    if (validateProvider(provider).ok && teachingContent) {
      const raw = await completeChat(provider, '只输出 JSON', buildMemoryPointsPrompt(topic, teachingContent, stars || 3));
      const parsed = extractJSON(raw);
      if (parsed?.memoryPoints?.length >= 3) memoryPoints = parsed.memoryPoints.slice(0, 3);
    }
  } catch (err) {
    console.error('memory points error:', err.message);
  }

  const status = (stars || 3) >= 4 ? 'mastered' : 'learning';
  const existing = store.knowledgeCards.find((c) => c.nodeName === topic);
  if (existing) {
    Object.assign(existing, { stars: stars || existing.stars, studyTime: new Date().toISOString().slice(0, 10), memoryPoints, status });
  } else {
    store.knowledgeCards.unshift({
      id: `card-${Date.now()}`, nodeName: topic, stars: stars || 3,
      studyTime: new Date().toISOString().slice(0, 10), memoryPoints, status,
    });
  }
  if (store.graphNodes[topic] !== undefined) store.graphNodes[topic] = status;

  res.json({ success: true, card: store.knowledgeCards.find((c) => c.nodeName === topic) });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  NeuraLearn 已启动 → http://localhost:${PORT}`);
  console.log(`  默认 AI: ${DEFAULT_PROVIDER}\n`);
});
