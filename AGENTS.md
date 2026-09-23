# CampusClaw Development Rules

本项目采用 Spec-Driven Development（SDD）。

1. 在没有对应 OpenSpec change 和可验收 Scenario 的情况下，不得编写业务代码。
2. 实现必须以 openspec/changes/ 下的 proposal、design、spec 和 tasks 为依据。
3. 第 2 课规约阶段已经完成并提交。
当前进入第 3 课 Apply 阶段：
- 允许依据当前 active OpenSpec change 实现业务代码。
- 实现必须严格遵守 proposal.md、design.md、specs 和 tasks.md。
- 必须按 tasks.md 顺序实施。
- 不得自行扩展 active change 范围之外的需求。
- 如果 spec/design 存在冲突或缺失，停止实现并报告，不得自行猜测。
4. tasks.md 中任务只有在实现完成并通过对应 verify 后才能从 [ ] 改为 [x]。
5. 不得通过前端隐藏按钮代替服务端权限校验。
6. 班级隔离必须由服务端强制执行。
7. 未经明确要求，不修改当前项目目录之外的文件或全局配置。
