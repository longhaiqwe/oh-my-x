/**
 * MAIN world 拦截器 → isolated world 监听器的桥接常量。
 *
 * XF_BRIDGE_MARKER 不是真正的安全边界（同源页面理论上仍可读取并伪造），
 * 它的作用是：
 *  1. 防止其他脚本 / 扩展意外消费我们广播的用户数据；
 *  2. 让数据流意图显式，监听端必须校验此标记 + 来源才会处理。
 * 真正的隔离依赖 Chrome 的 content script isolated world 机制本身。
 */
export const XF_BRIDGE_MARKER = '__x_focus_bridge_v1__'

/** 排期数据 postMessage 的 type */
export const SCHEDULED_TWEETS_TYPE = 'XF_SCHEDULED_TWEETS'

/** 右侧栏排期面板请求拦截器重新读取排期 / 拦截器回复读取结果 */
export const SCHEDULED_FETCH_REQ_TYPE = 'XF_SCHEDULED_FETCH_REQ'
export const SCHEDULED_FETCH_RES_TYPE = 'XF_SCHEDULED_FETCH_RES'

/** 推文/长文书签指标 postMessage 的 type */
export const BOOKMARK_METRICS_TYPE = 'XF_BOOKMARK_METRICS'

/** 回复成功发布 postMessage 的 type */
export const REPLY_POSTED_TYPE = 'XF_REPLY_POSTED'

/** 用户指标（粉丝数、关注数） postMessage 的 type */
export const USER_METRICS_TYPE = 'XF_USER_METRICS'

/** 原创内容奖励指标 postMessage 的 type */
export const CREATOR_REWARDS_TYPE = 'XF_CREATOR_REWARDS'

/** 后台静默抓取博主近期活动度请求 postMessage 的 type */
export const PROFILE_ACTIVITY_FETCH_REQ_TYPE = 'XF_PROFILE_ACTIVITY_FETCH_REQ'

/** 拦截器收到活动度抓取请求后立即回复的 type，请求方据此判断页面里有没有拦截器 */
export const PROFILE_ACTIVITY_FETCH_ACK_TYPE = 'XF_PROFILE_ACTIVITY_FETCH_ACK'

/** 后台静默抓取博主近期活动度响应 postMessage 的 type */
export const PROFILE_ACTIVITY_FETCH_RES_TYPE = 'XF_PROFILE_ACTIVITY_FETCH_RES'

export const OWN_POSTS_FETCH_REQ_TYPE = 'XF_OWN_POSTS_FETCH_REQ'
export const OWN_POSTS_FETCH_RES_TYPE = 'XF_OWN_POSTS_FETCH_RES'
