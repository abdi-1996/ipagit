import './boot-v018.js?v=0192';

const search=location.search||'';
const legacySmoke=search.includes('smoke')&&!search.includes('v019-smoke');
if(!legacySmoke){
  import('./v019-separate-parts.js?v=0192').then(()=>import('./v019-parts-ui.js?v=0192'));
}
