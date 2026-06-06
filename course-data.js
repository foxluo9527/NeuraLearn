/**
 * AI 应用开发 — 课程结构（server 与前端共享数据源，前端通过 GET /api/course 获取）
 */
const COURSE_MODULES = [
  {
    id: 'm1',
    title: 'AI 基础',
    color: '#4f9eff',
    icon: 'brain',
    lessons: [
      { id: 'prompt-engineering', title: 'Prompt 工程', duration: '25 min' },
      { id: 'token-context', title: 'Token 与上下文', duration: '20 min' },
      { id: 'model-selection', title: '模型选型', duration: '20 min' },
    ],
  },
  {
    id: 'm2',
    title: '应用架构',
    color: '#8b5cf6',
    icon: 'layers',
    lessons: [
      { id: 'rag', title: 'RAG 检索增强', duration: '30 min' },
      { id: 'embedding', title: 'Embedding 原理', duration: '25 min' },
      { id: 'vector-db', title: '向量数据库', duration: '25 min' },
    ],
  },
  {
    id: 'm3',
    title: 'Agent 开发',
    color: '#22c55e',
    icon: 'agent',
    lessons: [
      { id: 'function-calling', title: 'Function Calling', duration: '25 min' },
      { id: 'react-agent', title: 'ReAct Agent', duration: '30 min' },
      { id: 'multi-agent', title: '多 Agent 协作', duration: '30 min' },
    ],
  },
  {
    id: 'm4',
    title: '生产实践',
    color: '#f59e0b',
    icon: 'rocket',
    lessons: [
      { id: 'cost-latency', title: '成本与延迟优化', duration: '20 min' },
      { id: 'safety-guardrails', title: '安全护栏', duration: '25 min' },
      { id: 'eval-metrics', title: '效果评估', duration: '25 min' },
    ],
  },
];

const TOPIC_META = {
  'Prompt 工程': { prerequisites: '大语言模型基本概念、ChatGPT 使用经验', module: 'm1', reviewTopic: 'LLM 基础' },
  'Token 与上下文': { prerequisites: 'Prompt 工程、文本分词概念', module: 'm1', reviewTopic: 'Prompt 工程' },
  '模型选型': { prerequisites: 'Token 与上下文、常见模型对比', module: 'm1', reviewTopic: 'Token 与上下文' },
  'RAG 检索增强': { prerequisites: 'Embedding 基本概念、向量相似度', module: 'm2', reviewTopic: 'Prompt 工程' },
  'Embedding 原理': { prerequisites: '线性代数基础、词向量概念', module: 'm2', reviewTopic: 'RAG 检索增强' },
  '向量数据库': { prerequisites: 'Embedding 原理、RAG 流程', module: 'm2', reviewTopic: 'Embedding 原理' },
  'Function Calling': { prerequisites: 'OpenAI API 基础、JSON Schema', module: 'm3', reviewTopic: 'RAG 检索增强' },
  'ReAct Agent': { prerequisites: 'Function Calling、Chain-of-Thought', module: 'm3', reviewTopic: 'Function Calling' },
  '多 Agent 协作': { prerequisites: 'ReAct Agent、任务分解', module: 'm3', reviewTopic: 'ReAct Agent' },
  '成本与延迟优化': { prerequisites: '模型选型、缓存策略', module: 'm4', reviewTopic: '模型选型' },
  '安全护栏': { prerequisites: 'Prompt 注入攻击概念、内容审核', module: 'm4', reviewTopic: 'Prompt 工程' },
  '效果评估': { prerequisites: 'RAG 评估指标、A/B 测试', module: 'm4', reviewTopic: 'RAG 检索增强' },
};

const ALL_LESSON_IDS = COURSE_MODULES.flatMap((m) => m.lessons.map((l) => l.title));

const LEARNING_SUGGESTIONS = {
  'RAG 检索增强': { next: 'Embedding 原理', reason: '深入理解 Embedding 能帮你优化 RAG 检索质量' },
  'Prompt 工程': { next: 'Token 与上下文', reason: '掌握 Prompt 后，理解 Token 限制是构建长上下文应用的关键' },
  'Function Calling': { next: 'ReAct Agent', reason: 'Function Calling 是构建 Agent 的核心能力' },
  default: { next: 'RAG 检索增强', reason: 'RAG 是 AI 应用开发最实用的架构模式之一' },
};

const INITIAL_GRAPH_NODES = {
  'Prompt 工程': 'mastered',
  'Token 与上下文': 'mastered',
  '模型选型': 'learning',
  'RAG 检索增强': 'learning',
  'Embedding 原理': 'not_started',
  '向量数据库': 'not_started',
  'Function Calling': 'not_started',
  'ReAct Agent': 'not_started',
  '多 Agent 协作': 'not_started',
  '成本与延迟优化': 'not_started',
  '安全护栏': 'not_started',
  '效果评估': 'not_started',
};

const INITIAL_KNOWLEDGE_CARDS = [
  {
    id: 'card-1',
    nodeName: 'Prompt 工程',
    stars: 5,
    studyTime: '2025-05-28',
    memoryPoints: [
      'System/User/Assistant 三层结构：System 定角色，User 给任务，Assistant 输出',
      'Few-shot：在 Prompt 中提供 2-3 个示例可显著提升输出质量',
      'Chain-of-Thought：要求模型「一步步思考」可提升复杂推理准确率',
    ],
    status: 'mastered',
  },
  {
    id: 'card-2',
    nodeName: 'Token 与上下文',
    stars: 4,
    studyTime: '2025-06-01',
    memoryPoints: [
      'Token 是模型处理文本的最小单位，中英文 token 比例约 1:1.5~2',
      '上下文窗口 = 输入 + 输出 token 总和，超出会被截断',
      '长上下文策略：摘要压缩、RAG 外挂、滑动窗口',
    ],
    status: 'mastered',
  },
  {
    id: 'card-3',
    nodeName: 'RAG 检索增强',
    stars: 3,
    studyTime: '2025-06-04',
    memoryPoints: [
      'RAG = Retrieve + Augment + Generate，解决 LLM 知识过时问题',
      '检索质量取决于 Embedding 模型和 chunk 切分策略',
      'Hybrid Search：向量检索 + 关键词检索可提升召回率',
    ],
    status: 'learning',
  },
  {
    id: 'card-4',
    nodeName: 'Embedding 原理',
    stars: 4,
    studyTime: '2025-06-02',
    memoryPoints: [
      'Embedding 将文本映射到高维向量空间，语义相近的文本向量距离更近',
      '余弦相似度是最常用的向量比较方法',
      'Matryoshka Embedding 支持多粒度检索，平衡精度与速度',
    ],
    status: 'mastered',
  },
];

const FALLBACK_REVIEW_MCQ = {
  'RAG 检索增强': [
    {
      id: 1,
      question: 'RAG 架构中，检索（Retrieve）步骤的主要作用是？',
      options: [
        { id: 'A', text: '微调大模型参数' },
        { id: 'B', text: '从知识库中找到与问题相关的文档片段' },
        { id: 'C', text: '生成最终的回答文本' },
        { id: 'D', text: '压缩上下文窗口' },
      ],
      correctId: 'B',
    },
    {
      id: 2,
      question: '以下哪种情况最适合使用 RAG 而非 Fine-tuning？',
      options: [
        { id: 'A', text: '需要模型学习全新的推理能力' },
        { id: 'B', text: '知识库频繁更新，需要实时获取最新信息' },
        { id: 'C', text: '需要改变模型的对话风格' },
        { id: 'D', text: '训练数据量超过 100 万条' },
      ],
      correctId: 'B',
    },
    {
      id: 3,
      question: 'Embedding 在 RAG 流程中的核心作用是？',
      options: [
        { id: 'A', text: '将文本转换为向量，支持语义相似度检索' },
        { id: 'B', text: '压缩文档减少 token 消耗' },
        { id: 'C', text: '过滤有害内容' },
        { id: 'D', text: '生成摘要' },
      ],
      correctId: 'A',
    },
  ],
};

function getLessonByTitle(title) {
  for (const mod of COURSE_MODULES) {
    const lesson = mod.lessons.find((l) => l.title === title);
    if (lesson) return { ...lesson, module: mod };
  }
  return null;
}

function getFallbackReviewMcq(topic) {
  if (FALLBACK_REVIEW_MCQ[topic]) return { questions: FALLBACK_REVIEW_MCQ[topic] };
  const meta = TOPIC_META[topic];
  const prereq = meta?.prerequisites || 'AI 基础知识';
  return {
    questions: [
      {
        id: 1,
        question: `学习「${topic}」前，以下哪项属于其前置知识？`,
        options: [
          { id: 'A', text: prereq.split('、')[0] || '基础概念' },
          { id: 'B', text: '与课程无关的内容' },
          { id: 'C', text: '高级部署运维' },
          { id: 'D', text: '图形渲染原理' },
        ],
        correctId: 'A',
      },
      {
        id: 2,
        question: `「${topic}」在 AI 应用开发中的主要价值是？`,
        options: [
          { id: 'A', text: '提升应用智能化能力' },
          { id: 'B', text: '替代所有传统编程' },
          { id: 'C', text: '仅用于数据可视化' },
          { id: 'D', text: '与 AI 无关' },
        ],
        correctId: 'A',
      },
    ],
  };
}

module.exports = {
  COURSE_MODULES,
  TOPIC_META,
  ALL_LESSON_IDS,
  LEARNING_SUGGESTIONS,
  INITIAL_GRAPH_NODES,
  INITIAL_KNOWLEDGE_CARDS,
  FALLBACK_REVIEW_MCQ,
  getLessonByTitle,
  getFallbackReviewMcq,
};
