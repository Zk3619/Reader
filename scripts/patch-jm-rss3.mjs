import fs from 'node:fs';

const path = new URL('../examples/禁漫天堂.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const source = data[0];
source.ruleArticles =
  'class.list-col||@css:.thumb-overlay@all||@css:a[href*="/album/"]@all||:<a[^>]*href="[^"]*?/album/\\d+[^"]*"[^>]*>[\\s\\S]*?</a>';
source.ruleTitle =
  'tag.img@title||tag.img@alt||.video-title@text##\\[.*?\\]|【.*?】';
fs.writeFileSync(path, JSON.stringify(data));
console.log('ruleArticles:', source.ruleArticles);
console.log('ruleTitle:', source.ruleTitle);
