# Bark Worker 部署源码

部署日期：2026-10-03

上游：https://github.com/cwxiaos/bark-worker
上游 main.js blob：5dfafbb54442278f0d5b7b6e5b18d668852ee4c6
Worker：bark-worker
D1：database-bark（APAC）

本次修改：
- APNs 私钥从源码移至 Cloudflare 加密变量 APNS_PRIVATE_KEY。
- 使用 ROOT_PATH 加密变量中的随机路径校验所有请求，拒绝路径不匹配的访问。
- 关闭调用日志，减少访问令牌出现在请求记录中的机会。

当前部署已保存 APNS_PRIVATE_KEY 和 ROOT_PATH 两个加密变量。wrangler.jsonc 使用 keep_vars 保留现有变量；不要给 ROOT_PATH 添加 / 的普通变量覆盖现有密钥。新建其他 Worker 时必须先配置这两个加密变量。

验证：11 项本地测试通过；线上 /ping、/healthz、/info 返回 200；未带访问令牌的 /ping 返回 404。手机实际收到通知需要在 Bark 添加完整服务器地址后测试。

此压缩包不包含 APNs 私钥和服务器访问令牌。源代码按上游 GPLv3 许可证提供。

