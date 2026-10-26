"""Reproducible renderer/index measurements, synthetic host, real browser graphics."""
import json
import argparse
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
output = root / 'reports' / 'browser'
observations = []
parser = argparse.ArgumentParser()
parser.add_argument('--size', nargs='+', type=int, default=[1000,10000,50000])
sizes = parser.parse_args().size
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'])
    for count in sizes:
        print(f'Benchmark nodes={count}', flush=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.set_default_timeout(90000)
        page.goto((output / 'index.html').as_uri())
        page.wait_for_load_state('networkidle')
        started = time.perf_counter()
        page.evaluate('(count)=>rippleFixture.loadSynthetic(count)', count)
        index_wall_ms = (time.perf_counter() - started) * 1000
        expect(page.locator('[role=status]')).to_contain_text(f'{count} / {count}')
        for mode in ['frontier', 'dense', 'cluster', 'galaxy']:
            print(f'  mode={mode}', flush=True)
            started = time.perf_counter()
            page.get_by_role('combobox', name='Graph mode').select_option(mode)
            expect(page.locator('canvas')).to_have_attribute('data-mode', mode)
            page.wait_for_function('document.querySelector("canvas").dataset.drawMs !== undefined')
            initialization_wall_ms = (time.perf_counter() - started) * 1000
            page.wait_for_timeout(100)
            metrics = page.evaluate('''async () => {
              const intervals = []; let previous = performance.now();
              for(let i=0;i<12;i++){document.querySelector('button[aria-label="Zoom in"]').click(); await new Promise(requestAnimationFrame); const current=performance.now();intervals.push(current-previous);previous=current;}
              const canvas=document.querySelector('canvas');return {frameIntervalsMs:intervals,cpuDrawMs:Number(canvas.dataset.drawMs),firstDrawMs:Number(canvas.dataset.firstDrawMs??0),contextMs:Number(canvas.dataset.contextMs??0),geometryMs:Number(canvas.dataset.geometryMs??0),drawnNodes:Number(canvas.dataset.drawnNodes??0),heapUsedMiB:performance.memory?.usedJSHeapSize/1024**2};
            }''')
            observations.append({'nodes': count, 'edges': page.evaluate('rippleFixture.controller.snapshot.edges.length'), 'mode': mode, 'syntheticIndexAndControllerWallMs': index_wall_ms, 'modeInitializationWallMs': initialization_wall_ms, **metrics})
            page.get_by_role('button', name='Fit graph').click()
        page.evaluate('rippleFixture.shutdown()')
        page.close()
    version = browser.version
    browser.close()
result = {'environment': f'Chromium {version}, headless SwiftShader, 1440x1000, synthetic Mock SDK host', 'note': 'Single run per size/mode. Initialization includes automation roundtrip; CPU draw is command submission, not GPU completion. Heap excludes worker/GPU memory; no forced GC. Frame intervals sampled during toolbar zoom. No claim of real Vault performance.', 'observations': observations}
(root / 'reports' / 'render-benchmark.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
