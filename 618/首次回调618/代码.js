// ⚠️ Token 实时流策略：仅使用 ctx.logearn
const L = ctx.logearn || {}
const now = Math.floor(Date.now() / 1000)

// === 基本金狗条件 ===
// pump 发射
const isPump = String(L.platform_name || '').toLowerCase().includes('pump')

// 创建时间 < 6 小时
const createTime = L.swap_begin_time || now
const ageHours = (now - createTime) / 3600

// 已发射外盘（内盘毕业）
const migrated = !!L.launch_time && L.launch_time > 0

// 历史最高市值（门槛降到 15万，对准小盘）
const maxMcap = L.max_up_mcap || 0

// 当前市值（下限 3万 / 上限 12万，锁定小盘深回撤反弹）
const mcap = L.mcap || 0

// 垃圾钱包占比 < 5%
const shit = (typeof L.shit_volume === 'number') ? L.shit_volume : 999

// 蓝筹顶级赢家共振钱包数 > 2
const whaleMax = (L.whale_list || []).reduce((m, w) => Math.max(m, Number(w.whaleWalletCount) || 0), 0)

// 精选 + 共振 + 反弹 + 苏醒 通知总次数
const featuredCnt = (L.continue_breakout_volume_list || []).length // 精选
const whaleCnt = (L.whale_list || []).length                       // 共振
const vbCnt = (L.v_breakout_volume_list || []).length              // 反弹
const awakeCnt = (L.breakout_volume_10x_list || []).length         // 苏醒
const signalTotal = featuredCnt + whaleCnt + vbCnt + awakeCnt

// 24小时成交额（USD）
const nativePrice = L.chain === 56 ? (ctx.bnb_price || 0) : (ctx.sol_price || 0)
const vol24Coin = (L.buy_wcoin_amount_d1 || 0) + (L.sell_wcoin_amount_d1 || 0)
const vol24Usd = vol24Coin * nativePrice

// 回撤数据：取最近一轮回撤周期
const vList = L.v_breakout_volume_list || []
const latestRetrace = vList.slice().sort((a, b) => (b.top_price_time || 0) - (a.top_price_time || 0))[0]
const topMcapBeforeRetrace = latestRetrace ? (latestRetrace.top_price_mcap || 0) : 0
const lowMcapInRetrace = latestRetrace ? (latestRetrace.low_price_mcap || 0) : 0

// 基础条件：外盘最大回撤不能超过历史最高价的 71%（最低点市值 >= 最高市值 × 0.29）
const drawLimit = maxMcap * (1 - 0.71)
const deepestMcap = Math.min(lowMcapInRetrace > 0 ? lowMcapInRetrace : mcap, mcap)
const drawWithin71 = maxMcap > 0 && deepestMcap >= drawLimit

// === 反弹条件 ===
// 1. 当前价回撤到历史最高价斐波 0.618 ~ 0.71 区间内
const fibUpper = maxMcap * (1 - 0.618)
const fibLower = maxMcap * (1 - 0.71)
const inFibRange = maxMcap > 0 && mcap <= fibUpper && mcap >= fibLower

// 2. 最近5分钟涨幅 > 2%
const chg5m = (typeof L.price_change_5m === 'number') ? L.price_change_5m : -999

// 3. 本轮回调前的最高市值必须 > 15万
const topOver150k = topMcapBeforeRetrace > 150000

const checks = [
  ['Pump发射', isPump, `${L.platform_name}`, '含 Pump'],
  ['创建时长(小时)', ageHours < 6, ageHours.toFixed(2), '< 6'],
  ['已发射外盘', !!migrated, !!migrated, '= true'],
  ['历史最高市值USD', maxMcap > 150000, maxMcap.toFixed(0), '> 150000'],
  ['当前市值USD', mcap >= 30000 && mcap <= 120000, mcap.toFixed(0), '30000 ~ 120000'],
  ['精选+共振+反弹+苏醒总次数', signalTotal >= 3, `精${featuredCnt}+共${whaleCnt}+反${vbCnt}+苏${awakeCnt}=${signalTotal}`, '>= 3'],
  ['24h成交额USD', vol24Usd >= 300000, vol24Usd.toFixed(0), '>= 300000'],
  ['垃圾钱包占比%', shit < 5, shit, '< 5'],
  ['蓝筹顶级赢家共振钱包数', whaleMax > 2, whaleMax, '> 2'],
  ['最大回撤不超过71%', drawWithin71, `最低市值${deepestMcap.toFixed(0)}`, `>= ${drawLimit.toFixed(0)}`],
  ['回撤至斐波0.618~0.71区间', inFibRange, `市值${mcap.toFixed(0)}`, `${fibLower.toFixed(0)} ~ ${fibUpper.toFixed(0)}`],
  ['最近5分钟涨幅%', chg5m > 2, chg5m.toFixed(2), '> 2'],
  ['回调前市值>150k', topOver150k, topMcapBeforeRetrace.toFixed(0), '> 150000'],
]

// === 额外观测字段（不参与过滤，仅供复盘分析）===
const obs = [
  ['观测:1h涨幅%', true, (typeof L.price_change_1h === 'number' ? L.price_change_1h.toFixed(2) : 'NA'), '仅观测'],
  ['观测:6h涨幅%', true, (typeof L.price_change_6h === 'number' ? L.price_change_6h.toFixed(2) : 'NA'), '仅观测'],
  ['观测:24h买家数', true, (L.buyer_count_d1 || 0), '仅观测'],
  ['观测:24h卖家数', true, (L.seller_count_d1 || 0), '仅观测'],
  ['观测:聪明钱买入数', true, (L.smart_money_address_buy_count_d1 || 0), '仅观测'],
  ['观测:新钱包持仓%', true, (typeof L.new_volume === 'number' ? L.new_volume.toFixed(2) : 'NA'), '仅观测'],
  ['观测:高频钱包持仓%', true, (typeof L.frequent_volume === 'number' ? L.frequent_volume.toFixed(2) : 'NA'), '仅观测'],
  ['观测:老钱包持仓%', true, (typeof L.old_volume === 'number' ? L.old_volume.toFixed(2) : 'NA'), '仅观测'],
  ['观测:聪明钱持仓%', true, (typeof L.smart_volume === 'number' ? L.smart_volume.toFixed(2) : 'NA'), '仅观测'],
]

const failCount = checks.filter(c => !c[1]).length
const detail = `[${L.symbol || '??'}] 差${failCount}条  ` + checks.concat(obs).map(([name, ok, actual, expect]) => `${name}(${ok}): ${actual} [期望 ${expect}]`).join('  |  ')
const passed = checks.every(c => c[1])
if (!passed) {
  // 一批两三百个 token，全打会刷屏——只对"差 1~2 条就命中"的近似单打未命中日志
  if (failCount <= 2) ctx.log.error('未命中  ' + detail)
  return false
}
ctx.log.success('命中<小盘深回撤反弹>  ' + detail)
return true