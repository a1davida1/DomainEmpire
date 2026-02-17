/**
 * Bridge script injected into the preview iframe when loaded by the Visual Configurator.
 * Enables click-to-select and hover-highlight on blocks via postMessage.
 */

export function getConfiguratorBridgeScript(allowedParentOrigin: string): string {
    const serializedAllowedOrigin = JSON.stringify(allowedParentOrigin);
    return `<script>
(function(){
  var ALLOWED_PARENT_ORIGIN=${serializedAllowedOrigin};
  var parentOrigin=typeof ALLOWED_PARENT_ORIGIN==='string'?ALLOWED_PARENT_ORIGIN:'';
  var selected=null;
  var highlighted=null;
  var OUTLINE='2px solid #3b82f6';
  var HOVER_OUTLINE='2px dashed #93c5fd';

  function isTrustedParentOrigin(origin){
    return !!origin&&origin===ALLOWED_PARENT_ORIGIN;
  }

  function clearHighlight(){
    if(highlighted){highlighted.style.outline='';highlighted=null;}
  }
  function clearSelection(){
    if(selected){selected.style.outline='';selected=null;}
  }

  document.addEventListener('click',function(e){
    var el=e.target.closest('[data-block-id]');
    if(!el)return;
    e.preventDefault();
    e.stopPropagation();
    if(!isTrustedParentOrigin(parentOrigin))return;
    clearSelection();
    selected=el;
    el.style.outline=OUTLINE;
    parent.postMessage({type:'block-select',blockId:el.getAttribute('data-block-id'),blockType:el.getAttribute('data-block-type')},parentOrigin);
  },true);

  document.addEventListener('mouseover',function(e){
    var el=e.target.closest('[data-block-id]');
    if(!el||el===selected)return;
    clearHighlight();
    highlighted=el;
    el.style.outline=HOVER_OUTLINE;
  });
  document.addEventListener('mouseout',function(e){
    var el=e.target.closest('[data-block-id]');
    if(el&&el===highlighted)clearHighlight();
  });

  window.addEventListener('message',function(e){
    if(!isTrustedParentOrigin(parentOrigin))return;
    if(e.origin!==parentOrigin)return;
    if(!e.data||e.data.type!=='block-highlight')return;
    var bid=String(e.data.blockId||'').replace(/[^a-zA-Z0-9_\-]/g,'');
    if(!bid)return;
    clearSelection();
    var target=document.querySelector('[data-block-id="'+bid+'"]');
    if(!target)return;
    selected=target;
    target.style.outline=OUTLINE;
    target.scrollIntoView({behavior:'smooth',block:'center'});
  });
})();
</script>`;
}
