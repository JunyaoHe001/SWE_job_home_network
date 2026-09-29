/* SCB municipal network atlas. All paths are relative for GitHub project Pages. */
'use strict';
const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('en-GB', {maximumFractionDigits: 0});
const nf = v => Number.isFinite(v) ? fmt.format(v) : '—';
const pct = v => Number.isFinite(v) ? (v * 100).toFixed(1) + '%' : '—';
const km = v => Number.isFinite(v) ? v.toFixed(1) + ' km' : '—';
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palettes = {residence:['#edf1d9','#c7dfc1','#89bdaa','#4c938d','#245d70'], workplace:['#eff0d9','#c7daca','#89bdb9','#4b939f','#235c79']};
const seriesNames = {TAB1830:'BAS', TAB5850:'RAMS', TAB333:'RAMS legacy'};
const state = {source:'TAB1830',year:2024,sex:'total',side:'residence',code:'',metric:'share',minimum:50,limit:150,showLinks:true};
let catalog, nodes, geo, history, current, map, polygons, lines, dots, nationalBounds;
let nodeIndex = new Map(), polygonIndex = new Map(), bundleCache = new Map(), requestId = 0, visibleEdges = [], eligibleEdges = [], breaks = [], bins = [];
const renderer = () => L.canvas({padding:.4});
async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  if (!path.endsWith('.gz')) return response.json();
  if (!('DecompressionStream' in window)) throw new Error('This browser cannot read compressed data. Please use a recent Chrome, Edge, Firefox or Safari.');
  // The file is a gzip asset, not an HTTP Content-Encoding response.
  const bytes = await response.arrayBuffer();
  if (new Uint8Array(bytes)[0] !== 31) return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
}
function field(kind = state.metric) {
  const r = state.side === 'residence';
  return {share:r?'out_share':'in_share', workers:r?'out_workers':'in_workers', distance:state.side+'_mean_external_distance_km', degree:state.side+'_external_degree_ge5', entropy:state.side+'_external_entropy_normalised'}[kind];
}
function metricName() {
  return {share:state.side==='residence'?'Share working elsewhere':'Share living elsewhere',workers:state.side==='residence'?'Residents working elsewhere':'Workers living elsewhere',distance:'Mean external distance',degree:'Partners with ≥5 persons',entropy:state.side==='residence'?'Destination diversity':'Origin diversity'}[state.metric];
}
function valueLabel(v) {
  if (!Number.isFinite(v)) return 'No data';
  return state.metric==='share'?pct(v):state.metric==='distance'?km(v):state.metric==='entropy'?v.toFixed(3):nf(v);
}
function color(v) {return Number.isFinite(v)?palettes[state.side][breaks.filter(b => v > b).length]:'#e3e5e0';}
function selectedIndex() {return state.code ? nodeIndex.get(state.code) : undefined;}
function buildBins() {
  const values = current.metrics.map(m=>m[field()]).filter(Number.isFinite).sort((a,b)=>a-b);
  breaks = [.2,.4,.6,.8].map(q=>values[Math.floor((values.length-1)*q)]);
  bins = [values[0], ...breaks, values[values.length-1]];
  $('legend-title').textContent = metricName();
  $('legend-bins').innerHTML = palettes[state.side].map((c,i)=>`<div class="legend-row"><i style="background:${c}"></i><span>${i?'&gt; ':''}${esc(valueLabel(bins[i]))} - ${esc(valueLabel(bins[i+1]))}</span></div>`).join('');
  if (values.length<current.metrics.length) $('legend-bins').insertAdjacentHTML('beforeend','<div class="legend-row"><i style="background:#e3e5e0"></i><span>No data</span></div>');
  $('legend-title').title='Quintile bins recalculate for every layer';
}
function polygonStyle(feature) {
  const code = feature.properties.municipality_code, selected = state.code===code;
  return {color:selected?'#b78715':'#779293',weight:selected?2.6:.55,fillColor:color(current.metrics[nodeIndex.get(code)][field()]),fillOpacity:.88,opacity:selected?1:.7};
}
function tooltip(code) {
  const i = nodeIndex.get(code), m = current.metrics[i];
  return `<strong>${esc(nodes[i].municipality_name)}</strong> <span style="color:#7a9095">${code}</span><br>${esc(metricName())}: <b>${esc(valueLabel(m[field()]))}</b><br><small>Click to explore this municipality</small>`;
}
function updatePolygons() {
  buildBins();
  polygons.setStyle(polygonStyle);
  polygonIndex.forEach((layer,code)=>layer.setTooltipContent(tooltip(code)));
  if (state.code) polygonIndex.get(state.code).bringToFront();
}
function scopeEdges() {
  const i = selectedIndex(), r = state.side==='residence';
  return current.links.filter(e=>e[0]!==e[1] && (i===undefined || e[r?0:1]===i)).sort((a,b)=>b[2]-a[2] || a[0]-b[0] || a[1]-b[1]);
}
function curve(edge) {
  const a=nodes[edge[0]], b=nodes[edge[1]], p=map.project([a.latitude,a.longitude],6), q=map.project([b.latitude,b.longitude],6);
  const dx=q.x-p.x,dy=q.y-p.y,bend=.12,c={x:(p.x+q.x)/2-dy*bend,y:(p.y+q.y)/2+dx*bend};
  const pts=[];
  for(let j=0;j<=24;j++){const t=j/24,u=1-t;pts.push(map.unproject([u*u*p.x+2*u*t*c.x+t*t*q.x,u*u*p.y+2*u*t*c.y+t*t*q.y],6));}
  return pts;
}
function updateLinks() {
  if (!current) return;
  lines.clearLayers();dots.clearLayers();
  const scoped=scopeEdges();eligibleEdges=scoped.filter(e=>e[2]>=state.minimum);visibleEdges=state.showLinks?eligibleEdges.slice(0,state.limit):[];
  const sum=scoped.reduce((s,e)=>s+e[2],0),shown=visibleEdges.reduce((s,e)=>s+e[2],0);
  const scope=state.code?nodes[selectedIndex()].municipality_name:'Sweden';
  $('link-summary').textContent=`${nf(visibleEdges.length)} of ${nf(eligibleEdges.length)} qualifying links · ${sum?pct(shown/sum):'0.0%'} of ${scope}'s external persons shown`;
  $('clear-selection').hidden=!state.code;
  const max=visibleEdges[0]?.[2]||1,lineColor=state.side==='residence'?'#266e79':'#735d94';
  visibleEdges.slice().reverse().forEach(e=>{
    const points=curve(e),weight=.6+3.6*Math.sqrt(e[2]/max);
    const line=L.polyline(points,{renderer:lines._renderer,color:lineColor,weight,opacity:state.code?.68:.4,smoothFactor:.3}).addTo(lines);
    const a=nodes[e[0]],b=nodes[e[1]];
    line.bindTooltip(`<strong>${esc(a.municipality_name)} → ${esc(b.municipality_name)}</strong><br>${nf(e[2])} persons · ${state.year}`,{sticky:true});
    // Arrowhead is projected at the current zoom, so its size stays legible.
    const p=map.latLngToLayerPoint(points[18]),q=map.latLngToLayerPoint(points[19]);
    const ang=Math.atan2(q.y-p.y,q.x-p.x),size=4+weight;
    const left=L.point(q.x-size*Math.cos(ang-.45),q.y-size*Math.sin(ang-.45));
    const right=L.point(q.x-size*Math.cos(ang+.45),q.y-size*Math.sin(ang+.45));
    L.polyline([map.layerPointToLatLng(left),points[19],map.layerPointToLatLng(right)],{renderer:lines._renderer,color:lineColor,weight:Math.max(.7,weight*.6),opacity:state.code?.75:.5,interactive:false}).addTo(lines);
  });
  if(state.code){const n=nodes[selectedIndex()];L.circleMarker([n.latitude,n.longitude],{radius:5,color:'#fff',weight:1.7,fillColor:'#bd8c19',fillOpacity:1,interactive:false}).addTo(dots);}
  document.querySelector('.line-key span').style.background=lineColor;
}
function aggregate() {
  const r=state.side==='residence',totalKey=r?'resident_workers_observed':'workplace_workers_observed',extKey=r?'out_workers':'in_workers',distKey=field('distance');
  if(state.code){const m=current.metrics[selectedIndex()];return{total:m[totalKey],external:m[extKey],within:m.within_workers,share:m[field('share')],distance:m[distKey]};}
  let total=0,external=0,within=0,distNum=0,distDen=0;
  current.metrics.forEach(m=>{total+=m[totalKey]||0;external+=m[extKey]||0;within+=m.within_workers||0;if(Number.isFinite(m[distKey])&&m[extKey]>0){distNum+=m[distKey]*m[extKey];distDen+=m[extKey];}});
  return{total,external,within,share:total?external/total:null,distance:distDen?distNum/distDen:null};
}
function updateProfile() {
  const v=aggregate(),r=state.side==='residence';
  $('profile-name').textContent=state.code?nodes[selectedIndex()].municipality_name:'Sweden';
  $('profile-subtitle').textContent=state.code?`${state.code} · ${r?'Residence':'Workplace'} perspective`:'Domestic municipal network';
  $('primary-label').textContent=r?'Employed residents':'Registered workplace workers';
  $('primary-value').textContent=nf(v.total);$('external-label').textContent=r?'Work elsewhere':'Live elsewhere';
  $('external-value').textContent=nf(v.external);$('share-value').textContent=pct(v.share);$('within-value').textContent=nf(v.within);$('distance-value').textContent=km(v.distance);
  $('partners-title').textContent=state.code?(r?'Main work destinations':'Main residential origins'):'Strongest connections';
  const partners=scopeEdges().slice(0,8),max=partners[0]?.[2]||1;
  $('partners').innerHTML=partners.map(e=>{const dest=e[r?1:0],label=state.code?nodes[dest].municipality_name:`${nodes[e[0]].municipality_name} → ${nodes[e[1]].municipality_name}`;return `<li><button class="partner-button" data-code="${state.code?nodes[dest].municipality_code:nodes[e[0]].municipality_code}" title="Explore ${esc(nodes[state.code?dest:e[0]].municipality_name)}"><span class="partner-name"><i class="partner-bar" style="width:${e[2]/max*100}%"></i><span>${esc(label)}</span></span><strong class="partner-value">${nf(e[2])}</strong></button></li>`;}).join('')||'<li>No published external connections.</li>';
  updateTrend();
}
function updateTrend() {
  if(!history){$('trend').textContent='Loading time series…';return;}
  const r=state.side==='residence',years=catalog.sources[state.source].years, i=selectedIndex();
  const pts=years.map(year=>{
    const rows=history.partitions[`${state.source}_${year}_${state.sex}`];
    const chosen=i===undefined?rows:[rows[i]],total=chosen.reduce((s,m)=>s+(m[r?0:1]||0),0),ext=chosen.reduce((s,m)=>s+(m[r?2:3]||0),0);
    const p=catalog.partitions.find(p=>p.source_table===state.source&&p.year===year&&p.sex===state.sex);
    return{year,value:total?ext/total:null,regime:p.statistical_regime,event:p.method_event};
  });
  const vals=pts.map(p=>p.value).filter(Number.isFinite),w=260,h=110,lo=Math.max(0,Math.min(...vals)-.015),hi=Math.min(1,Math.max(...vals)+.015),x=y=>34+(y-years[0])/(years.at(-1)-years[0]||1)*(w-47),y=v=>13+(hi-v)/(hi-lo||1)*67;
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="External share across ${years[0]} to ${years.at(-1)}"><title>External share in the selected statistical series</title>`;
  [lo,(lo+hi)/2,hi].forEach(v=>{svg+=`<line x1="34" x2="247" y1="${y(v)}" y2="${y(v)}" stroke="#e4eae5"/><text x="28" y="${y(v)+3}" text-anchor="end" fill="#82918d" font-size="8" font-family="Arial">${(v*100).toFixed(0)}%</text>`;});
  pts.forEach((p,j)=>{
    const prev=pts[j-1],broken=prev&&(prev.regime!==p.regime||p.event);
    if(prev&&Number.isFinite(prev.value)&&Number.isFinite(p.value)&&!broken)svg+=`<path d="M${x(prev.year)},${y(prev.value)}L${x(p.year)},${y(p.value)}" fill="none" stroke="#337985" stroke-width="1.6"/>`;
    if(broken)svg+=`<line x1="${(x(p.year)+x(prev.year))/2}" x2="${(x(p.year)+x(prev.year))/2}" y1="8" y2="87" stroke="#c19b4d" stroke-dasharray="3 3"><title>Methodological break: ${esc(p.event||'statistical regime changes')}</title></line>`;
    if(Number.isFinite(p.value))svg+=`<circle cx="${x(p.year)}" cy="${y(p.value)}" r="${p.year===state.year?4:2.5}" fill="${p.year===state.year?'#d2ab43':'#337985'}" stroke="white" stroke-width="1"><title>${p.year}: ${pct(p.value)}${p.event?' · '+esc(p.event):''}</title></circle>`;
    if(years.length<=5||j===0||j===pts.length-1||p.year%5===0)svg+=`<text x="${x(p.year)}" y="102" text-anchor="middle" fill="#82918d" font-size="8" font-family="Arial">${p.year}</text>`;
  });
  $('trend').innerHTML=svg+'</svg>';$('trend-range').textContent=`${years[0]}-${years.at(-1)}`;
}
function notes() {
  if(state.source==='TAB1830')return (state.year===2024?'2024 entrepreneur classification changes. ':'')+'BAS, ages 15-74. Disclosure protection affects small counts; unlocated workplaces are assigned to the residence municipality.';
  if(state.source==='TAB5850')return 'RAMS, ages 16-74. 2019 AGI/method break; Armed Forces reporting changes from 2020. Compare years with care.';
  return 'RAMS legacy. Classification and upper-age coverage change in 2011. Fixed 2024 boundaries are used for all years.';
}
function updateHeader() {
  const name=state.code?nodes[selectedIndex()].municipality_name:'Sweden';
  $('map-title').textContent=`${name}, ${state.year}`;
  $('series-label').textContent=`${seriesNames[state.source]} · ${state.sex==='total'?'ALL PERSONS':state.sex.toUpperCase()} · ${state.side.toUpperCase()}`;
  $('side-help').textContent=state.side==='residence'?'Where residents work outside their municipality.':'Where workers live outside their workplace municipality.';
  document.querySelector('#metric option[value=entropy]').textContent=state.side==='residence'?'Destination diversity':'Origin diversity';
  $('method-note').textContent=notes();$('focus-map').disabled=!state.code;
  const params=new URLSearchParams(state);window.history.replaceState(null,'','#'+params.toString());
}
function redraw(){if(!current)return;updateHeader();updatePolygons();updateLinks();updateProfile();}
async function loadPartition() {
  const id=++requestId,key=`${state.source}_${state.year}_${state.sex}`;
  current=null;$('loading').hidden=false;$('error').hidden=true;$('export').disabled=true;
  try {
    if(!bundleCache.has(key))bundleCache.set(key,await fetchJSON(`data/${key}.json.gz`));
    if(id!==requestId)return;
    current=bundleCache.get(key);redraw();$('loading').hidden=true;$('export').disabled=false;
  }catch(error){if(id!==requestId)return;$('loading').hidden=true;$('error').textContent=`Could not load this layer. ${error.message} Please reload the page or select another year.`;$('error').hidden=false;}
}
function fillMunicipalities(query='') {
  const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),q=normalize(query);
  const list=nodes.filter(n=>normalize(n.municipality_name+' '+n.municipality_code).includes(q)||n.municipality_code===state.code).slice().sort((a,b)=>a.municipality_name.localeCompare(b.municipality_name,'sv'));
  $('municipality').innerHTML='<option value="">All 290 municipalities</option>'+list.map(n=>`<option value="${n.municipality_code}">${esc(n.municipality_name)} · ${n.municipality_code}</option>`).join('');
  $('municipality').value=state.code;
}
function selectMunicipality(code,focus=false){state.code=code;$('search').value='';fillMunicipalities();redraw();if(focus&&code)focusMap();}
function focusMap(){if(state.code)map.fitBounds(polygonIndex.get(state.code).getBounds().pad(.9),{maxZoom:9,animate:false});}
function syncYear(){const years=catalog.sources[state.source].years;state.year=Math.max(years[0],Math.min(years.at(-1),state.year));$('year').min=years[0];$('year').max=years.at(-1);$('year').value=state.year;$('year-value').textContent=state.year;$('year-min').textContent=years[0];$('year-max').textContent=years.at(-1);}
function downloadCSV(){
  if(!current)return;
  const quoted=v=>'"'+String(v).replace(/"/g,'""')+'"';
  const head=['source_table','year','sex','origin_code','origin_name','destination_code','destination_name','persons'];
  const rows=eligibleEdges.map(e=>[state.source,state.year,state.sex,nodes[e[0]].municipality_code,nodes[e[0]].municipality_name,nodes[e[1]].municipality_code,nodes[e[1]].municipality_name,e[2]]);
  const blob=new Blob(['\ufeff'+[head,...rows].map(row=>row.map(quoted).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`SCB_${state.source}_${state.year}_${state.sex}_${state.code||'Sweden'}_${state.side}_min${state.minimum}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function restoreState(){
  const params=new URLSearchParams(location.hash.slice(1));
  if(catalog.sources[params.get('source')])state.source=params.get('source');
  if(catalog.sources[state.source].years.includes(Number(params.get('year'))))state.year=Number(params.get('year'));
  if(['total','men','women'].includes(params.get('sex')))state.sex=params.get('sex');
  if(['residence','workplace'].includes(params.get('side')))state.side=params.get('side');
  if(nodeIndex.has(params.get('code')))state.code=params.get('code');
  if(['share','workers','distance','degree','entropy'].includes(params.get('metric')))state.metric=params.get('metric');
  if(params.has('minimum')&&Number.isFinite(+params.get('minimum')))state.minimum=Math.max(1,Math.min(1000000,Math.round(+params.get('minimum'))));
  if([50,150,300,600].includes(+params.get('limit')))state.limit=+params.get('limit');
  if(params.get('showLinks')==='false')state.showLinks=false;
  ['source','sex','metric','minimum','limit'].forEach(key=>$(key).value=state[key]);$('show-links').checked=state.showLinks;
  document.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.side===state.side)));
}
function bindUI(){
  $('source').onchange=()=>{state.source=$('source').value;syncYear();loadPartition();};
  $('year').oninput=()=>{$('year-value').textContent=$('year').value;};
  $('year').onchange=()=>{state.year=+$('year').value;loadPartition();};
  $('sex').onchange=()=>{state.sex=$('sex').value;loadPartition();};
  $('search').oninput=()=>fillMunicipalities($('search').value);
  $('search').onkeydown=e=>{if(e.key==='Enter'){const options=[...$('municipality').options].filter(o=>o.value);if(options.length===1)selectMunicipality(options[0].value,true);}};
  $('municipality').onchange=()=>selectMunicipality($('municipality').value);
  document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>{state.side=b.dataset.side;document.querySelectorAll('[data-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.side===state.side)));redraw();});
  $('metric').onchange=()=>{state.metric=$('metric').value;redraw();};
  $('minimum').onchange=()=>{state.minimum=Math.max(1,Math.min(1000000,Math.round(+$('minimum').value)||1));$('minimum').value=state.minimum;updateLinks();updateHeader();};
  $('limit').onchange=()=>{state.limit=+$('limit').value;updateLinks();updateHeader();};
  $('show-links').onchange=()=>{state.showLinks=$('show-links').checked;updateLinks();updateHeader();};
  $('reset-map').onclick=()=>map.fitBounds(nationalBounds,{padding:[26,32],animate:false});$('focus-map').onclick=focusMap;
  $('clear-selection').onclick=()=>selectMunicipality('');$('export').onclick=downloadCSV;
  $('partners').onclick=e=>{const b=e.target.closest('[data-code]');if(b)selectMunicipality(b.dataset.code,true);};
  $('filters-toggle').onclick=()=>{const open=$('controls').classList.toggle('open');$('filters-toggle').setAttribute('aria-expanded',String(open));map.invalidateSize();};
  $('legend-toggle').onclick=()=>{const open=document.querySelector('.map-legend').classList.toggle('expanded');$('legend-toggle').setAttribute('aria-expanded',String(open));$('legend-toggle').lastElementChild.textContent=open?'−':'+';};
  $('methods-open').onclick=()=>$('methods').showModal();$('methods-close').onclick=()=>$('methods').close();
  $('methods').onclick=e=>{if(e.target===$('methods')){const r=$('methods').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('methods').close();}};
}
async function init(){
  try {
    [catalog,geo]=await Promise.all([fetchJSON('data/catalog.json'),fetchJSON('data/geography.json.gz')]);
    nodes=geo.nodes;nodes.forEach((n,i)=>nodeIndex.set(n.municipality_code,i));restoreState();syncYear();fillMunicipalities();
    map=L.map('map',{zoomControl:false,preferCanvas:true,minZoom:3,maxZoom:12,attributionControl:true,zoomSnap:.25});
    L.control.zoom({position:'topright'}).addTo(map);L.control.scale({position:'bottomright',imperial:false,maxWidth:110}).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
    polygons=L.geoJSON(geo.boundaries,{renderer:renderer(),style:{color:'#9ab0a8',weight:.5,fillColor:'#d9e3d5',fillOpacity:.8},onEachFeature:(f,l)=>{const code=f.properties.municipality_code;polygonIndex.set(code,l);l.bindTooltip(nodes[nodeIndex.get(code)].municipality_name,{sticky:true});l.on('click',()=>selectMunicipality(code));}}).addTo(map);
    nationalBounds=polygons.getBounds();map.fitBounds(nationalBounds,{padding:[26,32],animate:false});
    lines=L.layerGroup().addTo(map);lines._renderer=renderer();dots=L.layerGroup().addTo(map);
    map.on('zoomend',()=>{if(current)updateLinks();});
    bindUI();await loadPartition();
    history=await fetchJSON('data/history.json.gz');updateTrend();
    window.__atlas={state,nodes,catalog,get current(){return current;},get eligibleEdges(){return eligibleEdges;},get visibleEdges(){return visibleEdges;},map};
  }catch(error){$('loading').hidden=true;$('error').textContent=`The atlas could not start. ${error.message} Please reload the page.`;$('error').hidden=false;console.error(error);}
}
init();
