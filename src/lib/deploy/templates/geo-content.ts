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
    'America/Denver':'mountain','America/Los_Angeles':'west',
    'America/Phoenix':'southwest','America/Anchorage':'west',
    'Pacific/Honolulu':'west','America/Detroit':'midwest',
    'America/Indiana/Indianapolis':'midwest',
    'America/Indiana/Knox':'midwest','America/Indiana/Marengo':'midwest',
    'America/Indiana/Petersburg':'midwest','America/Indiana/Tell_City':'midwest',
    'America/Indiana/Vevay':'midwest','America/Indiana/Vincennes':'midwest',
    'America/Indiana/Winamac':'midwest',
    'America/Kentucky/Louisville':'southeast','America/Kentucky/Monticello':'southeast',
    'America/Boise':'mountain','America/Juneau':'west',
    'America/Sitka':'west','America/Yakutat':'west','America/Nome':'west',
    'America/Metlakatla':'west','America/Adak':'west',
    'America/Menominee':'midwest','America/North_Dakota/Beulah':'midwest',
    'America/North_Dakota/Center':'midwest','America/North_Dakota/New_Salem':'midwest',
  };
  var stateMap={
    'America/New_York':'NY','America/Chicago':'IL',
    'America/Denver':'CO','America/Los_Angeles':'CA',
    'America/Phoenix':'AZ','America/Detroit':'MI',
    'America/Boise':'ID','America/Juneau':'AK',
    'America/Anchorage':'AK','America/Sitka':'AK','America/Yakutat':'AK',
    'America/Nome':'AK','America/Metlakatla':'AK','America/Adak':'AK',
    'Pacific/Honolulu':'HI',
    'America/Indiana/Indianapolis':'IN','America/Indiana/Knox':'IN',
    'America/Indiana/Marengo':'IN','America/Indiana/Petersburg':'IN',
    'America/Indiana/Tell_City':'IN','America/Indiana/Vevay':'IN',
    'America/Indiana/Vincennes':'IN','America/Indiana/Winamac':'IN',
    'America/Kentucky/Louisville':'KY','America/Kentucky/Monticello':'KY',
    'America/Menominee':'WI',
    'America/North_Dakota/Beulah':'ND','America/North_Dakota/Center':'ND',
    'America/North_Dakota/New_Salem':'ND',
  };
  var regionByState={
    AL:'southeast',AK:'west',AZ:'southwest',AR:'southeast',CA:'west',
    CO:'mountain',CT:'northeast',DE:'northeast',FL:'southeast',GA:'southeast',
    HI:'west',ID:'mountain',IL:'midwest',IN:'midwest',IA:'midwest',
    KS:'midwest',KY:'southeast',LA:'southeast',ME:'northeast',MD:'northeast',
    MA:'northeast',MI:'midwest',MN:'midwest',MS:'southeast',MO:'midwest',
    MT:'mountain',NE:'midwest',NV:'west',NH:'northeast',NJ:'northeast',
    NM:'southwest',NY:'northeast',NC:'southeast',ND:'midwest',OH:'midwest',
    OK:'southwest',OR:'west',PA:'northeast',RI:'northeast',SC:'southeast',
    SD:'midwest',TN:'southeast',TX:'southwest',UT:'mountain',VT:'northeast',
    VA:'southeast',WA:'west',WV:'southeast',WI:'midwest',WY:'mountain',
    DC:'northeast',
  };
  try{
    var tz=Intl.DateTimeFormat().resolvedOptions().timeZone;
    var st=stateMap[tz]||null;
    var reg=tzMap[tz]||null;
    if(st) reg=regionByState[st]||reg;
    var candidates=[st,reg].filter(Boolean);
    if(candidates.length>0){
      var blocks=document.querySelectorAll('.geo-block[data-region]');
      var matched=false;
      blocks.forEach(function(b){
        var r=b.dataset.region;
        if(candidates.indexOf(r)!==-1){b.style.display='';matched=true;}
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
