'use strict';
const $=id=>document.getElementById(id);
let tabId;
async function refresh(){
 try{
  const tabs=await chrome.tabs.query({active:true,currentWindow:true});tabId=tabs[0]?.id;
  const value=await chrome.runtime.sendMessage({type:'radar-state',tabId});
  if(value?.error)throw Error(value.error);
  $('enabled').checked=!!value.prefs.enabled;$('radar').checked=!!value.prefs.radar;
  $('site').textContent=value.active.hostname||'Browser/internal page';
  $('status').textContent=!value.active.supported?'Canvas injection is unavailable on this page.':value.active.excepted?'This hostname is excepted. Reload after changing exceptions.':value.status?.detail||'Registration status unavailable.';
  const host=$('activity');host.replaceChildren();
  const frames=Object.values(value.data.frames||{});
  if(!frames.length){host.textContent=value.prefs.radar?'No reported activity yet. Reload if collection was just enabled.':'Activity collection is off.';return;}
  for(const frame of frames){
   const title=document.createElement('p');title.className='origin';title.textContent=frame.origin;host.appendChild(title);
   const table=document.createElement('table');
   for(const [api,count]of Object.entries(frame.counts)){
    const row=table.insertRow();row.insertCell().textContent=api;row.insertCell().textContent=count.toLocaleString();
   }host.appendChild(table);
  }
 }catch(error){$('status').textContent=error.message}
}
for(const name of ['enabled','radar'])$(name).addEventListener('change',async()=>{
 try{await chrome.storage.local.set({[name]:$(name).checked});await chrome.runtime.sendMessage({type:'recheck'});await refresh()}
 catch(error){$('status').textContent=error.message}
});
$('reload').addEventListener('click',()=>chrome.tabs.reload(tabId));
$('refresh').addEventListener('click',refresh);
$('options').addEventListener('click',()=>chrome.runtime.openOptionsPage());
$('clear').addEventListener('click',async()=>{await chrome.runtime.sendMessage({type:'radar-clear',tabId});refresh()});
refresh();
