import './boot-v018.js?v=0191';

const search=location.search||'';
const legacySmoke=search.includes('smoke')&&!search.includes('v019-smoke');
if(!legacySmoke) import('./v019-separate-parts.js?v=0191');
