/**
 * Scroll-triggered smart CTAs.
 * Uses IntersectionObserver to show a CTA after 60% scroll depth.
 * Remembers dismissal in sessionStorage.
 */

import { escapeHtml, escapeAttr } from './shared';

interface CtaConfig {
    text: string;
    buttonLabel: string;
    buttonUrl: string;
    style: 'bar' | 'card' | 'banner';
}

/**
 * Generate scroll-triggered CTA HTML + JS.
 * Inserts a sentinel at ~60% of the article content.
 */
export function generateScrollCta(ctaConfig: CtaConfig | null | undefined, articleSlug: string): string {
    if (!ctaConfig?.text || !ctaConfig?.buttonUrl) return '';

    const style = ctaConfig.style || 'bar';
    const storageKey = `cta-dismissed-${articleSlug}`;

    return `<div class="scroll-cta-sentinel" aria-hidden="true"></div>
<div class="scroll-cta scroll-cta-${escapeAttr(style)}" id="scroll-cta" role="complementary" aria-label="Call to action" style="display:none">
  <div class="scroll-cta-inner">
    <p class="scroll-cta-text">${escapeHtml(ctaConfig.text)}</p>
    <a href="${escapeAttr(ctaConfig.buttonUrl)}" class="scroll-cta-btn">${escapeHtml(ctaConfig.buttonLabel)}</a>
    <button class="scroll-cta-dismiss" aria-label="Dismiss" type="button">&times;</button>
  </div>
</div>
<script>
(function(){
  var key='${storageKey}';
  try{if(sessionStorage.getItem(key))return}catch(e){}
  var cta=document.getElementById('scroll-cta');
  if(!cta)return;
  var sentinel=document.querySelector('.scroll-cta-sentinel');
  if(!sentinel)return;
  var shown=false;
  var observer=new IntersectionObserver(function(entries){
    if(entries[0].isIntersecting&&!shown){
      shown=true;
      cta.style.display='';
      requestAnimationFrame(function(){cta.classList.add('scroll-cta-visible')});
      observer.disconnect();
    }
  },{threshold:0.1});
  observer.observe(sentinel);
  cta.querySelector('.scroll-cta-dismiss').addEventListener('click',function(){
    cta.classList.remove('scroll-cta-visible');
    setTimeout(function(){cta.style.display='none'},300);
    try{sessionStorage.setItem(key,'1')}catch(e){}
  });
})();
</script>`;
}
