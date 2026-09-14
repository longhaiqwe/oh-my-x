import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { classifyHeading, extractHeadingsFromArticle } from '../../shared/toc-parser'

describe('toc-parser: classifyHeading (2-level hierarchy)', () => {
  it('should correctly classify Level 1 headings (# 一、xxx / 一、xxx / # xxx)', () => {
    expect(classifyHeading('一、下载、安装和注册')?.level).toBe(1)
    expect(classifyHeading('二、第一次打开，先认清主界面和九个入口')?.level).toBe(1)
    expect(classifyHeading('# 一、下载、安装和注册')?.level).toBe(1)
    expect(classifyHeading('# 一、下载、安装和注册')?.cleanText).toBe('一、下载、安装和注册')
    expect(classifyHeading('# 二、第一次打开，先认清主界面和九个入口')?.level).toBe(1)
    expect(classifyHeading('# 核心设计原理')?.level).toBe(1)
    expect(classifyHeading('第1章 项目架构概述')?.level).toBe(1)
    expect(classifyHeading('Part 1: Background & Motivation')?.level).toBe(1)
    expect(classifyHeading('【重磅发布】')?.level).toBe(1)
  })

  it('should correctly classify Level 2 headings (## 1. xxx / 1. xxx / ## xxx)', () => {
    expect(classifyHeading('1. 从官网下载')?.level).toBe(2)
    expect(classifyHeading('2. 登录时怎么选')?.level).toBe(2)
    expect(classifyHeading('## 1. 从官网下载')?.level).toBe(2)
    expect(classifyHeading('## 1. 从官网下载')?.cleanText).toBe('1. 从官网下载')
    expect(classifyHeading('## 2. 登录时怎么选')?.level).toBe(2)
    expect(classifyHeading('## 技术栈选型')?.level).toBe(2)
    expect(classifyHeading('10. 手机遥控电脑：离开电脑后继续查看和控制任务')?.level).toBe(2)
    expect(classifyHeading('1/ 新工作任务：所有一次性工作都从这里开始')?.level).toBe(2)
    expect(classifyHeading('1️⃣ 基础知识准备')?.level).toBe(2)
    expect(classifyHeading('（一）准备工作')?.level).toBe(2)
    expect(classifyHeading('(1) 账号登录')?.level).toBe(2)
    expect(classifyHeading('1.1 环境配置要求')?.level).toBe(2)
    expect(classifyHeading('a. 安装依赖库')?.level).toBe(2)
    expect(classifyHeading('### 模块拆解')?.level).toBe(2)
    expect(classifyHeading('📌 核心要点整理')?.level).toBe(2)
    expect(classifyHeading('🔥 爆款写作技巧')?.level).toBe(2)
  })

  it('should return null for normal long paragraphs or noise or random transition colons', () => {
    expect(classifyHeading('')).toBeNull()
    expect(classifyHeading('a')).toBeNull()
    expect(classifyHeading('让两个工具各自负责最擅长的事：')).toBeNull()
    expect(classifyHeading('用法：')).toBeNull()
    expect(
      classifyHeading(
        '这是一段普通的正文描述，包含了很多文字，比如我们在设计系统的时候需要考虑高可用性和可伸缩性，所以不要把它当作标题来看待。',
      ),
    ).toBeNull()
    expect(
      classifyHeading(
        '5.有时灵感喷发， 打算发定时推文，但是又不能发太密，太频繁怕被限流；排期时间全是生硬的绝对时间，不知道推文时间间隔，换算令人头秃……',
      ),
    ).toBeNull()
    expect(
      classifyHeading(
        '2.纵使你有大显示器，X 的主信息流却被死死焊在约 600px 宽的狭窄区域，两边留着巨大的空白，右边栏充斥着你根本不想看的推荐话题；',
      ),
    ).toBeNull()
    expect(
      classifyHeading(
        '1.一条稍有讨论度的推文，底部必有色情评论、营销评论、AI生硬评论',
      ),
    ).toBeNull()
  })

  it('should not heuristically infer weak Level 2 headings from unstyled paragraphs if hasNativeHeadings is true', () => {
    expect(classifyHeading('1. 设计原则', { hasNativeHeadings: true })).toBeNull()
    expect(classifyHeading('📌 重点内容说明', { hasNativeHeadings: true })).toBeNull()
    // Explicit markdown is always preserved even if hasNativeHeadings is true
    expect(classifyHeading('## 1. 设计原则', { hasNativeHeadings: true })?.level).toBe(2)
    expect(classifyHeading('# 模块一：核心理念', { hasNativeHeadings: true })?.level).toBe(1)
    expect(classifyHeading('一、背景介绍', { hasNativeHeadings: true })?.level).toBe(1)
  })
})

describe('toc-parser: extractHeadingsFromArticle on simulated DOM', () => {
  it('should extract hierarchical headings from article DOM structure', () => {
    const html = `
      <article data-testid="article">
        <h1 data-testid="twitter-article-title">万字长文｜豆包工作从 0 到 1</h1>
        <div data-testid="twitterArticleReadView">
          <p>前言简介...</p>
          <p># 一、下载、安装和注册</p>
          <p>## 1. 从官网下载</p>
          <p>## 2. 登录时怎么选</p>
          <p># 二、第一次打开，先认清主界面和九个入口</p>
          <p>## 1. 新工作任务：所有一次性工作都从这里开始</p>
          <p>让两个工具各自负责最擅长的事：</p>
          <p>## 2. 模型与推理强度：第一次保持 Auto 就够了</p>
        </div>
      </article>
    `
    const dom = new JSDOM(html)
    const headings = extractHeadingsFromArticle(dom.window.document)

    expect(headings.length).toBe(7)
    expect(headings[0].text).toBe('万字长文｜豆包工作从 0 到 1')
    expect(headings[0].level).toBe(1)

    expect(headings[1].text).toBe('一、下载、安装和注册')
    expect(headings[1].level).toBe(1)

    expect(headings[2].text).toBe('1. 从官网下载')
    expect(headings[2].level).toBe(2)

    expect(headings[3].text).toBe('2. 登录时怎么选')
    expect(headings[3].level).toBe(2)

    expect(headings[4].text).toBe('二、第一次打开，先认清主界面和九个入口')
    expect(headings[4].level).toBe(1)

    expect(headings[5].text).toBe('1. 新工作任务：所有一次性工作都从这里开始')
    expect(headings[5].level).toBe(2)

    expect(headings[6].text).toBe('2. 模型与推理强度：第一次保持 Auto 就够了')
    expect(headings[6].level).toBe(2)
  })

  it('should extract headings from long tweetText format', () => {
    const html = `
      <div data-testid="primaryColumn">
        <article data-testid="tweet">
          <div data-testid="tweetText">
            <span># Claude 3.7 开发实战指南</span>
            <br>
            <span># 一、核心特性解析</span>
            <br>
            <span>## 1. 混合推理架构</span>
            <br>
            <span>## 2. 编程能力跃迁</span>
            <br>
            <span># 二、如何上手配置</span>
            <br>
            <span>## 1. API 接入</span>
            <br>
            <span>## 2. Prompt 调优技巧</span>
          </div>
        </article>
      </div>
    `
    const dom = new JSDOM(html)
    const headings = extractHeadingsFromArticle(dom.window.document)

    expect(headings.length).toBe(7)
    expect(headings[0].level).toBe(1)
    expect(headings[1].level).toBe(1)
    expect(headings[2].level).toBe(2)
    expect(headings[3].level).toBe(2)
    expect(headings[4].level).toBe(1)
    expect(headings[5].level).toBe(2)
    expect(headings[6].level).toBe(2)
  })

  it('should extract headings from X Article Composer Draft.js editor', () => {
    const html = `
      <div>
        <textarea placeholder="添加标题">文章主标题</textarea>
        <div data-testid="composerRichTextInputContainer">
          <div class="DraftEditor-root">
            <div class="DraftEditor-editorContainer">
              <div class="notranslate public-DraftEditor-content" contenteditable="true" data-testid="composer">
                <div data-contents="true">
                  <div data-rfd-draggable-id="55h39">
                    <h1 class="longform-header-one" data-block="true">
                      <div class="public-DraftStyleDefault-block"><span><span data-text="true">一、背景介绍与核心理念</span></span></div>
                    </h1>
                  </div>
                  <div data-rfd-draggable-id="9kngu">
                    <div class="longform-unstyled" data-block="true">
                      <div class="public-DraftStyleDefault-block"><span><span data-text="true">这里是正文内容...</span></span></div>
                    </div>
                  </div>
                  <div data-rfd-draggable-id="53vuc">
                    <h2 class="longform-header-two" data-block="true">
                      <div class="public-DraftStyleDefault-block"><span><span data-text="true">1. 设计原则</span></span></div>
                    </h2>
                  </div>
                  <div data-rfd-draggable-id="7cg21">
                    <div class="longform-unstyled" data-block="true">
                      <div class="public-DraftStyleDefault-block"><span><span data-text="true">## 2. 技术架构选型</span></span></div>
                    </div>
                  </div>
                  <div data-rfd-draggable-id="f821k">
                    <h1 class="longform-header-one" data-block="true">
                      <div class="public-DraftStyleDefault-block"><span><span data-text="true">二、实战演练与落地</span></span></div>
                    </h1>
                  </div>
                  <div data-rfd-draggable-id="6gbig">
                    <h2 class="longform-header-two" data-block="true">
                      <div class="public-DraftStyleDefault-block"><span><span data-text="true">1. 快速上手步骤</span></span></div>
                    </h2>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    const dom = new JSDOM(html)
    const headings = extractHeadingsFromArticle(dom.window.document)

    expect(headings.length).toBe(6)
    expect(headings[0].text).toBe('文章主标题')
    expect(headings[0].level).toBe(1)

    expect(headings[1].text).toBe('一、背景介绍与核心理念')
    expect(headings[1].level).toBe(1)

    expect(headings[2].text).toBe('1. 设计原则')
    expect(headings[2].level).toBe(2)

    expect(headings[3].text).toBe('2. 技术架构选型')
    expect(headings[3].level).toBe(2)

    expect(headings[4].text).toBe('二、实战演练与落地')
    expect(headings[4].level).toBe(1)

    expect(headings[5].text).toBe('1. 快速上手步骤')
    expect(headings[5].level).toBe(2)
  })

  it('should never treat list items (with or without emoji) or prose sentences as headings in Draft.js editor', () => {
    const html = `
      <div>
        <textarea placeholder="添加标题">开源了 一款 X Chrome 插件</textarea>
        <div data-testid="composer">
          <div data-contents="true">
            <div class="longform-unstyled" data-block="true">
              <span>5.有时灵感喷发， 打算发定时推文，但是又不能发太密，太频繁怕被限流；排期时间全是生硬的绝对时间，不知道推文时间间隔，换算令人头秃……</span>
            </div>
            <h1 class="longform-header-one" data-block="true">
              <span>🎨 模块一：视图定制与沉浸式排版（按你的习惯重塑 X）</span>
            </h1>
            <h2 class="longform-header-two" data-block="true">
              <span>1. 痛点场景</span>
            </h2>
            <h2 class="longform-header-two" data-block="true">
              <span>2. 这个功能有什么用？</span>
            </h2>
            <li class="longform-unordered-list-item" data-block="true">
              <span>📏 时间线宽度自由滑动（600px ~ 800px）：通过滑块平滑拉伸主内容区域...</span>
            </li>
            <li class="longform-unordered-list-item" data-block="true">
              <span>🚫 一键隐藏右侧边栏：告别推荐话题与热搜牛皮癣，彻底消除视觉干扰；</span>
            </li>
            <li class="longform-unordered-list-item" data-block="true">
              <span>🛡️ 一键黑白名单管理：</span>
            </li>
            <li class="longform-unordered-list-item" data-block="true">
              <span>🎯 评论一键分词与词库扩充：</span>
            </li>
            <h2 class="longform-header-two" data-block="true">
              <span>3. 解决了什么问题？</span>
            </h2>
            <blockquote class="longform-blockquote" data-block="true">
              <span>核心特性：100% 纯本地运行</span>
            </blockquote>
          </div>
        </div>
      </div>
    `
    const dom = new JSDOM(html)
    const headings = extractHeadingsFromArticle(dom.window.document)

    expect(headings.map((h) => ({ level: h.level, text: h.text }))).toEqual([
      { level: 1, text: '开源了 一款 X Chrome 插件' },
      { level: 1, text: '🎨 模块一：视图定制与沉浸式排版（按你的习惯重塑 X）' },
      { level: 2, text: '1. 痛点场景' },
      { level: 2, text: '2. 这个功能有什么用？' },
      { level: 2, text: '3. 解决了什么问题？' },
    ])
  })

  it('should extract headings from Twitter Article using bold paragraphs and Chinese ordinal numbers', () => {
    const html = `
      <article data-testid="tweet">
        <article data-testid="twitterArticleReadView">
          <h1 data-testid="twitter-article-title">
            <span>继UU远程后，网易又整了一个识别速度快到没朋友的AI语音输入法</span>
          </h1>
          <div data-testid="twitterArticleRichTextView">
            <div class="longform-unstyled" data-block="true">
              <span>我是真没想到网易除了UU远程，又在AI赛道整了一个新活。</span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span style="font-weight: bold;"><span>Typeless，</span></span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span>从 Typeless 做出来的这个格式就知道了...</span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span style="font-weight: bold;"><span>叭哥说，</span></span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span>叭哥说这个其实跟Typeless的风格还挺不一样的...</span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span style="font-weight: bold;"><span>豆包，</span></span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span>豆包在常规语音识别上表现良好...</span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span style="font-weight: bold;"><span>闪电说，</span></span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span>闪电说有AI调整功能，但需要自己配API...</span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span style="font-weight: bold;"><span>第一个就是上班上的小声嘀嘀咕咕。</span></span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span>在办公室安静环境下，小声说也能精准识别...</span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span style="font-weight: bold;"><span>然后第二个是给AI写长Prompt和专业术语。</span></span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span>专业术语识别率非常高...</span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span style="font-weight: bold;"><span>第三个我非常常用的功能，多语言翻译。</span></span>
            </div>
            <div class="longform-unstyled" data-block="true">
              <span>中英日韩互译...</span>
            </div>
          </div>
        </article>
      </article>
    `
    const dom = new JSDOM(html)
    const headings = extractHeadingsFromArticle(dom.window.document)

    expect(headings.map((h) => ({ level: h.level, text: h.text }))).toEqual([
      { level: 1, text: '继UU远程后，网易又整了一个识别速度快到没朋友的AI语音输入法' },
      { level: 2, text: 'Typeless' },
      { level: 2, text: '叭哥说' },
      { level: 2, text: '豆包' },
      { level: 2, text: '闪电说' },
      { level: 2, text: '第一个就是上班上的小声嘀嘀咕咕' },
      { level: 2, text: '第二个是给AI写长Prompt和专业术语' },
      { level: 2, text: '第三个我非常常用的功能，多语言翻译' },
    ])
  })
})



