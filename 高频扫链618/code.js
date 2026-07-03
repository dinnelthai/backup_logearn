// ⚠️ Token 实时流策略：仅使用 ctx.logearn（激进小市值版）
const L = ctx.logearn || {}
const now = Math.floor(Date.now() / 1000)

// === 基本金狗条件 ===
// pump 发射
const isPump = String(L.platform_name || '').toLowerCase().includes('pump')

// 创建时间 < 8 小时
const createTime = L.swap_begin_time || now
const ageHours = (now - createTime) / 3600

// 已发射外盘（内盘毕业）
const migrated = !!L.launch_time && L.launch_time > 0

// 历史最高市值 > 150k（下限：证明曾有过热度/资金量）
const maxMcap = L.max_up_mcap || 0

// 当前买入市值（用于斐波区间约束 + 上限约束）
const mcap = L.mcap || 0

// 垃圾钱包占比 < 5%
const shit = (typeof L.shit_volume === 'number') ? L.shit_volume : 999

// 新钱包占比 < 60%
const newVol = (typeof L.new_volume === 'number') ? L.new_volume : 999

// 高频钱包占比 < 50%
const freqVol = (typeof L.frequent_volume === 'number') ? L.frequent_volume : 999

// 精选 + 共振 + 反弹 + 苏醒 通知总次数
const featuredCnt = (L.continue_breakout_volume_list || []).length // 精选
const whaleCnt = (L.whale_list || []).length                       // 共振
const vbCnt = (L.v_breakout_volume_list || []).length              // 反弹
const awakeCnt = (L.breakout_volume_10x_list || []).length         // 苏醒
const signalTotal = featuredCnt + whaleCnt + vbCnt + awakeCnt

// 共振 or 精选 至少一类存在
const hasWhaleOrFeatured = whaleCnt > 0 || featuredCnt > 0

// 24小时成交额（USD）：买入+卖出的原生币数量 × 原生币价格
const nativePrice = L.chain === 56 ? (ctx.bnb_price || 0) : (ctx.sol_price || 0)
const vol24Coin = (L.buy_wcoin_amount_d1 || 0) + (L.sell_wcoin_amount_d1 || 0)
const vol24Usd = vol24Coin * nativePrice

// 回撤数据：取最近一轮回撤周期
const vList = L.v_breakout_volume_list || []
const latestRetrace = vList.slice().sort((a, b) => (b.top_price_time || 0) - (a.top_price_time || 0))[0]
const topMcapBeforeRetrace = latestRetrace ? (latestRetrace.top_price_mcap || 0) : 0

// === 反弹条件 ===
// 1. 当前价回撤到历史最高价斐波 0.62 ~ 0.71 区间内
const fibUpper = maxMcap * (1 - 0.62)  // 回撤0.62对应的市值（较高）
const fibLower = maxMcap * (1 - 0.71)  // 回撤0.71对应的市值（较低）
const inFibRange = maxMcap > 0 && mcap <= fibUpper && mcap >= fibLower

// 2. 最近5分钟涨幅 > 2%
const chg5m = (typeof L.price_change_5m === 'number') ? L.price_change_5m : -999

// 3. 本轮回调前的最高市值必须 > 150k
const topOver150k = topMcapBeforeRetrace > 150000

// 4. 只玩外盘「首次」回撤到斐波0.62~0.71区间的反弹：
//    统计历史上回撤深度达到过 0.62~0.71 区间、并且反弹已结束（fibon_break4_time 有值=突破前高）的周期数
//    只要有一个这样的已结束周期，说明此前已在该区间玩过一次反弹，现在再次回撤进此区间属于「非首次」，直接 pass
const finishedDeepCycles = vList.filter(v => {
  const r = v.n_pattern_retracement || 0
  const ended = v.fibon_break4_time != null && v.fibon_break4_time > 0
  return r >= 0.62 && r <= 0.71 && ended
}).length
const isFirstFibRebound = finishedDeepCycles === 0

const checks = [
  ['Pump发射', isPump, `${L.platform_name}`, '含 Pump'],
  ['创建时长(小时)', ageHours < 8, ageHours.toFixed(2), '< 8'],
  ['已发射外盘', !!migrated, !!migrated, '= true'],
  ['历史最高市值USD', maxMcap > 150000, maxMcap.toFixed(0), '> 150000'],
  ['当前买入市值上限USD', mcap <= 200000, mcap.toFixed(0), '<= 200000'],
  ['精选+共振+反弹+苏醒总次数', signalTotal >= 2, `精${featuredCnt}+共${whaleCnt}+反${vbCnt}+苏${awakeCnt}=${signalTotal}`, '>= 2'],
  ['共振或精选至少一类存在', hasWhaleOrFeatured, `共${whaleCnt}/精${featuredCnt}`, '共>0 或 精>0'],
  ['24h成交额USD', vol24Usd >= 150000, vol24Usd.toFixed(0), '>= 150000'],
  ['垃圾钱包占比%', shit < 5, shit, '< 5'],
  ['新钱包占比%', newVol < 60, newVol, '< 60'],
  ['高频钱包占比%', freqVol < 50, freqVol, '< 50'],
  ['回撤至斐波0.62~0.71区间', inFibRange, `市值${mcap.toFixed(0)}`, `${fibLower.toFixed(0)} ~ ${fibUpper.toFixed(0)}`],
  ['首次该区间反弹(无已结束深度周期)', isFirstFibRebound, `已结束区间周期${finishedDeepCycles}`, '= 0'],
  ['最近5分钟涨幅%', chg5m > 2, chg5m.toFixed(2), '> 2'],
  ['回调前市值>150k', topOver150k, topMcapBeforeRetrace.toFixed(0), '> 150000'],
]
const detail = checks.map(([name, ok, actual, expect]) => `${name}(${ok}): ${actual} [期望 ${expect}]`).join('  |  ')
const passed = checks.every(c => c[1])
if (!passed) { 
  //ctx.log.error('未命中  ' + detail);
  return false
}
ctx.log.success('命中<激进小市值回调首次区间反弹>  ' + detail)
return true