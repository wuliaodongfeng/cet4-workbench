/**
 * seed.js —— 首次运行时写入的示例数据
 * 20 个 CET-4 高频词 + 10 道单选题（分属 2 套示例卷）
 */
window.SEED = (function () {
  /**
   * 取下本地日期字符串 YYYY-MM-DD，示例词卡当天即可复习
   */
  function todayStr() {
    const now = new Date();
    const pad = function (value) {
      return value < 10 ? '0' + value : '' + value;
    };
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  const dueDate = todayStr();

  const rawWords = [
    { word: 'abandon', phonetic: '/əˈbændən/', meaning: 'v. 放弃；抛弃', example: 'They had to abandon the project because of the heavy rain.' },
    { word: 'abundant', phonetic: '/əˈbʌndənt/', meaning: 'adj. 丰富的，充裕的', example: 'The region is abundant in natural resources.' },
    { word: 'accurate', phonetic: '/ˈækjərət/', meaning: 'adj. 准确的，精确的', example: 'Please give me an accurate description of the accident.' },
    { word: 'adapt', phonetic: '/əˈdæpt/', meaning: 'v. 适应；改编', example: 'It took her a week to adapt to the new schedule.' },
    { word: 'adequate', phonetic: '/ˈædɪkwət/', meaning: 'adj. 足够的，适当的', example: 'The hall provides adequate space for two hundred people.' },
    { word: 'alternative', phonetic: '/ɔːlˈtɜːnətɪv/', meaning: 'n. 替代方案 adj. 可替代的', example: 'We need an alternative plan in case the first one fails.' },
    { word: 'analyze', phonetic: '/ˈænəlaɪz/', meaning: 'v. 分析', example: 'Scientists analyze the data before drawing a conclusion.' },
    { word: 'assume', phonetic: '/əˈsjuːm/', meaning: 'v. 假定；承担', example: 'You should not assume that everyone agrees with you.' },
    { word: 'benefit', phonetic: '/ˈbenɪfɪt/', meaning: 'n. 益处 v. 使受益', example: 'Regular exercise brings great benefit to your health.' },
    { word: 'capable', phonetic: '/ˈkeɪpəbl/', meaning: 'adj. 有能力的，能胜任的', example: 'She is capable of handling the task on her own.' },
    { word: 'challenge', phonetic: '/ˈtʃælɪndʒ/', meaning: 'n. 挑战 v. 向……挑战', example: 'Learning a new language is a real challenge for adults.' },
    { word: 'commit', phonetic: '/kəˈmɪt/', meaning: 'v. 承诺；犯（错误）', example: 'He refused to commit himself to a final answer.' },
    { word: 'conclude', phonetic: '/kənˈkluːd/', meaning: 'v. 断定；结束', example: 'The report concludes that the new policy has worked.' },
    { word: 'consequence', phonetic: '/ˈkɒnsɪkwəns/', meaning: 'n. 结果，后果', example: 'He had to face the consequence of his own decision.' },
    { word: 'consume', phonetic: '/kənˈsjuːm/', meaning: 'v. 消耗；消费', example: 'Modern cars consume much less fuel than before.' },
    { word: 'contribute', phonetic: '/kənˈtrɪbjuːt/', meaning: 'v. 贡献；促成', example: 'Everyone is expected to contribute to the success of the team.' },
    { word: 'decline', phonetic: '/dɪˈklaɪn/', meaning: 'v./n. 下降；婉拒', example: 'Sales showed a sharp decline in the last quarter.' },
    { word: 'efficient', phonetic: '/ɪˈfɪʃnt/', meaning: 'adj. 高效的', example: 'The new system is far more efficient than the old one.' },
    { word: 'emphasize', phonetic: '/ˈemfəsaɪz/', meaning: 'v. 强调', example: 'The teacher emphasized the importance of daily practice.' },
    { word: 'essential', phonetic: '/ɪˈsenʃl/', meaning: 'adj. 必要的；本质的', example: 'Clean water is essential to human health.' }
  ];

  // 高频词标记：用于背词页「高频」范围筛选，其余词只标 CET4
  const highWords = ['abandon', 'adapt', 'benefit', 'challenge', 'contribute', 'decline', 'efficient', 'essential'];

  const words = rawWords.map(function (item, index) {
    const serial = index + 1 < 10 ? '0' + (index + 1) : '' + (index + 1);
    return {
      id: 'w' + serial,
      word: item.word,
      phonetic: item.phonetic,
      meaning: item.meaning,
      example: item.example,
      tags: highWords.indexOf(item.word) >= 0 ? ['cet4', 'high'] : ['cet4'],
      fsrs: {
        stability: 0,
        difficulty: 5,
        due: dueDate,
        reps: 0,
        lapses: 0,
        state: 'new'
      }
    };
  });

  const questions = [
    {
      id: 'demo-1-q1',
      paperId: 'demo-1',
      type: 'single',
      stem: 'The company decided to ______ the plan because of the heavy rain.',
      options: ['abandon', 'abundant', 'accurate', 'adapt'],
      answer: 'A',
      explanation: 'abandon 意为“放弃”，与“因大雨而放弃计划”的语境一致。'
    },
    {
      id: 'demo-1-q2',
      paperId: 'demo-1',
      type: 'single',
      stem: 'The report gives an ______ description of the accident.',
      options: ['abandon', 'abundant', 'accurate', 'adequate'],
      answer: 'C',
      explanation: 'accurate 意为“准确的”，修饰 description 表示“准确的描述”。'
    },
    {
      id: 'demo-1-q3',
      paperId: 'demo-1',
      type: 'single',
      stem: 'It took the students a week to ______ to the new schedule.',
      options: ['adopt', 'adapt', 'adjust', 'arrange'],
      answer: 'B',
      explanation: 'adapt to 是固定搭配，表示“适应”，故填 adapt。'
    },
    {
      id: 'demo-1-q4',
      paperId: 'demo-1',
      type: 'single',
      stem: 'We need an ______ plan in case the first one fails.',
      options: ['adequate', 'abundant', 'alternative', 'accurate'],
      answer: 'C',
      explanation: 'alternative plan 表示“备选方案”，符合 in case 的假设语境。'
    },
    {
      id: 'demo-1-q5',
      paperId: 'demo-1',
      type: 'single',
      stem: 'Please ______ the data carefully before you draw a conclusion.',
      options: ['announce', 'assume', 'analyze', 'approach'],
      answer: 'C',
      explanation: 'analyze the data 表示“分析数据”，与 draw a conclusion 搭配自然。'
    },
    {
      id: 'demo-2-q1',
      paperId: 'demo-2',
      type: 'single',
      stem: 'You should not ______ that everyone agrees with you.',
      options: ['assume', 'consume', 'conclude', 'commit'],
      answer: 'A',
      explanation: 'assume 意为“假定、想当然”，与后文从句搭配符合句意。'
    },
    {
      id: 'demo-2-q2',
      paperId: 'demo-2',
      type: 'single',
      stem: 'Modern industry ______ a large amount of energy every year.',
      options: ['contributes', 'consumes', 'declines', 'emphasizes'],
      answer: 'B',
      explanation: 'consume energy 表示“消耗能源”，主语为 industry 时用第三人称单数。'
    },
    {
      id: 'demo-2-q3',
      paperId: 'demo-2',
      type: 'single',
      stem: 'Everyone is expected to ______ to the success of the team.',
      options: ['consume', 'conclude', 'contribute', 'declare'],
      answer: 'C',
      explanation: 'contribute to 表示“为……做贡献”，是固定搭配。'
    },
    {
      id: 'demo-2-q4',
      paperId: 'demo-2',
      type: 'single',
      stem: 'The government has ______ the importance of environmental protection.',
      options: ['declined', 'abandoned', 'adapted', 'emphasized'],
      answer: 'D',
      explanation: 'emphasize the importance of 表示“强调……的重要性”。'
    },
    {
      id: 'demo-2-q5',
      paperId: 'demo-2',
      type: 'single',
      stem: 'Clean water is ______ to human health.',
      options: ['efficient', 'essential', 'adequate', 'ordinary'],
      answer: 'B',
      explanation: 'be essential to 表示“对……必不可少”，符合句意。'
    }
  ];

  return { words: words, questions: questions };
})();

// DONE: seed.js
