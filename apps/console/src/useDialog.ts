import {useEffect,useRef} from 'react';
export function useDialog(active:boolean,onClose:()=>void) {
  const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    if(!active)return;
    const previous=document.activeElement as HTMLElement|null;
    const dialog=document.querySelector<HTMLElement>('[role="dialog"]');
    if(!dialog)return;
    const elements=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]'));
    (dialog.querySelector<HTMLElement>('input,button:not(.close)') || elements()[0])?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();close.current();}
      if(event.key==='Tab'){
        const list=elements(),first=list[0],last=list.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('keydown',keydown);previous?.focus();};
  },[active]);
}
