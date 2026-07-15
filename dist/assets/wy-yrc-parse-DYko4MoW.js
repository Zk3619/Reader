const I=/^{"/,$=/^\[(\d+),\d+\]/,j=/\(\d+,\d+,\d+\)/,y=/(\(\d+,\d+,\d+\))/g;function g(t){if(Number.isNaN(t))return"";let r=t%1e3;t=Math.floor(t/1e3);const i=Math.floor(t/60).toString().padStart(2,"0");t%=60;const n=Math.floor(t).toString().padStart(2,"0");return`[${i}:${n}.${r}]`}function w(t){const r=[],i=[];for(let n of t){n=n.trim();const c=$.exec(n);if(!c){n.startsWith("[offset")&&(r.push(n),i.push(n));continue}const s=parseInt(c[1],10),o=g(s);if(!o)continue;let e=n.replace($,"");i.push(`${o}${e.replace(y,"")}`);const f=e.match(y);if(!f)continue;const m=f.map(a=>{const p=/\((\d+),(\d+),\d+\)/.exec(a);return`<${Math.max(parseInt(p[1],10)-s,0)},${p[2]}>`}),u=e.split(j);u.shift();const l=m.map((a,p)=>`${a}${u[p]??""}`).join("");r.push(`${o}${l}`)}return{lyric:i.join(`
`),lxlyric:r.join(`
`)}}function d(t){return t=t.trim().replace(/\r/g,""),t?t.split(`
`).map(r=>{if(!I.test(r))return r;try{const i=JSON.parse(r),n=g(Number(i.t??NaN));return n?`${n}${(i.c??[]).map(c=>c.tx??"").join("")}`:""}catch{return""}}):null}function x(t){if(!t)return 0;t.includes(".")||(t+=".0");const r=t.split(/:|\./);for(;r.length<3;)r.unshift("0");const[i,n,c]=r;return parseInt(i,10)*6e4+parseInt(n,10)*1e3+parseInt(c,10)}function L(t,r){let i=t.split(`
`);const n=r.split(`
`),c=/^\[([\d:.]+)\]/;let s=[];const o=[];for(const e of n){const f=c.exec(e);if(!f||!e.replace(c,"").trim())continue;const u=x(f[1]);for(;i.length;){const l=i.shift(),a=c.exec(l);if(!a)continue;const p=x(a[1]);if(Math.abs(u-p)<100){const h=e.replace(c,a[0]).trim();h&&o.push(h);break}s.push(l)}i=[...s,...i],s=[]}return o.join(`
`)}function R(t,r,i,n,c,s){const o={lyric:"",tlyric:"",rlyric:"",lxlyric:""};if(t){const e=d(t);if(e){const f=w(e);if(r){const l=d(r);l&&(o.tlyric=L(f.lyric,l.join(`
`)))}if(i){const l=d(i);l&&(o.rlyric=L(f.lyric,l.join(`
`)))}const m=/^\[[\d:.]+\]/,u=e.filter(l=>m.test(l)).join(`
`);return o.lyric=`${u}
${f.lyric}`,o.lxlyric=f.lxlyric,o}}if(n){const e=d(n);e&&(o.lyric=e.join(`
`))}if(c){const e=d(c);e&&(o.tlyric=e.join(`
`))}if(s){const e=d(s);e&&(o.rlyric=e.join(`
`))}return o}function T(t,r,i){let n=t??"",c=r??"",s=i??"";if(n){const o=n.replace(/\[(\d{2}:\d{2}):(\d{2})]/g,"[$1.$2]"),e=c.replace(/\[(\d{2}:\d{2}):(\d{2})]/g,"[$1.$2]");(o!==n||e!==c)&&(n=o,c=e,s&&(s=s.replace(/\[(\d{2}:\d{2}):(\d{2,3})]/g,"[$1.$2]").replace(/\[(\d{2}:\d{2}\.\d{2})0]/g,"[$1]")))}return{lrc:n,tlrc:c,romalrc:s}}export{T as fixWyTimeLabel,R as parseWyYrcBundle};
