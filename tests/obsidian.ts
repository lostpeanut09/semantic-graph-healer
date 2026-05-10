export class App {}
export class EventRef {}
export class TAbstractFile {}
export class TFile {}
export class TFolder {}
export class Plugin {}
export class Notice {
    noticeEl: any;
    constructor(msg: any, duration?: number) {
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
