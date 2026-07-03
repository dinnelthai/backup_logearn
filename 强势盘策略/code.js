// 单代币策略：年龄 + 市值(取max卡上限) + 垃圾钱包 + 平台白名单 + 成本线偏离 + AO连增 + AC上升
var num = function (x) { var n = Number(x); return Number.isFinite(n) ? n : 0 }
var sma = function (arr) { return arr.length ? arr.reduce(function (a, b) { return a + b }, 0) / arr.length : 0 }

var MCAP_MAX = 120000
var DEV_MIN = 2
var DEV_MAX = 40

var allow = [
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump 内盘
  'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA', // Pump AMM 外盘
  'mayhem',                                       // Pump Mayhem
  'FfYek5vEz23cMkWsdJwG2oa6EphsvXSHrGpdALN4g6W1', // LetsBonk 1
  'BuM6KDpWiTcxvrpXywWFiw45R2RNH8WURdvqoTDV1BW4'  // LetsBonk 2
]

var ki = ctx.kline_and_indicators || {}
var aoBars = Array.isArray(ki.ao_bars) ? ki.ao_bars : []
var logearn = ctx.logearn || {}
var symbol = logearn.symbol || ki.symbol || 'UNKNOWN'

var nowTs = Math.floor(Date.now() / 1000)

var launchTime = num(logearn.swap_begin_time)
var ageDays = launchTime > 0 ? (nowTs - launchTime) / 86400 : Infinity

var mcapCandidates = [num(logearn.current_mcap), num(logearn.mcap), num(logearn.fdv)]
var effMcap = Math.max(mcapCandidates[0], mcapCandidates[1], mcapCandidates[2])

var deviationPct = num(ki.avg_price_deviation_pct)
var buyTxD1 = num(logearn.buy_tx_count_d1)

var resStr = String(ki.resolution || '').toUpperCase().trim()
var needN = (resStr === '1S' || resStr === '5S') ? 5 : 3

var aoVals = []
for (var i = 0; i < needN; i++) aoVals.push(num(aoBars[i] ? aoBars[i].value : 0))
var aoOk = aoBars.length >= needN
if (aoOk) {
  for (var j = 0; j < needN; j++) {
    if (aoVals[j] <= 0) { aoOk = false; break }
    if (j < needN - 1 && !(aoVals[j] > aoVals[j + 1])) { aoOk = false; break }
  }
}

var calcAC = function (idx) {
  if (idx + 5 > aoBars.length) return null
  var win = aoBars.slice(idx, idx + 5).map(function (b) { return num(b.value) })
  return num(aoBars[idx].value) - sma(win)
}
var acVals = []
for (var k = 0; k < needN; k++) acVals.push(calcAC(k))
var ac0 = acVals[0], ac1 = acVals[1]
var acOk = ac0 !== null && ac1 !== null && ac0 > 0 && ac0 > ac1

var aoStr = aoVals.map(function (v) { return v.toFixed(0) }).join(',')
var acStr = acVals.map(function (v) { return v === null ? 'NA' : v.toFixed(2) }).join(',')

var checks = [
  ['年龄(天)', launchTime > 0 && ageDays <= 15, Number.isFinite(ageDays) ? ageDays.toFixed(2) : 'NA', '<= 15'],
  ['市值', effMcap > 0 && effMcap < MCAP_MAX, effMcap.toFixed(0) + '(cur=' + mcapCandidates[0].toFixed(0) + ',mcap=' + mcapCandidates[1].toFixed(0) + ',fdv=' + mcapCandidates[2].toFixed(0) + ')', '>0 且 < ' + MCAP_MAX],
  ['垃圾钱包%', num(logearn.shit_volume) < 5, num(logearn.shit_volume).toFixed(2), '< 5'],
  ['平台白名单(内+外盘)', allow.indexOf(logearn.platform) !== -1, String(logearn.platform), '内盘/外盘主流平台'],
  ['成本线偏离%', deviationPct > DEV_MIN && deviationPct < DEV_MAX, deviationPct.toFixed(2), DEV_MIN + ' ~ ' + DEV_MAX],
  ['24h买入次数', buyTxD1 > 50, buyTxD1, '> 50'],
  ['AO' + needN + '连增', aoOk, 'len=' + aoBars.length + ' [' + aoStr + ']', '连续' + needN + '根递增且>0'],
  ['AC上升', acOk, '[' + acStr + ']', 'ac0>0 且 ac0>ac1']
]

var detail = '[' + symbol + '] K=' + ki.resolution + ' needN=' + needN + '  ' + checks.map(function (c) { return c[0] + '(' + c[1] + '): ' + c[2] + ' [期望 ' + c[3] + ']' }).join('  |  ')
var passed = checks.every(function (c) { return c[1] })
if (!passed) { ctx.log.error('未命中  ' + detail); return false }
ctx.log.success('命中<成本线+AO+AC策略(内+外盘)>  ' + detail)
return true