import { useRef } from 'react';
import { CATEGORY_ICONS, CategoryIcon } from './CategoryIcon';
export function CategoryIconPicker({value,category,onChange}:{value:string;category:string;onChange:(icon:string)=>void}) {
  const details=useRef<HTMLDetailsElement>(null);
  return <details className="category-icon-picker" ref={details} onKeyDown={event=>{if(event.key==='Escape'){details.current!.open=false;details.current?.querySelector('summary')?.focus();}}}>
    <summary aria-label={`Choose icon for ${category || 'new category'}`} title="Choose category icon"><CategoryIcon name={value} size={20}/></summary>
    <div className="category-icon-menu"><span>Choose an icon</span><div className="category-icon-grid">{CATEGORY_ICONS.map(item=><button type="button" key={item.name} aria-label={item.label} title={item.label} aria-pressed={item.name===value} onClick={()=>{onChange(item.name);details.current!.open=false;details.current?.querySelector('summary')?.focus();}}><CategoryIcon name={item.name} size={21}/></button>)}</div></div>
  </details>;
}
