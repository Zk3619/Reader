import { describe, expect, it } from 'vitest';
import { patchLegadoLoginUrlScript } from '@/lib/js-engine/legado/login-script-patches';

describe('patchLegadoLoginUrlScript', () => {
  it('晴天 control 在 controlUrl 与 server 不一致时优先 server', () => {
    const code = `
let controlUrl = host[0];
function control() {
    controlUrla = getArgument('controlUrl');
    if (!controlUrla) controlUrla = controlUrl;
    setArgument('controlUrl', controlUrla);
    java.startBrowserAwait(controlUrla + '/control', '设置');
}
function set_server() {
    setArgument('server', nextServer);
}
`;
    const patched = patchLegadoLoginUrlScript(code);
    expect(patched).toContain('__readerServer = getArgument');
    expect(patched).not.toContain("setArgument('controlUrl', nextServer)");
  });
});
