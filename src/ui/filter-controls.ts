import { Setting } from 'obsidian';

export interface FilterControls {
  query: HTMLInputElement;
  slider: HTMLInputElement;
  source: HTMLSelectElement;
  view: HTMLSelectElement;
  content: HTMLInputElement;
  percent: HTMLElement;
  refresh: HTMLButtonElement;
  clear: HTMLButtonElement;
}

export function createControls(container: HTMLElement): FilterControls {
  const querySetting = new Setting(container)
    .setName('Query')
    .setDesc('Words, "phrases", title:, alias:, tag:, path:, content: and -exclusions.');
  let query!: HTMLInputElement;
  querySetting.addText((input) => {
    query = input.inputEl;
    input.setPlaceholder('Find a thread in your notes');
  });
  query.setAttribute('aria-label', 'Graph filter query');
  query.maxLength = 512;
  const rangeSetting = new Setting(container).setName('Relevance threshold');
  const percent = rangeSetting.descEl;
  let slider!: HTMLInputElement;
  rangeSetting.addSlider((control) => {
    slider = control.sliderEl;
    control.setLimits(0, 100, 1).setValue(50);
  });
  slider.setAttribute('aria-label', 'Relevance threshold percent');
  const sourceSetting = new Setting(container).setName('Graph source');
  let source!: HTMLSelectElement;
  sourceSetting.addDropdown((dropdown) => {
    source = dropdown.selectEl;
    dropdown.addOption('standalone', 'Ripple standalone graph');
    dropdown.addOption('graphfrontier', 'GraphFrontier snapshot (read-only)');
  });
  source.setAttribute('aria-label', 'Graph source');
  const viewSetting = new Setting(container).setName('GraphFrontier view');
  let view!: HTMLSelectElement;
  viewSetting.addDropdown((dropdown) => {
    view = dropdown.selectEl;
  });
  view.setAttribute('aria-label', 'GraphFrontier view');
  const bodySetting = new Setting(container)
    .setName('Include note text')
    .setDesc('Local read only; limited to 32,768 characters per note and 8 million total.');
  const content = bodySetting.controlEl.createEl('input', { type: 'checkbox' });
  content.setAttribute('aria-label', 'Include note text in relevance scoring');
  const actions = container.createDiv({ cls: 'ripple-actions' });
  const refresh = actions.createEl('button', { text: 'Refresh graph' });
  const clear = actions.createEl('button', { text: 'Clear and restore' });
  return { query, slider, source, view, content, percent, refresh, clear };
}
