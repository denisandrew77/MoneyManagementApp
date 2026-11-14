import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plane, ArrowUpRight, Check, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { CategoryIcon } from '../components/CategoryIcon';
import { AppShell } from '../components/AppShell';
import { useAppUpdates } from '../components/AppUpdates';
import { useAuth } from '../components/AuthProvider';
import { currentMonth, money, todayInBucharest } from '../lib/format';
import { decimalUnits } from '../lib/budget';
import { accountLabel, createRefund, deleteTransaction, editTransaction, HISTORY_PAGE_SIZE, kindLabel, loadHistory, loadHistoryCategories, type HistoryFilters, type Transaction } from '../lib/history';

type Action = 'edit' | 'delete' | 'refund';
export function History() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<HistoryFilters>({month:currentMonth().slice(0,7),kind:'',account:'',category:''});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<{ row:Transaction; action:Action } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const history = useQuery({queryKey:['history',session?.user.id,filters,page],queryFn:() => loadHistory(filters,page)});
  const categories = useQuery({queryKey:['history-categories',session?.user.id],queryFn:loadHistoryCategories});
  useEffect(() => {
    if (history.data && page > 0 && history.data.count <= page*HISTORY_PAGE_SIZE) setPage(Math.max(0,Math.ceil(history.data.count/HISTORY_PAGE_SIZE)-1));
  },[history.data,page]);
  function filter(patch:Partial<HistoryFilters>) { setPage(0); setFilters(current=>({...current,...patch})); }
  function open(row:Transaction,action:Action) { setMessage(null); setSelected({row,action}); }
  function completed(text:string) {
    setSelected(null); setMessage(text);
    void queryClient.invalidateQueries({queryKey:['history']});
    void queryClient.invalidateQueries({queryKey:['dashboard']});
  }
  return <AppShell><main className="dashboard history-page"><div className="page-heading"><div><span className="eyebrow muted">YOUR RECORDS</span><h1>Transactions<span className="wave">.</span></h1></div></div>
    <section className="white-panel history-filters" aria-label="Filter transactions">
      <div><label htmlFor="history-month" className="field-label">Month</label><input id="history-month" className="text-input" type="month" value={filters.month} onChange={e=>filter({month:e.target.value})}/><button className="text-button" type="button" onClick={()=>filter({month:filters.month ? '' : currentMonth().slice(0,7)})}>{filters.month ? 'Show all months' : 'Show this month'}</button></div>
      <div><label htmlFor="history-kind" className="field-label">Type</label><select id="history-kind" className="text-input" value={filters.kind} onChange={e=>filter({kind:e.target.value})}><option value="">All transactions</option><option value="expense">Expenses</option><option value="top_up">Top-ups</option><option value="refund">Refunds</option></select></div>
      <div><label htmlFor="history-account" className="field-label">Account</label><select id="history-account" className="text-input" value={filters.account} onChange={e=>filter({account:e.target.value})}><option value="">Both accounts</option><option value="flying_blue">Flying Blue</option><option value="personal">Personal</option></select></div>
      <div><label htmlFor="history-category" className="field-label">Category</label><select id="history-category" className="text-input" value={filters.category} onChange={e=>filter({category:e.target.value})}><option value="">All categories</option>{categories.data?.map(c=><option key={c.id} value={c.id}>{c.name}{c.is_archived ? ' (archived)' : ''}</option>)}</select></div>
    </section>
    {categories.isError && <div role="alert" className="notice error">Categories could not load. <button type="button" className="text-button" onClick={()=>categories.refetch()}>Retry</button></div>}
    {message && <div role="status" className="save-success"><Check size={17}/>{message}</div>}
    {history.isPending ? <div className="empty-panel history-results" role="status">Loading transactions…</div> : history.isError && !history.data ? <div className="empty-panel history-results"><p role="alert">{history.error.message}</p><button className="primary-button" type="button" onClick={()=>history.refetch()}>Try again</button></div> : <section className="white-panel history-results" aria-label="Transaction history">
      <div className="section-heading"><h2>{history.data.count} transaction{history.data.count===1?'':'s'}</h2><span>Newest first</span></div>
      {history.isError && <div className="notice error" role="alert">Could not refresh. Showing previously loaded records.</div>}
      {!history.data.rows.length ? <div className="empty-state"><RotateCcw size={28}/><h3>No transactions here yet.</h3><p>Try another month or change the filters.</p></div> : <ul className="transaction-list">{history.data.rows.map(row=><li key={`${row.kind}:${row.id}`} className="transaction-item">
        <div className={`transaction-icon ${row.kind}`}>{row.kind==='expense'?<CategoryIcon name={categories.data?.find(c=>c.id===row.category_id)?.icon} size={21}/>:row.kind==='refund'?<RotateCcw size={20}/>:<Plane size={21}/>}</div>
        <div className="transaction-details"><div className="transaction-topline"><strong>{row.kind==='top_up'?'Flying Blue top-up':row.category_name || kindLabel(row.kind)}</strong><strong className={row.kind==='expense'?'':'positive-text'}>{row.kind==='expense'?'−':'+'}{money(row.amount)}</strong></div>
          <p>{kindLabel(row.kind)} · {row.kind==='top_up'?'Personal → Flying Blue':accountLabel(row.account)} · {new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${row.date}T12:00:00`))}</p>
          {row.kind==='expense' && row.refund_count>0 && <span className="refund-badge">{row.remaining_refundable===0?'Fully refunded':`${money(row.refunded_amount)} refunded · ${money(row.remaining_refundable)} refundable`}</span>}
          {row.kind==='refund' && <span className="refund-badge">For {money(row.expense_amount ?? 0)} purchase on {row.expense_date}</span>}
          {row.description && <p>{row.description}</p>}
          <div className="transaction-actions"><button type="button" onClick={()=>open(row,'edit')}><Pencil size={13}/>Edit</button>{row.kind==='expense' && row.remaining_refundable>0 && <button type="button" onClick={()=>open(row,'refund')}><RotateCcw size={13}/>Refund</button>}<button type="button" className="danger-text" onClick={()=>open(row,'delete')}><Trash2 size={13}/>Delete</button></div>
        </div>
      </li>)}</ul>}
      {history.data.count>HISTORY_PAGE_SIZE && <div className="history-pagination"><button type="button" disabled={page===0 || history.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} of {Math.ceil(history.data.count/HISTORY_PAGE_SIZE)}</span><button type="button" disabled={(page+1)*HISTORY_PAGE_SIZE>=history.data.count || history.isFetching} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
    </section>}
    {selected && <TransactionDialog key={`${selected.action}:${selected.row.id}`} {...selected} categories={categories.data ?? []} onClose={()=>setSelected(null)} onComplete={completed}/>}
  </main></AppShell>;
}

function TransactionDialog({row,action,categories,onClose,onComplete}:{row:Transaction;action:Action;categories:{id:string;name:string}[];onClose:()=>void;onComplete:(message:string)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const {setUpdateBlocked}=useAppUpdates();
  const [amount,setAmount]=useState(action==='refund' ? String(row.remaining_refundable) : String(row.amount));
  const [date,setDate]=useState(action==='refund' ? todayInBucharest() : row.date);
  const [account,setAccount]=useState(row.account);
  const [category,setCategory]=useState(row.category_id ?? '');
  const [full,setFull]=useState(true);
  const [deleteRefunds,setDeleteRefunds]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const saving=useRef(false);
  const requestId=useRef<string | null>(null);
  const [error,setError]=useState<string | null>(null);
  useEffect(()=>{
    const element=dialog.current;
    element?.showModal(); setUpdateBlocked(true);
    return ()=>{element?.close();setUpdateBlocked(false);};
  },[setUpdateBlocked]);
  function close() { if (saving.current) return; if (dirty && !window.confirm('Discard these unsaved changes?')) return; onClose(); }
  function changed() { setDirty(true);setError(null); }
  const cents=decimalUnits(amount,2);
  const amountValid=cents!==null && cents>0n && cents<=99_999_999_999_999n;
  const amountNumber=amountValid?Number(cents)/100:0;
  const maxRefund=action==='refund'?row.remaining_refundable:row.remaining_refundable+row.amount;
  const maxDate=action==='edit' && row.kind==='expense' && row.first_refund_date ? row.first_refund_date : todayInBucharest();
  const minDate=(action==='refund'||row.kind==='refund')?row.expense_date ?? undefined:undefined;
  const linked=action!=='refund' && row.kind==='expense' && row.refund_count>0;
  const dateValid=!!date && date<=maxDate && (!minDate || date>=minDate);
  const valid=action==='delete' ? !linked || deleteRefunds : dateValid && (action==='refund' && full ? row.remaining_refundable>0 : amountValid) &&
    (!(action==='refund' || row.kind==='refund') || (full && action==='refund') || amountNumber<=maxRefund) &&
    (!(action==='edit' && row.kind==='expense') || (!!category && amountNumber>=row.refunded_amount));
  async function submit(event:FormEvent) {
    event.preventDefault();if (!valid || saving.current) return;
    saving.current=true;setBusy(true);setError(null);
    try {
      if (action==='delete') { await deleteTransaction(row,deleteRefunds);onComplete(`${kindLabel(row.kind)} deleted${linked?' with its linked refunds':''}. Balances recalculated.`); }
      else if (action==='edit') { await editTransaction(row,amount,date,account,category);onComplete(`${kindLabel(row.kind)} updated. Balances recalculated.`); }
      else { requestId.current ??= crypto.randomUUID(); const refunded=await createRefund(requestId.current,row,amount,full,date,account);onComplete(`${money(refunded)} refund saved to ${accountLabel(account)}.`); }
    } catch(err) { setError(err instanceof Error?err.message:'Could not save. Please try again.'); }
    finally {saving.current=false;setBusy(false);}
  }
  const title=action==='refund'?'Refund expense':action==='delete'?`Delete ${kindLabel(row.kind).toLowerCase()}?`:`Edit ${kindLabel(row.kind).toLowerCase()}`;
  return <dialog data-no-pull-refresh className="transaction-dialog" ref={dialog} aria-labelledby="transaction-dialog-title" onCancel={e=>{e.preventDefault();close();}}>
    <div className="dialog-heading"><h2 id="transaction-dialog-title">{title}</h2><button type="button" aria-label="Close" disabled={busy} onClick={close}><X size={20}/></button></div>
    <p className="dialog-context">{row.category_name || 'Personal → Flying Blue'} · {money(row.amount)} · {row.date}</p>
    <form onSubmit={submit} aria-busy={busy}><fieldset className="budget-fieldset" disabled={busy}>
      {action==='delete'?<><p className="dialog-note">This removes the record and recalculates account credit and affected monthly budgets. This action cannot be undone.</p>{linked && <label className="delete-refunds-confirm"><input type="checkbox" checked={deleteRefunds} onChange={e=>{changed();setDeleteRefunds(e.target.checked);}}/>Also delete all {row.refund_count} linked refund{row.refund_count===1?'':'s'} ({money(row.refunded_amount)})</label>}</>:<>
        {action==='refund' && <><div className="refund-available"><span>Already refunded: {money(row.refunded_amount)}</span><strong>Available to refund: {money(row.remaining_refundable)}</strong></div><div className="refund-mode" role="group" aria-label="Refund amount"><button type="button" aria-pressed={full} onClick={()=>{changed();setFull(true);}}>Refund remaining {money(row.remaining_refundable)}</button><button type="button" aria-pressed={!full} onClick={()=>{changed();setFull(false);setAmount('');}}>Partial refund</button></div></>}
        {!(action==='refund' && full) && <><label htmlFor="transaction-amount" className="field-label">Amount (lei)</label><input id="transaction-amount" className="text-input" inputMode="decimal" value={amount} onChange={e=>{changed();setAmount(e.target.value);}} required/>{(action==='refund'||row.kind==='refund') && amountValid && amountNumber>maxRefund && <p className="danger-text field-help">Maximum refund: {money(maxRefund)}.</p>}{linked && amountValid && amountNumber<row.refunded_amount && <p className="danger-text field-help">Amount must cover the {money(row.refunded_amount)} already refunded.</p>}</>}
        <label htmlFor="transaction-date" className="field-label">{action==='refund'||row.kind==='refund'?'Refund date':'Date'}</label><input id="transaction-date" className="text-input" type="date" value={date} min={minDate} max={maxDate} required onChange={e=>{changed();setDate(e.target.value);}}/>
        {row.kind!=='top_up' && <><label className="field-label" htmlFor="transaction-account">{action==='refund'||row.kind==='refund'?'Refund received in':'Paid from'}</label><select id="transaction-account" className="text-input" value={account} disabled={linked} onChange={e=>{changed();setAccount(e.target.value as typeof account);}}><option value="flying_blue">Flying Blue</option><option value="personal">Personal</option></select></>}
        {action==='edit' && row.kind==='expense' && <><label className="field-label" htmlFor="transaction-category">Category</label><select id="transaction-category" className="text-input" value={category} required disabled={linked} onChange={e=>{changed();setCategory(e.target.value);}}>{!categories.some(c=>c.id===category) && <option value={category}>{row.category_name}</option>}{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></>}
        {linked && <p className="dialog-note">This expense has refunds. Remove its refunds before changing the account or category; the amount must cover existing refunds and the purchase date cannot be after them.</p>}
        {(action==='refund'||row.kind==='refund') && <p className="dialog-note">Refunds restore the original category’s budget in the month received. Only refunds received in Flying Blue increase its credit.</p>}
        {action==='edit' && row.kind==='expense' && !linked && <p className="dialog-note">Overspending is allowed. Historical corrections also recalculate later carried shortfalls.</p>}
      </>}
      {error && <div role="alert" className="notice error">{error}</div>}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={close}>Cancel</button><button className={action==='delete'?'danger-button':'primary-button'} type="submit" disabled={!valid || busy}>{busy?'Saving…':action==='delete'?'Delete permanently':action==='refund'?'Save refund':'Save changes'}</button></div>
    </fieldset></form>
  </dialog>;
}
