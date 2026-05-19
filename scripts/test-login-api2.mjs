const body = JSON.stringify({
  register_email: '482363619@qq.com',
  password: 'aaaaaaaaa',
});
console.log('len', body.length, body);
const r = await fetch('https://v1.gyks.cf/login_api', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body,
});
console.log(await r.text());
