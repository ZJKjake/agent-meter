const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const vscode = require('vscode');
const { run } = require('./run.cjs');
exports.activate = async function () {
  const home = require('node:os').homedir();
  assert.equal(home, '/home/dev', 'Only use this fixture driver in the disposable Linux test container');
  assert(fs.existsSync('/tmp/agentmeter-disposable-home'));
  const cli = path.join(home, '.local/bin/codex');
  const settingsPath = path.join(home, '.claude/settings.json');
  const cache = path.join(home, '.agentmeter/claude-code-usage.json');
  const bridge = path.join(home, '.agentmeter/claude-statusline-bridge.js');
  assert(!fs.existsSync(cli) && !fs.existsSync(settingsPath) && !fs.existsSync(cache));
  const common = {requirePackagedPath:true,requireAvailable:[],dataProvenance:{'local:cursor':'signed-out isolated Cursor profile','workspace:codex':'synthetic CLI fixture','workspace:claude-code':'synthetic official-format status-line payload'}};
  const check = (name, options) => run({...common,...options,reportPath:`/home/dev/single-${name}.json`});
  const output = [];
  try {
    await vscode.commands.executeCommand('agentmeter.configureClaudeCode');
    assert(fs.existsSync(settingsPath), 'Workspace setup must write on Linux');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    assert(settings.statusLine.command.includes('/home/dev/.agentmeter/claude-statusline-bridge.js'));
    const payload = JSON.stringify({rate_limits:{five_hour:{used_percentage:61,resets_at:Math.floor(Date.now()/1000)+18000},seven_day:{used_percentage:37,resets_at:Math.floor(Date.now()/1000)+604800}}});
    const feed = () => {
      const result = cp.spawnSync(settings.statusLine.command, {shell:true,input:payload,encoding:'utf8',timeout:10000});
      assert.equal(result.status,0,'The generated status-line command must execute');
      assert(result.stdout.includes('AgentMeter'));
      assert.equal(fs.statSync(cache).mode & 0o777,0o600);
      assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(cache,'utf8'))).sort(),['provider','state','updatedAt','version','windows']);
    };
    feed();
    fs.mkdirSync(path.dirname(cli),{recursive:true});
    const healthy = `#!/usr/local/bin/node\nrequire('node:readline').createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.method==='initialize')process.stdout.write(JSON.stringify({id:r.id,result:{}})+'\\n');if(r.method==='account/rateLimits/read')process.stdout.write(JSON.stringify({id:r.id,result:{rateLimits:{primary:{usedPercent:23,windowDurationMins:300,resetsAt:2000000000}}}})+'\\n');});\n`;
    fs.writeFileSync(cli,healthy,{mode:0o700});
    output.push(await check('linux-fixture-connected',{requireAvailable:['workspace:codex','workspace:claude-code']}));
    const selected = await vscode.commands.executeCommand('agentmeter.refresh');
    const codexCard = selected.cards.find(card => card.tool === 'codex');
    assert.equal(codexCard.name, 'Codex');
    assert.equal(codexCard.location, 'workspace');
    assert.equal(codexCard.quotas[0].used, 23, 'Display the remote fixture account, not the live local account');
    fs.writeFileSync(cli,"#!/usr/local/bin/node\nprocess.stdout.write('null\\n');setInterval(()=>{},1000);\n");
    fs.writeFileSync(cache,'invalid JSON');
    output.push(await check('linux-fixture-failed',{requireStates:{'workspace:codex':'unavailable','workspace:claude-code':'unavailable'}}));
    fs.writeFileSync(cli,healthy);feed();
    output.push(await check('linux-fixture-recovered',{requireAvailable:['workspace:codex','workspace:claude-code']}));
    fs.writeFileSync('/home/dev/single-scenario-result.json',JSON.stringify({passed:true,scenarios:output.length,claudeConfigurationHost:'linux',claudeData:'fixture, not a live subscription'},null,2));
  } catch (e) {
    fs.writeFileSync('/home/dev/single-scenario-error.txt',String(e.stack || e));
    throw e;
  } finally {
    for (const file of [cli,settingsPath,cache,bridge]) { fs.rmSync(file,{force:true}); }
    await check('linux-fixture-cleaned',{requireStates:{'workspace:codex':'unsupported','workspace:claude-code':'setup-required'}});
  }
};
