/**
 * Geo-adaptive content blocks.
 * Uses Intl.DateTimeFormat timezone detection to show region-specific content.
 * No API calls, no IP lookup — fully client-side.
 */

import { escapeHtml } from './shared';

interface GeoConfig {
    regions: Record<string, { content: string; label?: string }>;
    fallback: string;
}

/**
 * Generate HTML + JS for geo-adaptive content blocks.
 * Content blocks are hidden by default, JS shows the matching region.
 */
export function generateGeoBlocks(geoConfig: GeoConfig | null | undefined): string {
    if (!geoConfig?.regions || Object.keys(geoConfig.regions).length === 0) return '';

    const regionBlocks = Object.entries(geoConfig.regions).map(([region, data]) => {
        const label = data.label ? `<span class="geo-label">${escapeHtml(data.label)}</span>` : '';
        return `<div class="geo-block" data-region="${escapeHtml(region)}" style="display:none">
  ${label}
  <div class="geo-content">${data.content}</div>
</div>`;
    }).join('\n');

    const fallbackHtml = `<div class="geo-block geo-fallback">
  <div class="geo-content">${geoConfig.fallback}</div>
</div>`;

    return `<div class="geo-adaptive">
  ${regionBlocks}
  ${fallbackHtml}
</div>
<script>
(function(){
  var tzMap={
    'America/New_York':'northeast','America/Chicago':'midwest',
    'America/Denver':'west','America/Los_Angeles':'west',
    'America/Phoenix':'west','America/Anchorage':'west',
    'Pacific/Honolulu':'west','America/Detroit':'midwest',
    'America/Indiana/Indianapolis':'midwest',
    'America/Boise':'west','America/Juneau':'west',
  };
  var stateMap={
    'America/New_York':'NY','America/Chicago':'IL',
    'America/Denver':'CO','America/Los_Angeles':'CA',
    'America/Phoenix':'AZ','America/Detroit':'MI',
  };
  try{
    var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
    var region=stateMap[tz]||tzMap[tz]||null;
    if(region){
      var blocks=document.querySelectorAll('.geo-block[data-region]');
      var matched=false;
      blocks.forEach(function(b){
        if(b.dataset.region===region){b.style.display='';matched=true;}
      });
      if(matched){
        var fb=document.querySelector('.geo-fallback');
        if(fb) fb.style.display='none';
      }
    }
  }catch(e){}
})();
</script>`;
}
