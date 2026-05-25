import { vi } from 'vitest';

export class App {}
export class EventRef {}
export class TAbstractFile {}
export class TFile {}
export class TFolder {}
export class Plugin {}
export class PluginSettingTab {
    app: App;
    plugin: Plugin;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = document.createElement('div');
    }
    display() {}
    hide() {}
}
export class Notice {
    noticeEl: HTMLElement;
    constructor(msg: string, duration?: number) {
        this.noticeEl = document.createElement('div');
        Notice.recordCall(msg, duration);
    }
    setMessage() {}
    hide() {}
    static recordCall = vi.fn();
}
export const parseLinktext = (linktext: string) => {
    const [path, subpath] = linktext.split('#');
    return { path, subpath };
};
export const normalizePath = (p: string) => p;
export const requestUrl = (url: string, options?: RequestInit) =>
    Promise.resolve({
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({}),
    });
export const Platform = {
    isMobile: false,
    isDesktop: true,
    isMacOS: false,
    isWin: true,
    isLinux: false,
};

export class ItemView {
    public contentEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf) {
        this.contentEl = document.createElement('div');
    }
}
export class WorkspaceLeaf {}
export class Modal {
    public contentEl: HTMLElement;
    constructor(app: App) {
        this.contentEl = document.createElement('div');
    }
    open() {}
    close() {}
    onOpen() {}
    onClose() {}
}
export class DropdownComponent {
    addOption() {
        return this;
    }
    setValue() {
        return this;
    }
    onChange() {
        return this;
    }
}
export class Setting {
    public settingEl: HTMLElement;
    constructor(containerEl: HTMLElement) {
        // @ts-ignore
        this.settingEl = containerEl.createDiv ? containerEl.createDiv() : document.createElement('div');
    }
    setName() {
        return this;
    }
    setDesc() {
        return this;
    }
    addDropdown() {
        return this;
    }
    addToggle() {
        return this;
    }
    addSlider() {
        return this;
    }
    addText(cb: (text: unknown) => unknown) {
        cb(new TextComponent(this.settingEl));
        return this;
    }
    addButton(cb: (btn: ButtonComponent) => unknown) {
        cb(new ButtonComponent(this.settingEl));
        return this;
    }
    setHeading() {
        return this;
    }
    setDisabled() {
        return this;
    }
    addSearch() {
        return this;
    }
    addExtraButton() {
        return this;
    }
}
export class ButtonComponent {
    public buttonEl: HTMLButtonElement;
    constructor(containerEl: HTMLElement) {
        this.buttonEl = containerEl.appendChild(document.createElement('button'));
    }
    setButtonText(text: string) {
        this.buttonEl.textContent = text;
        return this;
    }
    setCta() {
        return this;
    }
    onClick(cb: (evt: MouseEvent) => any) {
        this.buttonEl.addEventListener('click', cb);
        return this;
    }
    setDisabled() {
        return this;
    }
    setWarning() {
        return this;
    }
    setIcon() {
        return this;
    }
    setTooltip() {
        return this;
    }
}
export class TextComponent {
    public inputEl: HTMLInputElement;
    constructor(containerEl: HTMLElement) {
        this.inputEl = containerEl.appendChild(document.createElement('input'));
    }
    setValue(val: string) {
        this.inputEl.value = val;
        return this;
    }
    setPlaceholder(text: string) {
        this.inputEl.placeholder = text;
        return this;
    }
    onChange(cb: (val: string) => any) {
        this.inputEl.addEventListener('input', () => cb(this.inputEl.value));
        return this;
    }
    setDisabled() {
        return this;
    }
}
export const setCssProps = (el: HTMLElement, props: Record<string, string>) => {};

// Extend HTMLElement for JSDOM
if (typeof HTMLElement !== 'undefined') {
    HTMLElement.prototype.empty = function (this: HTMLElement) {
        this.innerHTML = '';
    };
    // @ts-ignore
    HTMLElement.prototype.createDiv = function (this: HTMLElement, options?: { cls?: string; text?: string }) {
        const div = document.createElement('div');
        if (options?.cls) div.className = options.cls;
        if (options?.text) div.textContent = options.text;
        this.appendChild(div);
        return div;
    };
    // @ts-ignore
    HTMLElement.prototype.createEl = function (this: HTMLElement, tag: string, options?: { cls?: string; text?: string }) {
        const el = document.createElement(tag);
        if (options?.cls) el.className = options.cls;
        if (options?.text) el.textContent = options.text;
        this.appendChild(el);
        return el;
    };
}
