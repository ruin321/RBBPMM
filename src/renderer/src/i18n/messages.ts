import type { en } from './locales/en';
export type Messages = {
    [K in keyof typeof en]: string;
};
