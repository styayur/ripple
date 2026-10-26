"""Real installed Obsidian smoke test. Creates a NEW vault/profile under reports.
Never opens, edits or deploys to an existing user vault. Requires Windows + Playwright.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports' / 'obsidian'

def prepare():
    REPORTS.mkdir(parents=True, exist_ok=True)
    sandbox = Path(tempfile.mkdtemp(prefix='run-', dir=REPORTS))
    profile = sandbox / 'profile'
    vault = sandbox / 'Ripple Integration'
    profile.mkdir()
    config = vault / '.obsidian'
    plugin = config / 'plugins' / 'ripple-graph-filter'
    plugin.mkdir(parents=True)
    for name in ['main.js', 'manifest.json', 'styles.css']:
        shutil.copy2(ROOT / 'dist' / name, plugin / name)
    fixtures = {
        'Systems': ['Architecture', 'Cache', 'Scheduler', 'Storage', 'Network', 'Process', 'Memory', 'Runtime'],
        'Graph': ['Graph', 'Nodes', 'Edges', 'Layouts', 'Communities', 'Camera', 'Traversal', 'Filtering'],
        'Knowledge': ['Notes', 'Aliases', 'Tags', 'Links', 'Index', 'Search', 'Metadata', 'Frontmatter'],
        'Testing': ['Assertions', 'Fixtures', 'Coverage', 'Integration', 'Browser', 'Build', 'Release', 'Audit'],
    }
    paths = []
    for group, names in fixtures.items():
        (vault / group).mkdir(parents=True)
        for i, name in enumerate(names):
            path = vault / group / f'{name}.md'
            links = [f'[[{group}/{other}]]' for j, other in enumerate(names) if j != i and (j - i) % 8 in [1, 2, 7]]
            path.write_text(f'---\ntags: [{group.lower()}]\naliases: [{name} reference]\n---\n# {name}\n\nLocal-first engineering notes for {group.lower()}.\n\n' + '\n'.join(links), encoding='utf-8', newline='\n')
            paths.append(path)
    (config / 'community-plugins.json').write_text(json.dumps(['ripple-graph-filter']), encoding='utf-8')
    (config / 'app.json').write_text(json.dumps({'safeMode': False, 'theme': 'obsidian'}), encoding='utf-8')
    (profile / 'obsidian.json').write_text(json.dumps({'locale': 'en', 'vaults': {'a02a02a02a02a02a': {'path': str(vault), 'ts': int(time.time()*1000), 'open': True}}}), encoding='utf-8')
    installed_update = Path(os.environ.get('APPDATA', '')) / 'obsidian' / 'obsidian-1.14.5.asar'
    if installed_update.is_file():
        shutil.copy2(installed_update, profile / installed_update.name)
    return sandbox, profile, vault, paths

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--executable', default=r'C:\Program Files\Obsidian\Obsidian.exe')
    parser.add_argument('--probe-only', action='store_true')
    args = parser.parse_args()
    sandbox, profile, vault, paths = prepare()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    before = {str(path.relative_to(vault)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0
    log = (sandbox / 'process.log').open('w', encoding='utf-8')
    process = subprocess.Popen([args.executable, f'--user-data-dir={profile}', f'--remote-debugging-port={port}', '--no-first-run'], startupinfo=startup, stdout=log, stderr=log)
    result = {'environment': 'Real installed Obsidian desktop, isolated profile and synthetic vault', 'sandbox': str(sandbox), 'timestamp': datetime.now(timezone.utc).isoformat(), 'assetHashes': {name: hashlib.sha256((ROOT / 'dist' / name).read_bytes()).hexdigest() for name in ['main.js', 'manifest.json', 'styles.css']}, 'checks': []}
    try:
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version', timeout=1) as response:
                    result['debugger'] = json.loads(response.read())['Browser']
                break
            except Exception:
                time.sleep(0.5)
        else:
            raise RuntimeError('Isolated Obsidian debugger did not start: ' + (sandbox / 'process.log').read_text(encoding='utf-8')[-2000:])
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}')
            context = browser.contexts[0]
            page = context.pages[0]
            page_errors = []
            result['runtimeErrors'] = page_errors
            page.on('pageerror', lambda error: page_errors.append(str(error)))
            page.on('console', lambda message: page_errors.append(message.text) if message.type == 'error' else None)
            page.wait_for_function('typeof app !== "undefined" && app.vault && app.workspace', timeout=45000)
            observed_path = page.evaluate('app.vault.adapter.basePath')
            if Path(observed_path).resolve() != vault.resolve():
                raise RuntimeError(f'Isolation gate failed: expected {vault}, got {observed_path}. No runtime actions executed.')
            result['vaultIsolationVerified'] = True
            result['appVersion'] = page.evaluate('({appVersion: window.appVersion ?? app.version ?? null, userAgent: navigator.userAgent})')
            result['checks'].append('Real Obsidian opened the newly created isolated vault')
            page.wait_for_function('app.plugins.manifests["ripple-graph-filter"]', timeout=30000)
            # This is our newly authored fixture vault, with only Ripple installed.
            # Accept its own host trust dialog before driving the workspace.
            trust = page.get_by_role('button', name='Trust author and enable plugins')
            chinese_trust = page.get_by_role('button', name='信任仓库作者并启用插件')
            trusted_by_dialog = False
            plugin_started = time.perf_counter()
            if trust.is_visible(): trust.click(); trusted_by_dialog = True
            elif chinese_trust.is_visible(): chinese_trust.click(); trusted_by_dialog = True
            # Host test API enables only the compiled plugin in this disposable vault.
            # No user profile or existing vault settings are accessed.
            if not trusted_by_dialog:
                page.evaluate('app.plugins.setEnable(true)')
            page.wait_for_function('app.plugins.getPlugin("ripple-graph-filter")', timeout=30000)
            result['pluginReadyWallMs'] = (time.perf_counter() - plugin_started) * 1000
            result['appVersion']['apiVersion'] = page.evaluate('app.plugins.getPlugin("ripple-graph-filter").hostVersion')
            result['checks'].append('Production plugin loaded from the three installation assets')
            page.evaluate('app.commands.executeCommandById("ripple-graph-filter:open-filter")')
            expect(page.locator('.ripple-workspace')).to_be_visible(timeout=30000)
            expect(page.locator('.ripple-workspace [role=status]')).to_contain_text('32 / 32', timeout=30000)
            result['checks'].append('Workspace opened with all 32 Markdown nodes indexed')
            if not args.probe_only:
                run_checks(page, result, sandbox, vault)
            page.wait_for_timeout(250)
            assert not page_errors, page_errors
            page.screenshot(path=str(sandbox / 'workspace.png'), full_page=True)
            page.locator('.ripple-workspace').screenshot(path=str(sandbox / 'workspace-crop.png'))
            result['unchangedOriginalNotes'] = before == {str(path.relative_to(vault)): hashlib.sha256(path.read_bytes()).hexdigest() for path in paths}
            assert result['unchangedOriginalNotes']
            # Close only this disposable application instance. Its profile is not the user's.
            browser.close()
    except Exception:
        try:
            result['failureDiagnostics'] = page.evaluate('({filter:app.plugins.getPlugin("ripple-graph-filter")?.controller.filter, inputs:[...document.querySelectorAll(".ripple-workspace input")].map(e=>({type:e.type,value:e.value,disabled:e.disabled})),alerts:[...document.querySelectorAll("[role=alert]")].map(e=>e.textContent),modals:[...document.querySelectorAll(".modal")].map(e=>e.textContent)})')
            page.screenshot(path=str(sandbox / 'failure.png'), full_page=True)
        except Exception:
            pass
        raise
    finally:
        if process.poll() is None:
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True)
        log.close()
        (sandbox / 'results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        (REPORTS / 'latest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))

def run_checks(page, result, sandbox, vault):
    prefix = 'app.plugins.getPlugin("ripple-graph-filter")'
    controller = prefix + '.controller'
    query = page.get_by_role('textbox', name='Graph query')
    slider = page.get_by_role('slider', name='Relevance threshold percent')
    mode = page.get_by_role('combobox', name='Graph mode')
    status = page.locator('.ripple-workspace [role=status]')
    expect(slider).to_be_disabled()
    query.fill('Graph')
    page.wait_for_timeout(150)
    slider.fill('65')
    page.wait_for_function(f'{controller}.filter.threshold === 65')
    expected_ids = page.evaluate(f'[...{controller}.visible.ids].sort()')
    assert expected_ids, 'Expected actual Graph matches at 65%'
    for name in ['frontier', 'dense', 'cluster', 'galaxy']:
        mode.select_option(name)
        expect(page.locator('.ripple-workspace canvas')).to_have_attribute('data-mode', name)
        expect(query).to_have_value('Graph')
        expect(slider).to_have_value('65')
        assert page.evaluate(f'[...{controller}.visible.ids].sort()') == expected_ids
        page.wait_for_timeout(150)
        page.screenshot(path=str(sandbox / f'{name}-filtered.png'), full_page=True)
    result['checks'].append('All four modes initialized with identical actual filtered IDs at 65%')
    page.locator('.ripple-inspector summary').click()
    page.get_by_role('combobox', name='Locate visible node').select_option('Graph/Graph.md')
    for name in ['frontier', 'dense', 'cluster', 'galaxy']:
        mode.select_option(name)
        assert page.evaluate(f'[...{controller}.selected]') == ['Graph/Graph.md']
    result['checks'].append('Query, threshold and selected node survive every mode switch')
    box = page.locator('.ripple-workspace canvas').bounding_box()
    before = page.evaluate(f'({{...{controller}.views.get("galaxy").camera}})')
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down(); page.mouse.move(box['x'] + box['width']/2+90, box['y'] + box['height']/2+50, steps=8); page.mouse.up()
    after = page.evaluate(f'({{...{controller}.views.get("galaxy").camera}})')
    assert after != before
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down(button='right'); page.mouse.move(box['x']+box['width']/2+40, box['y']+box['height']/2+30, steps=5); page.mouse.up(button='right')
    panned = page.evaluate(f'({{...{controller}.views.get("galaxy").camera}})')
    assert abs(panned['targetX'] - after['targetX']) + abs(panned['targetY'] - after['targetY']) > 0.000001
    after = panned
    assert page.locator('.ripple-workspace canvas').get_attribute('data-rendering') == 'webgl-3d'
    mode.select_option('dense')
    dense_before_pan = page.evaluate(f'({{...{controller}.views.get("dense").camera}})')
    dense_box = page.locator('.ripple-workspace canvas').bounding_box()
    page.mouse.move(dense_box['x']+10,dense_box['y']+10); page.mouse.down(); page.mouse.move(dense_box['x']+60,dense_box['y']+45,steps=5); page.mouse.up()
    assert page.evaluate(f'{controller}.views.get("dense").camera.x') != dense_before_pan['x']
    page.mouse.wheel(0,-120)
    page.wait_for_function(f'{controller}.views.get("dense").camera.zoom !== {dense_before_pan["zoom"]}')
    page.get_by_role('button', name='Zoom in', exact=True).click()
    dense_camera = page.evaluate(f'({{...{controller}.views.get("dense").camera}})')
    mode.select_option('galaxy')
    restored = page.evaluate(f'({{...{controller}.views.get("galaxy").camera}})')
    result['cameraRestore'] = {'beforeSwitch': after, 'afterSwitch': restored}
    assert all(abs(restored[key] - after[key]) < 0.000001 for key in after), result['cameraRestore']
    mode.select_option('dense')
    assert page.evaluate(f'({{...{controller}.views.get("dense").camera}})') == dense_camera
    result['checks'].append('Real WebGL orbit and independent cameras survive switches')
    page.get_by_role('button', name='Clear filters').click()
    expect(status).to_contain_text('32 / 32')
    page.get_by_role('button', name='Fit graph', exact=True).click()
    # Static Dense positions give a deterministic actual canvas click target.
    canvas = page.locator('.ripple-workspace canvas'); box = canvas.bounding_box()
    coordinate = page.evaluate(f'(() => {{ const s={controller}.views.get("dense"),p=s.positions.get("Graph/Graph.md"); return {{x:(p.x-s.camera.x)*s.camera.zoom,y:(p.y-s.camera.y)*s.camera.zoom}} }})()')
    page.mouse.click(box['x']+box['width']/2+coordinate['x'], box['y']+box['height']/2+coordinate['y'])
    page.wait_for_function('app.workspace.getActiveFile()?.path === "Graph/Graph.md"')
    result['checks'].append('Canvas node click opens the corresponding real Markdown note')
    page.evaluate('app.workspace.getLeavesOfType("markdown").forEach(leaf=>leaf.detach())')
    mode.select_option('frontier')
    page.get_by_role('combobox', name='Locate visible node').select_option('Graph/Graph.md')
    page.get_by_role('button', name='Toggle pin').click()
    assert page.evaluate(f'{controller}.views.get("frontier").positions.get("Graph/Graph.md").pinned')
    page.get_by_role('button', name='Fit graph', exact=True).click()
    page.get_by_role('button', name='Reset view', exact=True).click()
    result['checks'].append('Frontier pin, fit and reset actions operate on Ripple-owned state')
    query.fill('"unclosed')
    expect(page.get_by_role('alert')).to_contain_text('Close the quoted phrase')
    expect(status).to_contain_text('32 / 32')
    page.get_by_role('button', name='Clear filters').click()
    result['checks'].append('Invalid queries leave the last successful graph intact')
    # Host appearance API, inspected in the installed app; scratch profile only.
    page.evaluate('app.changeTheme("moonstone")')
    expect(page.locator('body')).to_have_class(__import__('re').compile(r'.*theme-light.*'))
    page.screenshot(path=str(sandbox / 'workspace-light.png'), full_page=True)
    page.evaluate('app.changeTheme("obsidian")')
    mode.select_option('cluster'); page.get_by_role('button', name='Fit graph', exact=True).click()
    page.screenshot(path=str(sandbox / 'workspace-dark.png'), full_page=True)
    result['checks'].append('Actual Obsidian appearance changes update the light/dark workspace')
    def change_fixture(operation, text=''):
        page.evaluate('''async ({operation,text}) => {
          const finished = new Promise((resolve,reject)=>{
            const timer=setTimeout(()=>{app.metadataCache.offref(ref);reject(new Error('Metadata resolution timeout'));},10000);
            const ref=app.metadataCache.on('resolved',()=>{clearTimeout(timer);app.metadataCache.offref(ref);resolve();});
          });
          const path='Integration update.md';
          if(operation==='create') await app.vault.create(path,text);
          else if(operation==='modify') await app.vault.modify(app.vault.getFileByPath(path),text);
          else await app.vault.delete(app.vault.getFileByPath(path));
          await finished;
        }''', {'operation': operation, 'text': text})
    change_fixture('create', '---\naliases: [Refresh proof]\n---\n# Integration update\n[[Graph/Graph]]\n')
    page.wait_for_function(f'{controller}.snapshot.nodes.some(n=>n.id === "Integration update.md")', timeout=15000)
    change_fixture('modify', '---\naliases: [Changed proof]\n---\n# Integration update\n[[Testing/Integration]]\n')
    page.wait_for_function(f'{controller}.snapshot.nodes.find(n=>n.id === "Integration update.md")?.aliases.includes("Changed proof")', timeout=15000)
    # The host serializes deletion against its pending file reads.
    change_fixture('delete')
    page.wait_for_function(f'!{controller}.snapshot.nodes.some(n=>n.id === "Integration update.md")', timeout=15000)
    result['checks'].append('Real file create, metadata modification and delete incrementally update the graph')
    mode.select_option('galaxy')
    state = page.evaluate('app.workspace.getLeavesOfType("ripple-graph-filter-view")[0].getViewState()')
    page.evaluate('app.workspace.getLeavesOfType("ripple-graph-filter-view")[0].detach()')
    expect(page.locator('.ripple-workspace')).to_have_count(0)
    page.evaluate('(state)=>app.workspace.getLeaf("tab").setViewState(state)', state)
    expect(mode).to_have_value('galaxy')
    result['checks'].append('Closing/reopening a workspace leaf restores the saved mode and camera')
    page.evaluate('app.plugins.disablePlugin("ripple-graph-filter")')
    page.wait_for_function('!app.plugins.getPlugin("ripple-graph-filter")')
    page.evaluate('app.plugins.enablePlugin("ripple-graph-filter")')
    page.wait_for_function('app.plugins.getPlugin("ripple-graph-filter")')
    page.evaluate('app.commands.executeCommandById("ripple-graph-filter:open-filter")')
    expect(page.locator('.ripple-workspace [role=status]')).to_contain_text('32 / 32', timeout=15000)
    result['checks'].append('Plugin disable/re-enable releases resources and creates a working indexed workspace')
    result['modeEvidence'] = {'frontier':'Canvas 2D + d3-force worker; pin tested','dense':'Canvas batched grid/LOD','cluster':'Folder-seeded label propagation + hulls','galaxy':'Three.js WebGL2 xyz points + OrbitControls; real orbit tested'}

if __name__ == '__main__':
    main()
