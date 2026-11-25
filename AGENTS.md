# 项目发布规则

- 默认仅在已有 `main` 工作，不自动新建分支。
- 只有用户在当前任务中明确要求发布一次 Release 时，才可创建或发布 GitHub Release（包括草稿、预发布）。普通修改、修复、提交、推送、构建和验收不构成 Release 发布授权。
- 先前任务的 Release 授权不自动延续到后续任务。未明确要求 Release 时，可以完成本地构建与交付，但不得发布或更新 Release 附件。
- 清理历史 Release、删除标签或删除提交各有独立作用范围，只执行用户明确指定的操作。

## 游戏素材

- 游戏对象使用对应的真实游戏图片并保存到软件本地，优先网易公开资源，逐项保留来源与校验值。
- 不用汉字首字、符号或 Emoji 代替图片，不用生成图冒充游戏图标，也不将其他对象的图混作缺图替代品。
- 缺图时继续查找可靠来源；没有取得时明确记录缺口，不能声称已收齐。软件自己的 logo 可以原创设计。

## Agent skills

### Issue tracker

工单与规格使用当前仓库的 GitHub Issues。见 [工单流程](docs/agents/issue-tracker.md)。

### Triage labels

工单分流使用五个默认标签。见 [标签映射](docs/agents/triage-labels.md)。

### Domain docs

使用单一术语表与决策记录目录。见 [领域文档](docs/agents/domain.md)。
