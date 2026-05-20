export class App {}
export class EventRef {}
export class TAbstractFile {}
export class TFile {}
export class TFolder {}
export class Plugin {}
export class Notice {
    noticeEl: unknown;
    constructor(msg: unknown, duration?: number) {
        this.noticeEl = document.createElement('div');
    }
    setMessage() {}
    hide() {}
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
    addText() {
        return this;
    }
    addButton() {
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
    constructor(containerEl: HTMLElement) {}
    setButtonText() {
        return this;
    }
    setCta() {
        return this;
    }
    onClick() {
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
export const setCssProps = (el: HTMLElement, props: Record<string, string>) => {};

// Extend HTMLElement for JSDOM
if (typeof HTMLElement !== 'undefined') {
    HTMLElement.prototype.empty = function(this: HTMLElement) {
        this.innerHTML = '';
    };
    // @ts-ignore
    HTMLElement.prototype.createDiv = function(this: HTMLElement, options?: { cls?: string; text?: string }) {
        const div = document.createElement('div');
        if (options?.cls) div.className = options.cls;
        if (options?.text) div.textContent = options.text;
        this.appendChild(div);
        return div;
    };
}
