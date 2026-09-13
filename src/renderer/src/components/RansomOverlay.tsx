import { useCallback, useEffect, useState } from 'react';
import RansomStopSign from '@/assets/ransom/Ransom_StopSign.png';
import Ransom_Taunt5 from '@/assets/ransom/Ransom_Taunt5.png';
import RansomOkSign from '@/assets/ransom/Ransom_OkSign.png';
import RansomSpawn from '@/assets/ransom/Ransom_Spawn.wav';
import RansomCash from '@/assets/ransom/Ransom_Cash.wav';
import RansomThankYou from '@/assets/ransom/Ransom_ThankYou.wav';
interface Props {
    onUnlocked: () => void;
}
const TARGET_FILES = 20;
function play(url: string, volume = 0.9): void {
    try {
        const a = new Audio(url);
        a.volume = volume;
        void a.play().catch(() => { });
    }
    catch {
    }
}
type Phase = 'ransom' | 'thankyou';
export function RansomOverlay({ onUnlocked }: Props): React.JSX.Element {
    const [received, setReceived] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [seconds, setSeconds] = useState(43);
    const [phase, setPhase] = useState<Phase>('ransom');
    const unlocked = received >= TARGET_FILES;
    useEffect(() => {
        play(RansomSpawn, 0.7);
    }, []);
    useEffect(() => {
        if (phase !== 'ransom')
            return;
        const id = window.setInterval(() => {
            setSeconds((s) => (s <= 0 ? 0 : s - 1));
        }, 1000);
        return () => window.clearInterval(id);
    }, [phase]);
    useEffect(() => {
        if (!unlocked || phase !== 'ransom')
            return;
        setPhase('thankyou');
    }, [unlocked, phase]);
    useEffect(() => {
        if (phase !== 'thankyou')
            return;
        play(RansomThankYou, 1);
        const t = window.setTimeout(onUnlocked, 2600);
        return () => window.clearTimeout(t);
    }, [phase, onUnlocked]);
    const handleDragOver = useCallback((e: React.DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(true);
    }, []);
    const handleDragLeave = useCallback((e: React.DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
    }, []);
    const handleDrop = useCallback((e: React.DragEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        setDragging(false);
        if (phase !== 'ransom')
            return;
        const n = e.dataTransfer.files.length;
        if (n > 0) {
            play(RansomCash, 0.8);
            setReceived((r) => Math.min(TARGET_FILES, r + n));
        }
    }, [phase]);
    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
    const ss = String(seconds % 60).padStart(2, '0');
    if (phase === 'thankyou') {
        return (<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden" style={{
                background: 'radial-gradient(circle at center, #28c828 0%, #00b000 40%, #007a00 100%)'
            }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08]" style={{
                backgroundImage: "repeating-linear-gradient(0deg, rgba(0,0,0,0.4) 0px, rgba(0,0,0,0.4) 1px, transparent 1px, transparent 3px)"
            }}/>
        <div className="flex flex-col items-center gap-6">
          <h1 className="text-center text-5xl font-black uppercase tracking-[0.3em] text-white" style={{ textShadow: '4px 4px 0 #000, -2px 0 0 #000' }}>
            THANK
            <span className="ml-1">YOU</span>
          </h1>
          <div className="flex h-28 w-28 items-center justify-center rounded-[14px] border-[6px] border-lime-500 bg-lime-400">
            <img src={RansomOkSign} alt="" className="h-20 w-20 object-contain"/>
          </div>
        </div>
      </div>);
    }
    return (<div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className="fixed inset-0 z-[100] overflow-hidden" style={{
            background: 'radial-gradient(ellipse at center, #7a0f0f 0%, #360000 30%, #100000 60%, #000 100%)'
        }}>
      
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.15]" style={{
            backgroundImage: "repeating-linear-gradient(0deg, rgba(255,0,0,0.5) 0px, rgba(255,0,0,0.5) 1px, transparent 1px, transparent 2px), repeating-linear-gradient(90deg, rgba(0,0,0,0.3) 0px, rgba(0,0,0,0.3) 2px, transparent 2px, transparent 4px)"
        }}/>

      
      <div className="absolute inset-x-0 top-8 flex flex-col items-center gap-2">
        <img src={Ransom_Taunt5} alt="" className="h-20 object-contain opacity-90"/>
        <h1 className="text-center text-2xl font-black uppercase tracking-[0.08em] text-black sm:text-3xl" style={{ textShadow: '1px 1px 0 #fff, -1px -1px 0 #fff', WebkitTextStroke: '1px rgba(255,255,255,0.35)' }}>
          YOUR MODS
          <br />
          HAVE BEEN <span className="text-red-700">ENCRYPTED</span>
        </h1>
      </div>

      
      <div className="absolute left-1/2 top-[52%] w-[90%] max-w-md -translate-x-1/2 -translate-y-1/2">
        <div className="relative bg-gradient-to-b from-red-600 to-red-800 p-[5px] shadow-[0_0_50px_rgba(255,0,0,0.5)]">
          <div className="px-5 py-6 text-center">
            
            <div className="relative mx-auto mb-3 flex w-fit items-center justify-center">
              <span aria-hidden className="absolute -inset-2 -z-10 rounded-full opacity-60 blur-md" style={{ background: 'linear-gradient(90deg,#00f,transparent,#f0f)' }}/>
              <img src={RansomStopSign} alt="" className="h-14 w-14 rotate-[-6deg] object-contain mix-blend-screen"/>
            </div>

            <p className="text-lg font-black uppercase leading-tight text-white">
              YOUR MODS
              <br />
              HAVE BEEN <span className="text-red-300">ENCRYPTED</span>
            </p>
            <p className="mt-3 text-[11px] uppercase leading-snug text-red-200">
              IF YOU DO NOT PAY THIS RANSOM BEFORE THE TIMER ENDS, YOUR MODS
              WILL BE UNRECOVERABLE BY ANY MEANS.
            </p>

            <div className="mx-auto mt-4 flex items-center justify-center gap-3">
              <button type="button" onClick={() => { }} className="flex items-center gap-1 border-2 border-yellow-400 bg-black px-4 py-1 font-black text-yellow-400">
                {received}
                <span className="text-2xl leading-none text-yellow-300">+</span>
              </button>
              <div className="flex items-center border-2 border-red-600 bg-black px-3 py-1">
                <span className="text-xs font-bold uppercase text-red-400">TIME:</span>
                <span className="ml-2 font-mono text-xl font-black text-white">
                  {mm}:{ss}
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3 text-center text-xs uppercase tracking-widest text-red-300/80">
          Drag {TARGET_FILES - received} file(s) into this window to pay
        </p>

        
        <div className="mx-auto mt-2 flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-600"/>
          <span className="h-2.5 w-2.5 rounded-sm bg-purple-700"/>
          <span className="font-mono text-sm font-bold text-[#5a0000]">
            {received}/{TARGET_FILES}
          </span>
        </div>
      </div>

      {dragging && (<div className="pointer-events-none absolute inset-3 z-10 rounded-lg border-4 border-dashed border-red-500/80 bg-red-500/10"/>)}
    </div>);
}
