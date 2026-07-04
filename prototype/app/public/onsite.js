(function(){
  'use strict';

  var QS = '?onsite_mode=1';
  var state = { candidates: [], plan: null, tasks: [], stations: [], skills: [] };

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function money(n){ return Number(n || 0).toLocaleString('zh-CN',{maximumFractionDigits:0}); }
  function toast(msg){ var el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(function(){el.classList.remove('show');},2600); }
  function api(path, opts){
    var join = path.indexOf('?') >= 0 ? '&onsite_mode=1' : QS;
    return fetch(path + join, Object.assign({ headers:{'Content-Type':'application/json'} }, opts || {}))
      .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || '请求失败'); return j; }); });
  }

  function renderCandidates(){
    var box=$('candidateList');
    if(!state.candidates.length){ box.innerHTML='<div class="meta">暂无候选，请先运行优先队列。</div>'; return; }
    box.innerHTML = state.candidates.map(function(c,i){
      var checked = i < 8 ? 'checked' : '';
      return '<label class="cand">'+
        '<input type="checkbox" '+checked+' data-case="'+esc(c.case_id)+'" data-finding="'+esc(c.finding_id || c.rule_id)+'">'+
        '<span><b>'+esc(c.case_title || c.case_id)+'</b>'+
        '<span class="meta"><span class="pill '+(c.nature==='明确违规'?'red':'amber')+'">'+esc(c.nature || '可疑')+'</span><span>'+esc(c.rule_id)+'</span><span>'+esc(c.rule_name || '')+'</span><span>¥'+money(c.amount_involved)+'</span></span></span>'+
      '</label>';
    }).join('');
  }

  function renderMap(){
    var stationMap = {};
    (state.stations || []).forEach(function(s){ stationMap[s.station_id]=s; });
    function count(id){ var s=stationMap[id] || {}; return (s.tasks || []).length || 0; }
    $('nodeMap').innerHTML =
      '<svg viewBox="0 0 660 310" width="100%" height="250" role="img" aria-label="静态科室节点图">'+
      '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#64748b"/></marker></defs>'+
      '<rect x="18" y="18" width="624" height="274" rx="8" fill="#ffffff" stroke="#dbe4ef"/>'+
      node(80,70,'病案室 / 医务科',count('station-records'),'#2563eb')+
      node(285,70,'设备科 / 影像科',count('station-equipment'),'#2563eb')+
      node(490,70,'信息科',count('station-info'),'#2563eb')+
      node(80,205,'药库 / 耗材库',count('station-pharmacy'),'#15b8a6')+
      node(285,205,'财务科 / 结算办',count('station-finance'),'#15b8a6')+
      '<path d="M158 70 H250 M365 70 H455" stroke="#2563eb" stroke-width="3" fill="none" marker-end="url(#arrow)"/>'+
      '<path d="M158 205 H250 M365 205 H455" stroke="#15b8a6" stroke-width="3" fill="none" marker-end="url(#arrow)"/>'+
      '<path d="M490 105 V170" stroke="#94a3b8" stroke-width="2" stroke-dasharray="5 5" fill="none"/>'+
      '<text x="30" y="34" font-size="12" fill="#64748b">静态节点图，不做真实平面图</text>'+
      '</svg>';
    function node(x,y,label,n,color){
      return '<g><rect x="'+x+'" y="'+y+'" width="126" height="54" rx="8" fill="#f8fafc" stroke="'+color+'"/>'+
      '<text x="'+(x+12)+'" y="'+(y+24)+'" font-size="13" font-weight="700" fill="#0B2A4A">'+label+'</text>'+
      '<text x="'+(x+12)+'" y="'+(y+42)+'" font-size="12" fill="#64748b">'+n+' 项任务</text></g>';
    }
  }

  function taskClass(t){
    if(t.verify_result === '属实') return 'done';
    if(t.verify_result === '不属实') return 'excluded';
    if(t.verify_result === '存疑' || t.needs_more_evidence) return 'need';
    return '';
  }
  function renderTasks(){
    var box=$('taskList');
    if(!state.tasks.length){ box.innerHTML='<div class="meta">暂无任务。请从左侧生成现场计划。</div>'; return; }
    box.innerHTML = state.tasks.map(function(t){
      var basis=t.basis_ref || {};
      var done=t.verify_result ? '<span class="pill '+(t.verify_result==='属实'?'green':(t.verify_result==='不属实'?'red':'amber'))+'">'+t.verify_result+'</span>' : '<span class="pill">待核</span>';
      return '<article class="task '+taskClass(t)+'" data-task="'+esc(t.task_id)+'">'+
        '<div class="task-h"><b>'+esc(t.type)+'<br><span class="meta">'+esc(t.case_title)+' · '+esc(t.rule_id)+'</span></b>'+done+'</div>'+
        '<div class="task-b">'+
        '<div class="meta"><span class="pill">'+esc(t.team)+'</span><span>'+esc(t.station_id)+'</span><span>¥'+money(t.amount_involved)+'</span></div>'+
        '<div class="basis"><b>核查依据</b><br>规则 '+esc(basis.rule_id || t.rule_id)+' · '+esc(basis.rule_name || t.rule_name)+'<br>GZ '+esc((basis.official_gz_codes || []).join("、") || "—")+' · 生效区间 '+esc(interval(basis.effective_interval))+'<br>处置建议 '+esc(basis.disposal || "按规则元数据带出")+(basis.region_override?'<br>属地口径 '+esc(basis.region_override):'')+'</div>'+
        '<div class="guard">本任务需至少 2 名持执法证件人员参加。'+(t.compliance_flags && t.compliance_flags.need_signed_transcript ? '询问笔录需逐页签字/捺印。' : '')+'</div>'+
        '<ul class="req">'+(t.evidence_requirements || []).map(function(r){return '<li>'+esc(r)+'</li>';}).join('')+'</ul>'+
        '<div class="form">'+
          '<input data-field="officer1" placeholder="持证人员 1" value="张检查员">'+
          '<input data-field="officer2" placeholder="持证人员 2" value="王检查员">'+
          '<input data-field="photo" placeholder="照片/材料编号" value="现场照片-'+esc(t.task_id)+'">'+
          '<select data-field="result"><option>属实</option><option>不属实</option><option>存疑</option></select>'+
          '<textarea data-field="reason" placeholder="不属实须填写理由；存疑可写补证方向">'+esc(t.verify_reason || '')+'</textarea>'+
        '</div>'+
        '<div class="actions">'+
          '<button class="btn primary" data-act="verify">回填改档</button>'+
          '<button class="btn" data-act="chain">证据链</button>'+
          '<button class="btn" data-act="outline">询问提纲</button>'+
        '</div>'+
        '</div></article>';
    }).join('');
  }
  function interval(v){ if(!v) return '—'; return (v.start || v.from || '—')+' 至 '+(v.end || v.to || '现行'); }

  function renderKpis(){
    var tasks=state.tasks || [];
    var done=tasks.filter(function(t){return t.verify_result;});
    var confirmed=tasks.filter(function(t){return t.verify_result==='属实';});
    $('kTasks').textContent=tasks.length;
    $('kDone').textContent=done.length;
    $('kConfirmed').textContent=confirmed.length;
    $('kAmount').textContent=money(confirmed.reduce(function(s,t){return s+Number(t.amount_involved||0);},0));
    $('planMeta').textContent = state.plan ? (state.plan.plan_id+' · '+state.plan.org_id+' · '+state.plan.status) : '尚未生成现场计划';
  }
  function renderSkills(){
    $('skillList').innerHTML = (state.skills || []).map(function(s){
      return '<div class="skill"><b>'+esc(s.id+' '+s.name.replace(/^S\\d+\\s*/,''))+'</b><small>'+esc(s.service_role || s.carrier || '')+'</small></div>';
    }).join('') || '<div class="meta">未发现技能目录</div>';
  }
  function renderAll(){ renderCandidates(); renderMap(); renderTasks(); renderKpis(); renderSkills(); }

  function loadCandidates(){
    return api('/api/onsite/candidates?limit=24').then(function(j){ state.candidates=j.candidates || []; renderCandidates(); });
  }
  function loadSkills(){
    return api('/api/onsite/skills').then(function(j){ state.skills=j.skills || []; renderSkills(); });
  }
  function loadPlan(){
    var pid=localStorage.getItem('yingyan_onsite_plan_id');
    return api('/api/onsite/plans'+(pid?'?plan_id='+encodeURIComponent(pid):'')).then(function(j){
      if(j.ok){ state.plan=j.plan; state.tasks=j.tasks || []; state.stations=j.stations || []; renderAll(); }
    }).catch(function(){ renderAll(); });
  }
  function generatePlan(){
    var selected=[].slice.call(document.querySelectorAll('.cand input:checked')).map(function(x){ return { case_id:x.dataset.case, finding_id:x.dataset.finding }; });
    if(!selected.length){ toast('请至少勾选一条疑点'); return; }
    api('/api/onsite/plans',{method:'POST',body:JSON.stringify({selected:selected.slice(0,8), org_id:'示范市第一人民医院', actor:'飞检组长'})})
      .then(function(j){ state.plan=j.plan; state.tasks=j.tasks || []; state.stations=j.stations || []; localStorage.setItem('yingyan_onsite_plan_id',j.plan.plan_id); renderAll(); toast('已生成 '+state.tasks.length+' 条现场任务'); });
  }
  function verifyTask(card){
    var taskId=card.dataset.task;
    var result=card.querySelector('[data-field=result]').value;
    var reason=card.querySelector('[data-field=reason]').value.trim();
    var o1=card.querySelector('[data-field=officer1]').value.trim();
    var o2=card.querySelector('[data-field=officer2]').value.trim();
    var photo=card.querySelector('[data-field=photo]').value.trim();
    api('/api/onsite/tasks/'+encodeURIComponent(taskId)+'/verify',{
      method:'POST',
      body:JSON.stringify({
        result:result,
        reason:reason,
        officers:[o1,o2].filter(Boolean),
        operators:[o1 || '现场检查员'],
        evidence_payload:{ photo_ref:photo, transcript_summary:reason || result, line_no:null }
      })
    }).then(function(){ toast('已回填：'+result); return loadPlan(); }).catch(function(e){ toast(e.message); });
  }
  function showChain(card){
    var task=state.tasks.find(function(t){return t.task_id===card.dataset.task;});
    if(!task) return;
    api('/api/onsite/evidence-chain?case_id='+encodeURIComponent(task.case_id)).then(function(j){
      var links=j.onsite_links || [];
      $('briefBox').textContent = '现场实证节点：'+links.length+' 条\n\n'+links.map(function(l){
        return '- '+l.created_at+' · '+(l.rule_id || '')+' · '+(l.payload && (l.payload.photo_ref || l.payload.doc_no || l.payload.transcript_summary) || l.material_id)+' · officers '+((l.payload && l.payload.officers || []).join('、'));
      }).join('\n');
      toast('证据链已刷新，现场实证在第五排');
    });
  }
  function showOutline(card){
    var task=state.tasks.find(function(t){return t.task_id===card.dataset.task;});
    api('/api/onsite/interview-outline',{method:'POST',body:JSON.stringify(task || {})}).then(function(j){
      $('briefBox').textContent='询问提纲\n\n'+(j.outline || []).map(function(x,i){return (i+1)+'. '+x;}).join('\n');
    });
  }
  function dailyBrief(){
    var pid=state.plan && state.plan.plan_id || localStorage.getItem('yingyan_onsite_plan_id') || '';
    api('/api/onsite/daily-brief?format=json'+(pid?'&plan_id='+encodeURIComponent(pid):'')).then(function(j){
      $('briefBox').textContent = j.markdown || JSON.stringify(j,null,2);
      toast('当日小结已生成');
    });
  }

  document.addEventListener('click',function(e){
    var act=e.target && e.target.dataset && e.target.dataset.act;
    if(act === 'verify') verifyTask(e.target.closest('.task'));
    if(act === 'chain') showChain(e.target.closest('.task'));
    if(act === 'outline') showOutline(e.target.closest('.task'));
  });
  $('btnGenerate').addEventListener('click',generatePlan);
  $('btnRefresh').addEventListener('click',function(){ loadPlan(); loadCandidates(); });
  $('btnBrief').addEventListener('click',dailyBrief);
  $('btnSkills').addEventListener('click',function(){ loadSkills().then(function(){ toast('技能清单已刷新'); }); });

  Promise.all([loadCandidates(), loadSkills(), loadPlan()]).catch(function(e){
    $('candidateList').innerHTML='<div class="guard">'+esc(e.message)+'</div>';
  });
})();
