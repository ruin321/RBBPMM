import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import splashUrl from '@/assets/splash.png';
interface Props {
    onDone: () => void;
}
export function SplashScreen({ onDone }: Props): React.JSX.Element {
    const [loaded, setLoaded] = useState(false);
    const [fading, setFading] = useState(false);
    const [failed, setFailed] = useState(false);
    const doneRef = useRef(onDone);
    doneRef.current = onDone;
    const visible = loaded || failed;
    useEffect(() => {
        if (!visible)
            return undefined;
        const fadeOutAt = window.setTimeout(() => setFading(true), 2600);
        const hardEsc = window.setTimeout(() => doneRef.current(), 8000);
        return () => {
            window.clearTimeout(fadeOutAt);
            window.clearTimeout(hardEsc);
        };
    }, [visible]);
    useEffect(() => {
        if (fading) {
            const t = window.setTimeout(() => doneRef.current(), 900);
            return () => window.clearTimeout(t);
        }
        return undefined;
    }, [fading]);
    return (<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-black transition-opacity duration-700 ease-in-out" style={{ opacity: fading ? 0 : 1 }} aria-hidden>
      {failed ? (<div className="text-lg font-semibold text-white/70">
          Ruin321&apos;s Baldi&apos;s Basics Plus Mod Manager
        </div>) : (<img src={splashUrl} alt="" className="max-h-[80vh] max-w-[80vw] object-contain transition-opacity duration-1000 ease-in-out" style={{ opacity: loaded ? 1 : 0 }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)}/>)}
    </div>);
}
