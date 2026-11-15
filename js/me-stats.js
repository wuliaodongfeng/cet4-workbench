/**
 * me-stats.js —— 「我的」页统计面板与静态备考资料
 * 统计口径：词汇覆盖率、近 7 天正确率、连续打卡；资料来自内置真题风格卷题干与参考范文
 */
window.MeStats = (function () {
  /**
   * 学习统计：覆盖率进度条 + 近 7 天正确率柱状图
   */
  function renderOverview(summary) {
    const coverage = summary.coverage;
    const week = summary.week;
    // 刚开始学时覆盖率不足 1%，保留两位小数，避免一直显示 0%
    const coverageText = coverage.learned && coverage.percent < 1
      ? (coverage.learned / coverage.total * 100).toFixed(2) + '%'
      : coverage.percent + '%';
    const barWidth = coverage.learned && coverage.percent < 1 ? 1 : coverage.percent;
    const bars = summary.days.map(function (day) {
      const height = day.total ? Math.max(6, day.percent) : 4;
      const cls = day.total ? '' : ' is-empty';
      return '<div class="trend-col' + cls + '" title="' + day.date + '：' +
        (day.total ? day.correct + '/' + day.total + ' 题' : '未作答') + '">' +
        '<span class="trend-bar"><i style="height:' + height + '%"></i></span>' +
        '<span class="trend-label">' + day.label + '</span></div>';
    }).join('');

    return [
      '<div class="panel">',
      '  <div class="panel-head"><h3>学习统计</h3><span class="panel-tag">连续打卡 ' + summary.streak + ' 天</span></div>',
      '  <div class="coverage">',
      '    <div class="coverage-head"><span>词汇覆盖率</span><b>' + coverageText + '</b></div>',
      '    <div class="coverage-bar"><span style="width:' + barWidth + '%"></span></div>',
      '    <p class="panel-note">已学 ' + coverage.learned + ' / ' + coverage.total + ' 词，按 FSRS 复习过即计入</p>',
      '  </div>',
      '  <div class="trend">',
      '    <div class="coverage-head"><span>近 7 天正确率</span><b>' + (week.total ? week.percent + '%' : '—') + '</b></div>',
      '    <div class="trend-chart">' + bars + '</div>',
      '    <p class="panel-note">近 7 天共作答 ' + week.total + ' 题，答对 ' + week.correct + ' 题</p>',
      '  </div>',
      '</div>'
    ].join('');
  }

  /**
   * 复习强度：切换目标保持率 90% / 85%
   */
  function renderRetention() {
    const current = FSRS.getRetention();
    return [
      '<div class="panel">',
      '  <div class="panel-head"><h3>复习强度</h3><span class="panel-tag">目标保持率 ' + Math.round(current * 100) + '%</span></div>',
      '  <p class="panel-text">保持率越高，复习越频繁、记得越牢；修改后只影响之后的排期，已排好的到期日不变。</p>',
      '  <div class="chip-row">',
      '    <button class="chip' + (current === 0.9 ? ' is-active' : '') + '" type="button" data-action="retention" data-value="0.9">90%（稳，推荐）</button>',
      '    <button class="chip' + (current === 0.85 ? ' is-active' : '') + '" type="button" data-action="retention" data-value="0.85">85%（省时，间隔更长）</button>',
      '  </div>',
      '</div>'
    ].join('');
  }

  /**
   * 范文重点标注（单趟分词器）：
   * 1) 段首句（主题句）加浅黄底高亮；
   * 2) 逻辑连接词短语标蓝（优先整短语匹配，避免被点词包裹破坏）；
   * 3) 其余单词走点词翻译（wt-word），未收录词加生词下划线（wt-hard）。
   * 全程先取原文再转义，受控 span 包裹，不会破坏页面结构。
   */
  function renderReference(stem, reference) {
    const text = String(reference || '');
    if (!text.trim()) return '';
    const LINK_SET = [
      'first and foremost', 'first of all', 'to begin with', 'for one thing',
      'what is more', 'in addition', 'for example', 'for instance', 'a case in point',
      'in particular', 'by contrast', 'on the contrary', 'on the one hand', 'on the other hand',
      'as a result', 'in conclusion', 'to conclude', 'in summary', 'to sum up', 'in other words'
    ].reduce(function (set, phrase) { set[phrase] = true; return set; }, {});
    const LINK_SINGLE = {
      'moreover': 1, 'furthermore': 1, 'besides': 1, 'however': 1, 'nevertheless': 1,
      'nonetheless': 1, 'therefore': 1, 'thus': 1, 'consequently': 1, 'hence': 1,
      'admittedly': 1, 'indeed': 1, 'overall': 1, 'also': 1, 'specifically': 1, 'yet': 1, 'first': 1
    };

    const paragraphs = text.split(/\n+/).filter(function (part) {
      return part.trim();
    });

    const htmlParts = paragraphs.map(function (paragraph) {
      // 段内切句：非句末标点收进同一句
      const sentences = paragraph.match(/[^.!?]+[.!?]+["'’”)]*|[^.!?]+$/g) || [paragraph];
      return sentences.map(function (sentence, sentenceIndex) {
        const tokens = [];
        const re = /[A-Za-z][A-Za-z'’-]*|\s+|[^\sA-Za-z]+/g;
        let m;
        while ((m = re.exec(sentence)) !== null) {
          tokens.push({ text: m[0], isWord: /^[A-Za-z]/.test(m[0]) });
        }
        // 逐 token 组装：先尝试连接词短语（2–5 词），再走点词翻译
        let out = '';
        let i = 0;
        while (i < tokens.length) {
          const token = tokens[i];
          if (!token.isWord) {
            out += esc(token.text);
            i += 1;
            continue;
          }
          // 连接词短语组匹配：窗口 i..i+span-1 内，首尾是词，中间 token 全为空白
          let matchedLen = 0;
          for (let span = 5; span >= 2; span -= 1) {
            const windowTokens = tokens.slice(i, i + span);
            if (windowTokens.length < span) break;
            const wordCount = windowTokens.filter(function (part) { return part.isWord; }).length;
            const gapCount = span - wordCount;
            // 窗口应正好是 span 个词由 (span-1) 个纯空白 token 连接；
            // 由于分词器把连续空白合并成一个 token，gapCount 应为 span-1
            const first = windowTokens[0];
            const last = windowTokens[span - 1];
            const mids = windowTokens.slice(1, span - 1);
            const midsOk = mids.length === span - 2 &&
              mids.every(function (part) { return !part.isWord && /^\s+$/.test(part.text); });
            if (first.isWord && last.isWord && midsOk) {
              // 词序列（跳过空白）
              const words = windowTokens.filter(function (part) { return part.isWord; })
                .map(function (part) { return part.text.toLowerCase(); });
              const joined = words.join(' ');
              if (LINK_SET[joined]) {
                matchedLen = span;
                break;
              }
            }
          }
          if (matchedLen) {
            const group = tokens.slice(i, i + matchedLen);
            out += '<span class="ref-link">' + esc(group.map(function (part) { return part.text; }).join('')) + '</span>';
            i += matchedLen;
            continue;
          }
          const lower = token.text.toLowerCase().replace(/['’]s$/, '');
          const entry = window.WordTip && window.WordTip.lookup ? window.WordTip.lookup(token.text) : null;
          const isProper = /^[A-Z]/.test(token.text);
          if (entry) {
            out += '<span class="wt-word" data-w="' + esc(entry.word) + '">' + esc(token.text) + '</span>';
          } else if (LINK_SINGLE[lower]) {
            out += '<span class="ref-link">' + esc(token.text) + '</span>';
          } else if (!isProper && token.text.replace(/[^A-Za-z]/g, '').length >= 4) {
            out += '<span class="wt-hard">' + esc(token.text) + '</span>';
          } else {
            out += esc(token.text);
          }
          i += 1;
        }
        return sentenceIndex === 0 ? '<span class="ref-topic">' + out + '</span>' : out;
      }).join('');
    }).join('<span class="ref-br"></span>');
    return htmlParts;
  }

  /**
   * 写作三段式模板，考前可直接套用
   */
  function writingTemplate() {
    return [
      '<details class="kit-item" open>',
      '  <summary>写作三段式模板（120–180 词）</summary>',
      '  <p class="kit-text"><b>第一段 · 引出话题（约 35 词）</b><br>',
      '  In recent years, ______ has become a hot topic among college students. ',
      '  While some people believe that ______, others argue that ______. ',
      '  From my perspective, ______.</p>',
      '  <p class="kit-text"><b>第二段 · 两个理由 + 例子（约 80 词）</b><br>',
      '  First and foremost, ______. For example, ______. ',
      '  What is more, ______. A case in point is that ______.</p>',
      '  <p class="kit-text"><b>第三段 · 结论与建议（约 40 词）</b><br>',
      '  In conclusion, ______. Therefore, it is advisable for us to ______.</p>',
      '  <p class="kit-note">时间分配：3 分钟审题列点，22 分钟成文，5 分钟检查。</p>',
      '</details>'
    ].join('');
  }

  /**
   * 写作自查清单
   */
  function writingChecklist() {
    return [
      '<details class="kit-item">',
      '  <summary>写作自查清单</summary>',
      '  <ul class="kit-list">',
      '    <li>是否写成三段，每段只讲一个中心？</li>',
      '    <li>主谓是否一致，第三人称单数有没有漏 -s？</li>',
      '    <li>时态是否统一（观点用现在时，举例可用过去时）？</li>',
      '    <li>可数名词单复数、冠词 a/an/the 是否漏写？</li>',
      '    <li>连接词是否用了 First / What is more / In conclusion？</li>',
      '    <li>字数是否在 120–180 词之间，是否偏题？</li>',
      '  </ul>',
      '  <p class="kit-note">常见扣分点：整段只有一句话、通篇简单句、拼写错误反复出现。</p>',
      '</details>'
    ].join('');
  }

  /**
   * 翻译自查清单
   */
  function translationChecklist() {
    return [
      '<details class="kit-item">',
      '  <summary>翻译自查清单</summary>',
      '  <ul class="kit-list">',
      '    <li>先通读整段，划出每句的动词与主干，再动笔。</li>',
      '    <li>无主句要补主语（we / people / it），不要逐字硬译。</li>',
      '    <li>时态：叙述历史用过去时，普遍现象用现在时，已完成的影响用现在完成时。</li>',
      '    <li>中文四字短语、成语优先意译，保证英文通顺。</li>',
      '    <li>数字、年份、专有名词首字母大写，单位不要漏。</li>',
      '    <li>留 3 分钟检查单复数、冠词、介词搭配与拼写。</li>',
      '  </ul>',
      '  <p class="kit-note">分值 15 分，评分更看整体通顺度，不要为了难词牺牲句子结构。</p>',
      '</details>'
    ].join('');
  }

  /**
   * 用内置真题风格卷生成写作 / 翻译题目与参考范文列表
   */
  function renderPapers() {
    const writing = (window.CONTENT && window.CONTENT.writing) || [];
    const translation = (window.CONTENT && window.CONTENT.translation) || [];
    if (!writing.length && !translation.length) return '';

    // 题干：写作/翻译的原文都在 prompt 字段（promptZh 只是“请翻译成英文”类指令文案），
    // 优先取 prompt，避免只显示指令而看不到题干（用户反馈：翻译题看不到题干，仅有英文）
    const writingItems = writing.map(function (item) {
      const stem = String(item.prompt || item.promptZh || '');
      const refWords = String(item.reference || '').split(/\s+/).filter(Boolean).length;
      const highlighted = renderReference(stem, item.reference || '');
      const zhHint = item.promptZh && item.promptZh !== item.prompt
        ? '<details class="kit-zh"><summary>显示中文提示</summary>' +
          '<p class="kit-text">' + esc(item.promptZh) + '</p></details>'
        : '';
      return '<details class="kit-item"><summary>' + esc(item.title) + ' · 写作</summary>' +
        '<p class="kit-text kit-stem">' + esc(stem) + '</p>' + zhHint +
        '<p class="kit-note">参考范文（' + refWords + ' 词）· 蓝色为逻辑连接词，浅黄底为主题句，虚线下划线词可点查释义</p>' +
        '<p class="kit-ref">' + highlighted + '</p></details>';
    }).join('');

    const translationItems = translation.map(function (item) {
      const stem = String(item.prompt || item.promptZh || '');
      return '<details class="kit-item"><summary>' + esc(item.title) + ' · 翻译</summary>' +
        '<p class="kit-text kit-stem">' + esc(stem) + '</p>' +
        '<p class="kit-note">参考译文 · 蓝色为逻辑连接词，浅黄底为主题句，虚线下划线词可点查释义</p>' +
        '<p class="kit-ref">' + renderReference(stem, item.reference || '') + '</p></details>';
    }).join('');

    return [
      '<div class="panel">',
      '  <div class="panel-head"><h3>写作 / 翻译资料</h3><span class="panel-tag">' + (writing.length + translation.length) + ' 篇</span></div>',
      '  <p class="panel-text">内置真题风格卷的写作与翻译题面及参考范文，只做静态参考，不提供自动批改。</p>',
      writingTemplate(),
      writingChecklist(),
      translationChecklist(),
      writingItems,
      translationItems,
      '  <p class="panel-note">说明：听力音频、词组搭配与作文自动评分尚未内置，可先用真题纸质材料配合练习。</p>',
      '</div>'
    ].join('');
  }

  return {
    renderOverview: renderOverview,
    renderRetention: renderRetention,
    renderStudyKit: renderPapers
  };
})();

// DONE: me-stats.js
