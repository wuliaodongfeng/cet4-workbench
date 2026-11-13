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

    const writingItems = writing.map(function (item) {
      return '<details class="kit-item"><summary>' + esc(item.title) + ' · 写作</summary>' +
        '<p class="kit-text">' + esc(item.promptZh || item.prompt) + '</p>' +
        '<p class="kit-note">参考范文（' + String(item.reference || '').split(/\s+/).length + ' 词）</p>' +
        '<p class="kit-ref">' + esc(item.reference || '') + '</p></details>';
    }).join('');

    const translationItems = translation.map(function (item) {
      return '<details class="kit-item"><summary>' + esc(item.title) + ' · 翻译</summary>' +
        '<p class="kit-text">' + esc(item.promptZh || item.prompt) + '</p>' +
        '<p class="kit-note">参考译文</p>' +
        '<p class="kit-ref">' + esc(item.reference || '') + '</p></details>';
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
