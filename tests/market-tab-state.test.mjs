import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const company=readFileSync(new URL('../companies/kesef/Company.jsx',import.meta.url),'utf8');
const market=readFileSync(new URL('../companies/kesef/MarketConnection.jsx',import.meta.url),'utf8');
test('department owner retains result and symbol while market tab unmounts',()=>{
  assert.match(company,/\[marketResult, setMarketResult\] = useState\(null\)/);
  assert.match(company,/result=\{marketResult\} setResult=\{setMarketResult\} symbol=\{marketSymbol\} setSymbol=\{setMarketSymbol\}/);
  assert.match(market,/MarketConnection\(\{result,setResult,symbol,setSymbol\}\)/);
  assert.doesNotMatch(company,/apiKey/);
  assert.match(market,/\[apiKey,setApiKey\]=useState\(''\)/);
});
test('returning only checks configuration; failed load does not erase previous result',()=>{
  assert.match(market,/useEffect\(\(\)=>\{check\(\);\},\[\]\)/);
  const connect=market.slice(market.indexOf('async function connect'),market.indexOf('const latest'));
  assert.doesNotMatch(connect,/setResult\(null\)/);
  assert.match(connect,/setResult\(await call\('POST',\{symbol\}\)\)/);
});
