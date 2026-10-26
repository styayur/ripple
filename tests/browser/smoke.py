"""Production workspace/renderers with a mock SDK; real Canvas/WebGL/Worker APIs."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[2]
output = root / 'reports' / 'browser'
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto((output / 'index.html').as_uri())
    page.wait_for_load_state('networkidle')
    status = page.locator('[role=status]')
    expect(status).to_contain_text('32 / 32')
    expect(page.get_by_role('slider')).to_be_disabled()
    checks.append('Initial graph contains all candidates; empty query disables strictness slider')
    query = page.get_by_role('textbox', name='Graph query')
    mode = page.get_by_role('combobox', name='Graph mode')
    query.fill('Graph')
    page.wait_for_timeout(120)
    page.get_by_role('slider').fill('65')
    expect(status).to_contain_text('8 / 32')
    expected_ids = page.evaluate('[...rippleFixture.controller.visible.ids].sort()')
    read_count = page.evaluate('rippleFixture.reads')
    for name in ['dense', 'cluster', 'galaxy', 'frontier']:
        mode.select_option(name)
        expect(page.locator('canvas')).to_have_attribute('data-mode', name)
        expect(query).to_have_value('Graph')
        expect(page.get_by_role('slider')).to_have_value('65')
        assert page.evaluate('[...rippleFixture.controller.visible.ids].sort()') == expected_ids
        page.screenshot(path=str(output / f'{name}.png'), full_page=True)
    assert read_count == page.evaluate('rippleFixture.reads') == 0
    checks.append('All four actual renderers receive identical IDs/query/threshold without body reads')
    details = page.locator('.ripple-inspector')
    details.locator('summary').click()
    page.get_by_role('combobox', name='Locate visible node').select_option('Graph/Graph.md')
    expect(page.get_by_text('Graph/Graph.md', exact=True).first).to_be_visible()
    for name in ['dense', 'cluster', 'galaxy']:
        mode.select_option(name)
        assert page.evaluate('[...rippleFixture.controller.selected]') == ['Graph/Graph.md']
    checks.append('Selection and inspector survive mode changes')
    canvas = page.locator('canvas')
    box = canvas.bounding_box()
    before = page.evaluate('({...rippleFixture.controller.views.get("galaxy").camera})')
    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
    page.mouse.down()
    page.mouse.move(box['x'] + box['width']/2 + 100, box['y'] + box['height']/2 + 60, steps=8)
    page.mouse.up()
    after = page.evaluate('({...rippleFixture.controller.views.get("galaxy").camera})')
    assert before != after
    assert page.locator('canvas').get_attribute('data-rendering') == 'webgl-3d'
    assert page.evaluate('[...rippleFixture.controller.views.get("galaxy").positions.values()].some(p => Math.abs(p.z)>1)')
    checks.append('Galaxy uses perspective WebGL geometry with real depth and orbit controls')
    mode.select_option('dense')
    page.get_by_role('button', name='Zoom in', exact=True).click()
    dense_zoom = page.evaluate('rippleFixture.controller.views.get("dense").camera.zoom')
    page.get_by_role('button', name='Zoom in', exact=True).focus()
    page.keyboard.press('Enter')
    assert page.evaluate('rippleFixture.controller.views.get("dense").camera.zoom') > dense_zoom
    dense_zoom = page.evaluate('rippleFixture.controller.views.get("dense").camera.zoom')
    mode.select_option('galaxy')
    restored = page.evaluate('({...rippleFixture.controller.views.get("galaxy").camera})')
    assert all(abs(restored[key]-after[key]) < 0.000001 for key in after)
    mode.select_option('dense')
    assert page.evaluate('rippleFixture.controller.views.get("dense").camera.zoom') == dense_zoom
    checks.append('Each mode retains an independent camera across switches')
    page.get_by_role('button', name='Open selected note').click()
    assert page.evaluate('rippleFixture.lastOpened') == 'Graph/Graph.md'
    checks.append('Selected node resolves to the corresponding note path (Mock host openFile)')
    query.fill('"unclosed')
    expect(page.get_by_role('alert')).to_contain_text('Close the quoted phrase')
    assert page.evaluate('[...rippleFixture.controller.visible.ids].sort()') == expected_ids
    page.get_by_role('button', name='Clear filters').click()
    expect(status).to_contain_text('32 / 32')
    checks.append('Query failure is atomic and clear restores the complete graph')
    query.fill('nonexistent')
    page.wait_for_timeout(120)
    page.get_by_role('slider').fill('100')
    expect(status).to_contain_text('0 / 32')
    for name in ['frontier', 'dense', 'cluster', 'galaxy']:
        mode.select_option(name)
        expect(page.locator('canvas')).to_have_attribute('data-visible-count', '0')
    page.get_by_role('button', name='Clear filters').click()
    checks.append('Every mode initializes and renders an empty visible graph')
    page.locator('.ripple-advanced summary').click()
    page.get_by_role('checkbox', name='Include note text').check()
    page.wait_for_function('rippleFixture.reads === 32')
    reads = page.evaluate('rippleFixture.reads')
    page.get_by_role('button', name='Refresh index').click()
    page.wait_for_timeout(150)
    assert page.evaluate('rippleFixture.reads') == reads
    page.evaluate('rippleFixture.modify()')
    assert page.evaluate('rippleFixture.reads') == reads + 1
    checks.append('Opt-in body cache reuses unchanged notes and reads only a modified body')
    page.evaluate('document.body.classList.add("dark")')
    page.evaluate('rippleFixture.controller.setMode("cluster")')
    page.screenshot(path=str(output / 'dark.png'), full_page=True)
    page.set_viewport_size({'width': 600, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    checks.append('Dark theme and narrow workspace remain usable without page overflow')
    page.evaluate('rippleFixture.close()')
    expect(page.locator('canvas')).to_have_count(0)
    page.evaluate('rippleFixture.mount()')
    expect(status).to_contain_text('32 / 32')
    page.evaluate('rippleFixture.empty()')
    expect(status).to_contain_text('0 / 0')
    page.evaluate('rippleFixture.shutdown()')
    assert page.evaluate('[...rippleFixture.handlers.values()].every(set => set.size === 0)')
    checks.append('View remount, empty Vault and plugin disposal release events/canvas resources')
    assert not errors, errors
    page.close()
    failure = browser.new_page(viewport={'width': 1200, 'height': 900})
    failure.add_init_script('const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(kind,...args){if(String(kind).startsWith("webgl"))return null;return original.call(this,kind,...args)}')
    failure.goto((output / 'index.html').as_uri())
    failure.wait_for_load_state('networkidle')
    failure.get_by_role('combobox', name='Graph mode').select_option('galaxy')
    expect(failure.get_by_role('alert')).to_contain_text('WebGL 2')
    failure.get_by_role('combobox', name='Graph mode').select_option('frontier')
    expect(failure.locator('canvas')).to_have_attribute('data-mode', 'frontier')
    checks.append('WebGL initialization failure is explicit and switching to 2D recovers')
    browser.close()
(output / 'results.json').write_text(json.dumps({'environment': 'Chromium headless / SwiftShader + mocked Obsidian SDK; real Canvas, WebGL and Workers', 'checks': checks, 'pageErrors': errors}, indent=2), encoding='utf-8')
print(json.dumps({'passed': len(checks), 'checks': checks}, indent=2))
