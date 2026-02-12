/**
 * PDF download button generator for deployed sites.
 * Two modes: direct download or email-gated.
 */

import { escapeHtml, escapeAttr } from './shared';

interface PdfDownloadConfig {
    articleId: string;
    domainId: string;
    captureApiUrl: string;
    type?: 'article' | 'worksheet';
    gated?: boolean;
    buttonText?: string;
}

/**
 * Generate a "Download PDF" button with optional email gate.
 */
export function generatePdfDownloadButton(config: PdfDownloadConfig): string {
    const type = config.type || 'article';
    const buttonText = config.buttonText || (type === 'worksheet' ? 'Download Worksheet' : 'Download PDF');
    const pdfUrl = `/api/articles/${config.articleId}/pdf?type=${type}`;

    if (!config.gated) {
        return `<div class="pdf-download">
  <a href="${escapeAttr(pdfUrl)}" class="pdf-download-btn" download>${escapeHtml(buttonText)}</a>
</div>`;
    }

    // Email-gated: show form first, reveal download after capture
    return `<div class="pdf-download" id="pdf-gate">
  <p class="pdf-gate-text">Enter your email to download:</p>
  <form id="pdf-gate-form" class="pdf-gate-form">
    <input type="email" id="pdf-gate-email" placeholder="your@email.com" required>
    <button type="submit">${escapeHtml(buttonText)}</button>
  </form>
  <a href="${escapeAttr(pdfUrl)}" class="pdf-download-btn" id="pdf-direct-link" style="display:none" download>${escapeHtml(buttonText)}</a>
</div>
<script>
(function(){
  var form=document.getElementById('pdf-gate-form');
  var link=document.getElementById('pdf-direct-link');
  if(!form||!link)return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var email=document.getElementById('pdf-gate-email').value;
    if(!email)return;
    var btn=form.querySelector('button');
    btn.disabled=true;
    btn.textContent='Processing...';
    fetch(${JSON.stringify(config.captureApiUrl)},{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({domainId:${JSON.stringify(config.domainId)},email:email,source:'lead_form',articleId:${JSON.stringify(config.articleId)}})
    }).then(function(r){
      if(r.ok){
        form.style.display='none';
        link.style.display='';
        link.click();
      } else {
        btn.textContent='Try again';
        btn.disabled=false;
      }
    }).catch(function(){
      btn.textContent='Try again';
      btn.disabled=false;
    });
  });
})();
</script>`;
}
