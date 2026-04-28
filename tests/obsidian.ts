export class App {}
export class EventRef {}
export class TAbstractFile {}
export class TFile {}
export class TFolder {}
export class Plugin {}
export const parseLinktext = () => ({});
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
