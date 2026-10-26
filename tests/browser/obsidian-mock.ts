// Browser-only SDK fixture. Never imported by production or shipped in main.js.
type ElementOptions = {
  cls?: string;
  text?: string;
  type?: string;
  value?: string;
  attr?: Record<string, string>;
};

export function installDomHelpers(): void {
  const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;
  prototype.empty = function (this: HTMLElement) {
    this.replaceChildren();
  };
  prototype.addClass = function (this: HTMLElement, value: string) {
    this.classList.add(value);
  };
  prototype.setText = function (this: HTMLElement, value: string) {
    this.textContent = value;
  };
  prototype.createEl = function (this: HTMLElement, name: string, options: ElementOptions = {}) {
    const element = this.ownerDocument.createElement(name);
    if (options.cls) element.className = options.cls;
    if (options.text) element.textContent = options.text;
    if (options.type) element.setAttribute('type', options.type);
    if (options.value !== undefined) element.setAttribute('value', options.value);
    for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
    this.appendChild(element);
    return element;
  };
  prototype.createDiv = function (this: HTMLElement, options: ElementOptions = {}) {
    return this.createEl('div', options);
  };
  prototype.createSpan = function (this: HTMLElement, options: ElementOptions = {}) {
    return this.createEl('span', options);
  };
  prototype.appendText = function (this: HTMLElement, text: string) {
    this.appendChild(this.ownerDocument.createTextNode(text));
  };
}

export class TFile {
  stat = { mtime: 1, size: 10 };
  constructor(
    readonly path: string,
    readonly basename: string,
  ) {}
}
export function getAllTags(cache: { tags?: { tag: string }[] }): string[] {
  return cache.tags?.map((entry) => entry.tag) ?? [];
}
export class Notice {
  constructor(readonly text: string) {}
}
export class ItemView {
  readonly app: unknown;
  readonly contentEl: HTMLElement;
  readonly containerEl: HTMLElement;
  private readonly cleanup: (() => void)[] = [];
  constructor(leaf: { app: unknown; contentEl: HTMLElement }) {
    this.app = leaf.app;
    this.contentEl = leaf.contentEl;
    this.containerEl = leaf.contentEl;
  }
  register(cleanup: () => void): void {
    this.cleanup.push(cleanup);
  }
  registerEvent(cleanup: () => void): void {
    this.cleanup.push(cleanup);
  }
  unload(): void {
    for (const callback of this.cleanup.reverse()) callback();
  }
  async setState(): Promise<void> {}
}

export class Setting {
  readonly descEl: HTMLElement;
  readonly controlEl: HTMLElement;
  private readonly nameEl: HTMLElement;
  constructor(container: HTMLElement) {
    const row = container.createDiv({ cls: 'setting-item' });
    const info = row.createDiv({ cls: 'setting-item-info' });
    this.nameEl = info.createDiv({ cls: 'setting-item-name' });
    this.descEl = info.createDiv({ cls: 'setting-item-description' });
    this.controlEl = row.createDiv({ cls: 'setting-item-control' });
  }
  setName(name: string): this {
    this.nameEl.textContent = name;
    return this;
  }
  setDesc(desc: string): this {
    this.descEl.textContent = desc;
    return this;
  }
  addText(
    callback: (value: { inputEl: HTMLInputElement; setPlaceholder(value: string): void }) => void,
  ): this {
    const inputEl = this.controlEl.createEl('input', { type: 'text' });
    callback({
      inputEl,
      setPlaceholder(value) {
        inputEl.placeholder = value;
      },
    });
    return this;
  }
  addSlider(callback: (value: Slider) => void): this {
    callback(new Slider(this.controlEl));
    return this;
  }
  addDropdown(callback: (value: Dropdown) => void): this {
    callback(new Dropdown(this.controlEl));
    return this;
  }
}
class Slider {
  readonly sliderEl: HTMLInputElement;
  constructor(container: HTMLElement) {
    this.sliderEl = container.createEl('input', { type: 'range' });
  }
  setLimits(min: number, max: number, step: number): this {
    this.sliderEl.min = String(min);
    this.sliderEl.max = String(max);
    this.sliderEl.step = String(step);
    return this;
  }
  setValue(value: number): this {
    this.sliderEl.value = String(value);
    return this;
  }
}
class Dropdown {
  readonly selectEl: HTMLSelectElement;
  constructor(container: HTMLElement) {
    this.selectEl = container.createEl('select');
  }
  addOption(value: string, text: string): this {
    this.selectEl.createEl('option', { value, text });
    return this;
  }
}
