/**
 * build-content.js —— 一次性内容转换脚本（开发期使用，不参与网页运行）
 * 输入：三个 GitHub 项目的数据文件（已下载到系统临时目录）
 * 输出：data/content-words.js、data/content-questions.js
 *
 * 数据来源：
 *   WordRush  https://github.com/Box611/wordrush（MIT）四级大纲 4540 词 + 466 精选词
 *   TypeWords https://github.com/zyronon/TypeWords（GPL-3.0）四级词库例句与补充词条
 *   exam-practice https://github.com/cypher-yht/dsh-plugins-exam-practice（MIT）10 套模拟卷 + 6 套真题风格卷
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const bankParser = require('./bank-parser');
const parseClozeNote = bankParser.parseClozeNote;
const deriveClozeBank = bankParser.deriveClozeBank;
const splitByLabel = bankParser.splitByLabel;

const TEMP = process.env.TEMP;
const ROOT = path.resolve(__dirname, '..');
const CONTENT_VERSION = 5;

/** 在隔离沙箱中执行 window 挂载型数据脚本，取回 window */
function loadWindowScript(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return sandbox.window;
}

/** 生成稳定的词条 id：w-<小写单词，非字母数字转连字符> */
function wordId(word) {
  const slug = String(word).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return 'w-' + (slug || 'word');
}

/** 去掉选项自带的 "A. " 前缀，避免页面重复显示字母 */
function stripOption(text) {
  return String(text).replace(/^\s*[A-H][.、)]\s*/, '').trim();
}

/** 把 TypeWords 的词条释义拼成中文串 */
function typeWordsMeaning(item) {
  const list = Array.isArray(item.trans) ? item.trans : [];
  const parts = list.map(function (one) {
    const pos = one.pos ? one.pos + ' ' : '';
    return pos + String(one.cn || '').trim();
  }).filter(Boolean);
  return parts.join('；');
}

/** 把 TypeWords 的第一条例句拼成 "英文 中文" */
function typeWordsExample(item) {
  const list = Array.isArray(item.sentences) ? item.sentences : [];
  if (!list.length) return '';
  const first = list[0] || {};
  return (String(first.c || '').trim() + ' ' + String(first.cn || '').trim()).trim();
}

/** 构建合并后的词库：WordRush 为主，TypeWords 补充例句与独有词条 */
function buildWords() {
  const wordrush = loadWindowScript(path.join(TEMP, 'wordrush-cet4.js'));
  const curated = loadWindowScript(path.join(TEMP, 'wordrush-cet4-curated.js'));
  const fullItems = wordrush.ET.DATA.cet4full.items;
  const curatedItems = curated.ET.DATA.cet4.items;
  const typeWords = JSON.parse(fs.readFileSync(path.join(TEMP, 'CET4_T.json'), 'utf8'));

  const highSet = {};
  curatedItems.forEach(function (item) {
    highSet[String(item[0]).toLowerCase()] = true;
  });

  const typeMap = {};
  typeWords.forEach(function (item) {
    if (item && item.word) typeMap[String(item.word).toLowerCase()] = item;
  });

  const words = [];
  const seen = {};
  fullItems.forEach(function (item) {
    const word = String(item[0] || '').trim();
    if (!word) return;
    const key = word.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    const typeItem = typeMap[key];
    const example = typeItem ? typeWordsExample(typeItem) : '';
    const phonetic = String(item[2] || '').trim();
    words.push({
      id: wordId(word),
      word: word,
      phonetic: phonetic ? '/' + phonetic + '/' : '',
      meaning: String(item[1] || '').trim(),
      example: example,
      tags: highSet[key] ? ['cet4', 'high'] : ['cet4'],
      sources: example ? ['wordrush', 'typewords'] : ['wordrush'],
      exampleSource: example ? 'typewords' : ''
    });
  });

  let typeOnly = 0;
  typeWords.forEach(function (item) {
    const word = String(item.word || '').trim();
    if (!word) return;
    const key = word.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    typeOnly += 1;
    const phonetic = String(item.phonetic0 || item.phonetic1 || '').trim();
    words.push({
      id: wordId(word),
      word: word,
      phonetic: phonetic ? '/' + phonetic + '/' : '',
      meaning: typeWordsMeaning(item) || '暂无释义',
      example: typeWordsExample(item),
      tags: ['cet4'],
      sources: ['typewords'],
      exampleSource: typeWordsExample(item) ? 'typewords' : ''
    });
  });

  return { words: words, stats: { wordrush: fullItems.length, curated: curatedItems.length, typewords: typeWords.length, typeOnly: typeOnly } };
}

/**
 * 构建题库：只取 cloze / matching / reading 三类客观题，跳过听力与主观题
 * 同时收集写作与翻译题面，供「我的」页静态资料使用
 */
function buildQuestions() {
  const bankDir = path.join(TEMP, 'cet4-bank');
  const files = fs.readdirSync(bankDir).filter(function (name) {
    return /^cet4-(mock-\d+|real-[\d-]+)\.json$/.test(name);
  }).sort();

  const questions = [];
  const papers = [];
  const writing = [];
  const translation = [];

  files.forEach(function (name) {
    const data = JSON.parse(fs.readFileSync(path.join(bankDir, name), 'utf8'));
    (data.papers || []).forEach(function (paper) {
      const paperId = 'src-exam-' + paper.id;
      // 写作 / 翻译只取题面与参考范文，不做自动批改
      (paper.sections || []).forEach(function (section) {
        if (section.id !== 'writing' && section.id !== 'translation') return;
        const entry = {
          paperId: paperId,
          title: String(paper.title || '').replace('大学英语四级真题风格卷（原创题面）', '四级真题风格卷'),
          prompt: String(section.prompt || '').trim(),
          promptZh: String(section.promptZh || '').trim(),
          reference: String(section.reference || '').trim()
        };
        if (!entry.reference) return;
        if (section.id === 'writing') writing.push(entry);
        else translation.push(entry);
      });
      // 试卷级附加信息：选词填空词库 + 各 section 的阅读材料
      const paperRecord = {
        id: paperId,
        title: String(paper.title || name),
        total: 0,
        wordbank: [],
        materials: {}
      };

      (paper.sections || []).forEach(function (section) {
        if (['cloze', 'matching', 'reading'].indexOf(section.id) < 0) return;
        const note = String(section.note || '');

        if (section.id === 'cloze') {
          const cloze = parseClozeNote(note);
          if (cloze.wordbank.length) paperRecord.wordbank = cloze.wordbank;
          if (cloze.passage) paperRecord.materials.cloze = cloze.passage;
        } else if (section.id === 'matching') {
          const paragraphs = splitByLabel(note, 'Paragraph');
          if (paragraphs.length) paperRecord.materials.matching = paragraphs;
        } else if (section.id === 'reading') {
          const passages = splitByLabel(note, 'Passage');
          if (passages.length) paperRecord.materials.reading = passages;
        }

        (section.questions || []).forEach(function (question) {
          if (!question || !question.stem) return;
          const type = question.kind === 'blank' ? 'blank' : 'single';
          const options = Array.isArray(question.options)
            ? question.options.map(stripOption).filter(Boolean)
            : [];
          if (type === 'single' && options.length < 2) return;
          questions.push({
            id: paperId + '-' + section.id + '-' + question.id,
            paperId: paperId,
            type: type,
            stem: String(question.stem).trim(),
            options: options,
            answer: String(question.answer || '').trim(),
            explanation: String(question.explanation || '暂无解析').trim(),
            source: 'exam-practice'
          });
          paperRecord.total += 1;
        });
      });

      // 真题风格卷若未给候选词库，用答案词与短文实词合成，保证题目可作答
      if (!paperRecord.wordbank.length && paperRecord.materials.cloze) {
        const answers = questions.filter(function (item) {
          return item.paperId === paperId && item.type === 'blank';
        }).map(function (item) { return item.answer; });
        paperRecord.wordbank = deriveClozeBank(paperRecord.materials.cloze, answers);
      }

      papers.push(paperRecord);
    });
  });

  return { questions: questions, papers: papers, writing: writing, translation: translation };
}

/** 按每行固定条数输出，既控制文件体积也保证 JS 文件行数不超过 300 */
function writeWordsFile(words) {
  const lines = [
    '/**',
    ' * content-words.js —— 内置词库（由 tools/build-content.js 生成，请勿手改）',
    ' * 来源：WordRush（MIT）四级大纲词库；例句补充自 TypeWords（GPL-3.0）',
    ' */',
    'window.CONTENT = window.CONTENT || {};',
    'window.CONTENT.version = ' + CONTENT_VERSION + ';',
    'window.CONTENT.wordStats = ' + JSON.stringify(buildStats(words)) + ';',
    'window.CONTENT.words = ['
  ];
  const perLine = 20;
  for (let i = 0; i < words.length; i += perLine) {
    lines.push(words.slice(i, i + perLine).map(function (item) {
      return JSON.stringify(item);
    }).join(',') + (i + perLine < words.length ? ',' : ''));
  }
  lines.push('];');
  fs.writeFileSync(path.join(ROOT, 'data', 'content-words.js'), lines.join('\n') + '\n', 'utf8');
  return lines.length;
}

/** 统计各来源词条数，供「我的」页展示 */
function buildStats(words) {
  const stats = { wordrush: 0, typewords: 0, high: 0, example: 0 };
  words.forEach(function (item) {
    if (item.sources.indexOf('wordrush') >= 0) stats.wordrush += 1;
    if (item.sources.indexOf('typewords') >= 0) stats.typewords += 1;
    if (item.tags.indexOf('high') >= 0) stats.high += 1;
    if (item.example) stats.example += 1;
  });
  return stats;
}

/** 输出题库文件，每行一道题 */
function writeQuestionsFile(result) {
  const lines = [
    '/**',
    ' * content-questions.js —— 内置题库（由 tools/build-content.js 生成，请勿手改）',
    ' * 来源：exam-practice（MIT）10 套模拟卷 + 6 套真题风格卷的 cloze / matching / reading 客观题',
    ' */',
    'window.CONTENT = window.CONTENT || {};',
    'window.CONTENT.papers = ' + JSON.stringify(result.papers) + ';',
    'window.CONTENT.questions = ['
  ];
  result.questions.forEach(function (item, index) {
    lines.push(JSON.stringify(item) + (index < result.questions.length - 1 ? ',' : ''));
  });
  lines.push('];');
  fs.writeFileSync(path.join(ROOT, 'data', 'content-questions.js'), lines.join('\n') + '\n', 'utf8');
  return lines.length;
}

/** 输出写作 / 翻译静态资料，每行一篇 */
function writeWritingFile(result) {
  const lines = [
    '/**',
    ' * content-writing.js —— 写作与翻译题面 + 参考范文（由 tools/build-content.js 生成，请勿手改）',
    ' * 来源：exam-practice（MIT）真题风格卷，仅作静态参考，不做自动批改',
    ' */',
    'window.CONTENT = window.CONTENT || {};',
    'window.CONTENT.writing = ['
  ];
  result.writing.forEach(function (item, index) {
    lines.push(JSON.stringify(item) + (index < result.writing.length - 1 ? ',' : ''));
  });
  lines.push('];');
  lines.push('window.CONTENT.translation = [');
  result.translation.forEach(function (item, index) {
    lines.push(JSON.stringify(item) + (index < result.translation.length - 1 ? ',' : ''));
  });
  lines.push('];');
  fs.writeFileSync(path.join(ROOT, 'data', 'content-writing.js'), lines.join('\n') + '\n', 'utf8');
  return lines.length;
}

const wordResult = buildWords();
const questionResult = buildQuestions();
const wordLines = writeWordsFile(wordResult.words);
const questionLines = writeQuestionsFile(questionResult);
const writingLines = writeWritingFile(questionResult);

process.stdout.write('词条：' + wordResult.words.length + '（WordRush ' + wordResult.stats.wordrush +
  ' · TypeWords ' + wordResult.stats.typewords + ' · 高频 ' + buildStats(wordResult.words).high + '）\n');
process.stdout.write('题目：' + questionResult.questions.length + '，试卷：' + questionResult.papers.length +
  '，写作：' + questionResult.writing.length + '，翻译：' + questionResult.translation.length + '\n');
process.stdout.write('content-words.js 行数：' + wordLines + '\n');
process.stdout.write('content-questions.js 行数：' + questionLines + '\n');
process.stdout.write('content-writing.js 行数：' + writingLines + '\n');
