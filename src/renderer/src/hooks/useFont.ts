import { useCallback, useEffect, useState } from 'react';
export function useFont(): {
    font: string;
    fonts: string[];
    setFont: (f: string) => void;
} {
    const [font, setFontState] = useState('Comic Sans MS');
    const [fonts, setFonts] = useState<string[]>([]);
    useEffect(() => {
        let active = true;
        void window.api.app.getFont().then((f) => {
            if (active)
                apply(f);
        });
        void window.api.app.listFonts().then((list) => {
            if (active)
                setFonts(list);
        });
        const unsub = window.api.app.onFontChanged((f) => {
            if (active)
                apply(f);
        });
        return () => {
            active = false;
            unsub();
        };
    }, []);
    const apply = (f: string): void => {
        setFontState(f);
        document.body.style.fontFamily = f;
    };
    const setFont = useCallback((f: string) => {
        apply(f);
        void window.api.app.setFont(f);
    }, []);
    return { font, fonts, setFont };
}
