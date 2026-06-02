import { describe, expect, it } from 'vitest';
import { analyzeListElements, analyzeString } from '@/lib/rule-engine';
import { resolveExploreAuthor } from '@/lib/book-source/explore';

const LIST_ITEM = `<li class="column-2 ">
					<div class="right">
						 <a class="name" href="/55/55311/">我获得了熟女好感度系统</a>
						 <span style="float:right;font-size:0.8125em;color: #999;"></span>
						<p class="update">
							最新章节：<a href="/55/55311/10977.html">我获得了熟女好感度系统（14）</a>						</p>
						<p class="info">
							作者：折戟沉尘							<span class="words">字数：314760</span>
						</p>
					</div>
				</li>`;

const AUTHOR_RULE = '##作者：(.*?)\<##$1###';

describe('author ##作者…## on p.info', () => {
  it('纯 ## 规则应提取 折戟沉尘', async () => {
    const html = `<ul>${LIST_ITEM}</ul>`;
    const baseUrl = 'https://www.banzhu77777777.net/s.php';
    const items = await analyzeListElements('.column-2@all', {
      content: html,
      contentType: 'html',
      baseUrl,
    });
    expect(items.length).toBe(1);
    const ctx = { content: items[0]!.content, contentType: 'html' as const, baseUrl };
    const direct = await analyzeString(AUTHOR_RULE, ctx);
    const author = await resolveExploreAuthor(AUTHOR_RULE, ctx);
    expect(direct.trim()).toBe('折戟沉尘');
    expect(author).toBe('折戟沉尘');
  });
});
