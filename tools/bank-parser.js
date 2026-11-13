/**
 * bank-parser.js —— 题库 note 解析工具（构建期使用，不参与网页运行）
 * 负责：解析 cloze 词库与短文、切分 A–F / Passage 原文、补齐候选词库
 */

/** 合成候选词库时排除的常见虚词 */
const STOP_WORDS = ('the and for that with this from have has had they their them there what when where which ' +
  'will would can could should about into than then them these those your you our we his her its not but ' +
  'are was were been being does did doing also more most some such only very much many other another over ' +
  'because while after before between during under above each every both few all any who whom whose how').split(' ');

/**
 * 从 cloze section 的 note 中提取 A–O 词库与选词填空短文
 * note 是纯文本，格式为「词库：A. xxx ... 短文：第 26 空...」
 */
function parseClozeNote(note) {
  const text = String(note || '');
  const bank = [];
  const pattern = /^\s*([A-O])[.、]\s*(.+?)\s*$/gm;
  let matched = pattern.exec(text);
  let bankEnd = 0;
  while (matched !== null) {
    bank.push({ letter: matched[1], word: matched[2].trim() });
    bankEnd = pattern.lastIndex;
    matched = pattern.exec(text);
  }
  bank.sort(function (a, b) { return a.letter.localeCompare(b.letter); });
  // 短文可能带「短文：」标记，也可能紧跟在词库之后，两种格式都兼容
  const passage = text.slice(bankEnd)
    .replace(/^\s*/, '')
    .replace(/^短文\s*[:：]\s*/, '')
    .trim();
  return { wordbank: bank.map(function (item) { return item.word; }), passage: passage };
}

/**
 * 真题风格卷的 cloze 段未提供候选词库时，用答案词 + 短文里的实词合成 15 词词库
 * 词库按字母排序，既不泄露答案，也保留「从候选中选词」的作答方式
 */
function deriveClozeBank(passage, answers) {
  const answerSet = {};
  const picked = [];
  answers.forEach(function (word) {
    const clean = String(word || '').trim().toLowerCase();
    if (!clean || answerSet[clean]) return;
    answerSet[clean] = true;
    picked.push(clean);
  });
  const used = Object.assign({}, answerSet);
  const words = String(passage || '').toLowerCase().match(/[a-z]{4,12}/g) || [];
  for (let i = 0; i < words.length && picked.length < 15; i += 1) {
    const word = words[i];
    if (used[word] || STOP_WORDS.indexOf(word) >= 0) continue;
    used[word] = true;
    picked.push(word);
  }
  return picked.sort();
}

/**
 * 按「Paragraph A:」「Passage 1:」这类标记切分原文
 * 返回 [{ key, text }]，未匹配到任何标记时返回空数组
 */
function splitByLabel(note, label) {
  const text = String(note || '');
  const pattern = new RegExp(label + '\\s+([A-Z0-9]+)\\s*[:：]', 'g');
  const marks = [];
  let matched = pattern.exec(text);
  while (matched !== null) {
    marks.push({ key: matched[1], start: matched.index, contentStart: pattern.lastIndex });
    matched = pattern.exec(text);
  }
  return marks.map(function (mark, index) {
    const end = index + 1 < marks.length ? marks[index + 1].start : text.length;
    return { key: mark.key, text: text.slice(mark.contentStart, end).trim() };
  }).filter(function (item) { return item.text.length > 0; });
}

module.exports = {
  parseClozeNote: parseClozeNote,
  deriveClozeBank: deriveClozeBank,
  splitByLabel: splitByLabel
};
